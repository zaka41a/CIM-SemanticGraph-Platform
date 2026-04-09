package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.model.ImportHistory;
import com.cim.semanticgraph.service.ImportHistoryService;
import com.cim.semanticgraph.service.JenaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/history")
@RequiredArgsConstructor
@Tag(name = "Import History", description = "Import history management")
public class HistoryController {

    private final ImportHistoryService historyService;
    private final JenaService jenaService;

    @GetMapping
    @Operation(summary = "Get import history", description = "Get all CIM file import history records")
    public ResponseEntity<List<ImportHistory>> getImportHistory() {
        log.info("Get import history request received");
        try {
            List<ImportHistory> history = historyService.getAllHistory();
            return ResponseEntity.ok(history);
        } catch (Exception e) {
            log.error("Error fetching import history", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get import history by ID", description = "Get specific import history record")
    public ResponseEntity<ImportHistory> getHistoryById(@PathVariable String id) {
        log.info("Get import history by ID: {}", id);
        return historyService.getHistoryById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete import history", description = "Delete an import history record")
    public ResponseEntity<Map<String, String>> deleteHistory(@PathVariable String id) {
        log.info("Delete import history request: {}", id);
        boolean deleted = historyService.deleteHistory(id);
        if (deleted) {
            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Import history deleted successfully"
            ));
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/rollback")
    @Operation(
        summary = "Rollback import",
        description = "Remove from the knowledge graph all triples introduced by this import. " +
                      "Requires the import to have a named graph (imported after rollback support was added)."
    )
    public ResponseEntity<?> rollbackImport(@PathVariable String id) {
        log.warn("Rollback requested for import: {}", id);

        return historyService.getHistoryById(id)
                .map(record -> {
                    if (!record.isRollbackAvailable()) {
                        return ResponseEntity.badRequest()
                                .<Map<String, String>>body(Map.of(
                                    "error", "Rollback not available for this import. " +
                                             "Only imports made after rollback support was added can be rolled back."
                                ));
                    }
                    if (record.getStatus() == ImportHistory.ImportStatus.ROLLED_BACK) {
                        return ResponseEntity.badRequest()
                                .<Map<String, String>>body(Map.of("error", "Import has already been rolled back"));
                    }
                    try {
                        jenaService.rollbackNamedGraph(record.getGraphUri());
                        historyService.markRolledBack(id);
                        log.info("Import {} rolled back successfully (graph: {})", id, record.getGraphUri());
                        return ResponseEntity.<Map<String, String>>ok(Map.of(
                            "status", "success",
                            "message", "Import rolled back. Triples removed from knowledge graph.",
                            "graphUri", record.getGraphUri()
                        ));
                    } catch (Exception e) {
                        log.error("Rollback failed for import {}: {}", id, e.getMessage());
                        return ResponseEntity.internalServerError()
                                .<Map<String, String>>body(Map.of("error", "Rollback failed: " + e.getMessage()));
                    }
                })
                .orElse(ResponseEntity.notFound().<Map<String, String>>build());
    }

    @GetMapping("/statistics")
    @Operation(summary = "Get import statistics", description = "Get statistics about imports")
    public ResponseEntity<Map<String, Object>> getImportStatistics() {
        log.info("Get import statistics request received");
        try {
            Map<String, Object> stats = historyService.getImportStatistics();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            log.error("Error fetching import statistics", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
