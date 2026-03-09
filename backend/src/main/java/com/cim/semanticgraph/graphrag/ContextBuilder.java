package com.cim.semanticgraph.graphrag;

import lombok.extern.slf4j.Slf4j;
import org.apache.jena.rdf.model.*;
import org.apache.jena.vocabulary.RDF;
import org.apache.jena.vocabulary.RDFS;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Context Builder for GraphRAG
 *
 * Builds human-readable context from RDF subgraph
 * for consumption by LLM
 */
@Slf4j
@Component
public class ContextBuilder {

    @Value("${graphrag.context.include-labels}")
    private boolean includeLabels;

    @Value("${graphrag.context.include-inference}")
    private boolean includeInference;

    // CIM type priority: lower number = higher priority in context
    private static final Map<String, Integer> TYPE_PRIORITY = Map.ofEntries(
        Map.entry("Substation", 1),
        Map.entry("PowerTransformer", 2),
        Map.entry("GeneratingUnit", 3),
        Map.entry("SynchronousMachine", 3),
        Map.entry("ACLineSegment", 4),
        Map.entry("EnergyConsumer", 5),
        Map.entry("VoltageLevel", 6),
        Map.entry("BusbarSection", 7),
        Map.entry("ConnectivityNode", 8),
        Map.entry("Terminal", 9),
        Map.entry("BaseVoltage", 10)
    );

    /**
     * Build context from RDF model, prioritizing important CIM types first.
     *
     * @param model      RDF model (subgraph)
     * @param maxTriples Maximum triples to include
     * @return Formatted context string for LLM
     */
    public String buildContext(Model model, int maxTriples) {
        log.debug("Building context from model with {} triples", model.size());

        if (model.size() == 0) {
            return "No relevant data found in knowledge graph.";
        }

        StringBuilder context = new StringBuilder();
        context.append("=== Knowledge Graph Context ===\n\n");

        // Group triples by subject
        Map<Resource, List<Statement>> triplesBySubject = groupTriplesBySubject(model);

        // Sort subjects by CIM type priority (important types first)
        List<Map.Entry<Resource, List<Statement>>> sortedEntries = triplesBySubject.entrySet().stream()
                .sorted(Comparator.comparingInt(e -> getTypePriority(e.getValue())))
                .collect(Collectors.toList());

        // Build context for each entity in priority order
        int triplesIncluded = 0;
        for (Map.Entry<Resource, List<Statement>> entry : sortedEntries) {
            if (triplesIncluded >= maxTriples) {
                break;
            }

            Resource subject = entry.getKey();
            List<Statement> statements = entry.getValue();

            context.append(formatEntity(subject, statements));
            context.append("\n");

            triplesIncluded += statements.size();
        }

        context.append("\n=== End of Context ===");

        String result = context.toString();
        log.info("Context built: {} characters, {} triples", result.length(), triplesIncluded);

        return result;
    }

    /** Returns the CIM type priority score for a set of statements (lower = higher priority). */
    private int getTypePriority(List<Statement> statements) {
        for (Statement stmt : statements) {
            if (stmt.getPredicate().equals(RDF.type) && stmt.getObject().isResource()) {
                String typeUri = stmt.getObject().asResource().getURI();
                if (typeUri != null) {
                    String localName = typeUri.contains("#")
                            ? typeUri.substring(typeUri.lastIndexOf('#') + 1)
                            : typeUri.substring(typeUri.lastIndexOf('/') + 1);
                    return TYPE_PRIORITY.getOrDefault(localName, 99);
                }
            }
        }
        return 99;
    }

    /**
     * Group triples by subject resource
     */
    private Map<Resource, List<Statement>> groupTriplesBySubject(Model model) {
        Map<Resource, List<Statement>> grouped = new LinkedHashMap<>();

        StmtIterator iter = model.listStatements();
        while (iter.hasNext()) {
            Statement stmt = iter.nextStatement();
            Resource subject = stmt.getSubject();

            grouped.computeIfAbsent(subject, k -> new ArrayList<>()).add(stmt);
        }

        return grouped;
    }

