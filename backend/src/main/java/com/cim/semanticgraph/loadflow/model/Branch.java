package com.cim.semanticgraph.loadflow.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Branch (Line/Transformer) in the power network
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Branch {
    private String id;
    private String name;
    private BranchType type;

    // Connected buses
    private String fromBusId;
    private String toBusId;

    // Electrical parameters (per-unit on system base)
    private double resistance;  // R (pu)
    private double reactance;   // X (pu)
    private double susceptance; // B (pu) - charging susceptance

    // Transformer parameters (if applicable)
    private double turnsRatio;  // 1.0 for lines
    private double phaseShift;  // Radians

    // Ratings
    private double ratingMva;

    // Calculated power flows (after load flow)
    private double fromActivePowerMw;
    private double fromReactivePowerMvar;
    private double toActivePowerMw;
    private double toReactivePowerMvar;
    private double lossActivePowerMw;
    private double lossReactivePowerMvar;
    private double currentMagnitude;
    private double loadingPercentage;

    // Status
    private boolean inService;
    private boolean overloaded;

    public enum BranchType {
        LINE, TRANSFORMER
    }

    public double getImpedanceMagnitude() {
        return Math.sqrt(resistance * resistance + reactance * reactance);
    }
}
