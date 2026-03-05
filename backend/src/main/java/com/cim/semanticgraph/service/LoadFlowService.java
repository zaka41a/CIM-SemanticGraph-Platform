package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.LoadFlowResponse;
import com.cim.semanticgraph.loadflow.extractor.CIMNetworkExtractor;
import com.cim.semanticgraph.loadflow.model.Branch;
import com.cim.semanticgraph.loadflow.model.Bus;
import com.cim.semanticgraph.loadflow.model.CalculationMethod;
import com.cim.semanticgraph.loadflow.model.NetworkModel;
import com.cim.semanticgraph.loadflow.solver.SimplifiedLoadFlowSolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.rdf.model.Model;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoadFlowService {

    private final CIMNetworkExtractor networkExtractor;
    private final SimplifiedLoadFlowSolver loadFlowSolver;
    private final JenaService jenaService;
    private final PandapowerService pandapowerService;

    /**
     * Resolve a natural language question to a bus ID using Qdrant semantic search.
     * Delegates to the Python powerflow service's /find-bus endpoint.
     * Returns null if the service is unavailable or no match found.
     */
    public String findBusForQuestion(String question) {
        return pandapowerService.findBusSemantic(question);
    }

    public LoadFlowResponse calculateLoadFlow() {
        return calculateLoadFlow(null, CalculationMethod.DC);
    }

    public LoadFlowResponse calculateLoadFlow(String targetBusId) {
        return calculateLoadFlow(targetBusId, CalculationMethod.DC);
    }

    public LoadFlowResponse calculateLoadFlow(String targetBusId, CalculationMethod method) {
        long startTime = System.currentTimeMillis();

            log.info("═══════════════════════════════════════════════════════════");
            log.info("Starting Load Flow Calculation{}",
                    targetBusId != null ? " for bus: " + targetBusId : "");
            log.info("═══════════════════════════════════════════════════════════");

        try {
            Model cimModel = jenaService.getModelCopy();

            if (cimModel == null || cimModel.isEmpty()) {
                log.error("CIM model is empty - cannot perform load flow calculation");
                return createEmptyDataResponse("CIM model is empty. Please import network data first.");
            }

            log.info("CIM model contains {} triples", cimModel.size());

            NetworkModel network = networkExtractor.extractNetwork(cimModel);

            if (network.getBusCount() == 0) {
                log.error("No buses found in network model");
                return createEmptyDataResponse("No buses found in the network. Please check your CIM data import.");
            }

            double totalGen = network.getBuses().stream().mapToDouble(Bus::getGenerationMw).sum();
            double totalLoad = network.getBuses().stream().mapToDouble(Bus::getLoadMw).sum();

            log.info("Network validation: {} buses, {} branches, {} MW generation, {} MW load",
                    network.getBusCount(), network.getBranchCount(), totalGen, totalLoad);

            if (totalGen == 0.0 && totalLoad > 0.0) {
                log.error("WARNING: Network has {} MW load but NO generation!", totalLoad);
            }
            if (totalLoad == 0.0 && totalGen > 0.0) {
                log.warn("WARNING: Network has {} MW generation but NO load!", totalGen);
            }
            if (network.getBranchCount() == 0) {
                log.warn("WARNING: Network has NO branches - all buses are isolated!");
            }

            String actualBusId = targetBusId;
            if (targetBusId != null) {
                final String searchBusId = targetBusId;
                Bus targetBus = network.getBus(searchBusId);

                // Try without _CN suffix since bus IDs may or may not include it
                if (targetBus == null && searchBusId.endsWith("_CN")) {
                    String busIdWithoutSuffix = searchBusId.substring(0, searchBusId.length() - 3);
                    targetBus = network.getBus(busIdWithoutSuffix);
                    if (targetBus != null) {
                        actualBusId = busIdWithoutSuffix;
                        log.info("Found bus without _CN suffix: {} (searched: {})", actualBusId, searchBusId);
                    }
                }

                // Try partial match as last resort
                if (targetBus == null) {
                    targetBus = network.getBuses().stream()
                            .filter(b -> {
                                String busId = b.getId().toLowerCase();
                                String searchId = searchBusId.toLowerCase();
                                return busId.contains(searchId) || searchId.contains(busId) ||
                                       busId.replace("_cn", "").equals(searchId.replace("_cn", ""));
                            })
                            .findFirst()
                            .orElse(null);

                    if (targetBus != null) {
                        actualBusId = targetBus.getId();
                        log.info("Found bus by partial match: {} (searched: {})", actualBusId, searchBusId);
                    }
                }

                if (targetBus == null) {
                    log.warn("Target bus {} not found in network. Available buses: {}",
                            searchBusId, network.getBuses().stream()
                                    .map(Bus::getId)
                                    .collect(java.util.stream.Collectors.joining(", ")));
                    return createBusNotFoundResponse(searchBusId);
                }

                targetBusId = actualBusId;
            }

            LoadFlowResponse response;

            if (method == CalculationMethod.DC) {
                log.info("Using built-in DC Power Flow solver");
                SimplifiedLoadFlowSolver.LoadFlowResult solverResult = loadFlowSolver.solve(network);
                response = buildResponse(network, solverResult, targetBusId);
            } else {
                if (pandapowerService.isAvailable()) {
                    log.info("Using pandapower service for {} calculation", method);
                    response = pandapowerService.calculate(network, method.name());
                    response.setTargetBusId(targetBusId);
                } else {
                    log.warn("══════════════════════════════════════════════════════");
                    log.warn("Pandapower service is NOT available at configured URL.");
                    log.warn("Requested method: {} - Falling back to simplified DC solver.", method);
                    log.warn("Results may be less accurate. Start the powerflow-service for full AC/OPF support.");
                    log.warn("══════════════════════════════════════════════════════");
                    SimplifiedLoadFlowSolver.LoadFlowResult solverResult = loadFlowSolver.solve(network);
                    response = buildResponse(network, solverResult, targetBusId);
                    response.setCalculationMethod("SIMPLIFIED_DC (fallback - pandapower unavailable, requested: " + method + ")");
                }
            }

            long executionTime = System.currentTimeMillis() - startTime;
            response.setExecutionTimeMs(executionTime);

            log.info("Load flow calculation completed in {} ms - Converged: {}",
                    executionTime, response.isConverged());

            return response;

        } catch (Exception e) {
            log.error("Error calculating load flow: {}", e.getMessage(), e);
            return createErrorResponse(e.getMessage());
        }
    }

    private LoadFlowResponse buildResponse(NetworkModel network,
                                          SimplifiedLoadFlowSolver.LoadFlowResult solverResult,
                                          String targetBusId) {

        List<LoadFlowResponse.BusResult> busResults = network.getBuses().stream()
                .map(this::buildBusResult)
                .collect(Collectors.toList());

        List<LoadFlowResponse.BranchResult> branchResults = network.getBranches().stream()
                .map(this::buildBranchResult)
                .collect(Collectors.toList());

        LoadFlowResponse.SystemStatistics statistics = calculateStatistics(network);
        List<LoadFlowResponse.Violation> violations = detectViolations(network);

        return LoadFlowResponse.builder()
                .converged(solverResult.isConverged())
                .iterations(solverResult.getIterations())
                .tolerance(solverResult.getTolerance())
                .executionTimeMs(solverResult.getExecutionTimeMs())
                .timestamp(LocalDateTime.now())
                .calculationMethod("SIMPLIFIED_DC")
                .busResults(busResults)
                .branchResults(branchResults)
                .statistics(statistics)
                .violations(violations)
                .targetBusId(targetBusId)
                .networkId(network.getNetworkId())
                .build();
    }

    private LoadFlowResponse.BusResult buildBusResult(Bus bus) {
        // Default NaN/Infinite values to safe defaults to prevent JSON serialization issues
        double voltageAngle = bus.getCalculatedVoltageAngle();
        if (Double.isNaN(voltageAngle) || Double.isInfinite(voltageAngle)) {
            voltageAngle = 0.0;
        }

        double activePowerMw = bus.getCalculatedActivePower();
        if (Double.isNaN(activePowerMw) || Double.isInfinite(activePowerMw)) {
            activePowerMw = bus.getNetActivePower();
            if (Double.isNaN(activePowerMw)) {
                activePowerMw = 0.0;
            }
        }

        double reactivePowerMvar = bus.getCalculatedReactivePower();
        if (Double.isNaN(reactivePowerMvar) || Double.isInfinite(reactivePowerMvar)) {
            reactivePowerMvar = bus.getNetReactivePower();
            if (Double.isNaN(reactivePowerMvar)) {
                reactivePowerMvar = 0.0;
            }
        }

        double voltageMagnitude = bus.getCalculatedVoltageMagnitude();
        if (Double.isNaN(voltageMagnitude) || Double.isInfinite(voltageMagnitude)) {
            voltageMagnitude = bus.getVoltageMagnitude() > 0 ? bus.getVoltageMagnitude() : 1.0;
        }

        return LoadFlowResponse.BusResult.builder()
                .busId(bus.getId())
                .busName(bus.getName())
                .busType(bus.getType().name())
                .voltageMagnitude(voltageMagnitude)
                .voltageAngle(voltageAngle)
                .voltageKv(voltageMagnitude * bus.getBaseVoltageKv())
                .activePowerMw(activePowerMw)
                .reactivePowerMvar(reactivePowerMvar)
                .generationMw(bus.getGenerationMw())
                .generationMvar(bus.getGenerationMvar())
                .loadMw(bus.getLoadMw())
                .loadMvar(bus.getLoadMvar())
                .withinLimits(!bus.isViolatesLimits())
                .voltagePercentage(voltageMagnitude * 100.0)
                .build();
    }

    private LoadFlowResponse.BranchResult buildBranchResult(Branch branch) {
        return LoadFlowResponse.BranchResult.builder()
                .branchId(branch.getId())
                .branchName(branch.getName())
                .branchType(branch.getType().name())
                .fromBusId(branch.getFromBusId())
                .toBusId(branch.getToBusId())
                .fromActivePowerMw(branch.getFromActivePowerMw())
                .fromReactivePowerMvar(branch.getFromReactivePowerMvar())
                .toActivePowerMw(branch.getToActivePowerMw())
                .toReactivePowerMvar(branch.getToReactivePowerMvar())
                .lossActivePowerMw(branch.getLossActivePowerMw())
                .lossReactivePowerMvar(branch.getLossReactivePowerMvar())
                .currentMagnitude(branch.getCurrentMagnitude())
                .loadingPercentage(branch.getLoadingPercentage())
                .overloaded(branch.isOverloaded())
                .build();
    }

    private LoadFlowResponse.SystemStatistics calculateStatistics(NetworkModel network) {
        int pvBuses = (int) network.getBuses().stream().filter(Bus::isPV).count();
        int pqBuses = (int) network.getBuses().stream().filter(Bus::isPQ).count();
        int slackBuses = (int) network.getBuses().stream().filter(Bus::isSlack).count();

        double totalGenMw = network.getBuses().stream()
                .mapToDouble(Bus::getGenerationMw).sum();
        double totalGenMvar = network.getBuses().stream()
                .mapToDouble(Bus::getGenerationMvar).sum();

        double totalLoadMw = network.getBuses().stream()
                .mapToDouble(Bus::getLoadMw).sum();
        double totalLoadMvar = network.getBuses().stream()
                .mapToDouble(Bus::getLoadMvar).sum();

        double totalLossesMw = network.getBranches().stream()
                .mapToDouble(branch -> {
                    double loss = branch.getLossActivePowerMw();
                    return Double.isNaN(loss) || Double.isInfinite(loss) ? 0.0 : loss;
                })
                .sum();
        double totalLossesMvar = network.getBranches().stream()
                .mapToDouble(branch -> {
                    double loss = branch.getLossReactivePowerMvar();
                    return Double.isNaN(loss) || Double.isInfinite(loss) ? 0.0 : loss;
                })
                .sum();

        double lossPercentage = 0.0;
        if (totalLoadMw > 0 && !Double.isNaN(totalLossesMw) && !Double.isInfinite(totalLossesMw)) {
            lossPercentage = (totalLossesMw / totalLoadMw) * 100.0;
        }

        // Sanitize all computed values to avoid NaN in JSON response
        if (Double.isNaN(totalLossesMw) || Double.isInfinite(totalLossesMw)) {
            totalLossesMw = 0.0;
        }
        if (Double.isNaN(totalLossesMvar) || Double.isInfinite(totalLossesMvar)) {
            totalLossesMvar = 0.0;
        }

        Bus minVoltageBus = network.getBuses().stream()
                .min(Comparator.comparingDouble(Bus::getCalculatedVoltageMagnitude))
                .orElse(null);

        Bus maxVoltageBus = network.getBuses().stream()
                .max(Comparator.comparingDouble(Bus::getCalculatedVoltageMagnitude))
                .orElse(null);

        double avgVoltagePu = network.getBuses().stream()
                .mapToDouble(Bus::getCalculatedVoltageMagnitude)
                .average()
                .orElse(1.0);

        if (Double.isNaN(totalGenMw) || Double.isInfinite(totalGenMw)) totalGenMw = 0.0;
        if (Double.isNaN(totalGenMvar) || Double.isInfinite(totalGenMvar)) totalGenMvar = 0.0;
        if (Double.isNaN(totalLoadMw) || Double.isInfinite(totalLoadMw)) totalLoadMw = 0.0;
        if (Double.isNaN(totalLoadMvar) || Double.isInfinite(totalLoadMvar)) totalLoadMvar = 0.0;
        if (Double.isNaN(lossPercentage) || Double.isInfinite(lossPercentage)) lossPercentage = 0.0;

        double minVoltage = minVoltageBus != null ? minVoltageBus.getCalculatedVoltageMagnitude() : 1.0;
        double maxVoltage = maxVoltageBus != null ? maxVoltageBus.getCalculatedVoltageMagnitude() : 1.0;
        if (Double.isNaN(minVoltage) || Double.isInfinite(minVoltage)) minVoltage = 1.0;
        if (Double.isNaN(maxVoltage) || Double.isInfinite(maxVoltage)) maxVoltage = 1.0;
        if (Double.isNaN(avgVoltagePu) || Double.isInfinite(avgVoltagePu)) avgVoltagePu = 1.0;

        return LoadFlowResponse.SystemStatistics.builder()
                .totalBuses(network.getBusCount())
                .totalBranches(network.getBranchCount())
                .pvBuses(pvBuses)
                .pqBuses(pqBuses)
                .slackBuses(slackBuses)
                .totalGenerationMw(totalGenMw)
                .totalGenerationMvar(totalGenMvar)
                .totalLoadMw(totalLoadMw)
                .totalLoadMvar(totalLoadMvar)
                .totalLossesMw(totalLossesMw)
                .totalLossesMvar(totalLossesMvar)
                .lossPercentage(lossPercentage)
                .minVoltagePu(minVoltage)
                .maxVoltagePu(maxVoltage)
                .avgVoltagePu(avgVoltagePu)
                .minVoltageBus(minVoltageBus != null ? minVoltageBus.getId() : "N/A")
                .maxVoltageBus(maxVoltageBus != null ? maxVoltageBus.getId() : "N/A")
                .build();
    }

    private List<LoadFlowResponse.Violation> detectViolations(NetworkModel network) {
        List<LoadFlowResponse.Violation> violations = new ArrayList<>();

        for (Bus bus : network.getBuses()) {
            double vPu = bus.getCalculatedVoltageMagnitude();

            if (vPu < bus.getVoltageMin()) {
                violations.add(LoadFlowResponse.Violation.builder()
                        .type("VOLTAGE_LOW")
                        .severity(vPu < 0.90 ? "CRITICAL" : "WARNING")
                        .elementId(bus.getId())
                        .elementName(bus.getName())
                        .actualValue(vPu)
                        .limitValue(bus.getVoltageMin())
                        .violationPercentage(((bus.getVoltageMin() - vPu) / bus.getVoltageMin()) * 100.0)
                        .description(String.format("Bus voltage %.3f pu is below minimum %.3f pu", vPu, bus.getVoltageMin()))
                        .build());
            } else if (vPu > bus.getVoltageMax()) {
                violations.add(LoadFlowResponse.Violation.builder()
                        .type("VOLTAGE_HIGH")
                        .severity(vPu > 1.10 ? "CRITICAL" : "WARNING")
                        .elementId(bus.getId())
                        .elementName(bus.getName())
                        .actualValue(vPu)
                        .limitValue(bus.getVoltageMax())
                        .violationPercentage(((vPu - bus.getVoltageMax()) / bus.getVoltageMax()) * 100.0)
                        .description(String.format("Bus voltage %.3f pu exceeds maximum %.3f pu", vPu, bus.getVoltageMax()))
                        .build());
            }
        }

        for (Branch branch : network.getBranches()) {
            if (branch.isOverloaded()) {
                violations.add(LoadFlowResponse.Violation.builder()
                        .type("BRANCH_OVERLOAD")
                        .severity(branch.getLoadingPercentage() > 120.0 ? "CRITICAL" : "WARNING")
                        .elementId(branch.getId())
                        .elementName(branch.getName())
                        .actualValue(branch.getLoadingPercentage())
                        .limitValue(100.0)
                        .violationPercentage(branch.getLoadingPercentage() - 100.0)
                        .description(String.format("Branch loading %.1f%% exceeds rating", branch.getLoadingPercentage()))
                        .build());
            }
        }

        return violations;
    }

    private LoadFlowResponse createEmptyDataResponse() {
        return createEmptyDataResponse("No network data available");
    }

    private LoadFlowResponse createEmptyDataResponse(String errorMessage) {
        List<LoadFlowResponse.Violation> violations = new ArrayList<>();
        violations.add(LoadFlowResponse.Violation.builder()
                .type("DATA_ERROR")
                .severity("CRITICAL")
                .elementId("NETWORK")
                .elementName("Network Model")
                .description(errorMessage)
                .build());

        return LoadFlowResponse.builder()
                .converged(false)
                .iterations(0)
                .tolerance(0.0)
                .executionTimeMs(0)
                .timestamp(LocalDateTime.now())
                .calculationMethod("SIMPLIFIED_DC")
                .busResults(new ArrayList<>())
                .branchResults(new ArrayList<>())
                .statistics(createEmptyStatistics())
                .violations(violations)
                .build();
    }

    private LoadFlowResponse createBusNotFoundResponse(String busId) {
        LoadFlowResponse response = createEmptyDataResponse();
        response.setTargetBusId(busId);
        return response;
    }

    private LoadFlowResponse createErrorResponse(String errorMessage) {
        LoadFlowResponse response = createEmptyDataResponse();
        response.getViolations().add(LoadFlowResponse.Violation.builder()
                .type("CALCULATION_ERROR")
                .severity("CRITICAL")
                .elementId("SYSTEM")
                .elementName("Load Flow Solver")
                .description(errorMessage)
                .build());
        return response;
    }

    private LoadFlowResponse.SystemStatistics createEmptyStatistics() {
        return LoadFlowResponse.SystemStatistics.builder()
                .totalBuses(0)
                .totalBranches(0)
                .pvBuses(0)
                .pqBuses(0)
                .slackBuses(0)
                .totalGenerationMw(0.0)
                .totalGenerationMvar(0.0)
                .totalLoadMw(0.0)
                .totalLoadMvar(0.0)
                .totalLossesMw(0.0)
                .totalLossesMvar(0.0)
                .lossPercentage(0.0)
                .minVoltagePu(0.0)
                .maxVoltagePu(0.0)
                .avgVoltagePu(0.0)
                .minVoltageBus("N/A")
                .maxVoltageBus("N/A")
                .build();
    }
}
