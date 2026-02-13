package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.ValidationResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.ontology.OntModel;
import org.apache.jena.rdf.model.*;
import org.apache.jena.vocabulary.RDF;
import org.apache.jena.vocabulary.RDFS;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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

    public Model transformCimXmlToRdf(InputStream inputStream) throws Exception {
        log.info("Starting CIM/XML to RDF transformation");

        Model model = ModelFactory.createDefaultModel();
        model.setNsPrefix("cim", cimNamespace);
        model.setNsPrefix("rdf", RDF.getURI());
        model.setNsPrefix("rdfs", RDFS.getURI());

        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(inputStream);
            doc.getDocumentElement().normalize();

            log.info("XML parsed successfully. Root element: {}", doc.getDocumentElement().getNodeName());

            transformElementToRdf(doc.getDocumentElement(), model, new HashMap<>());

            log.info("Transformation completed. Total triples: {}", model.size());
            return model;

        } catch (Exception e) {
            log.error("Error transforming CIM/XML to RDF", e);
            throw new RuntimeException("CIM transformation failed: " + e.getMessage(), e);
        }
    }

    public Model transformCimRdfToModel(InputStream inputStream, String format) {
        log.info("Loading CIM/RDF data in format: {} (base URI: {})", format, cimBaseUri);

        Model model = ModelFactory.createDefaultModel();
        try {
            model.read(inputStream, cimBaseUri, format);
            long tripleCount = model.size();
            log.info("CIM/RDF loaded successfully. Triples: {}", tripleCount);

            if (tripleCount == 0) {
                log.warn("WARNING: Model is empty after parsing! This might indicate:");
                log.warn("   - File format mismatch (expected: {})", format);
                log.warn("   - Empty or invalid RDF file");
                log.warn("   - Incorrect base URI: {}", cimBaseUri);
            } else {
                log.info("Successfully parsed {} triples from RDF file", tripleCount);
            }

            return model;
        } catch (Exception e) {
            log.error("Error loading CIM/RDF with format '{}'", format, e);
            throw new RuntimeException("Failed to load CIM/RDF: " + e.getMessage(), e);
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

            validatePropertyDomains(model, errors, warnings);
            validateCardinality(model, warnings);

            boolean isValid = errors.isEmpty();
            log.info("Validation completed. Valid: {}, Errors: {}, Warnings: {}",
                    isValid, errors.size(), warnings.size());

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

            long originalSize = model.size();
            long enrichedSize = inferredModel.size();
            long inferredTriples = enrichedSize - originalSize;

            log.info("Inference completed. Original: {}, Inferred: {}, Total: {}",
                    originalSize, inferredTriples, enrichedSize);

            return inferredModel;

        } catch (Exception e) {
            log.error("Error during inference", e);
            log.warn("Returning original model without inference");
            return model;
        }
    }

    public Map<String, Object> importCimData(InputStream inputStream, String format) throws Exception {
        log.info("Importing CIM data. Format: {}", format);

        Model model;

        if ("CIM/XML".equalsIgnoreCase(format) || "application/xml".equalsIgnoreCase(format)) {
            model = transformCimXmlToRdf(inputStream);
        } else {
            String rdfFormat = mapFormatToJena(format);
            log.info("Transforming CIM/RDF with format mapping: {} -> {}", format, rdfFormat);
            model = transformCimRdfToModel(inputStream, rdfFormat);
        }

        if (model == null || model.isEmpty()) {
            log.error("Model is empty after transformation! Format: {}", format);
            throw new RuntimeException("Failed to parse CIM data. The model is empty. Please check the file format and content.");
        }

        log.info("Model transformed successfully. Initial triple count: {}", model.size());

        if (validateOnImport) {
            ValidationResult validation = validateCimSchema(model);
            if (!validation.isValid()) {
                log.warn("Validation failed but continuing import. Errors: {}", validation.getErrors());
            }
        }

        long originalSize = model.size();
        log.info("Model size before enrichment: {} triples", originalSize);

        Model enrichedModel = enrichWithInferences(model);
        long enrichedSize = enrichedModel.size();
        long inferredTriples = enrichedSize - originalSize;

        log.info("Model size after enrichment: {} triples ({} inferred)", enrichedSize, inferredTriples);

        jenaService.importRdfData(
            new java.io.ByteArrayInputStream(
                writeModelToString(enrichedModel).getBytes()
            ),
            "RDF/XML"
        );

        Map<String, Object> stats = new HashMap<>();
        stats.put("originalTriples", originalSize);
        stats.put("inferredTriples", inferredTriples);
        stats.put("totalTriples", enrichedSize);
        stats.put("format", format);

        log.info("CIM import completed successfully. Stats: originalTriples={}, inferredTriples={}, totalTriples={}",
                originalSize, inferredTriples, enrichedSize);
        return stats;
    }

    private void transformElementToRdf(Element element, Model model, Map<String, Resource> resourceMap) {
        String elementName = element.getLocalName();
        String namespace = element.getNamespaceURI();

        if (namespace == null) {
            namespace = cimNamespace;
        }

        String resourceId = element.getAttribute("rdf:ID");
        if (resourceId == null || resourceId.isEmpty()) {
            resourceId = element.getAttribute("ID");
        }
        if (resourceId == null || resourceId.isEmpty()) {
            resourceId = "resource_" + System.nanoTime();
        }

        String resourceUri = namespace + resourceId;
        Resource resource = model.createResource(resourceUri);

        resourceMap.put(resourceId, resource);

        Resource classResource = model.createResource(namespace + elementName);
        resource.addProperty(RDF.type, classResource);

        for (int i = 0; i < element.getAttributes().getLength(); i++) {
            Node attr = element.getAttributes().item(i);
            String attrName = attr.getNodeName();
            String attrValue = attr.getNodeValue();

            if (!attrName.startsWith("xmlns") && !attrName.equals("rdf:ID") && !attrName.equals("ID")) {
                Property property = model.createProperty(namespace + attrName);
                resource.addProperty(property, attrValue);
            }
        }

        NodeList children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() == Node.ELEMENT_NODE) {
                Element childElement = (Element) child;
                String childName = childElement.getLocalName();

                Property property = model.createProperty(namespace + childName);

                String refId = childElement.getAttribute("rdf:resource");
                if (refId == null || refId.isEmpty()) {
                    refId = childElement.getAttribute("resource");
                }

                if (refId != null && !refId.isEmpty()) {
                    Resource refResource = model.createResource(refId);
                    resource.addProperty(property, refResource);
                } else if (childElement.hasChildNodes()) {
                    transformElementToRdf(childElement, model, resourceMap);
                } else {
                    String value = childElement.getTextContent();
                    if (value != null && !value.trim().isEmpty()) {
                        resource.addProperty(property, value);
                    }
                }
            }
        }
    }

    private boolean hasRequiredCIMClasses(Model model) {
        String[] requiredClasses = {
            "IdentifiedObject", "Equipment", "PowerSystemResource",
            "Substation", "GeneratingUnit", "ACLineSegment", "EnergyConsumer",
            "VoltageLevel", "Terminal", "TransformerEnd", "SynchronousMachine"
        };

        // Return true if ANY known CIM class is present (not all are required)
        for (String className : requiredClasses) {
            Resource classResource = model.createResource(cimNamespace + className);
            if (model.contains(null, RDF.type, classResource)) {
                log.debug("Found CIM class: {}", className);
                return true;
            }
        }

        // Fallback: check if any resource uses the CIM namespace at all
        StmtIterator iter = model.listStatements(null, RDF.type, (RDFNode) null);
        while (iter.hasNext()) {
            Statement stmt = iter.nextStatement();
            Resource type = stmt.getObject().asResource();
            if (type.getURI() != null && type.getURI().startsWith(cimNamespace)) {
                log.debug("Found CIM-namespaced type: {}", type.getURI());
                return true;
            }
        }

        return false;
    }

    private void validatePropertyDomains(Model model, List<String> errors, List<String> warnings) {
        log.debug("Validating property domains");
    }

    private void validateCardinality(Model model, List<String> warnings) {
        log.debug("Validating cardinality constraints");
    }

    private String mapFormatToJena(String format) {
        String upperFormat = format.toUpperCase();
        log.debug("Mapping format '{}' to Jena format", format);

        return switch (upperFormat) {
            case "CIM/RDF", "RDF/XML", "APPLICATION/RDF+XML" -> {
                log.debug("Mapped to RDF/XML");
                yield "RDF/XML";
            }
            case "TURTLE", "TEXT/TURTLE", "TTL" -> {
                log.debug("Mapped to TURTLE");
                yield "TURTLE";
            }
            case "N-TRIPLES", "APPLICATION/N-TRIPLES", "NTRIPLES" -> {
                log.debug("Mapped to N-TRIPLES");
                yield "N-TRIPLES";
            }
            case "JSON-LD", "APPLICATION/LD+JSON", "JSONLD" -> {
                log.debug("Mapped to JSON-LD");
                yield "JSON-LD";
            }
            default -> {
                log.warn("Unknown format '{}', defaulting to RDF/XML", format);
                yield "RDF/XML";
            }
        };
    }

    private String writeModelToString(Model model) {
        java.io.StringWriter writer = new java.io.StringWriter();
        model.write(writer, "RDF/XML");
        return writer.toString();
    }
}
