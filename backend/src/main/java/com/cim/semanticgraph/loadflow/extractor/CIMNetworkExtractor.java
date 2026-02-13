package com.cim.semanticgraph.loadflow.extractor;

import com.cim.semanticgraph.loadflow.model.Branch;
import com.cim.semanticgraph.loadflow.model.Bus;
import com.cim.semanticgraph.loadflow.model.NetworkModel;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.Model;
import org.springframework.stereotype.Component;

/**
 * CIM Network Extractor
 *
 * Extracts network topology and parameters from CIM RDF model
 * and converts to internal load flow representation.
 *
 * Supports:
 * - TopologicalNode (buses)
 * - ACLineSegment (transmission lines)
 * - PowerTransformer (transformers)
 * - EnergyConsumer (loads)
 * - GeneratingUnit (generators)
 */
@Slf4j
@Component
public class CIMNetworkExtractor {

    private static final String CIM_PREFIX = "http://iec.ch/TC57/CIM100#";
    private static final double DEFAULT_BASE_MVA = 100.0;
    private static final double DEFAULT_BASE_VOLTAGE_KV = 110.0;

    /**
     * Extract network model from CIM RDF graph
     */
    public NetworkModel extractNetwork(Model cimModel) {
        log.info("═══════════════════════════════════════════════════════════");
        log.info("Starting CIM Network Extraction");
        log.info("═══════════════════════════════════════════════════════════");
        
        if (cimModel == null || cimModel.isEmpty()) {
            log.error("❌ CIM model is null or empty!");
            throw new IllegalArgumentException("CIM model cannot be null or empty");
        }
        
        log.info("CIM model size: {} triples", cimModel.size());

        NetworkModel network = NetworkModel.builder()
                .networkId("CIM-Network-" + System.currentTimeMillis())
                .name("Extracted CIM Network")
                .baseMva(DEFAULT_BASE_MVA)
                .build();

        try {
            // Extract buses (TopologicalNodes or ConnectivityNodes)
            log.info("Step 1/5: Extracting buses...");
            extractBuses(cimModel, network);
            log.info("✅ Buses extracted: {}", network.getBusCount());

            // Extract branches (ACLineSegments and PowerTransformers)
            log.info("Step 2/5: Extracting branches...");
            extractBranches(cimModel, network);
            log.info("✅ Branches extracted: {}", network.getBranchCount());

            // Extract loads (EnergyConsumers)
            log.info("Step 3/5: Extracting loads...");
            extractLoads(cimModel, network);
            double totalLoadP = network.getBuses().stream()
                    .mapToDouble(Bus::getLoadMw)
                    .sum();
            double totalLoadQ = network.getBuses().stream()
                    .mapToDouble(Bus::getLoadMvar)
                    .sum();
            log.info("✅ Loads extracted. Total: P={} MW, Q={} MVAr", totalLoadP, totalLoadQ);

            // Extract generators (GeneratingUnits, SynchronousMachines)
            log.info("Step 4/5: Extracting generators...");
            extractGenerators(cimModel, network);
            double totalGenP = network.getBuses().stream()
                    .mapToDouble(Bus::getGenerationMw)
                    .sum();
            double totalGenQ = network.getBuses().stream()
                    .mapToDouble(Bus::getGenerationMvar)
                    .sum();
            log.info("✅ Generators extracted. Total: P={} MW, Q={} MVAr", totalGenP, totalGenQ);

            // Ensure at least one slack bus exists
            log.info("Step 5/5: Ensuring slack bus...");
            ensureSlackBus(network);
            log.info("✅ Slack bus: {}", network.getSlackBus() != null ? network.getSlackBus().getId() : "NONE");

            // Final validation
            log.info("═══════════════════════════════════════════════════════════");
            log.info("Network Extraction Summary:");
            log.info("  - Buses: {} ({} PQ, {} PV, {} Slack)", 
                    network.getBusCount(),
                    network.getBuses().stream().filter(Bus::isPQ).count(),
                    network.getBuses().stream().filter(Bus::isPV).count(),
                    network.getBuses().stream().filter(Bus::isSlack).count());
            log.info("  - Branches: {}", network.getBranchCount());
            log.info("  - Total Generation: {} MW / {} MVAr", totalGenP, totalGenQ);
            log.info("  - Total Load: {} MW / {} MVAr", totalLoadP, totalLoadQ);
            log.info("═══════════════════════════════════════════════════════════");

            // Validation warnings
            if (totalGenP == 0.0 && totalLoadP > 0.0) {
                log.error("⚠️ WARNING: Network has load but NO generation! Load flow may not converge.");
            }
            if (totalLoadP == 0.0 && totalGenP > 0.0) {
                log.warn("⚠️ WARNING: Network has generation but NO load!");
            }
            if (network.getBranchCount() == 0) {
                log.warn("⚠️ WARNING: Network has NO branches! All buses are isolated.");
            }

        } catch (Exception e) {
            log.error("❌ Error extracting CIM network: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to extract network from CIM model: " + e.getMessage(), e);
        }

        return network;
    }

