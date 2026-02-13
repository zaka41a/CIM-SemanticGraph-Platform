package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.LoadFlowResponse;
import com.cim.semanticgraph.loadflow.model.Branch;
import com.cim.semanticgraph.loadflow.model.Bus;
import com.cim.semanticgraph.loadflow.model.NetworkModel;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service for communicating with the Python pandapower microservice.
 * Handles network serialization and power flow result deserialization.
 */
@Slf4j
@Service
public class PandapowerService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${powerflow.service.url:http://localhost:8000}")
    private String serviceUrl;

    public PandapowerService(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Check if the pandapower service is available
     */
    public boolean isAvailable() {
        try {
            ResponseEntity<Map> response = restTemplate.getForEntity(
                    serviceUrl + "/health", Map.class);
            boolean available = response.getStatusCode().is2xxSuccessful();
            log.debug("Pandapower service available: {}", available);
            return available;
        } catch (Exception e) {
            log.warn("Pandapower service not available at {}: {}", serviceUrl, e.getMessage());
            return false;
        }
    }

    /**
     * Calculate power flow using the pandapower service
     *
     * @param network The CIM network model extracted from the knowledge graph
     * @param method  Calculation method: DC, AC_NEWTON_RAPHSON, or OPF
     * @return LoadFlowResponse with calculation results
     */
    public LoadFlowResponse calculate(NetworkModel network, String method) {
        log.info("Sending power flow request to pandapower service: method={}, buses={}, branches={}",
                method, network.getBusCount(), network.getBranchCount());

        try {
            // Build request body
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("network", serializeNetwork(network));
            requestBody.put("method", method);
            requestBody.put("maxIterations", 100);
            requestBody.put("tolerance", 1e-6);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            log.debug("Sending request to {}/calculate", serviceUrl);
            ResponseEntity<LoadFlowResponse> response = restTemplate.exchange(
                    serviceUrl + "/calculate",
                    HttpMethod.POST,
                    entity,
                    LoadFlowResponse.class
            );

            if (response.getBody() != null) {
                log.info("Pandapower calculation completed: converged={}, method={}",
                        response.getBody().isConverged(), response.getBody().getCalculationMethod());
                return response.getBody();
            }

            throw new RuntimeException("Empty response from pandapower service");

        } catch (Exception e) {
            log.error("Error communicating with pandapower service: {}", e.getMessage(), e);
            throw new RuntimeException("Pandapower service call failed: " + e.getMessage(), e);
        }
    }

    /**
     * Serialize NetworkModel to the JSON format expected by the Python service.
     * Matches the Python NetworkInput Pydantic model.
     */
    private Map<String, Object> serializeNetwork(NetworkModel network) {
        Map<String, Object> networkMap = new HashMap<>();
        networkMap.put("networkId", network.getNetworkId() != null ? network.getNetworkId() : "cim-network");
        networkMap.put("name", network.getName() != null ? network.getName() : "CIM Network");
        networkMap.put("baseMva", network.getBaseMva() > 0 ? network.getBaseMva() : 100.0);

        // Serialize buses
        List<Map<String, Object>> busList = new ArrayList<>();
        for (Bus bus : network.getBuses()) {
            Map<String, Object> busMap = new HashMap<>();
            busMap.put("id", bus.getId());
            busMap.put("name", bus.getName() != null ? bus.getName() : bus.getId());
            busMap.put("index", bus.getIndex());
            busMap.put("type", bus.getType().name());
            busMap.put("baseVoltageKv", bus.getBaseVoltageKv() > 0 ? bus.getBaseVoltageKv() : 110.0);
            busMap.put("voltageMagnitude", bus.getVoltageMagnitude() > 0 ? bus.getVoltageMagnitude() : 1.0);
            busMap.put("voltageAngle", bus.getVoltageAngle());
            busMap.put("generationMw", bus.getGenerationMw());
            busMap.put("generationMvar", bus.getGenerationMvar());
            busMap.put("generationMinMvar", bus.getGenerationMinMvar());
            busMap.put("generationMaxMvar", bus.getGenerationMaxMvar());
            busMap.put("loadMw", bus.getLoadMw());
            busMap.put("loadMvar", bus.getLoadMvar());
            busMap.put("voltageMin", bus.getVoltageMin() > 0 ? bus.getVoltageMin() : 0.95);
            busMap.put("voltageMax", bus.getVoltageMax() > 0 ? bus.getVoltageMax() : 1.05);
            busMap.put("inService", bus.isInService());
            busList.add(busMap);
        }
        networkMap.put("buses", busList);

        // Serialize branches
        List<Map<String, Object>> branchList = new ArrayList<>();
        for (Branch branch : network.getBranches()) {
            Map<String, Object> branchMap = new HashMap<>();
            branchMap.put("id", branch.getId());
            branchMap.put("name", branch.getName() != null ? branch.getName() : branch.getId());
            branchMap.put("type", branch.getType().name());
            branchMap.put("fromBusId", branch.getFromBusId());
            branchMap.put("toBusId", branch.getToBusId());
            branchMap.put("resistance", branch.getResistance());
            branchMap.put("reactance", branch.getReactance());
            branchMap.put("susceptance", branch.getSusceptance());
            branchMap.put("turnsRatio", branch.getTurnsRatio());
            branchMap.put("phaseShift", branch.getPhaseShift());
            branchMap.put("ratingMva", branch.getRatingMva() > 0 ? branch.getRatingMva() : 100.0);
            branchMap.put("inService", branch.isInService());
            branchList.add(branchMap);
        }
        networkMap.put("branches", branchList);

        return networkMap;
    }
}
