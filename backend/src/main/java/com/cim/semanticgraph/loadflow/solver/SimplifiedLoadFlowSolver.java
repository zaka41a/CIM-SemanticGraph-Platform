package com.cim.semanticgraph.loadflow.solver;

import com.cim.semanticgraph.loadflow.model.Branch;
import com.cim.semanticgraph.loadflow.model.Bus;
import com.cim.semanticgraph.loadflow.model.NetworkModel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Simplified Load Flow Solver
 *
 * Uses DC power flow approximation for fast, stable calculations.
 * Suitable for real-time analysis and initial network assessment.
 *
 * Assumptions:
 * - Voltage magnitudes near 1.0 pu
 * - Small angle differences
 * - Resistance << Reactance (high X/R ratio)
 * - Focuses on active power flow only
 */
@Slf4j
@Component
public class SimplifiedLoadFlowSolver {

    private static final double CONVERGENCE_TOLERANCE = 1e-3; // Relaxed tolerance for better convergence
    private static final int MAX_ITERATIONS = 100; // Reasonable max iterations
    private static final double RELAXATION_FACTOR = 1.0; // No over-relaxation to avoid instability
    private static final double MAX_ANGLE_RADIANS = Math.PI; // Maximum angle difference (180 degrees)

    /**
     * Solve load flow using simplified DC approximation
     */
    public LoadFlowResult solve(NetworkModel network) {
        long startTime = System.currentTimeMillis();

        log.info("Starting simplified load flow calculation for network: {}", network.getNetworkId());

        if (!network.isValid()) {
            log.error("Invalid network model - missing slack bus or disconnected buses");
            return LoadFlowResult.builder()
                    .converged(false)
                    .iterations(0)
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .errorMessage("Invalid network: must have at least one slack bus and all branches must connect valid buses")
                    .build();
        }

        int n = network.getBusCount();

        // Build admittance matrix (Y-bus) - using only reactance for DC approximation
        double[][] B = buildSusceptanceMatrix(network);

        // Check for isolated buses (diagonal element = 0 means no connections)
        int isolatedCount = 0;
        for (int i = 0; i < n; i++) {
            if (Math.abs(B[i][i]) < 1e-10) {
                Bus bus = network.getBuses().get(i);
                log.warn("⚠️ Bus {} (index {}) is ISOLATED - not connected to any branch!", bus.getId(), i);
                isolatedCount++;
            }
        }
        if (isolatedCount > 0) {
            log.warn("Network has {} isolated buses out of {} total. Results may be inaccurate.", isolatedCount, n);
        }

        // Initialize voltage angles (slack bus at 0)
        double[] theta = new double[n];
        Bus slackBus = network.getSlackBus();

        // Set initial voltage magnitudes
        for (Bus bus : network.getBuses()) {
            bus.setCalculatedVoltageMagnitude(bus.getVoltageMagnitude() > 0 ? bus.getVoltageMagnitude() : 1.0);
            if (bus.isSlack()) {
                bus.setCalculatedVoltageAngle(0.0);
            }
        }

        // Solve for voltage angles using DC power flow
        int iterations = solveDCPowerFlow(network, B, theta);

        // Calculate branch power flows
        calculateBranchFlows(network, theta);

        // Update bus results
        for (Bus bus : network.getBuses()) {
            int i = bus.getIndex();
            
            // Check if bus is isolated (diagonal element = 0)
            boolean isIsolated = Math.abs(B[i][i]) < 1e-10;
            
            // Convert angle from radians to degrees, handle NaN and normalize
            double angleRad = theta[i];
            if (Double.isNaN(angleRad) || Double.isInfinite(angleRad) || isIsolated) {
                angleRad = 0.0; // Default to 0 radians for isolated buses or NaN
            }
            double angleDeg = Math.toDegrees(angleRad);
            // Round small angles to 0 for cleaner display
            if (Math.abs(angleDeg) < 0.01) {
                angleDeg = 0.0;
            }
            bus.setCalculatedVoltageAngle(angleDeg);
            
            // Log warning for isolated buses
            if (isIsolated && !bus.isSlack()) {
                log.warn("Bus {} is isolated (no branch connections). P={} MW, Load={} MW, Gen={} MW", 
                        bus.getId(), bus.getNetActivePower(), bus.getLoadMw(), bus.getGenerationMw());
            }

            // For DC approximation, voltage magnitude stays at specified value
            double voltageMag = bus.getVoltageMagnitude();
            if (bus.isPV() || bus.isSlack()) {
                bus.setCalculatedVoltageMagnitude(voltageMag > 0 ? voltageMag : 1.0);
            } else {
                bus.setCalculatedVoltageMagnitude(1.0); // Assume 1.0 pu for PQ buses
            }

            // Calculate power injection at bus
            calculateBusPower(bus, network, theta);
        }

        long executionTime = System.currentTimeMillis() - startTime;
        boolean converged = iterations < MAX_ITERATIONS;

        log.info("Load flow completed in {} iterations, {} ms - Converged: {}",
                iterations, executionTime, converged);

        return LoadFlowResult.builder()
                .converged(converged)
                .iterations(iterations)
                .executionTimeMs(executionTime)
                .tolerance(CONVERGENCE_TOLERANCE)
                .build();
    }