    /**
     * Extract buses from CIM TopologicalNodes or ConnectivityNodes
     */
    private void extractBuses(Model cimModel, NetworkModel network) {
        // First, build a map of VoltageLevel name → base voltage (kV)
        // This serves as a lookup for buses whose voltage can't be found directly
        java.util.Map<String, Double> voltageLevelMap = new java.util.HashMap<>();
        String vlQuery = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                SELECT ?vl ?vlName ?nomV WHERE {
                    ?vl rdf:type cim:VoltageLevel .
                    ?vl cim:IdentifiedObject.name ?vlName .
                    ?vl cim:VoltageLevel.BaseVoltage ?bv .
                    ?bv cim:BaseVoltage.nominalVoltage ?nomV .
                }
                """.formatted(CIM_PREFIX);
        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(vlQuery), cimModel)) {
            ResultSet vlResults = qexec.execSelect();
            while (vlResults.hasNext()) {
                QuerySolution soln = vlResults.nextSolution();
                String vlName = soln.getLiteral("vlName").getString();
                double nomV = soln.getLiteral("nomV").getDouble();
                // Store as kV (CIM BaseVoltage.nominalVoltage is in kV)
                voltageLevelMap.put(vlName.toLowerCase(), nomV);
                log.debug("VoltageLevel '{}' -> {} kV", vlName, nomV);
            }
        } catch (Exception e) {
            log.warn("Could not extract VoltageLevel map: {}", e.getMessage());
        }
        log.info("Built VoltageLevel map with {} entries: {}", voltageLevelMap.size(), voltageLevelMap);

        // Extract buses with multiple voltage resolution paths
        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT DISTINCT ?node ?name ?baseVoltage ?vlVoltage
                WHERE {
                    { ?node rdf:type cim:TopologicalNode }
                    UNION
                    { ?node rdf:type cim:ConnectivityNode }
                    OPTIONAL { ?node cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?node cim:TopologicalNode.BaseVoltage ?bv .
                               ?bv cim:BaseVoltage.nominalVoltage ?baseVoltage }
                    OPTIONAL { ?node cim:ConnectivityNode.ConnectivityNodeContainer ?vl .
                               ?vl cim:VoltageLevel.BaseVoltage ?bv2 .
                               ?bv2 cim:BaseVoltage.nominalVoltage ?vlVoltage }
                }
                """.formatted(CIM_PREFIX);

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            int busIndex = 0;

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String nodeId = soln.getResource("node").getLocalName();
                String busId = nodeId.endsWith("_CN") ? nodeId.substring(0, nodeId.length() - 3) : nodeId;
                String busName = soln.contains("name") ? soln.getLiteral("name").getString() : busId;

                // Resolve base voltage with multiple fallback strategies
                double baseVoltageKv = DEFAULT_BASE_VOLTAGE_KV;
                if (soln.contains("baseVoltage")) {
                    // Path 1: Direct TopologicalNode.BaseVoltage
                    baseVoltageKv = soln.getLiteral("baseVoltage").getDouble();
                    // Values > 1000 are likely in Volts, convert to kV
                    if (baseVoltageKv > 1000) baseVoltageKv /= 1000.0;
                } else if (soln.contains("vlVoltage")) {
                    // Path 2: Through ConnectivityNodeContainer → VoltageLevel
                    baseVoltageKv = soln.getLiteral("vlVoltage").getDouble();
                    if (baseVoltageKv > 1000) baseVoltageKv /= 1000.0;
                } else {
                    // Path 3: Infer from bus name (e.g. "Brauweiler 380kV Bus CN")
                    baseVoltageKv = inferVoltageFromName(busName, voltageLevelMap);
                }

                Bus existingBus = network.getBus(busId);
                if (existingBus == null) {
                    Bus bus = Bus.builder()
                            .id(busId)
                            .name(busName)
                            .index(busIndex++)
                            .type(Bus.BusType.PQ)
                            .baseVoltageKv(baseVoltageKv)
                            .voltageMagnitude(1.0)
                            .voltageAngle(0.0)
                            .voltageMin(0.95)
                            .voltageMax(1.05)
                            .inService(true)
                            .violatesLimits(false)
                            .build();

                    network.addBus(bus);
                    log.info("Bus {} '{}' baseVoltage={} kV", busId, busName, baseVoltageKv);
                }
            }

