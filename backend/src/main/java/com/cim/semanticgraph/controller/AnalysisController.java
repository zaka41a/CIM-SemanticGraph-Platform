package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.service.AnalysisService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/analysis")
@RequiredArgsConstructor
@Tag(name = "Network Analysis", description = "Unified network analysis: statistics, health, data quality, graph insights")
public class AnalysisController {

    private final AnalysisService analysisService;

    @GetMapping("/summary")
    @Operation(
        summary = "Get unified analysis summary",
        description = "Single endpoint returning statistics, diagnostic health, data quality checks, " +
                      "quality score and top connected entities."
    )
    public ResponseEntity<?> getSummary() {
        log.info("GET /analysis/summary");
        try {
            AnalysisService.AnalysisSummary summary = analysisService.getSummary();
            return ResponseEntity.ok(summary);
        } catch (Exception e) {
            log.error("Analysis summary failed", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Analysis failed: " + e.getMessage()));
        }
    }
}