    /**
     * Build susceptance matrix (B = Im(Y)) for DC approximation
     */
    private double[][] buildSusceptanceMatrix(NetworkModel network) {
        int n = network.getBusCount();
        double[][] B = new double[n][n];

        for (Branch branch : network.getBranches()) {
            if (!branch.isInService()) {
                continue;
            }

            Bus fromBus = network.getBus(branch.getFromBusId());
            Bus toBus = network.getBus(branch.getToBusId());

            if (fromBus == null || toBus == null) {
                continue;
            }

            int i = fromBus.getIndex();
            int j = toBus.getIndex();

            // Use reactance for susceptance calculation
            double x = branch.getReactance();
            if (Math.abs(x) < 1e-10) {
                x = 0.0001; // Avoid division by zero
            }

            double b = -1.0 / x; // Susceptance

            // Off-diagonal elements
            B[i][j] += b;
            B[j][i] += b;

            // Diagonal elements
            B[i][i] -= b;
            B[j][j] -= b;
        }

        return B;
    }

    /**
     * Solve DC power flow: P = B * theta
     */
    private int solveDCPowerFlow(NetworkModel network, double[][] B, double[] theta) {
        int n = network.getBusCount();
        Bus slackBus = network.getSlackBus();
        int slackIndex = slackBus.getIndex();

        // Build power injection vector (P)
        double[] P = new double[n];
        for (Bus bus : network.getBuses()) {
            if (!bus.isSlack()) {
                P[bus.getIndex()] = bus.getNetActivePower() / network.getBaseMva();
            }
        }

        // Iterative solution using Successive Over-Relaxation (SOR) for faster convergence
        int iterations = 0;
        double maxChange;

        do {
            maxChange = 0.0;

            for (Bus bus : network.getBuses()) {
                if (bus.isSlack()) {
                    continue;
                }

                int i = bus.getIndex();
                double sum = P[i];

                for (int j = 0; j < n; j++) {
                    if (i != j) {
                        sum -= B[i][j] * theta[j];
                    }
                }

                double newTheta;
                if (Math.abs(B[i][i]) > 1e-10) {
                    newTheta = sum / B[i][i];
                    // Handle NaN or infinite values
                    if (Double.isNaN(newTheta) || Double.isInfinite(newTheta)) {
                        newTheta = theta[i]; // Keep previous value
                    } else {
                        // Apply relaxation (no over-relaxation to avoid instability)
                        newTheta = theta[i] + RELAXATION_FACTOR * (newTheta - theta[i]);
                        
                        // Normalize angle to reasonable range for power systems
                        // Typical angles should be < 30-40 degrees (0.5-0.7 rad)
                        // Angles > 90 degrees indicate convergence issues
                        double maxReasonableAngle = Math.PI / 3; // 60 degrees
                        if (Math.abs(newTheta) > maxReasonableAngle) {
                            log.debug("Bus {} angle {} rad exceeds reasonable limit, clamping", i, newTheta);
                            newTheta = Math.signum(newTheta) * maxReasonableAngle;
                        }
                    }
                } else {
                    // Diagonal element is too small = isolated bus
                    // Keep angle at 0 for isolated buses
                    newTheta = 0.0;
                    if (iterations == 1) {
                        log.debug("Bus {} is isolated (B[i][i]=0), setting angle to 0", i);
                    }
                }
                
                double change = Math.abs(newTheta - theta[i]);

                if (change > maxChange) {
                    maxChange = change;
                }

                theta[i] = newTheta;
            }

            iterations++;

            // Check for divergence (angles growing too large)
            // For a well-conditioned power system, angles should typically be < 30-40 degrees
            boolean diverging = false;
            double maxAbsAngle = 0.0;
            for (int k = 0; k < n; k++) {
                double absAngle = Math.abs(theta[k]);
                if (absAngle > maxAbsAngle) {
                    maxAbsAngle = absAngle;
                }
                if (absAngle > Math.PI / 2) { // 90 degrees indicates problems
                    diverging = true;
                }
            }
            
            if (diverging && iterations > 10) {
                log.warn("Load flow showing convergence issues at iteration {} (max angle: {} deg). May have isolated buses.", 
                        iterations, Math.toDegrees(maxAbsAngle));
            }

            // Log progress every 20 iterations for debugging
            if (iterations % 20 == 0) {
                log.debug("Load flow iteration {}: maxChange = {}", iterations, maxChange);
            }

        } while (maxChange > CONVERGENCE_TOLERANCE && iterations < MAX_ITERATIONS);

        return iterations;
    }

