package com.cim.semanticgraph.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.jena.ontology.OntModel;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.rdfconnection.RDFConnection;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class JenaService {

    private final OntModel ontModel;
    private final RDFConnection rdfConnection;

    @Value("${jena.query.max-results}")
    private int maxResults;

    @Value("${cim.namespaces.cim}")
    private String cimNamespace;

    @Value("${cim.namespaces.rdf}")
    private String rdfNamespace;

    @Value("${cim.namespaces.rdfs}")
    private String rdfsNamespace;

    public JenaService(OntModel ontModel, RDFConnection rdfConnection) {
        this.ontModel = ontModel;
        this.rdfConnection = rdfConnection;
    }

    // ── Write ──────────────────────────────────────────────────────────────────

    public void addModel(Model model) {
        log.info("Loading {} triples to Fuseki", model.size());
        try {
            rdfConnection.load(model);
            log.info("Model loaded to Fuseki successfully");
        } catch (Exception e) {
            log.error("Error loading model to Fuseki", e);
            throw new RuntimeException("Failed to load model to Fuseki: " + e.getMessage(), e);
        }
    }

    public void importRdfData(InputStream inputStream, String format) {
        log.info("Importing RDF data (format: {})", format);
        Model tempModel = ModelFactory.createDefaultModel();
        try {
            tempModel.read(inputStream, null, format);
            log.info("Read {} triples from input stream", tempModel.size());
            rdfConnection.load(tempModel);
            log.info("RDF data imported to Fuseki: {} triples", tempModel.size());
        } catch (Exception e) {
            log.error("RDF import failed", e);
            throw new RuntimeException("RDF import failed: " + e.getMessage(), e);
        } finally {
            tempModel.close();
        }
    }

    public void executeSparqlUpdate(String sparqlUpdate) {
        log.debug("Executing SPARQL UPDATE via Fuseki");
        try {
            rdfConnection.update(addPrefixes(sparqlUpdate));
            log.info("SPARQL UPDATE executed successfully");
        } catch (Exception e) {
            log.error("SPARQL UPDATE failed", e);
            throw new RuntimeException("SPARQL UPDATE failed: " + e.getMessage(), e);
        }
    }

    public void clearKnowledgeGraph() {
        log.warn("Clearing entire knowledge graph via Fuseki...");
        try {
            rdfConnection.update("DROP ALL");
            log.info("Knowledge graph cleared via Fuseki");
        } catch (Exception e) {
            log.error("Clear failed", e);
            throw new RuntimeException("Clear failed: " + e.getMessage(), e);
        }
    }

    /**
     * Load a model into a named graph (in addition to the default graph).
     * Used for versioning: each import gets its own named graph for potential rollback.
     */
    public void loadToNamedGraph(String graphUri, Model model) {
        log.info("Loading {} triples into named graph <{}>", model.size(), graphUri);
        try {
            rdfConnection.load(graphUri, model);
            log.info("Named graph <{}> populated successfully", graphUri);
        } catch (Exception e) {
            log.error("Failed to load named graph <{}>: {}", graphUri, e.getMessage());
            throw new RuntimeException("Named graph load failed: " + e.getMessage(), e);
        }
    }

    /**
     * Rollback an import: remove from the default graph all triples present in the given named graph,
     * then drop the named graph itself.
     */
    public void rollbackNamedGraph(String graphUri) {
        log.warn("Rolling back import — removing triples of named graph <{}>", graphUri);
        try {
            // Step 1: delete from default graph every triple that came from this named graph
            String deleteQuery = String.format(
                "DELETE { ?s ?p ?o } WHERE { GRAPH <%s> { ?s ?p ?o } }", graphUri);
            rdfConnection.update(deleteQuery);
            log.info("Triples from <{}> removed from default graph", graphUri);

            // Step 2: drop the named graph itself
            rdfConnection.update(String.format("DROP GRAPH <%s>", graphUri));
            log.info("Named graph <{}> dropped", graphUri);
        } catch (Exception e) {
            log.error("Rollback of <{}> failed: {}", graphUri, e.getMessage());
            throw new RuntimeException("Rollback failed: " + e.getMessage(), e);
        }
    }

    /**
     * List all named graph URIs in the dataset (excluding the default graph).
     */
    public List<String> listNamedGraphs() {
        try {
            List<Map<String, String>> rows = executeSparqlSelect(
                "SELECT DISTINCT ?g WHERE { GRAPH ?g { } }");
            return rows.stream()
                    .map(r -> r.get("g"))
                    .filter(g -> g != null && !g.isBlank())
                    .toList();
        } catch (Exception e) {
            log.warn("listNamedGraphs failed: {}", e.getMessage());
            return List.of();
        }
    }

    // ── Read ───────────────────────────────────────────────────────────────────

    public List<Map<String, String>> executeSparqlSelect(String sparqlQuery) {
        log.debug("Executing SPARQL SELECT via Fuseki");
        List<Map<String, String>> results = new ArrayList<>();

        try (QueryExecution qexec = rdfConnection.query(addPrefixes(sparqlQuery))) {
            ResultSet resultSet = qexec.execSelect();
            int count = 0;
            while (resultSet.hasNext() && count < maxResults) {
                QuerySolution solution = resultSet.nextSolution();
                Map<String, String> row = new HashMap<>();
                solution.varNames().forEachRemaining(v -> {
                    if (solution.get(v) != null) row.put(v, solution.get(v).toString());
                });
                results.add(row);
                count++;
            }
            log.debug("SELECT returned {} results", results.size());
        } catch (Exception e) {
            log.error("SPARQL SELECT failed", e);
            throw new RuntimeException("SPARQL SELECT failed: " + e.getMessage(), e);
        }
        return results;
    }

    public Model executeSparqlConstruct(String sparqlQuery) {
        log.debug("Executing SPARQL CONSTRUCT via Fuseki");
        try {
            Model result = rdfConnection.queryConstruct(addPrefixes(sparqlQuery));
            log.debug("CONSTRUCT returned {} triples", result.size());
            return result;
        } catch (Exception e) {
            log.error("SPARQL CONSTRUCT failed", e);
            throw new RuntimeException("SPARQL CONSTRUCT failed: " + e.getMessage(), e);
        }
    }

    public boolean executeSparqlAsk(String sparqlQuery) {
        log.debug("Executing SPARQL ASK via Fuseki");
        try {
            boolean result = rdfConnection.queryAsk(addPrefixes(sparqlQuery));
            log.debug("ASK result: {}", result);
            return result;
        } catch (Exception e) {
            log.error("SPARQL ASK failed", e);
            throw new RuntimeException("SPARQL ASK failed: " + e.getMessage(), e);
        }
    }

    public Model getModelCopy() {
        log.debug("Fetching full model copy from Fuseki");
        try {
            return rdfConnection.queryConstruct("CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }");
        } catch (Exception e) {
            log.error("Failed to fetch model from Fuseki", e);
            throw new RuntimeException("Failed to fetch model from Fuseki: " + e.getMessage(), e);
        }
    }

    public String exportRdfData(String format) {
        log.info("Exporting RDF data (format: {})", format);
        try {
            Model model = rdfConnection.fetch();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            model.write(out, format);
            String result = out.toString();
            log.info("RDF data exported: {} bytes", result.length());
            return result;
        } catch (Exception e) {
            log.error("RDF export failed", e);
            throw new RuntimeException("RDF export failed: " + e.getMessage(), e);
        }
    }

    public long getTripleCount() {
        try {
            List<Map<String, String>> results = executeSparqlSelect(
                    "SELECT (COUNT(*) AS ?count) WHERE { ?s ?p ?o }");
            if (!results.isEmpty() && results.get(0).containsKey("count")) {
                return parseCountValue(results.get(0).get("count"));
            }
        } catch (Exception e) {
            log.error("Error getting triple count from Fuseki", e);
        }
        return 0;
    }

    public List<Map<String, String>> getResourceTriples(String resourceUri) {
        return executeSparqlSelect("""
            SELECT ?p ?o
            WHERE { <%s> ?p ?o . }
            """.formatted(resourceUri));
    }

    public Map<String, Object> getGraphStatistics() {
        log.info("Calculating knowledge graph statistics via Fuseki...");
        Map<String, Object> stats = new HashMap<>();

        stats.put("totalTriples",      countFuseki("SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }"));
        stats.put("totalSubjects",     countFuseki("SELECT (COUNT(DISTINCT ?s) as ?count) WHERE { ?s ?p ?o }"));
        stats.put("totalPredicates",   countFuseki("SELECT (COUNT(DISTINCT ?p) as ?count) WHERE { ?s ?p ?o }"));
        stats.put("totalClasses",      countFuseki("SELECT (COUNT(DISTINCT ?class) as ?count) WHERE { ?s rdf:type ?class }"));

        stats.put("substations",       countCimEntities("Substation"));
        stats.put("generators",        countCimEntities("GeneratingUnit", "SynchronousMachine"));
        stats.put("transmissionLines", countCimEntities("ACLineSegment"));
        stats.put("transformers",      countCimEntities("PowerTransformer"));
        stats.put("breakers",          countCimEntities("Breaker"));
        stats.put("disconnectors",     countCimEntities("Disconnector"));
        stats.put("loads",             countCimEntities("EnergyConsumer"));
        stats.put("connectivityNodes", countCimEntities("ConnectivityNode"));
        stats.put("terminals",         countCimEntities("Terminal"));
        stats.put("busbarSections",    countCimEntities("BusbarSection"));
        stats.put("baseVoltages",      countCimEntities("BaseVoltage"));
        stats.put("voltageLevels",     countCimEntities("VoltageLevel"));

        log.info("Statistics calculated: {}", stats);
        return stats;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private long countFuseki(String queryString) {
        try {
            List<Map<String, String>> results = executeSparqlSelect(queryString);
            if (!results.isEmpty() && results.get(0).containsKey("count")) {
                return parseCountValue(results.get(0).get("count"));
            }
        } catch (Exception e) {
            log.error("Count query failed: {}", e.getMessage());
        }
        return 0;
    }

    private long countCimEntities(String... entityTypes) {
        StringBuilder q = new StringBuilder("SELECT (COUNT(DISTINCT ?entity) as ?count) WHERE { ");
        if (entityTypes.length == 1) {
            q.append("?entity rdf:type cim:").append(entityTypes[0]).append(" . ");
        } else {
            q.append("{ ");
            for (int i = 0; i < entityTypes.length; i++) {
                if (i > 0) q.append(" UNION ");
                q.append("{ ?entity rdf:type cim:").append(entityTypes[i]).append(" } ");
            }
            q.append("} ");
        }
        q.append("}");
        return countFuseki(q.toString());
    }

    private String addPrefixes(String query) {
        if (query.contains("PREFIX")) return query;
        return "PREFIX cim: <"  + cimNamespace  + ">\n"
             + "PREFIX rdf: <"  + rdfNamespace  + ">\n"
             + "PREFIX rdfs: <" + rdfsNamespace + ">\n"
             + "PREFIX owl: <http://www.w3.org/2002/07/owl#>\n\n"
             + query;
    }

    private long parseCountValue(String rawValue) {
        if (rawValue == null) return 0;
        String sanitized = rawValue.replaceAll("\\^\\^.*", "").replace("\"", "").trim();
        if (sanitized.isEmpty()) return 0;
        try {
            return Long.parseLong(sanitized);
        } catch (NumberFormatException ex) {
            log.warn("Unable to parse count value '{}': {}", rawValue, ex.getMessage());
            return 0;
        }
    }
}
