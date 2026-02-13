package com.cim.semanticgraph.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoadFlowResponse {

    private boolean converged;
    private int iterations;
    private double tolerance;
    private long executionTimeMs;
    private LocalDateTime timestamp;
    private String calculationMethod;
    private List<BusResult> busResults;
    private List<BranchResult> branchResults;
    private SystemStatistics statistics;
    private List<Violation> violations;
    private String targetBusId;
    private String networkId;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BusResult {
        private String busId;
        private String busName;
        private String busType;
        private double voltageMagnitude;
        private double voltageAngle;
        private double voltageKv;
        private double activePowerMw;
        private double reactivePowerMvar;
        private double generationMw;
        private double generationMvar;
        private double loadMw;
        private double loadMvar;
        private boolean withinLimits;
        private double voltagePercentage;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BranchResult {
        private String branchId;
        private String branchName;
        private String branchType;
        private String fromBusId;
        private String toBusId;
        private double fromActivePowerMw;
        private double fromReactivePowerMvar;
        private double toActivePowerMw;
        private double toReactivePowerMvar;
        private double lossActivePowerMw;
        private double lossReactivePowerMvar;
        private double currentMagnitude;
        private double loadingPercentage;
        private boolean overloaded;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SystemStatistics {
        private int totalBuses;
        private int totalBranches;
        private int pvBuses;
        private int pqBuses;
        private int slackBuses;
        private double totalGenerationMw;
        private double totalGenerationMvar;
        private double totalLoadMw;
        private double totalLoadMvar;
        private double totalLossesMw;
        private double totalLossesMvar;
        private double lossPercentage;
        private double minVoltagePu;
        private double maxVoltagePu;
        private double avgVoltagePu;
        private String minVoltageBus;
        private String maxVoltageBus;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Violation {
        private String type;
        private String severity;
        private String elementId;
        private String elementName;
        private double actualValue;
        private double limitValue;
        private double violationPercentage;
        private String description;
    }
}
