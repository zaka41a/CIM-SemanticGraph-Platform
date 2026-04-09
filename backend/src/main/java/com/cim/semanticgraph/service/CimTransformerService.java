package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.ValidationResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.ontology.OntModel;
import org.apache.jena.rdf.model.*;
import org.apache.jena.riot.Lang;
import org.apache.jena.riot.RDFLanguages;
import org.apache.jena.riot.RDFParser;
import org.apache.jena.riot.system.ErrorHandlerFactory;
import org.apache.jena.vocabulary.RDF;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class CimTransformerService {

    private final JenaService jenaService;
    private final OntModel ontModel;

    @Value("${cim.schema.base-uri}")
    private String cimBaseUri;

    @Value("${cim.namespaces.cim}")
    private String cimNamespace;

    @Value("${cim.import.validate}")
    private boolean validateOnImport;

    // Fix UUIDs without dashes: urn:uuid:8abccff5f05c45bc9b6870ce301f3a70 → urn:uuid:8abccff5-f05c-45bc-9b68-70ce301f3a70
    private static final Pattern BARE_UUID = Pattern.compile(
            "urn:uuid:([0-9a-fA-F]{8})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{12})");

    private byte[] fixUuids(byte[] bytes) {
        String content = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        String fixed = BARE_UUID.matcher(content).replaceAll("urn:uuid:$1-$2-$3-$4-$5");
        return fixed.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    /**
     * Parse any RDF format (CIM/XML, CIM/RDF, RDF/XML, TURTLE, N-TRIPLES, JSON-LD)
     * using Jena's RDFParser with lenient error handling and proper base URI resolution.
     */
    public Model transformCimRdfToModel(InputStream inputStream, String format) {
        // Remove trailing '#' to avoid double-# when resolving relative fragment IRIs like #_uuid
        String baseUri = cimBaseUri.endsWith("#")
                ? cimBaseUri.substring(0, cimBaseUri.length() - 1)
                : cimBaseUri;

        log.info("Parsing RDF data: format={}, baseUri={}", format, baseUri);
        Model model = ModelFactory.createDefaultModel();
        try {
            Lang lang = RDFLanguages.nameToLang(format);
            if (lang == null) lang = Lang.RDFXML;

            // Fix malformed urn:uuid: (no dashes) before passing to Jena's strict IRI validator
            byte[] content = fixUuids(inputStream.readAllBytes());

            RDFParser.create()
                    .source(new java.io.ByteArrayInputStream(content))
                    .base(baseUri)
                    .lang(lang)
                    .checking(false)
                    .errorHandler(ErrorHandlerFactory.errorHandlerWarn)
                    .parse(model.getGraph());

            long tripleCount = model.size();
            if (tripleCount == 0) {
                log.warn("Model is empty after parsing (format={}, baseUri={})", format, baseUri);
            } else {
                log.info("Parsed {} triples successfully", tripleCount);
            }
            return model;
        } catch (Exception e) {
            log.error("Failed to parse RDF format '{}'", format, e);
            throw new RuntimeException("Failed to parse RDF: " + e.getMessage(), e);
        }
    }

    public ValidationResult validateCimSchema(Model model) {
        log.info("Validating CIM schema compliance");
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        try {
            if (!hasRequiredCIMClasses(model)) {
                errors.add("Model does not contain required CIM classes");
            }

            boolean isValid = errors.isEmpty();
            log.info("Validation completed. Valid: {}, Errors: {}, Warnings: {}", isValid, errors.size(), warnings.size());

            return ValidationResult.builder()
                    .valid(isValid)
                    .errors(errors)
                    .warnings(warnings)
                    .build();
        } catch (Exception e) {
            log.error("Error during validation", e);
            errors.add("Validation error: " + e.getMessage());
            return ValidationResult.builder()
                    .valid(false)
                    .errors(errors)
                    .warnings(warnings)
                    .build();
        }
    }

    public Model enrichWithInferences(Model model) {
        log.info("Enriching model with OWL inferences");
        try {
            OntModel reasoningModel = ModelFactory.createOntologyModel();
            reasoningModel.add(model);
            if (ontModel != null && ontModel.size() > 0) {
                reasoningModel.addSubModel(ontModel);
            }
            Model inferredModel = ModelFactory.createDefaultModel();
            inferredModel.add(reasoningModel);
            log.info("Inference completed. Original: {}, Total: {}", model.size(), inferredModel.size());
            return inferredModel;
        } catch (Exception e) {
            log.warn("Inference failed, returning original model: {}", e.getMessage());
            return model;
        }
    }

    public Map<String, Object> importCimData(InputStream inputStream, String format) throws Exception {
        return importCimData(inputStream, format, null);
    }

    public Map<String, Object> importCimData(InputStream inputStream, String format, String graphUri) throws Exception {
        log.info("Importing CIM data. Format: {}, graphUri: {}", format, graphUri);

        String rdfFormat = mapFormatToJena(format);
        Model model = transformCimRdfToModel(inputStream, rdfFormat);

        if (model == null || model.isEmpty()) {
            throw new RuntimeException("Failed to parse CIM data — model is empty. Check the file format and content.");
        }

        log.info("Parsed {} triples. Format: {}", model.size(), format);

        if (validateOnImport) {
            ValidationResult validation = validateCimSchema(model);
            if (!validation.isValid()) {
                log.warn("Validation warnings during import: {}", validation.getErrors());
            }
        }

        long originalSize = model.size();
        Model enrichedModel = enrichWithInferences(model);
        long enrichedSize = enrichedModel.size();
        long inferredTriples = enrichedSize - originalSize;

        // Import into default graph (keeps all SPARQL queries working)
        jenaService.importRdfData(
            new java.io.ByteArrayInputStream(writeModelToString(enrichedModel).getBytes()),
            "RDF/XML"
        );

        // Also load into named graph for rollback versioning
        if (graphUri != null && !graphUri.isBlank()) {
            try {
                jenaService.loadToNamedGraph(graphUri, enrichedModel);
                log.info("Import also stored in named graph <{}> for rollback", graphUri);
            } catch (Exception e) {
                log.warn("Named graph versioning failed (import still succeeded): {}", e.getMessage());
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("originalTriples", originalSize);
        stats.put("inferredTriples", inferredTriples);
        stats.put("totalTriples", enrichedSize);
        stats.put("format", format);
        if (graphUri != null) stats.put("graphUri", graphUri);

        log.info("Import complete. original={}, inferred={}, total={}", originalSize, inferredTriples, enrichedSize);
        return stats;
    }

    private boolean hasRequiredCIMClasses(Model model) {
        String[] knownClasses = {
            "IdentifiedObject", "Equipment", "PowerSystemResource",
            "Substation", "GeneratingUnit", "ACLineSegment", "EnergyConsumer",
            "VoltageLevel", "Terminal", "TransformerEnd", "SynchronousMachine"
        };
        for (String cls : knownClasses) {
            if (model.contains(null, RDF.type, model.createResource(cimNamespace + cls))) {
                return true;
            }
        }
        // Fallback: any type from the CIM namespace
        StmtIterator iter = model.listStatements(null, RDF.type, (RDFNode) null);
        while (iter.hasNext()) {
            Resource type = iter.nextStatement().getObject().asResource();
            if (type.getURI() != null && type.getURI().startsWith(cimNamespace)) {
                return true;
            }
        }
        return false;
    }

    private String mapFormatToJena(String format) {
        return switch (format.toUpperCase()) {
            case "CIM/XML", "CIM/RDF", "RDF/XML", "APPLICATION/RDF+XML", "APPLICATION/XML" -> "RDF/XML";
            case "TURTLE", "TEXT/TURTLE", "TTL" -> "TURTLE";
            case "N-TRIPLES", "APPLICATION/N-TRIPLES", "NTRIPLES" -> "N-TRIPLES";
            case "JSON-LD", "APPLICATION/LD+JSON", "JSONLD" -> "JSON-LD";
            default -> { log.warn("Unknown format '{}', defaulting to RDF/XML", format); yield "RDF/XML"; }
        };
    }

    private String writeModelToString(Model model) {
        java.io.StringWriter writer = new java.io.StringWriter();
        model.write(writer, "RDF/XML");
        return writer.toString();
    }
}
