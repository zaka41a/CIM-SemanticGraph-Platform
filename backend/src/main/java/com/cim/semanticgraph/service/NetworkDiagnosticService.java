package com.cim.semanticgraph.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.Model;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class NetworkDiagnosticService {

    private final JenaService jenaService;

    private static final String CIM_PREFIX = "http://iec.ch/TC57/CIM100#";

    public DiagnosticResult runDiagnostics() {
        log.info("═══════════════════════════════════════════════════════════");
        log.info("Running Network Diagnostics");
        log.info("═══════════════════════════════════════════════════════════");

        DiagnosticResult result = new DiagnosticResult();

        try {
            Model cimModel = jenaService.getModelCopy();

            if (cimModel == null || cimModel.isEmpty()) {
                result.addError("CIM_MODEL_EMPTY", "CIM model is empty. No data has been imported.");
                return result;
            }

            result.setTotalTriples(cimModel.size());
            log.info("CIM model contains {} triples", cimModel.size());

            checkBuses(cimModel, result);
            checkBranches(cimModel, result);
            checkGenerators(cimModel, result);
            checkLoads(cimModel, result);
            checkConnectivity(cimModel, result);
            assessNetwork(result);

            log.info("═══════════════════════════════════════════════════════════");
            log.info("Diagnostics Complete: {} errors, {} warnings",
                    result.getErrors().size(), result.getWarnings().size());
            log.info("═══════════════════════════════════════════════════════════");

        } catch (Exception e) {
            log.error("Error running diagnostics: {}", e.getMessage(), e);
            result.addError("DIAGNOSTIC_ERROR", "Failed to run diagnostics: " + e.getMessage());
        }

        return result;
    }

    private void checkBuses(Model cimModel, DiagnosticResult result) {
        log.info("Checking buses...");

        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT DISTINCT ?node ?name
                WHERE {
                    { ?node rdf:type cim:TopologicalNode }
                    UNION
                    { ?node rdf:type cim:ConnectivityNode }
                    OPTIONAL { ?node cim:IdentifiedObject.name ?name }
                }
                """.formatted(CIM_PREFIX);

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            int count = 0;
            List<String> busIds = new ArrayList<>();

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String nodeId = soln.getResource("node").getLocalName();
                busIds.add(nodeId);
                count++;
            }

            result.setBusCount(count);
            result.setBusIds(busIds);

            if (count == 0) {
                result.addError("NO_BUSES", "No buses found in the network. Cannot perform load flow.");
            } else if (count < 2) {
                result.addWarning("INSUFFICIENT_BUSES",
                        String.format("Only %d bus found. Need at least 2 buses for a meaningful network.", count));
            } else {
                log.info("✅ Found {} buses", count);
            }
        } catch (Exception e) {
            log.error("Error checking buses: {}", e.getMessage());
            result.addError("BUS_CHECK_ERROR", "Failed to check buses: " + e.getMessage());
        }
    }

    private void checkBranches(Model cimModel, DiagnosticResult result) {
        log.info("Checking branches...");

        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?line ?name ?fromNode ?toNode
                WHERE {
                    ?line rdf:type cim:ACLineSegment .
                    OPTIONAL { ?line cim:IdentifiedObject.name ?name }
                    OPTIONAL {
                        ?t1 cim:Terminal.ConductingEquipment ?line .
                        ?t1 cim:Terminal.ConnectivityNode ?fromNode .
                        ?t1 cim:Terminal.sequenceNumber ?seq1 .
                        FILTER(?seq1 = 1)
                    }
                    OPTIONAL {
                        ?t2 cim:Terminal.ConductingEquipment ?line .
                        ?t2 cim:Terminal.ConnectivityNode ?toNode .
                        ?t2 cim:Terminal.sequenceNumber ?seq2 .
                        FILTER(?seq2 = 2)
                    }
                }
                """.formatted(CIM_PREFIX);

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            int count = 0;
            int connectedCount = 0;
            List<String> lineIds = new ArrayList<>();

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String lineId = soln.getResource("line").getLocalName();
                lineIds.add(lineId);
                count++;

                boolean hasFrom = soln.contains("fromNode");
                boolean hasTo = soln.contains("toNode");

                if (hasFrom && hasTo) {
                    connectedCount++;
                } else {
                    result.addWarning("UNCONNECTED_LINE",
                            String.format("Line %s is missing terminal connections (from: %s, to: %s)",
                                    lineId, hasFrom, hasTo));
                }
            }

            result.setBranchCount(count);
            result.setConnectedBranchCount(connectedCount);
            result.setLineIds(lineIds);

            if (count == 0) {
                result.addError("NO_BRANCHES",
                        "No transmission lines found. All buses are isolated. Check if lines were imported correctly.");
            } else if (connectedCount < count) {
                result.addWarning("PARTIALLY_CONNECTED_BRANCHES",
                        String.format("%d out of %d lines are fully connected", connectedCount, count));
            } else {
                log.info("✅ Found {} branches, all connected", count);
            }
        } catch (Exception e) {
            log.error("Error checking branches: {}", e.getMessage());
            result.addError("BRANCH_CHECK_ERROR", "Failed to check branches: " + e.getMessage());
        }
    }

    private void checkGenerators(Model cimModel, DiagnosticResult result) {
        log.info("Checking generators...");

        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?gen ?name ?p ?node
                WHERE {
                    ?gen rdf:type cim:SynchronousMachine .
                    OPTIONAL { ?gen cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?gen cim:RotatingMachine.p ?p }
                    OPTIONAL {
                        ?t cim:Terminal.ConductingEquipment ?gen .
                        ?t cim:Terminal.ConnectivityNode ?node
                    }
                }
                """.formatted(CIM_PREFIX);

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            int count = 0;
            int connectedCount = 0;
            double totalP = 0.0;
            List<String> genIds = new ArrayList<>();

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String genId = soln.getResource("gen").getLocalName();
                genIds.add(genId);
                count++;

                if (soln.contains("node")) {
                    connectedCount++;
                } else {
                    result.addWarning("UNCONNECTED_GENERATOR",
                            String.format("Generator %s is not connected to any bus", genId));
                }

                if (soln.contains("p")) {
                    totalP += soln.getLiteral("p").getDouble();
                }
            }

            result.setGeneratorCount(count);
            result.setConnectedGeneratorCount(connectedCount);
            result.setTotalGenerationMw(totalP);
            result.setGeneratorIds(genIds);

            if (count == 0) {
                result.addError("NO_GENERATORS",
                        "No generators found. Load flow will show 0 MW generation.");
            } else if (connectedCount < count) {
                result.addWarning("PARTIALLY_CONNECTED_GENERATORS",
                        String.format("%d out of %d generators are connected", connectedCount, count));
            } else if (totalP == 0.0) {
                result.addWarning("ZERO_GENERATION",
                        "All generators have P=0. Check if power values were imported correctly.");
            } else {
                log.info("✅ Found {} generators, total {} MW", count, totalP);
            }
        } catch (Exception e) {
            log.error("Error checking generators: {}", e.getMessage());
            result.addError("GENERATOR_CHECK_ERROR", "Failed to check generators: " + e.getMessage());
        }
    }

    private void checkLoads(Model cimModel, DiagnosticResult result) {
        log.info("Checking loads...");

        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT ?load ?name ?p ?node
                WHERE {
                    ?load rdf:type cim:EnergyConsumer .
                    OPTIONAL { ?load cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?load cim:EnergyConsumer.p ?p }
                    OPTIONAL {
                        ?t cim:Terminal.ConductingEquipment ?load .
                        ?t cim:Terminal.ConnectivityNode ?node
                    }
                }
                """.formatted(CIM_PREFIX);

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            int count = 0;
            int connectedCount = 0;
            double totalP = 0.0;
            List<String> loadIds = new ArrayList<>();

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String loadId = soln.getResource("load").getLocalName();
                loadIds.add(loadId);
                count++;

                if (soln.contains("node")) {
                    connectedCount++;
                } else {
                    result.addWarning("UNCONNECTED_LOAD",
                            String.format("Load %s is not connected to any bus", loadId));
                }

                if (soln.contains("p")) {
                    totalP += soln.getLiteral("p").getDouble();
                }
            }

            result.setLoadCount(count);
            result.setConnectedLoadCount(connectedCount);
            result.setTotalLoadMw(totalP);
            result.setLoadIds(loadIds);

            if (count == 0) {
                result.addWarning("NO_LOADS",
                        "No loads found. Network has no consumption.");
            } else if (connectedCount < count) {
                result.addWarning("PARTIALLY_CONNECTED_LOADS",
                        String.format("%d out of %d loads are connected", connectedCount, count));
            } else if (totalP == 0.0) {
                result.addWarning("ZERO_LOAD",
                        "All loads have P=0. Check if power values were imported correctly.");
            } else {
                log.info("✅ Found {} loads, total {} MW", count, totalP);
            }
        } catch (Exception e) {
            log.error("Error checking loads: {}", e.getMessage());
            result.addError("LOAD_CHECK_ERROR", "Failed to check loads: " + e.getMessage());
        }
    }

    private void checkConnectivity(Model cimModel, DiagnosticResult result) {
        log.info("Checking network connectivity...");

        String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT DISTINCT ?equipment ?node
                WHERE {
                    {
                        ?equipment rdf:type cim:ACLineSegment
                    }
                    UNION
                    {
                        ?equipment rdf:type cim:SynchronousMachine
                    }
                    UNION
                    {
                        ?equipment rdf:type cim:EnergyConsumer
                    }
                    ?t cim:Terminal.ConductingEquipment ?equipment .
                    ?t cim:Terminal.ConnectivityNode ?node
                }
                """.formatted(CIM_PREFIX);

        try (QueryExecution qexec = QueryExecutionFactory.create(QueryFactory.create(query), cimModel)) {
            ResultSet results = qexec.execSelect();
            Map<String, Integer> nodeConnections = new HashMap<>();

            while (results.hasNext()) {
                QuerySolution soln = results.nextSolution();
                String nodeId = soln.getResource("node").getLocalName();
                nodeConnections.put(nodeId, nodeConnections.getOrDefault(nodeId, 0) + 1);
            }

            result.setNodeConnections(nodeConnections);

            long isolatedBuses = result.getBusIds().stream()
                    .filter(busId -> !nodeConnections.containsKey(busId) &&
                                   !nodeConnections.containsKey(busId + "_CN"))
                    .count();

            if (isolatedBuses > 0) {
                result.addWarning("ISOLATED_BUSES",
                        String.format("%d buses have no equipment connected", isolatedBuses));
            }
        } catch (Exception e) {
            log.error("Error checking connectivity: {}", e.getMessage());
        }
    }

    private void assessNetwork(DiagnosticResult result) {
        boolean hasErrors = !result.getErrors().isEmpty();
        boolean hasWarnings = !result.getWarnings().isEmpty();

        if (hasErrors) {
            result.setStatus("ERROR");
            result.setMessage("Network has critical errors. Load flow calculation may fail.");
        } else if (hasWarnings) {
            result.setStatus("WARNING");
            result.setMessage("Network has warnings. Load flow may produce unexpected results.");
        } else {
            result.setStatus("OK");
            result.setMessage("Network is ready for load flow calculation.");
        }
    }

    public static class DiagnosticResult {
        private String status = "UNKNOWN";
        private String message = "";
        private long totalTriples = 0;
        private int busCount = 0;
        private int branchCount = 0;
        private int connectedBranchCount = 0;
        private int generatorCount = 0;
        private int connectedGeneratorCount = 0;
        private int loadCount = 0;
        private int connectedLoadCount = 0;
        private double totalGenerationMw = 0.0;
        private double totalLoadMw = 0.0;
        private List<String> busIds = new ArrayList<>();
        private List<String> lineIds = new ArrayList<>();
        private List<String> generatorIds = new ArrayList<>();
        private List<String> loadIds = new ArrayList<>();
        private Map<String, Integer> nodeConnections = new HashMap<>();
        private List<DiagnosticIssue> errors = new ArrayList<>();
        private List<DiagnosticIssue> warnings = new ArrayList<>();

        public void addError(String code, String message) {
            errors.add(new DiagnosticIssue(code, message));
        }

        public void addWarning(String code, String message) {
            warnings.add(new DiagnosticIssue(code, message));
        }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public long getTotalTriples() { return totalTriples; }
        public void setTotalTriples(long totalTriples) { this.totalTriples = totalTriples; }
        public int getBusCount() { return busCount; }
        public void setBusCount(int busCount) { this.busCount = busCount; }
        public int getBranchCount() { return branchCount; }
        public void setBranchCount(int branchCount) { this.branchCount = branchCount; }
        public int getConnectedBranchCount() { return connectedBranchCount; }
        public void setConnectedBranchCount(int connectedBranchCount) { this.connectedBranchCount = connectedBranchCount; }
        public int getGeneratorCount() { return generatorCount; }
        public void setGeneratorCount(int generatorCount) { this.generatorCount = generatorCount; }
        public int getConnectedGeneratorCount() { return connectedGeneratorCount; }
        public void setConnectedGeneratorCount(int connectedGeneratorCount) { this.connectedGeneratorCount = connectedGeneratorCount; }
        public int getLoadCount() { return loadCount; }
        public void setLoadCount(int loadCount) { this.loadCount = loadCount; }
        public int getConnectedLoadCount() { return connectedLoadCount; }
        public void setConnectedLoadCount(int connectedLoadCount) { this.connectedLoadCount = connectedLoadCount; }
        public double getTotalGenerationMw() { return totalGenerationMw; }
        public void setTotalGenerationMw(double totalGenerationMw) { this.totalGenerationMw = totalGenerationMw; }
        public double getTotalLoadMw() { return totalLoadMw; }
        public void setTotalLoadMw(double totalLoadMw) { this.totalLoadMw = totalLoadMw; }
        public List<String> getBusIds() { return busIds; }
        public void setBusIds(List<String> busIds) { this.busIds = busIds; }
        public List<String> getLineIds() { return lineIds; }
        public void setLineIds(List<String> lineIds) { this.lineIds = lineIds; }
        public List<String> getGeneratorIds() { return generatorIds; }
        public void setGeneratorIds(List<String> generatorIds) { this.generatorIds = generatorIds; }
        public List<String> getLoadIds() { return loadIds; }
        public void setLoadIds(List<String> loadIds) { this.loadIds = loadIds; }
        public Map<String, Integer> getNodeConnections() { return nodeConnections; }
        public void setNodeConnections(Map<String, Integer> nodeConnections) { this.nodeConnections = nodeConnections; }
        public List<DiagnosticIssue> getErrors() { return errors; }
        public List<DiagnosticIssue> getWarnings() { return warnings; }
    }

    public static class DiagnosticIssue {
        private String code;
        private String message;

        public DiagnosticIssue(String code, String message) {
            this.code = code;
            this.message = message;
        }

        public String getCode() { return code; }
        public String getMessage() { return message; }
    }
}
