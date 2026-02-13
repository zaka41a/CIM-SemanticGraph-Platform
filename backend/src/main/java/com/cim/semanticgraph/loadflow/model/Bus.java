package com.cim.semanticgraph.loadflow.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Bus (Node) in the power network
 *
 * Represents an electrical bus with voltage, power injections,
 * and generator/load connections.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Bus {

    /**
     * Bus identification
     */
    private String id;
    private String name;
    private int index; // Numerical index for matrix operations

    /**
     * Bus type classification
     */
    private BusType type;

    /**
     * Electrical parameters (initial/specified values)
     */
    private double baseVoltageKv;    // Base voltage in kV
    private double voltageMagnitude; // Per-unit or kV
    private double voltageAngle;     // Radians

    /**
     * Power injections (specified)
     */
    private double activePowerMw;      // P (generation - load)
    private double reactivePowerMvar;  // Q (generation - load)

    /**
     * Generation
     */
    private double generationMw;
    private double generationMvar;
    private double generationMinMvar; // For reactive power limits
    private double generationMaxMvar;

    /**
     * Load
     */
    private double loadMw;
    private double loadMvar;

    /**
     * Voltage limits
     */
    private double voltageMin; // Per-unit
    private double voltageMax; // Per-unit

    /**
     * Calculated values (after load flow)
     */
    private double calculatedVoltageMagnitude;
    private double calculatedVoltageAngle;
    private double calculatedActivePower;
    private double calculatedReactivePower;

    /**
     * Status flags
     */
    private boolean inService;
    private boolean violatesLimits;

    /**
     * Bus types for load flow classification
     */
    public enum BusType {
        /**
         * Slack/Swing bus: V and θ are specified
         * System reference, balances power
         */
        SLACK,

        /**
         * PV bus: P and V are specified
         * Generator buses with voltage control
         */
        PV,

        /**
         * PQ bus: P and Q are specified
         * Load buses, no voltage control
         */
        PQ
    }

    /**
     * Check if bus is slack (reference) bus
     */
    public boolean isSlack() {
        return type == BusType.SLACK;
    }

    /**
     * Check if bus is PV (generator) bus
     */
    public boolean isPV() {
        return type == BusType.PV;
    }

    /**
     * Check if bus is PQ (load) bus
     */
    public boolean isPQ() {
        return type == BusType.PQ;
    }

    /**
     * Get net power injection (generation - load)
     */
    public double getNetActivePower() {
        return generationMw - loadMw;
    }

    public double getNetReactivePower() {
        return generationMvar - loadMvar;
    }
}