            log.info("Extracted {} buses from CIM model", busIndex);
        } catch (Exception e) {
            log.warn("Error extracting buses: {}. Creating default bus.", e.getMessage());
            createDefaultBus(network);
        }
    }

    /**
     * Infer base voltage from bus name using regex patterns and VoltageLevel map.
     * Handles patterns like "380kV", "220 kV", "110kv" in bus names.
     */
    private double inferVoltageFromName(String name, java.util.Map<String, Double> voltageLevelMap) {
        if (name == null) return DEFAULT_BASE_VOLTAGE_KV;

        // Try regex: match "NNNkV" or "NNN kV" in the name
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("(\\d+)\\s*[kK][vV]")
                .matcher(name);
        if (matcher.find()) {
            double kv = Double.parseDouble(matcher.group(1));
            log.debug("Inferred voltage {} kV from name '{}'", kv, name);
            return kv;
        }

        // Try matching against VoltageLevel names
        String lowerName = name.toLowerCase();
        for (var entry : voltageLevelMap.entrySet()) {
            if (lowerName.contains(entry.getKey())) {
                log.debug("Inferred voltage {} kV from VoltageLevel match '{}'", entry.getValue(), entry.getKey());
                return entry.getValue();
            }
        }

        return DEFAULT_BASE_VOLTAGE_KV;
    }

    /**
     * Extract branches (transmission lines and transformers)
     */
    private void extractBranches(Model cimModel, NetworkModel network) {
        // Extract AC Line Segments
        extractACLineSegments(cimModel, network);

        // Extract Power Transformers
        extractPowerTransformers(cimModel, network);
    }

    /**
     * Extract AC line segments
     */
    private void extractACLineSegments(Model cimModel, NetworkModel network) {
        log.info("Extracting AC line segments from CIM model...");
        
        // More robust query - finds all terminals connected to each line
        // Works even without sequenceNumber
        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?line ?name ?r ?x ?bch ?rating ?terminal ?node ?seq
                WHERE {
                    ?line rdf:type cim:ACLineSegment .
                    OPTIONAL { ?line cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?line cim:ACLineSegment.r ?r }
                    OPTIONAL { ?line cim:ACLineSegment.x ?x }
                    OPTIONAL { ?line cim:ACLineSegment.bch ?bch }
                    OPTIONAL { ?line cim:ACLineSegment.thermalRating ?rating }
                    OPTIONAL {
                        ?terminal cim:Terminal.ConductingEquipment ?line .
                        ?terminal cim:Terminal.ConnectivityNode ?node .
                        OPTIONAL { ?terminal cim:Terminal.sequenceNumber ?seq }
                    }
                }
                ORDER BY ?line ?seq
                """.formatted(CIM_PREFIX);

        int lineCount = 0;
        int linesWithoutTerminals = 0;
        int linesWithoutBuses = 0;

        // Collect terminals for each line
        java.util.Map<String, LineData> lineDataMap = new java.util.HashMap<>();

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            
            log.debug("AC line extraction query executed. Processing results...");

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String lineId = soln.getResource("line").getLocalName();
                
                LineData lineData = lineDataMap.computeIfAbsent(lineId, k -> {
                    LineData ld = new LineData();
                    ld.id = k;
                    ld.name = soln.contains("name") ? soln.getLiteral("name").getString() : k;
                    ld.r = soln.contains("r") ? soln.getLiteral("r").getDouble() : 0.01;
                    ld.x = soln.contains("x") ? soln.getLiteral("x").getDouble() : 0.1;
                    ld.bch = soln.contains("bch") ? soln.getLiteral("bch").getDouble() : 0.0;
                    ld.ratingMva = soln.contains("rating") ? soln.getLiteral("rating").getDouble() : 500.0;
                    return ld;
                });

                // Collect connected nodes
                if (soln.contains("node")) {
                    String nodeId = soln.getResource("node").getLocalName();
                    int seq = soln.contains("seq") ? soln.getLiteral("seq").getInt() : -1;
                    
                    if (seq == 1 || lineData.fromNodeId == null) {
                        if (lineData.fromNodeId == null || seq == 1) {
                            lineData.fromNodeId = nodeId;
                        } else if (lineData.toNodeId == null) {
                            lineData.toNodeId = nodeId;
                        }
                    } else if (seq == 2 || lineData.toNodeId == null) {
                        lineData.toNodeId = nodeId;
                    }
                }
            }
        } catch (Exception e) {
            log.error("❌ Error querying AC lines: {}", e.getMessage(), e);
        }

        // Now process collected line data
        for (LineData lineData : lineDataMap.values()) {
            if (lineData.fromNodeId == null || lineData.toNodeId == null) {
                linesWithoutTerminals++;
                log.warn("⚠️ Line {} has missing terminal connections (from: {}, to: {})", 
                        lineData.id, 
                        lineData.fromNodeId != null ? lineData.fromNodeId : "MISSING", 
                        lineData.toNodeId != null ? lineData.toNodeId : "MISSING");
                continue;
            }
            
            // Remove _CN suffix if present
            final String fromBusId = lineData.fromNodeId.endsWith("_CN") ? 
                    lineData.fromNodeId.substring(0, lineData.fromNodeId.length() - 3) : lineData.fromNodeId;
            final String toBusId = lineData.toNodeId.endsWith("_CN") ? 
                    lineData.toNodeId.substring(0, lineData.toNodeId.length() - 3) : lineData.toNodeId;

            // Try to find buses with flexible matching
            Bus fromBus = findBusFlexible(network, fromBusId, lineData.fromNodeId);
            Bus toBus = findBusFlexible(network, toBusId, lineData.toNodeId);

            if (fromBus != null && toBus != null) {
                String finalFromBusId = fromBus.getId();
                String finalToBusId = toBus.getId();

                Branch branch = Branch.builder()
                        .id(lineData.id)
                        .name(lineData.name)
                        .type(Branch.BranchType.LINE)
                        .fromBusId(finalFromBusId)
                        .toBusId(finalToBusId)
                        .resistance(lineData.r)
                        .reactance(lineData.x)
                        .susceptance(lineData.bch)
                        .turnsRatio(1.0)
                        .phaseShift(0.0)
                        .ratingMva(lineData.ratingMva)
                        .inService(true)
                        .overloaded(false)
                        .build();

                network.addBranch(branch);
                lineCount++;
                log.info("✅ Connected line {} (name: {}, R={}, X={}) from bus {} to bus {}", 
                        lineData.id, lineData.name, lineData.r, lineData.x, finalFromBusId, finalToBusId);
            } else {
                linesWithoutBuses++;
                log.warn("❌ Could not find buses for line {} (fromNode: {}, toNode: {}). Available buses: {}", 
                        lineData.id, lineData.fromNodeId, lineData.toNodeId, 
                        network.getBuses().stream()
                                .map(Bus::getId)
                                .collect(java.util.stream.Collectors.joining(", ")));
            }
        }

        log.info("AC line extraction complete: {} lines connected, {} without terminals, {} without buses", 
                lineCount, linesWithoutTerminals, linesWithoutBuses);
        
        if (lineCount == 0) {
            log.error("⚠️ NO LINES WERE EXTRACTED! All buses are isolated.");
        }
    }

    /**
     * Helper class to collect line data from multiple result rows
     */
    private static class LineData {
        String id;
        String name;
        double r;
        double x;
        double bch;
        double ratingMva;
        String fromNodeId;
        String toNodeId;
    }

    /**
     * Find bus with flexible matching (exact, without _CN, or partial)
     */
    private Bus findBusFlexible(NetworkModel network, String busId, String originalNodeId) {
        // Try exact match first
        Bus bus = network.getBus(busId);
        if (bus != null) return bus;
        
        // Try without _CN suffix
        if (originalNodeId != null && originalNodeId.endsWith("_CN")) {
            String busIdWithoutSuffix = originalNodeId.substring(0, originalNodeId.length() - 3);
            bus = network.getBus(busIdWithoutSuffix);
            if (bus != null) {
                log.debug("Found bus by removing _CN suffix: {} -> {}", originalNodeId, busIdWithoutSuffix);
                return bus;
            }
        }
        
        // Try partial match
        final String searchId = busId;
        bus = network.getBuses().stream()
                .filter(b -> {
                    String id = b.getId();
                    return searchId.contains(id) || 
                           id.contains(searchId) ||
                           searchId.replace("_CN", "").equals(id);
                })
                .findFirst()
                .orElse(null);
        
        if (bus != null) {
            log.debug("Found bus by flexible match: {} -> {}", busId, bus.getId());
        }
        
        return bus;
    }

    /**
     * Extract power transformers
     */
    private void extractPowerTransformers(Model cimModel, NetworkModel network) {
        // Query transformer with terminal connections AND rated power
        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?xfmr ?name ?r ?x ?ratedS ?fromNode ?toNode
                WHERE {
                    ?xfmr rdf:type cim:PowerTransformer .
                    OPTIONAL { ?xfmr cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?xfmr cim:PowerTransformer.r ?r }
                    OPTIONAL { ?xfmr cim:PowerTransformer.x ?x }
                    OPTIONAL {
                        ?end cim:PowerTransformerEnd.PowerTransformer ?xfmr .
                        ?end cim:PowerTransformerEnd.ratedS ?ratedS
                    }
                    OPTIONAL {
                        ?t1 cim:Terminal.ConductingEquipment ?xfmr .
                        ?t1 cim:Terminal.ConnectivityNode ?fromNode .
                        ?t2 cim:Terminal.ConductingEquipment ?xfmr .
                        ?t2 cim:Terminal.ConnectivityNode ?toNode .
                        FILTER(?t1 != ?t2)
                    }
                }
                """.formatted(CIM_PREFIX);

        java.util.Set<String> processedXfmrs = new java.util.HashSet<>();

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            int xfmrCount = 0;

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String xfmrId = soln.getResource("xfmr").getLocalName();
                if (processedXfmrs.contains(xfmrId)) continue;
                processedXfmrs.add(xfmrId);

                String xfmrName = soln.contains("name") ? soln.getLiteral("name").getString() : xfmrId;
                double ratedMva = soln.contains("ratedS") ? soln.getLiteral("ratedS").getDouble() : 150.0;

                // Default per-unit impedance for transformer (on transformer MVA base)
                double r = soln.contains("r") ? soln.getLiteral("r").getDouble() : 0.005;
                double x = soln.contains("x") ? soln.getLiteral("x").getDouble() : 0.05;

                String fromNodeId = soln.contains("fromNode") ? soln.getResource("fromNode").getLocalName() : null;
                String toNodeId = soln.contains("toNode") ? soln.getResource("toNode").getLocalName() : null;

                Bus fromBus = null;
                Bus toBus = null;

                // Try direct terminal connectivity first
                if (fromNodeId != null && toNodeId != null) {
                    String fromBusId = fromNodeId.endsWith("_CN") ?
                            fromNodeId.substring(0, fromNodeId.length() - 3) : fromNodeId;
                    String toBusId = toNodeId.endsWith("_CN") ?
                            toNodeId.substring(0, toNodeId.length() - 3) : toNodeId;
                    fromBus = findBusFlexible(network, fromBusId, fromNodeId);
                    toBus = findBusFlexible(network, toBusId, toNodeId);
                }

                // Fallback: infer connections from transformer name
                // e.g. "Brauweiler 380/220 Transformer" → find Brauweiler 380kV and 220kV buses
                if (fromBus == null || toBus == null) {
                    Bus[] inferred = inferTransformerBuses(xfmrName, network);
                    if (inferred != null) {
                        fromBus = inferred[0];
                        toBus = inferred[1];
                        log.info("Inferred transformer {} connections from name: {} -> {}",
                                xfmrName, fromBus.getId(), toBus.getId());
                    }
                }

                if (fromBus != null && toBus != null) {
                    // Ensure HV bus is 'from' and LV bus is 'to'
                    if (fromBus.getBaseVoltageKv() < toBus.getBaseVoltageKv()) {
                        Bus temp = fromBus;
                        fromBus = toBus;
                        toBus = temp;
                    }

                    Branch branch = Branch.builder()
                            .id(xfmrId)
                            .name(xfmrName)
                            .type(Branch.BranchType.TRANSFORMER)
                            .fromBusId(fromBus.getId())
                            .toBusId(toBus.getId())
                            .resistance(r)
                            .reactance(x)
                            .susceptance(0.0)
                            .turnsRatio(fromBus.getBaseVoltageKv() / toBus.getBaseVoltageKv())
                            .phaseShift(0.0)
                            .ratingMva(ratedMva)
                            .inService(true)
                            .overloaded(false)
                            .build();

                    network.addBranch(branch);
                    xfmrCount++;
                    log.info("✅ Connected transformer {} '{}' (R={}, X={}, ratio={}, ratedMVA={}) from {} ({} kV) to {} ({} kV)",
                            xfmrId, xfmrName, r, x, branch.getTurnsRatio(), ratedMva,
                            fromBus.getId(), fromBus.getBaseVoltageKv(),
                            toBus.getId(), toBus.getBaseVoltageKv());
                } else {
                    log.warn("❌ Could not connect transformer {} '{}'. No matching buses found.", xfmrId, xfmrName);
                }
            }

            log.info("Extracted {} power transformers", xfmrCount);
        } catch (Exception e) {
            log.warn("Error extracting transformers: {}", e.getMessage());
        }
    }

    /**
     * Infer transformer bus connections from name pattern.
     * Handles names like "Brauweiler 380/220 Transformer" or "Cologne 220/110 Transformer".
     * Finds buses matching the substation name and voltage levels.
     */
    private Bus[] inferTransformerBuses(String xfmrName, NetworkModel network) {
        if (xfmrName == null) return null;

        // Extract voltage levels from name, e.g. "380/220" or "380kV/220kV"
        java.util.regex.Matcher voltageMatcher = java.util.regex.Pattern
                .compile("(\\d+)\\s*[kK]?[vV]?\\s*/\\s*(\\d+)\\s*[kK]?[vV]?")
                .matcher(xfmrName);

        if (!voltageMatcher.find()) return null;

        double hvKv = Double.parseDouble(voltageMatcher.group(1));
        double lvKv = Double.parseDouble(voltageMatcher.group(2));

        // Extract substation name (everything before the voltage pattern)
        String substationPart = xfmrName.substring(0, voltageMatcher.start()).trim().toLowerCase();

        log.debug("Inferring transformer buses: substation='{}', HV={}kV, LV={}kV", substationPart, hvKv, lvKv);

        // Find HV and LV buses matching the substation name and voltage
        Bus hvBus = null;
        Bus lvBus = null;

        for (Bus bus : network.getBuses()) {
            String busNameLower = bus.getName().toLowerCase();
            double busKv = bus.getBaseVoltageKv();

            if (busNameLower.contains(substationPart)) {
                if (Math.abs(busKv - hvKv) < 1.0) {
                    hvBus = bus;
                } else if (Math.abs(busKv - lvKv) < 1.0) {
                    lvBus = bus;
                }
            }
        }

        if (hvBus != null && lvBus != null) {
            return new Bus[]{hvBus, lvBus};
        }

        // Broader search: just match voltage levels
        if (hvBus == null || lvBus == null) {
            for (Bus bus : network.getBuses()) {
                String busNameLower = bus.getName().toLowerCase();
                double busKv = bus.getBaseVoltageKv();

                // Check if bus name contains the substation hint
                boolean nameMatch = substationPart.isEmpty() ||
                        busNameLower.contains(substationPart) ||
                        substationPart.contains(busNameLower.split("\\s+")[0]);

                if (nameMatch) {
                    if (hvBus == null && Math.abs(busKv - hvKv) < 1.0) {
                        hvBus = bus;
                    } else if (lvBus == null && Math.abs(busKv - lvKv) < 1.0) {
                        lvBus = bus;
                    }
                }
            }
        }

        if (hvBus != null && lvBus != null) {
            return new Bus[]{hvBus, lvBus};
        }

        log.warn("Could not infer transformer buses for '{}' (HV={}kV, LV={}kV)", xfmrName, hvKv, lvKv);
        return null;
    }

    /**
     * Extract loads from EnergyConsumers and ConformLoads
     */
    private void extractLoads(Model cimModel, NetworkModel network) {
        log.info("Starting load extraction from CIM model");

        int loadCount = 0;
        int loadsWithoutBus = 0;
        double totalLoadP = 0.0;
        double totalLoadQ = 0.0;

        // Query for EnergyConsumer (includes subclasses like ConformLoad)
        // Note: ConformLoad uses pfixed/qfixed instead of p/q
        String queryEnergyConsumer = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?load ?node ?p ?q ?pfixed ?qfixed ?name
                WHERE {
                    { ?load rdf:type cim:EnergyConsumer }
                    UNION
                    { ?load rdf:type cim:ConformLoad }
                    OPTIONAL { ?load cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?load cim:EnergyConsumer.p ?p }
                    OPTIONAL { ?load cim:EnergyConsumer.q ?q }
                    OPTIONAL { ?load cim:EnergyConsumer.pfixed ?pfixed }
                    OPTIONAL { ?load cim:EnergyConsumer.qfixed ?qfixed }
                    OPTIONAL {
                        ?t cim:Terminal.ConductingEquipment ?load .
                        ?t cim:Terminal.ConnectivityNode ?node
                    }
                }
                """.formatted(CIM_PREFIX);

        java.util.Set<String> processedLoads = new java.util.HashSet<>();

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(queryEnergyConsumer), cimModel)) {
            ResultSet results = qexec.execSelect();
            log.debug("Load extraction query executed. Processing results...");

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String loadId = soln.getResource("load").getLocalName();

                // Skip if already processed (UNION might return duplicates)
                if (processedLoads.contains(loadId)) {
                    continue;
                }
                processedLoads.add(loadId);

                String loadName = soln.contains("name") ? soln.getLiteral("name").getString() : loadId;
                String nodeId = soln.contains("node") ? soln.getResource("node").getLocalName() : null;

                // Check both p/q (EnergyConsumer) and pfixed/qfixed (ConformLoad)
                double p = 0.0;
                double q = 0.0;

                if (soln.contains("p")) {
                    p = soln.getLiteral("p").getDouble();
                } else if (soln.contains("pfixed")) {
                    p = soln.getLiteral("pfixed").getDouble();
                }

                if (soln.contains("q")) {
                    q = soln.getLiteral("q").getDouble();
                } else if (soln.contains("qfixed")) {
                    q = soln.getLiteral("qfixed").getDouble();
                }

                if (nodeId == null) {
                    log.warn("Load {} has no ConnectivityNode connection", loadId);
                    loadsWithoutBus++;
                    continue;
                }

                Bus bus = findBusFlexible(network, nodeId, nodeId);

                if (bus != null) {
                    bus.setLoadMw(bus.getLoadMw() + p);
                    bus.setLoadMvar(bus.getLoadMvar() + q);
                    totalLoadP += p;
                    totalLoadQ += q;
                    loadCount++;
                    log.info("✅ Connected load {} (name: {}, P={} MW, Q={} MVAr) to bus {}",
                            loadId, loadName, p, q, bus.getId());
                } else {
                    log.warn("❌ Could not find bus for load {} (node: {}). Available buses: {}",
                            loadId, nodeId, network.getBuses().stream()
                                    .map(Bus::getId)
                                    .collect(java.util.stream.Collectors.joining(", ")));
                    loadsWithoutBus++;
                }
            }
        } catch (Exception e) {
            log.error("❌ Error extracting loads: {}", e.getMessage(), e);
        }

        log.info("Load extraction complete: {} loads connected, {} without bus connection. Total: P={} MW, Q={} MVAr",
                loadCount, loadsWithoutBus, totalLoadP, totalLoadQ);

        if (loadCount == 0) {
            log.error("⚠️ NO LOADS WERE EXTRACTED! This will result in zero load values.");
            log.error("Available buses in network: {}", network.getBuses().stream()
                    .map(b -> b.getId() + " (type: " + b.getType() + ")")
                    .collect(java.util.stream.Collectors.joining(", ")));
        }
    }

    /**
     * Extract generators from GeneratingUnits and SynchronousMachines
     */
    private void extractGenerators(Model cimModel, NetworkModel network) {
        log.info("Starting generator extraction from CIM model");

        int genCount = 0;
        int gensWithoutBus = 0;
        double totalGenP = 0.0;
        double totalGenQ = 0.0;

        // Query for SynchronousMachines
        String querySync = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?gen ?node ?p ?q ?minQ ?maxQ ?maxP ?name
                WHERE {
                    ?gen rdf:type cim:SynchronousMachine .
                    OPTIONAL { ?gen cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?gen cim:RotatingMachine.p ?p }
                    OPTIONAL { ?gen cim:RotatingMachine.q ?q }
                    OPTIONAL { ?gen cim:RotatingMachine.minQ ?minQ }
                    OPTIONAL { ?gen cim:RotatingMachine.maxQ ?maxQ }
                    OPTIONAL {
                        ?gen cim:RotatingMachine.GeneratingUnit ?gu .
                        ?gu cim:GeneratingUnit.maxOperatingP ?maxP
                    }
                    OPTIONAL {
                        ?t cim:Terminal.ConductingEquipment ?gen .
                        ?t cim:Terminal.ConnectivityNode ?node
                    }
                }
                """.formatted(CIM_PREFIX);

        // Also query for GeneratingUnit (directly connected to terminals)
        String queryGenUnit = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?gen ?node ?maxP ?minP ?name
                WHERE {
                    ?gen rdf:type cim:GeneratingUnit .
                    OPTIONAL { ?gen cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?gen cim:GeneratingUnit.maxOperatingP ?maxP }
                    OPTIONAL { ?gen cim:GeneratingUnit.minOperatingP ?minP }
                    OPTIONAL {
                        ?t cim:Terminal.ConductingEquipment ?gen .
                        ?t cim:Terminal.ConnectivityNode ?node
                    }
                }
                """.formatted(CIM_PREFIX);

        // Process SynchronousMachines
        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(querySync), cimModel)) {
            ResultSet results = qexec.execSelect();
            log.debug("SynchronousMachine extraction query executed. Processing results...");

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                int[] counts = processGeneratorResult(soln, network, "SynchronousMachine");
                genCount += counts[0];
                gensWithoutBus += counts[1];
                totalGenP += counts[2];
                totalGenQ += counts[3];
            }
        } catch (Exception e) {
            log.error("❌ Error extracting SynchronousMachines: {}", e.getMessage(), e);
        }

        // Process GeneratingUnits
        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(queryGenUnit), cimModel)) {
            ResultSet results = qexec.execSelect();
            log.debug("GeneratingUnit extraction query executed. Processing results...");

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String genId = soln.getResource("gen").getLocalName();
                String genName = soln.contains("name") ? soln.getLiteral("name").getString() : genId;
                String nodeId = soln.contains("node") ? soln.getResource("node").getLocalName() : null;

                if (nodeId == null) {
                    log.warn("GeneratingUnit {} has no ConnectivityNode connection", genId);
                    gensWithoutBus++;
                    continue;
                }

                Bus bus = findBusFlexible(network, nodeId, nodeId);

                if (bus != null) {
                    // Use maxOperatingP as generation (e.g., 80% of max capacity)
                    double p = 0.0;
                    if (soln.contains("maxP")) {
                        double maxP = soln.getLiteral("maxP").getDouble();
                        p = maxP * 0.8; // 80% of max capacity
                        log.debug("GeneratingUnit {} using 80% of maxP: {} MW (maxP: {})", genId, p, maxP);
                    }

                    bus.setGenerationMw(bus.getGenerationMw() + p);
                    totalGenP += p;

                    // If bus has generation, make it PV bus
                    if (p > 0 && bus.getType() == Bus.BusType.PQ) {
                        bus.setType(Bus.BusType.PV);
                        bus.setVoltageMagnitude(1.0);
                        log.debug("Changed bus {} to PV type due to generation", bus.getId());
                    }

                    genCount++;
                    log.info("✅ Connected GeneratingUnit {} (name: {}, P={} MW) to bus {}",
                            genId, genName, p, bus.getId());
                } else {
                    log.warn("❌ Could not find bus for GeneratingUnit {} (node: {}). Available buses: {}",
                            genId, nodeId, network.getBuses().stream()
                                    .map(Bus::getId)
                                    .collect(java.util.stream.Collectors.joining(", ")));
                    gensWithoutBus++;
                }
            }
        } catch (Exception e) {
            log.error("❌ Error extracting GeneratingUnits: {}", e.getMessage(), e);
        }

        log.info("Generator extraction complete: {} generators connected, {} without bus connection. Total: P={} MW, Q={} MVAr",
                genCount, gensWithoutBus, totalGenP, totalGenQ);

        if (genCount == 0) {
            log.error("⚠️ NO GENERATORS WERE EXTRACTED! This will result in zero generation values.");
            log.error("Available buses in network: {}", network.getBuses().stream()
                    .map(b -> b.getId() + " (type: " + b.getType() + ")")
                    .collect(java.util.stream.Collectors.joining(", ")));
        }
    }

    /**
     * Helper method to process a single generator query result
     */
    private int[] processGeneratorResult(QuerySolution soln, NetworkModel network, String genType) {
        int genCount = 0;
        int gensWithoutBus = 0;
        double totalGenP = 0.0;
        double totalGenQ = 0.0;

        String genId = soln.getResource("gen").getLocalName();
        String genName = soln.contains("name") ? soln.getLiteral("name").getString() : genId;
        String nodeId = soln.contains("node") ? soln.getResource("node").getLocalName() : null;

        if (nodeId == null) {
            log.warn("{} {} has no ConnectivityNode connection", genType, genId);
            return new int[]{0, 1, 0, 0};
        }

        Bus bus = findBusFlexible(network, nodeId, nodeId);

        if (bus != null) {
            double p = 0.0;
            if (soln.contains("p")) {
                p = soln.getLiteral("p").getDouble();
                log.debug("{} {} has explicit P value: {} MW", genType, genId, p);
            } else if (soln.contains("maxP")) {
                double maxP = soln.getLiteral("maxP").getDouble();
                p = maxP * 0.8;
                log.debug("{} {} using 80% of maxP: {} MW (maxP: {})", genType, genId, p, maxP);
            }

            double q = soln.contains("q") ? soln.getLiteral("q").getDouble() : 0.0;
            double minQ = soln.contains("minQ") ? soln.getLiteral("minQ").getDouble() : -50.0;
            double maxQ = soln.contains("maxQ") ? soln.getLiteral("maxQ").getDouble() : 50.0;

            bus.setGenerationMw(bus.getGenerationMw() + p);
            bus.setGenerationMvar(bus.getGenerationMvar() + q);
            bus.setGenerationMinMvar(minQ);
            bus.setGenerationMaxMvar(maxQ);
            totalGenP = p;
            totalGenQ = q;

            if (p > 0 && bus.getType() == Bus.BusType.PQ) {
                bus.setType(Bus.BusType.PV);
                bus.setVoltageMagnitude(1.0);
            }

            genCount = 1;
            log.info("✅ Connected {} {} (name: {}, P={} MW, Q={} MVAr) to bus {}",
                    genType, genId, genName, p, q, bus.getId());
        } else {
            log.warn("❌ Could not find bus for {} {} (node: {})", genType, genId, nodeId);
            gensWithoutBus = 1;
        }

        return new int[]{genCount, gensWithoutBus, (int)totalGenP, (int)totalGenQ};
    }

    /**
     * Ensure at least one slack bus exists in the network
     */
    private void ensureSlackBus(NetworkModel network) {
        if (network.getSlackBus() == null && !network.getBuses().isEmpty()) {
            // Find bus with highest generation or first PV bus
            Bus slackCandidate = network.getBuses().stream()
                    .filter(Bus::isPV)
                    .max((b1, b2) -> Double.compare(b1.getGenerationMw(), b2.getGenerationMw()))
                    .orElse(network.getBuses().get(0));

            slackCandidate.setType(Bus.BusType.SLACK);
            slackCandidate.setVoltageMagnitude(1.0);
            slackCandidate.setVoltageAngle(0.0);

            log.info("Designated bus {} as slack bus", slackCandidate.getId());
        }
    }

    /**
     * Create default minimal network for testing
     */
    private void createDefaultBus(NetworkModel network) {
        Bus defaultBus = Bus.builder()
                .id("BUS_DEFAULT")
                .name("Default Bus")
                .index(0)
                .type(Bus.BusType.SLACK)
                .baseVoltageKv(DEFAULT_BASE_VOLTAGE_KV)
                .voltageMagnitude(1.0)
                .voltageAngle(0.0)
                .voltageMin(0.95)
                .voltageMax(1.05)
                .generationMw(100.0)
                .loadMw(0.0)
                .inService(true)
                .build();

        network.addBus(defaultBus);
        log.info("Created default bus");
    }
}
