package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.service.JenaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/sparql")
@RequiredArgsConstructor
@Tag(name = "SPARQL", description = "SPARQL query execution")
public class SparqlController {

    private final JenaService jenaService;

    @PostMapping("/query")
    @Operation(summary = "Execute SPARQL query", description = "Execute a SPARQL SELECT query")
    public ResponseEntity<?> executeSparqlQuery(@RequestBody SparqlRequest request) {
        log.info("SPARQL query received. Query length: {} chars", request.getQuery().length());

        try {
            if (request.getQuery() == null || request.getQuery().trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Query cannot be empty"));
            }

            List<Map<String, String>> results = jenaService.executeSparqlSelect(
                    request.getQuery());

            Map<String, Object> response = new HashMap<>();
            response.put("results", results);
            response.put("count", results.size());
            response.put("query", request.getQuery());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error executing SPARQL query", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Query execution failed: " + e.getMessage()));
        }
    }

    @PostMapping("/ask")
    @Operation(summary = "Execute SPARQL ASK query", description = "Execute a SPARQL ASK query")
    public ResponseEntity<?> executeSparqlAsk(@RequestBody SparqlRequest request) {
        log.info("SPARQL ASK query received");

        try {
            boolean result = jenaService.executeSparqlAsk(request.getQuery());

            return ResponseEntity.ok(Map.of(
                    "result", result,
                    "query", request.getQuery()
            ));

        } catch (Exception e) {
            log.error("Error executing SPARQL ASK query", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Query execution failed: " + e.getMessage()));
        }
    }

    @GetMapping("/samples")
    @Operation(summary = "Get sample queries", description = "Get sample SPARQL queries for testing")
    public ResponseEntity<Map<String, Object>> getSampleQueries() {
        Map<String, Object> samples = new HashMap<>();

        samples.put("allEquipment", Map.of(
                "name", "Get all equipment",
                "query", """
                        SELECT ?equipment ?name ?type WHERE {
                            ?equipment a cim:Equipment .
                            ?equipment cim:IdentifiedObject.name ?name .
                            ?equipment a ?type .
                        }
                        LIMIT 100
                        """
        ));

        samples.put("substations", Map.of(
                "name", "Get all substations",
                "query", """
                        SELECT ?substation ?name WHERE {
                            ?substation a cim:Substation .
                            ?substation cim:IdentifiedObject.name ?name .
                        }
                        """
        ));

        samples.put("transmissionLines", Map.of(
                "name", "Get transmission lines",
                "query", """
                        SELECT ?line ?name ?voltage WHERE {
                            ?line a cim:ACLineSegment .
                            ?line cim:IdentifiedObject.name ?name .
                            ?line cim:ConductingEquipment.BaseVoltage ?voltage .
                        }
                        """
        ));

        samples.put("connections", Map.of(
                "name", "Get equipment connections",
                "query", """
                        SELECT ?eq1 ?eq2 ?connectionType WHERE {
                            ?eq1 cim:Terminal.ConductingEquipment ?connectionPoint .
                            ?eq2 cim:Terminal.ConductingEquipment ?connectionPoint .
                            ?connectionPoint a ?connectionType .
                            FILTER(?eq1 != ?eq2)
                        }
                        LIMIT 50
                        """
        ));

        samples.put("countByType", Map.of(
                "name", "Count equipment by type",
                "query", """
                        SELECT ?type (COUNT(?equipment) as ?count) WHERE {
                            ?equipment a cim:Equipment .
                            ?equipment a ?type .
                        }
                        GROUP BY ?type
                        ORDER BY DESC(?count)
                        """
        ));

        return ResponseEntity.ok(samples);
    }

    @PostMapping("/update")
    @Operation(summary = "Execute SPARQL UPDATE query", description = "Execute a SPARQL UPDATE query (INSERT/DELETE)")
    public ResponseEntity<?> executeSparqlUpdate(@RequestBody SparqlRequest request) {
        log.info("SPARQL UPDATE query received. Query length: {} chars", request.getQuery().length());

        try {
            if (request.getQuery() == null || request.getQuery().trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Query cannot be empty"));
            }

            jenaService.executeSparqlUpdate(request.getQuery());

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "SPARQL UPDATE executed successfully",
                    "query", request.getQuery()
            ));

        } catch (Exception e) {
            log.error("Error executing SPARQL UPDATE query", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of(
                            "success", false,
                            "error", "UPDATE execution failed: " + e.getMessage()
                    ));
        }
    }

    @PostMapping("/validate")
    @Operation(summary = "Validate SPARQL query", description = "Validate SPARQL query syntax without execution")
    public ResponseEntity<Map<String, Object>> validateQuery(@RequestBody SparqlRequest request) {
        log.info("SPARQL validation requested");

        try {
            org.apache.jena.query.QueryFactory.create(request.getQuery());

            return ResponseEntity.ok(Map.of(
                    "valid", true,
                    "message", "Query syntax is valid"
            ));

        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                    "valid", false,
                    "message", "Query syntax error: " + e.getMessage()
            ));
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SparqlRequest {
        private String query;
    }
}