    /**
     * Calculate power flows on branches
     */
    private void calculateBranchFlows(NetworkModel network, double[] theta) {
        for (Branch branch : network.getBranches()) {
            if (!branch.isInService()) {
                continue;
            }

            Bus fromBus = network.getBus(branch.getFromBusId());
            Bus toBus = network.getBus(branch.getToBusId());

            if (fromBus == null || toBus == null) {
                continue;
            }

            int i = fromBus.getIndex();
            int j = toBus.getIndex();

            // Ensure theta values are valid
            double thetaI = Double.isNaN(theta[i]) ? 0.0 : theta[i];
            double thetaJ = Double.isNaN(theta[j]) ? 0.0 : theta[j];
            double thetaIJ = thetaI - thetaJ;
            
            double x = branch.getReactance();
            if (Double.isNaN(x) || Double.isInfinite(x)) {
                x = 0.0001; // Default small reactance
            }

            if (Math.abs(x) < 1e-10) {
                x = 0.0001;
            }

            // DC power flow: P = (theta_i - theta_j) / X (in per-unit)
            // Convert to MW: P_MW = P_pu * baseMVA
            double powerFlowPu = thetaIJ / x; // Power flow in per-unit
            double powerFlowMw = powerFlowPu * network.getBaseMva();

            branch.setFromActivePowerMw(powerFlowMw);
            branch.setToActivePowerMw(-powerFlowMw);

            // Approximate reactive power (simplified for DC approximation)
            // Q ≈ P * (R/X) for small angles (DC approximation)
            double r = branch.getResistance();
            double reactivePower = 0.0;
            if (Math.abs(x) > 1e-10 && !Double.isNaN(powerFlowPu) && !Double.isInfinite(powerFlowPu)) {
                // Q ≈ P * tan(phi) where tan(phi) ≈ R/X for high X/R ratio
                reactivePower = powerFlowPu * (r / x) * network.getBaseMva();
                if (Double.isNaN(reactivePower) || Double.isInfinite(reactivePower)) {
                    reactivePower = 0.0;
                }
            }

            branch.setFromReactivePowerMvar(reactivePower);
            branch.setToReactivePowerMvar(-reactivePower);

            // Calculate losses: P_loss = I²R ≈ (P²/V²) * R
            // For DC approximation with V ≈ 1.0 pu: P_loss ≈ P² * R (in per-unit)
            // Convert to MW: P_loss_MW = P_loss_pu * baseMVA
            double lossP = 0.0;
            if (Math.abs(x) > 1e-10 && !Double.isNaN(powerFlowPu) && !Double.isInfinite(powerFlowPu)) {
                // Losses in per-unit: P_loss_pu = P_pu² * R
                double lossPu = powerFlowPu * powerFlowPu * Math.abs(r);
                // Convert to MW
                lossP = lossPu * network.getBaseMva();
                if (Double.isNaN(lossP) || Double.isInfinite(lossP) || lossP < 0) {
                    lossP = 0.0;
                }
            }
            branch.setLossActivePowerMw(lossP);
            
            // Reactive losses: Q_loss ≈ P_loss * (X/R) for small losses
            double lossQ = 0.0;
            if (lossP > 0 && Math.abs(r) > 1e-10) {
                lossQ = lossP * (x / Math.abs(r)) * 0.1; // Simplified
                if (Double.isNaN(lossQ) || Double.isInfinite(lossQ)) {
                    lossQ = 0.0;
                }
            }
            branch.setLossReactivePowerMvar(lossQ);

            // Calculate loading percentage
            if (branch.getRatingMva() > 0) {
                double apparentPower = Math.sqrt(powerFlowMw * powerFlowMw + reactivePower * reactivePower);
                branch.setLoadingPercentage((apparentPower / branch.getRatingMva()) * 100.0);
                branch.setOverloaded(branch.getLoadingPercentage() > 100.0);
            }

            // Approximate current
            double vBase = fromBus.getBaseVoltageKv();
            if (vBase > 0) {
                branch.setCurrentMagnitude(Math.abs(powerFlowMw) / (Math.sqrt(3) * vBase));
            }
        }
    }