    /**
     * Format entity with its properties
     */
    private String formatEntity(Resource subject, List<Statement> statements) {
        StringBuilder entity = new StringBuilder();

        // Get entity type
        String type = getType(statements);
        String label = getLabel(subject, statements);

        // Entity header
        entity.append("## ").append(label != null ? label : "Entity").append("\n");
        entity.append("URI: ").append(subject.getURI()).append("\n");

        if (type != null) {
            entity.append("Type: ").append(simplifyUri(type)).append("\n");
        }

        // Properties
        entity.append("\nProperties:\n");
        for (Statement stmt : statements) {
            Property predicate = stmt.getPredicate();
            RDFNode object = stmt.getObject();

            // Skip certain properties
            if (shouldSkipProperty(predicate)) {
                continue;
            }

            String propertyName = simplifyUri(predicate.getURI());
            String value = formatValue(object);

            entity.append("  - ").append(propertyName).append(": ").append(value).append("\n");
        }

        return entity.toString();
    }

    /**
     * Get RDF type of resource
     */
    private String getType(List<Statement> statements) {
        for (Statement stmt : statements) {
            if (stmt.getPredicate().equals(RDF.type)) {
                return stmt.getObject().toString();
            }
        }
        return null;
    }

    /**
     * Get label of resource
     */
    private String getLabel(Resource subject, List<Statement> statements) {
        // Try rdfs:label
        for (Statement stmt : statements) {
            if (stmt.getPredicate().equals(RDFS.label)) {
                return stmt.getObject().toString();
            }
        }

        // Try common name properties
        String[] namePredicates = {"name", "IdentifiedObject.name", "label", "title"};
        for (Statement stmt : statements) {
            String predUri = stmt.getPredicate().getURI();
            for (String namePred : namePredicates) {
                if (predUri.contains(namePred)) {
                    return stmt.getObject().toString();
                }
            }
        }

        // Fallback to URI fragment
        if (subject.getURI() != null) {
            String uri = subject.getURI();
            int lastSlash = Math.max(uri.lastIndexOf('/'), uri.lastIndexOf('#'));
            if (lastSlash >= 0 && lastSlash < uri.length() - 1) {
                return uri.substring(lastSlash + 1);
            }
        }

        return null;
    }

    /**
     * Check if property should be skipped
     */
    private boolean shouldSkipProperty(Property predicate) {
        String uri = predicate.getURI();
        return uri.equals(RDF.type.getURI()) ||
               uri.equals(RDFS.label.getURI()) ||
               uri.contains("System");
    }

    /**
     * Format RDF value for display
     */
    private String formatValue(RDFNode node) {
        if (node.isLiteral()) {
            Literal literal = node.asLiteral();
            String value = literal.getString();

            // Add datatype if available and not xsd:string
            if (literal.getDatatypeURI() != null &&
                !literal.getDatatypeURI().endsWith("#string")) {
                value += " (" + simplifyUri(literal.getDatatypeURI()) + ")";
            }

            return value;
        } else if (node.isResource()) {
            Resource resource = node.asResource();
            if (resource.getURI() != null) {
                return simplifyUri(resource.getURI());
            } else {
                return "[Blank Node]";
            }
        }

        return node.toString();
    }

    /**
     * Simplify URI to local name
     */
    private String simplifyUri(String uri) {
        if (uri == null) {
            return "unknown";
        }

        // Get local name after # or /
        int lastHash = uri.lastIndexOf('#');
        int lastSlash = uri.lastIndexOf('/');
        int split = Math.max(lastHash, lastSlash);

        if (split >= 0 && split < uri.length() - 1) {
            return uri.substring(split + 1);
        }

        return uri;
    }

    /**
     * Format list of triples as simple text
     *
     * @param statements List of RDF statements
     * @return Formatted text
     */
    public String formatTriples(List<Statement> statements) {
        StringBuilder formatted = new StringBuilder();

        for (Statement stmt : statements) {
            formatted.append(simplifyUri(stmt.getSubject().toString()))
                    .append(" -> ")
                    .append(simplifyUri(stmt.getPredicate().getURI()))
                    .append(" -> ")
                    .append(formatValue(stmt.getObject()))
                    .append("\n");
        }

        return formatted.toString();
    }

    /**
     * Build summary statistics of the context
     *
     * @param model RDF model
     * @return Summary string
     */
    public String buildContextSummary(Model model) {
        long tripleCount = model.size();

        Set<Resource> subjects = new HashSet<>();
        Set<Resource> types = new HashSet<>();

        StmtIterator iter = model.listStatements();
        while (iter.hasNext()) {
            Statement stmt = iter.nextStatement();
            subjects.add(stmt.getSubject());

            if (stmt.getPredicate().equals(RDF.type)) {
                if (stmt.getObject().isResource()) {
                    types.add(stmt.getObject().asResource());
                }
            }
        }

        return String.format(
            "Context Summary: %d triples, %d entities, %d types",
            tripleCount, subjects.size(), types.size()
        );
    }
}
