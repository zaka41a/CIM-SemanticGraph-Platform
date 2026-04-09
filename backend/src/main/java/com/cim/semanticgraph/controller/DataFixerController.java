package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.service.DataFixerService;
import com.cim.semanticgraph.service.DataFixerService.ApplyResponse;
import com.cim.semanticgraph.service.DataFixerService.FixRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/fixer")
@RequiredArgsConstructor
@Tag(name = "Data Fixer", description = "Safe application of SPARQL UPDATE fixes to the CIM knowledge graph")
public class DataFixerController {

    private final DataFixerService dataFixerService;

    /**
     * Apply a list of SPARQL UPDATE fixes.
     * Each fix is validated (no DROP/CLEAR allowed) before execution.
     * Failures are reported per-fix without stopping the batch.
     */
    @PostMapping("/apply")
    @Operation(
        summary = "Apply fixes",
        description = "Apply a list of SPARQL UPDATE fixes to the knowledge graph. " +
                      "Destructive operations (DROP, CLEAR) are blocked. " +
                      "Returns per-fix results."
    )
    public ResponseEntity<?> applyFixes(@RequestBody List<FixRequest> fixes) {
        if (fixes == null || fixes.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No fixes provided"));
        }
        if (fixes.size() > 50) {
            return ResponseEntity.badRequest().body(Map.of("error", "Too many fixes in one request (max 50)"));
        }

        log.info("POST /fixer/apply — {} fix(es) received", fixes.size());

        try {
            ApplyResponse response = dataFixerService.applyFixes(fixes);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error applying fixes", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Fix application failed: " + e.getMessage()));
        }
    }

    /**
     * Dry-run: validate fixes without executing them.
     * Useful to confirm all fixes are safe before committing.
     */
    @PostMapping("/preview")
    @Operation(
        summary = "Preview fixes (dry-run)",
        description = "Validate a list of fixes without executing them. " +
                      "Returns 'applied' for fixes that would succeed, 'blocked'/'failed' for invalid ones."
    )
    public ResponseEntity<?> previewFixes(@RequestBody List<FixRequest> fixes) {
        if (fixes == null || fixes.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No fixes provided"));
        }

        log.info("POST /fixer/preview — dry-run for {} fix(es)", fixes.size());

        try {
            ApplyResponse response = dataFixerService.previewFixes(fixes);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error in fix preview", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Preview failed: " + e.getMessage()));
        }
    }
}
