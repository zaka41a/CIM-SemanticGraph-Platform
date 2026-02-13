package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.service.NetworkDiagnosticService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/diagnostic")
@RequiredArgsConstructor
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:5173"})
@Tag(name = "Network Diagnostics", description = "Network diagnostic and health check endpoints")
public class DiagnosticController {

    private final NetworkDiagnosticService diagnosticService;

    @GetMapping("/network")
    @Operation(summary = "Run network diagnostics",
               description = "Performs comprehensive diagnostics on the CIM network to identify issues")
    public ResponseEntity<NetworkDiagnosticService.DiagnosticResult> runDiagnostics() {
        log.info("Network diagnostic request received");
        try {
            NetworkDiagnosticService.DiagnosticResult result = diagnosticService.runDiagnostics();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error running diagnostics: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }
}