    /**
     * Calculate power injection at bus
     */
    private void calculateBusPower(Bus bus, NetworkModel network, double[] theta) {
        double pCalc = 0.0;
        double qCalc = 0.0;

        // Sum power flows from all connected branches
        for (Branch branch : network.getBranches()) {
            if (!branch.isInService()) {
                continue;
            }

            double fromP = branch.getFromActivePowerMw();
            double fromQ = branch.getFromReactivePowerMvar();
            double toP = branch.getToActivePowerMw();
            double toQ = branch.getToReactivePowerMvar();

            // Handle NaN values
            if (Double.isNaN(fromP)) fromP = 0.0;
            if (Double.isNaN(fromQ)) fromQ = 0.0;
            if (Double.isNaN(toP)) toP = 0.0;
            if (Double.isNaN(toQ)) toQ = 0.0;

            if (branch.getFromBusId().equals(bus.getId())) {
                pCalc += fromP;
                qCalc += fromQ;
            } else if (branch.getToBusId().equals(bus.getId())) {
                pCalc += toP;
                qCalc += toQ;
            }
        }

        // Ensure calculated values are not NaN
        if (Double.isNaN(pCalc)) {
            pCalc = bus.getNetActivePower(); // Fallback to net power
            if (Double.isNaN(pCalc)) pCalc = 0.0;
        }
        if (Double.isNaN(qCalc)) {
            qCalc = bus.getNetReactivePower(); // Fallback to net reactive power
            if (Double.isNaN(qCalc)) qCalc = 0.0;
        }

        bus.setCalculatedActivePower(pCalc);
        bus.setCalculatedReactivePower(qCalc);

        // Check voltage limits
        double vPu = bus.getCalculatedVoltageMagnitude();
        bus.setViolatesLimits(vPu < bus.getVoltageMin() || vPu > bus.getVoltageMax());
    }

    /**
     * Result container for load flow calculation
     */
    @lombok.Data
    @lombok.Builder
    public static class LoadFlowResult {
        private boolean converged;
        private int iterations;
        private long executionTimeMs;
        private double tolerance;
        private String errorMessage;
    }
}
