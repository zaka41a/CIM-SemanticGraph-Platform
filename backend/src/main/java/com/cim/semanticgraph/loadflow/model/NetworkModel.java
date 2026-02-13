package com.cim.semanticgraph.loadflow.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Complete network model for load flow calculations
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NetworkModel {

    private String networkId;
    private String name;

    @Builder.Default
    private List<Bus> buses = new ArrayList<>();

    @Builder.Default
    private List<Branch> branches = new ArrayList<>();

    @Builder.Default
    private Map<String, Bus> busMap = new HashMap<>();

    @Builder.Default
    private Map<String, Branch> branchMap = new HashMap<>();

    // System base power (MVA)
    private double baseMva = 100.0;

    /**
     * Add bus to network
     */
    public void addBus(Bus bus) {
        buses.add(bus);
        busMap.put(bus.getId(), bus);
        bus.setIndex(buses.size() - 1);
    }

    /**
     * Add branch to network
     */
    public void addBranch(Branch branch) {
        branches.add(branch);
        branchMap.put(branch.getId(), branch);
    }

    /**
     * Get bus by ID
     */
    public Bus getBus(String busId) {
        return busMap.get(busId);
    }

    /**
     * Get branch by ID
     */
    public Branch getBranch(String branchId) {
        return branchMap.get(branchId);
    }

    /**
     * Get total number of buses
     */
    public int getBusCount() {
        return buses.size();
    }

    /**
     * Get total number of branches
     */
    public int getBranchCount() {
        return branches.size();
    }

    /**
     * Get slack bus
     */
    public Bus getSlackBus() {
        return buses.stream()
                .filter(Bus::isSlack)
                .findFirst()
                .orElse(null);
    }

    /**
     * Get all PQ buses
     */
    public List<Bus> getPQBuses() {
        return buses.stream()
                .filter(Bus::isPQ)
                .toList();
    }

    /**
     * Get all PV buses
     */
    public List<Bus> getPVBuses() {
        return buses.stream()
                .filter(Bus::isPV)
                .toList();
    }

    /**
     * Validate network model
     */
    public boolean isValid() {
        // Must have at least one slack bus
        if (getSlackBus() == null) {
            return false;
        }

        // All branches must connect valid buses
        for (Branch branch : branches) {
            if (busMap.get(branch.getFromBusId()) == null ||
                busMap.get(branch.getToBusId()) == null) {
                return false;
            }
        }

        return true;
    }
}
