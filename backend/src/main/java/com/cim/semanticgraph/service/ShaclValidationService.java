package com.cim.semanticgraph.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.graph.Graph;
import org.apache.jena.rdf.model.*;
import org.apache.jena.shacl.ShaclValidator;
import org.apache.jena.shacl.Shapes;
import org.apache.jena.shacl.ValidationReport;
import org.apache.jena.shacl.validation.ReportEntry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShaclValidationService {

    private final JenaService jenaService;

    @Value("${shacl.shapes-path:classpath:shacl/cim-shapes.ttl}")
    private String shapesPath;

    private Shapes shapes;
    private boolean shapesLoaded = false;

    @PostConstruct
    public void init() {
        loadShapes();
    }

    private void loadShapes() {
        try {
            ClassPathResource resource = new ClassPathResource("shacl/cim-shapes.ttl");
            if (resource.exists()) {
                try (InputStream is = resource.getInputStream()) {
                    Model shapesModel = ModelFactory.createDefaultModel();
                    shapesModel.read(is, null, "TURTLE");
                    Graph shapesGraph = shapesModel.getGraph();
                    shapes = Shapes.parse(shapesGraph);
                    shapesLoaded = true;
                    log.info("SHACL shapes loaded successfully from {}", shapesPath);
                }
            } else {
                shapes = createDefaultCimShapes();
                shapesLoaded = true;
                log.info("Using default CIM SHACL shapes");
            }
        } catch (Exception e) {
            log.warn("Could not load SHACL shapes: {}. Using default shapes.", e.getMessage());
            shapes = createDefaultCimShapes();
            shapesLoaded = true;
        }
    }

    public ValidationResult validateGraph() {
        log.info("Starting SHACL validation of knowledge graph");
        long startTime = System.currentTimeMillis();

        if (!shapesLoaded || shapes == null) {
            return ValidationResult.builder()
                    .valid(false)
                    .errorCount(1)
                    .warningCount(0)
                    .violations(List.of(new Violation(
                            "SHAPES_ERROR",
                            "SHACL shapes not loaded",
                            "ERROR",
                            null, null
                    )))
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .build();
        }

        try {
            Model model = jenaService.getModelCopy();

            if (model == null || model.isEmpty()) {
                return ValidationResult.builder()
                        .valid(true)
                        .errorCount(0)
                        .warningCount(0)
                        .violations(List.of())
                        .message("Knowledge graph is empty - nothing to validate")
                        .executionTimeMs(System.currentTimeMillis() - startTime)
                        .build();
            }

            ValidationReport report = ShaclValidator.get().validate(shapes, model.getGraph());

            List<Violation> violations = new ArrayList<>();
            int errorCount = 0;
            int warningCount = 0;

            for (ReportEntry entry : report.getEntries()) {
                String severity = getSeverity(entry);
                if ("ERROR".equals(severity)) {
                    errorCount++;
                } else {
                    warningCount++;
                }

                violations.add(new Violation(
                        entry.resultPath() != null ? entry.resultPath().toString() : "Unknown",
                        entry.message(),
                        severity,
                        entry.focusNode() != null ? entry.focusNode().toString() : null,
                        entry.value() != null ? entry.value().toString() : null
                ));
            }

            long executionTime = System.currentTimeMillis() - startTime;
            log.info("SHACL validation completed in {} ms. Valid: {}, Errors: {}, Warnings: {}",
                    executionTime, report.conforms(), errorCount, warningCount);

            return ValidationResult.builder()
                    .valid(report.conforms())
                    .errorCount(errorCount)
                    .warningCount(warningCount)
                    .violations(violations)
                    .triplesValidated(model.size())
                    .executionTimeMs(executionTime)
                    .message(report.conforms() ? "All constraints satisfied" :
                            errorCount + " errors and " + warningCount + " warnings found")
                    .build();

        } catch (Exception e) {
            log.error("Error during SHACL validation", e);
            return ValidationResult.builder()
                    .valid(false)
                    .errorCount(1)
                    .violations(List.of(new Violation(
                            "VALIDATION_ERROR",
                            e.getMessage(),
                            "ERROR",
                            null, null
                    )))
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .build();
        }
    }

    public ValidationResult validateModel(Model model) {
        log.info("Validating model against SHACL constraints");
        long startTime = System.currentTimeMillis();

        if (!shapesLoaded || shapes == null) {
            return ValidationResult.builder()
                    .valid(false)
                    .errorCount(1)
                    .violations(List.of(new Violation(
                            "SHAPES_ERROR",
                            "SHACL shapes not loaded",
                            "ERROR",
                            null, null
                    )))
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .build();
        }

        try {
            ValidationReport report = ShaclValidator.get().validate(shapes, model.getGraph());

            List<Violation> violations = new ArrayList<>();
            int errorCount = 0;
            int warningCount = 0;

            for (ReportEntry entry : report.getEntries()) {
                String severity = getSeverity(entry);
                if ("ERROR".equals(severity)) {
                    errorCount++;
                } else {
                    warningCount++;
                }

                violations.add(new Violation(
                        entry.resultPath() != null ? entry.resultPath().toString() : "Unknown",
                        entry.message(),
                        severity,
                        entry.focusNode() != null ? entry.focusNode().toString() : null,
                        entry.value() != null ? entry.value().toString() : null
                ));
            }

            return ValidationResult.builder()
                    .valid(report.conforms())
                    .errorCount(errorCount)
                    .warningCount(warningCount)
                    .violations(violations)
                    .triplesValidated(model.size())
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .build();

        } catch (Exception e) {
            log.error("Error validating model", e);
            return ValidationResult.builder()
                    .valid(false)
                    .errorCount(1)
                    .violations(List.of(new Violation(
                            "VALIDATION_ERROR",
                            e.getMessage(),
                            "ERROR",
                            null, null
                    )))
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .build();
        }
    }

    private String getSeverity(ReportEntry entry) {
        if (entry.severity() != null) {
            String severity = entry.severity().toString().toLowerCase();
            if (severity.contains("violation")) return "ERROR";
            if (severity.contains("warning")) return "WARNING";
            if (severity.contains("info")) return "INFO";
        }
        return "ERROR";
    }

    private Shapes createDefaultCimShapes() {
        log.info("Creating default CIM SHACL shapes");

        String shapesStr = """
            @prefix sh: <http://www.w3.org/ns/shacl#> .
            @prefix cim: <http://iec.ch/TC57/CIM100#> .
            @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
            @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            # IdentifiedObject must have a name
            cim:IdentifiedObjectShape
                a sh:NodeShape ;
                sh:targetClass cim:IdentifiedObject ;
                sh:property [
                    sh:path cim:IdentifiedObject.name ;
                    sh:minCount 0 ;
                    sh:maxCount 1 ;
                    sh:datatype xsd:string ;
                    sh:message "IdentifiedObject should have a name" ;
                    sh:severity sh:Warning ;
                ] .

            # Substation constraints
            cim:SubstationShape
                a sh:NodeShape ;
                sh:targetClass cim:Substation ;
                sh:property [
                    sh:path cim:IdentifiedObject.name ;
                    sh:minCount 1 ;
                    sh:message "Substation must have a name" ;
                    sh:severity sh:Violation ;
                ] ;
                sh:property [
                    sh:path cim:Substation.Region ;
                    sh:minCount 0 ;
                    sh:maxCount 1 ;
                    sh:message "Substation should belong to a Region" ;
                    sh:severity sh:Warning ;
                ] .

            # VoltageLevel constraints
            cim:VoltageLevelShape
                a sh:NodeShape ;
                sh:targetClass cim:VoltageLevel ;
                sh:property [
                    sh:path cim:VoltageLevel.BaseVoltage ;
                    sh:minCount 0 ;
                    sh:message "VoltageLevel should have a BaseVoltage" ;
                    sh:severity sh:Warning ;
                ] ;
                sh:property [
                    sh:path cim:VoltageLevel.Substation ;
                    sh:minCount 0 ;
                    sh:message "VoltageLevel should belong to a Substation" ;
                    sh:severity sh:Warning ;
                ] .

            # Terminal constraints
            cim:TerminalShape
                a sh:NodeShape ;
                sh:targetClass cim:Terminal ;
                sh:property [
                    sh:path cim:Terminal.ConductingEquipment ;
                    sh:minCount 1 ;
                    sh:message "Terminal must be connected to ConductingEquipment" ;
                    sh:severity sh:Violation ;
                ] ;
                sh:property [
                    sh:path cim:Terminal.ConnectivityNode ;
                    sh:minCount 0 ;
                    sh:maxCount 1 ;
                    sh:message "Terminal should have a ConnectivityNode" ;
                    sh:severity sh:Warning ;
                ] .

            # ACLineSegment constraints
            cim:ACLineSegmentShape
                a sh:NodeShape ;
                sh:targetClass cim:ACLineSegment ;
                sh:property [
                    sh:path cim:Conductor.length ;
                    sh:minCount 0 ;
                    sh:message "ACLineSegment should have a length" ;
                    sh:severity sh:Warning ;
                ] ;
                sh:property [
                    sh:path cim:ACLineSegment.r ;
                    sh:minCount 0 ;
                    sh:message "ACLineSegment should have resistance" ;
                    sh:severity sh:Warning ;
                ] .

            # GeneratingUnit constraints
            cim:GeneratingUnitShape
                a sh:NodeShape ;
                sh:targetClass cim:GeneratingUnit ;
                sh:property [
                    sh:path cim:GeneratingUnit.maxOperatingP ;
                    sh:minCount 0 ;
                    sh:nodeKind sh:Literal ;
                    sh:message "GeneratingUnit should have maxOperatingP" ;
                    sh:severity sh:Warning ;
                ] ;
                sh:property [
                    sh:path cim:GeneratingUnit.minOperatingP ;
                    sh:minCount 0 ;
                    sh:nodeKind sh:Literal ;
                    sh:message "GeneratingUnit should have minOperatingP" ;
                    sh:severity sh:Warning ;
                ] .

            # BaseVoltage constraints
            cim:BaseVoltageShape
                a sh:NodeShape ;
                sh:targetClass cim:BaseVoltage ;
                sh:property [
                    sh:path cim:BaseVoltage.nominalVoltage ;
                    sh:minCount 1 ;
                    sh:message "BaseVoltage must have a nominalVoltage" ;
                    sh:severity sh:Violation ;
                ] .
            """;

        try {
            Model shapesModel = ModelFactory.createDefaultModel();
            shapesModel.read(new java.io.StringReader(shapesStr), null, "TURTLE");
            return Shapes.parse(shapesModel.getGraph());
        } catch (Exception e) {
            log.error("Error creating default shapes: {}", e.getMessage());
            return null;
        }
    }

    public List<String> getAvailableShapes() {
        if (shapes == null) return List.of();

        List<String> shapeNames = new ArrayList<>();
        shapes.forEach(shape -> {
            if (shape.getShapeNode() != null) {
                shapeNames.add(shape.getShapeNode().toString());
            }
        });
        return shapeNames;
    }

    @lombok.Builder
    @lombok.Data
    public static class ValidationResult {
        private boolean valid;
        private int errorCount;
        private int warningCount;
        private List<Violation> violations;
        private long triplesValidated;
        private long executionTimeMs;
        private String message;
    }

    @lombok.AllArgsConstructor
    @lombok.Data
    public static class Violation {
        private String path;
        private String message;
        private String severity;
        private String focusNode;
        private String value;
    }
}
