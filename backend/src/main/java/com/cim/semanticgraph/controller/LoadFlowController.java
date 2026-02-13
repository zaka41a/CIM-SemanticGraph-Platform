package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.dto.LoadFlowResponse;
import com.cim.semanticgraph.loadflow.model.CalculationMethod;
import com.cim.semanticgraph.service.LoadFlowService;
import com.cim.semanticgraph.service.PandapowerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/loadflow")
@RequiredArgsConstructor
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:5173"})
@Tag(name = "Load Flow", description = "Power system load flow calculation APIs")
public class LoadFlowController {

    private final LoadFlowService loadFlowService;
    private final PandapowerService pandapowerService;

    @PostMapping("/calculate")
    @Operation(
            summary = "Calculate network load flow",
            description = "Performs power flow calculation for the entire CIM network model using the specified method"
    )
    public ResponseEntity<LoadFlowResponse> calculateLoadFlow(
            @Parameter(description = "Calculation method: DC, AC_NEWTON_RAPHSON, OPF")
            @RequestParam(value = "method", defaultValue = "DC") String method) {

        log.info("REST API: Calculate load flow - method: {}", method);

        try {
            CalculationMethod calcMethod = parseMethod(method);
            LoadFlowResponse response = loadFlowService.calculateLoadFlow(null, calcMethod);
            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            log.error("Invalid calculation method: {}", method);
            return ResponseEntity.badRequest().body(createErrorResponse("Invalid method: " + method +
                    ". Supported: DC, AC_NEWTON_RAPHSON, OPF"));
        } catch (Exception e) {
            log.error("Error in load flow calculation: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(createErrorResponse(e.getMessage()));
        }
    }

    @PostMapping("/calculate/{busId}")
    @Operation(
            summary = "Calculate load flow for specific bus",
            description = "Performs load flow calculation with focus on a specific bus in the network"
    )
    public ResponseEntity<LoadFlowResponse> calculateLoadFlowForBus(
            @Parameter(description = "Bus identifier (e.g., 'BUS_12345' or 'Node_ABC')", required = true)
            @PathVariable String busId,
            @Parameter(description = "Calculation method: DC, AC_NEWTON_RAPHSON, OPF")
            @RequestParam(value = "method", defaultValue = "DC") String method) {

        log.info("REST API: Calculate load flow for bus: {} - method: {}", busId, method);

        try {
            CalculationMethod calcMethod = parseMethod(method);
            LoadFlowResponse response = loadFlowService.calculateLoadFlow(busId, calcMethod);

            if (response.getTargetBusId() != null && response.getBusResults().isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            log.error("Invalid calculation method: {}", method);
            return ResponseEntity.badRequest().body(createErrorResponse("Invalid method: " + method));
        } catch (Exception e) {
            log.error("Error in load flow calculation for bus {}: {}", busId, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(createErrorResponse(e.getMessage()));
        }
    }

    @GetMapping("/methods")
    @Operation(
            summary = "Get available calculation methods",
            description = "Returns list of available power flow calculation methods and whether they are online"
    )
    public ResponseEntity<List<Map<String, Object>>> getAvailableMethods() {
        log.info("REST API: Get available calculation methods");

        boolean pandapowerAvailable = pandapowerService.isAvailable();

        List<Map<String, Object>> methods = new ArrayList<>();
        methods.add(Map.of(
                "id", "DC",
                "name", "DC Power Flow",
                "description", "Fast linear approximation (built-in Java solver)",
                "available", true
        ));
        methods.add(Map.of(
                "id", "AC_NEWTON_RAPHSON",
                "name", "AC Newton-Raphson",
                "description", "Full AC power flow with Newton-Raphson method (pandapower)",
                "available", pandapowerAvailable
        ));
        methods.add(Map.of(
                "id", "OPF",
                "name", "Optimal Power Flow",
                "description", "Cost-optimized power flow solution (pandapower)",
                "available", pandapowerAvailable
        ));

        return ResponseEntity.ok(methods);
    }

    @GetMapping("/voltage/{busId}")
    @Operation(
            summary = "Get bus voltage",
            description = "Calculates load flow and returns voltage information for a specific bus"
    )
    public ResponseEntity<?> getBusVoltage(
            @Parameter(description = "Bus identifier", required = true)
            @PathVariable String busId) {

        log.info("REST API: Get voltage for bus: {}", busId);

        try {
            LoadFlowResponse response = loadFlowService.calculateLoadFlow(busId);

            if (response.getBusResults().isEmpty()) {
                return ResponseEntity.status(404).build();
            }

            LoadFlowResponse.BusResult busResult = response.getBusResults().stream()
                    .filter(br -> br.getBusId().equals(busId))
                    .findFirst()
                    .orElse(null);

            if (busResult == null) {
                return ResponseEntity.status(404).build();
            }

            return ResponseEntity.ok(busResult);

        } catch (Exception e) {
            log.error("Error getting voltage for bus {}: {}", busId, e.getMessage(), e);
            return ResponseEntity.status(500).build();
        }
    }

    @GetMapping("/statistics")
    @Operation(
            summary = "Get system statistics",
            description = "Returns system-wide load flow statistics including generation, load, and losses"
    )
    public ResponseEntity<?> getSystemStatistics() {
        log.info("REST API: Get system statistics");

        try {
            LoadFlowResponse response = loadFlowService.calculateLoadFlow();
            return ResponseEntity.ok(response.getStatistics());

        } catch (Exception e) {
            log.error("Error getting system statistics: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Error calculating statistics: " + e.getMessage()));
        }
    }

    @GetMapping("/violations")
    @Operation(
            summary = "Get system violations",
            description = "Returns voltage violations and branch overloads detected in the network"
    )
    public ResponseEntity<?> getViolations() {
        log.info("REST API: Get system violations");

        try {
            LoadFlowResponse response = loadFlowService.calculateLoadFlow();
            return ResponseEntity.ok(response.getViolations());

        } catch (Exception e) {
            log.error("Error getting violations: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Error detecting violations: " + e.getMessage()));
        }
    }

    @GetMapping("/health")
    @Operation(
            summary = "Load flow service health check",
            description = "Checks if load flow calculation service is available"
    )
    public ResponseEntity<Map<String, Object>> healthCheck() {
        log.debug("Load flow health check");
        boolean pandapowerAvailable = pandapowerService.isAvailable();
        return ResponseEntity.ok(Map.of(
                "status", "operational",
                "dcSolver", true,
                "pandapowerAvailable", pandapowerAvailable
        ));
    }

    private CalculationMethod parseMethod(String method) {
        return CalculationMethod.valueOf(method.toUpperCase());
    }

    private LoadFlowResponse createErrorResponse(String errorMessage) {
        return LoadFlowResponse.builder()
                .converged(false)
                .iterations(0)
                .build();
    }
}
