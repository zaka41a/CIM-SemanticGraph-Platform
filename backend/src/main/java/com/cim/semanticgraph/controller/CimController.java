package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.dto.ValidationResult;
import com.cim.semanticgraph.model.ImportHistory;
import com.cim.semanticgraph.service.CIMIndexingService;
import com.cim.semanticgraph.service.CimTransformerService;
import com.cim.semanticgraph.service.ImportHistoryService;
import com.cim.semanticgraph.service.JenaService;
import com.cim.semanticgraph.service.QdrantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/cim")
@RequiredArgsConstructor
@Tag(name = "CIM Management", description = "CIM data import, export, and validation")
public class CimController {

    private final CimTransformerService cimTransformerService;
    private final JenaService jenaService;
    private final ImportHistoryService importHistoryService;
    private final CIMIndexingService cimIndexingService;
    private final QdrantService qdrantService;

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Import CIM data", description = "Import CIM data from XML or RDF file")
    public ResponseEntity<?> importCimData(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "format", required = false, defaultValue = "CIM/XML") String format) {

        log.info("Import request received. Filename: {}, Size: {} bytes, Format: {}",
                file.getOriginalFilename(), file.getSize(), format);

        ImportHistory historyRecord = importHistoryService.addImportRecord(
                file.getOriginalFilename(),
                file.getSize(),
                format
        );

        long startTime = System.currentTimeMillis();

        try {
            if (file.isEmpty()) {
                importHistoryService.updateImportFailure(historyRecord.getId(), "File is empty");
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "File is empty"));
            }

            long maxSize = 100 * 1024 * 1024;
            if (file.getSize() > maxSize) {
                importHistoryService.updateImportFailure(historyRecord.getId(),
                        "File too large. Maximum size: 100MB");
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "File too large. Maximum size: 100MB"));
            }

            // Generate named graph URI for rollback versioning
            String graphUri = "urn:import:" + historyRecord.getId();

            Map<String, Object> stats = cimTransformerService.importCimData(
                    file.getInputStream(), format, graphUri);

            long endTime = System.currentTimeMillis();
            double duration = (endTime - startTime) / 1000.0;

            long triplesCount = 0;
            if (stats.containsKey("totalTriples")) {
                triplesCount = ((Number) stats.get("totalTriples")).longValue();
            }

            importHistoryService.updateImportSuccess(historyRecord.getId(), triplesCount, duration);
            importHistoryService.setGraphUri(historyRecord.getId(), graphUri);

            log.info("Import successful. Stats: {}", stats);

            // Trigger async vector indexing to Qdrant (non-blocking)
            cimIndexingService.indexAllEntitiesAsync();
            log.info("Async CIM entity indexing to Qdrant triggered");

            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("message", "CIM data imported successfully");
            response.put("filename", file.getOriginalFilename());
            response.put("statistics", stats);
            response.put("historyId", historyRecord.getId());
            response.put("indexing", "Vector indexing started in background");

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            long endTime = System.currentTimeMillis();
            double duration = (endTime - startTime) / 1000.0;

            importHistoryService.updateImportFailure(historyRecord.getId(), e.getMessage());

            log.error("Error importing CIM data", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of(
                            "status", "error",
                            "message", "Import failed: " + e.getMessage()
                    ));
        }
    }

    @GetMapping("/export")
    @Operation(summary = "Export knowledge graph", description = "Export entire knowledge graph in specified format")
    public ResponseEntity<?> exportKnowledgeGraph(
            @RequestParam(value = "format", required = false, defaultValue = "RDF/XML") String format) {

        log.info("Export request received. Format: {}", format);

        try {
            String rdfData = jenaService.exportRdfData(format);

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_XML)
                    .body(rdfData);

        } catch (Exception e) {
            log.error("Error exporting knowledge graph", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Export failed: " + e.getMessage()));
        }
    }

    @GetMapping("/statistics")
    @Operation(summary = "Get graph statistics", description = "Get statistics about the knowledge graph")
    public ResponseEntity<Map<String, Object>> getStatistics() {
        log.info("Statistics request received");

        try {
            Map<String, Object> stats = jenaService.getGraphStatistics();

            return ResponseEntity.ok(stats);

        } catch (Exception e) {
            log.error("Error getting statistics", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to get statistics: " + e.getMessage()));
        }
    }

    @PostMapping(value = "/validate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Validate CIM data", description = "Validate CIM data without importing")
    public ResponseEntity<?> validateCimData(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "format", required = false, defaultValue = "CIM/XML") String format) {

        log.info("Validation request received. Filename: {}", file.getOriginalFilename());

        try {
            org.apache.jena.rdf.model.Model model = cimTransformerService.transformCimRdfToModel(
                    file.getInputStream(), format);

            ValidationResult validation = cimTransformerService.validateCimSchema(model);

            Map<String, Object> response = new HashMap<>();
            response.put("valid", validation.isValid());
            response.put("errors", validation.getErrors());
            response.put("warnings", validation.getWarnings());
            response.put("summary", validation.getSummary());
            response.put("tripleCount", model.size());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error validating CIM data", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Validation failed: " + e.getMessage()));
        }
    }

    @DeleteMapping("/clear")
    @Operation(summary = "Clear knowledge graph", description = "Remove all data from knowledge graph")
    public ResponseEntity<Map<String, String>> clearKnowledgeGraph() {
        log.warn("Clear knowledge graph request received");

        try {
            jenaService.clearKnowledgeGraph();
            qdrantService.clearCollection();

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Knowledge graph and vector index cleared successfully"
            ));

        } catch (Exception e) {
            log.error("Error clearing knowledge graph", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Clear failed: " + e.getMessage()));
        }
    }

    @GetMapping("/formats")
    @Operation(summary = "Get supported formats", description = "List supported CIM data formats")
    public ResponseEntity<Map<String, Object>> getSupportedFormats() {
        Map<String, Object> formats = new HashMap<>();

        formats.put("import", new String[]{
                "CIM/XML",
                "RDF/XML",
                "TURTLE",
                "N-TRIPLES",
                "JSON-LD"
        });

        formats.put("export", new String[]{
                "RDF/XML",
                "TURTLE",
                "N-TRIPLES",
                "JSON-LD",
                "RDF/JSON"
        });

        return ResponseEntity.ok(formats);
    }

    @GetMapping("/indexing-status")
    @Operation(summary = "Vector indexing status", description = "Get Qdrant vector DB indexing status")
    public ResponseEntity<Map<String, Object>> getIndexingStatus() {
        Map<String, Object> status = new HashMap<>();
        try {
            boolean qdrantAvailable = qdrantService.isAvailable();
            long pointCount = qdrantAvailable ? qdrantService.countPoints() : 0;
            status.put("qdrantAvailable", qdrantAvailable);
            status.put("indexedEntities", pointCount);
            status.put("collectionName", "cim_entities");
            status.put("status", qdrantAvailable ? "CONNECTED" : "DISCONNECTED");
            return ResponseEntity.ok(status);
        } catch (Exception e) {
            status.put("qdrantAvailable", false);
            status.put("indexedEntities", 0);
            status.put("status", "ERROR");
            status.put("error", e.getMessage());
            return ResponseEntity.ok(status);
        }
    }

    @PostMapping("/reindex")
    @Operation(summary = "Re-index all entities", description = "Trigger re-indexing of all CIM entities into Qdrant")
    public ResponseEntity<Map<String, Object>> reindexEntities() {
        try {
            cimIndexingService.indexAllEntitiesAsync();
            return ResponseEntity.ok(Map.of(
                    "status", "started",
                    "message", "Re-indexing of CIM entities started in background"
            ));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                    "status", "error",
                    "message", e.getMessage()
            ));
        }
    }

    @GetMapping("/health")
    @Operation(summary = "Health check", description = "Check if CIM service is operational")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        Map<String, Object> health = new HashMap<>();

        try {
            long tripleCount = jenaService.getTripleCount();

            health.put("status", "UP");
            health.put("tripleCount", tripleCount);
            health.put("service", "CIM Management");

            return ResponseEntity.ok(health);

        } catch (Exception e) {
            health.put("status", "DOWN");
            health.put("error", e.getMessage());

            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(health);
        }
    }
}
