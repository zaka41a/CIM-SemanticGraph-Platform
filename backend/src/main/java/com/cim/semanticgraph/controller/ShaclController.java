package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.service.ShaclValidationService;
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
@RequestMapping("/shacl")
@RequiredArgsConstructor
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:5173"})
@Tag(name = "SHACL Validation", description = "CIM model constraint validation using SHACL")
public class ShaclController {

    private final ShaclValidationService shaclValidationService;

    @GetMapping("/validate")
    @Operation(summary = "Validate knowledge graph",
               description = "Validates the current knowledge graph against CIM SHACL constraints")
    public ResponseEntity<ShaclValidationService.ValidationResult> validateGraph() {
        log.info("SHACL validation request received");
        ShaclValidationService.ValidationResult result = shaclValidationService.validateGraph();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/shapes")
    @Operation(summary = "List SHACL shapes",
               description = "Returns list of available SHACL shapes for validation")
    public ResponseEntity<Map<String, Object>> getShapes() {
        log.info("Request for available SHACL shapes");
        List<String> shapes = shaclValidationService.getAvailableShapes();
        return ResponseEntity.ok(Map.of(
            "count", shapes.size(),
            "shapes", shapes
        ));
    }

    @PostMapping("/validate/detailed")
    @Operation(summary = "Detailed validation",
               description = "Performs detailed SHACL validation with full report")
    public ResponseEntity<Map<String, Object>> validateDetailed() {
        log.info("Detailed SHACL validation request");
        ShaclValidationService.ValidationResult result = shaclValidationService.validateGraph();
        return ResponseEntity.ok(Map.of(
            "summary", Map.of(
                "valid", result.isValid(),
                "errorCount", result.getErrorCount(),
                "warningCount", result.getWarningCount(),
                "triplesValidated", result.getTriplesValidated(),
                "executionTimeMs", result.getExecutionTimeMs()
            ),
            "violations", result.getViolations(),
            "message", result.getMessage() != null ? result.getMessage() : ""
        ));
    }
}
