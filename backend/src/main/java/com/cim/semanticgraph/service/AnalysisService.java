package com.cim.semanticgraph.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * AnalysisService - unified network analysis aggregating statistics, health diagnostics,
 * data quality checks, and graph insights in a single call.
 *
 * Powers the /analysis/summary endpoint consumed by the NetworkAnalysis dashboard.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisService {

    private final JenaService jenaService;
    private final NetworkDiagnosticService diagnosticService;

    @Value("${cim.namespaces.cim:http://iec.ch/TC57/CIM100#}")
    private String cimNamespace;

    // ── Public response types ──────────────────────────────────────────────

    public record TopEntity(String uri, String name, String type, long connections) {}

    public record QualityCheck(String name, String category, String severity, long count, String description) {}

    public record AnalysisSummary(
            Map<String, Object> statistics,
            Map<String, Object> health,
            List<QualityCheck> qualityChecks,
            int qualityScore,
            List<TopEntity> topConnectedEntities,
            long computedAt
    ) {}

    // ── Main entry point ───────────────────────────────────────────────────

    public AnalysisSummary getSummary() {
        log.info("Computing analysis summary");
        long start = System.currentTimeMillis();

        Map<String, Object> stats = fetchStatistics();
        Map<String, Object> health = fetchHealth();
        List<QualityCheck> quality = runQualityChecks();
        int qualityScore = computeQualityScore(quality);
        List<TopEntity> topEntities = fetchTopConnectedEntities();

        log.info("Analysis summary computed in {}ms", System.currentTimeMillis() - start);

        return new AnalysisSummary(stats, health, quality, qualityScore, topEntities, System.currentTimeMillis());
    }

    // ── Statistics ─────────────────────────────────────────────────────────

    private Map<String, Object> fetchStatistics() {
        try {
            return jenaService.getGraphStatistics();
        } catch (Exception e) {
            log.warn("Statistics fetch failed: {}", e.getMessage());
            return Map.of("error", e.getMessage());
        }
    }

    // ── Health / Diagnostics ───────────────────────────────────────────────

    private Map<String, Object> fetchHealth() {
        try {
            var result = diagnosticService.runDiagnostics();
            Map<String, Object> health = new LinkedHashMap<>();
            health.put("status", result.getStatus());
            health.put("message", result.getMessage());
            health.put("totalTriples", result.getTotalTriples());
            health.put("busCount", result.getBusCount());
            health.put("branchCount", result.getBranchCount());
            health.put("connectedBranchCount", result.getConnectedBranchCount());
            health.put("generatorCount", result.getGeneratorCount());
            health.put("connectedGeneratorCount", result.getConnectedGeneratorCount());
            health.put("loadCount", result.getLoadCount());
            health.put("connectedLoadCount", result.getConnectedLoadCount());
            health.put("totalGenerationMw", result.getTotalGenerationMw());
            health.put("totalLoadMw", result.getTotalLoadMw());
            health.put("errors", result.getErrors());
            health.put("warnings", result.getWarnings());
            return health;
        } catch (Exception e) {
            log.warn("Health check failed: {}", e.getMessage());
            return Map.of("status", "ERROR", "message", e.getMessage(), "errors", List.of());
        }
    }

    // ── Data quality checks ────────────────────────────────────────────────

    private List<QualityCheck> runQualityChecks() {
        List<QualityCheck> checks = new ArrayList<>();

        checks.add(checkMissingImpedances());
        checks.add(checkMissingRatings());
        checks.add(checkUnconnectedLines());
        checks.add(checkBusesWithoutInjections());

        return checks;
    }

    private QualityCheck checkMissingImpedances() {
        String sparql = """
                PREFIX cim: <%s>
                SELECT (COUNT(DISTINCT ?line) as ?count) WHERE {
                    ?line a cim:ACLineSegment .
                    FILTER NOT EXISTS { ?line cim:ACLineSegment.r ?r }
                }
                """.formatted(cimNamespace);
        long count = queryCount(sparql);
        return new QualityCheck(
                "Missing Impedances", "Line Impedances",
                count > 0 ? "error" : "ok",
                count,
                count > 0
                        ? count + " ACLineSegment(s) missing r/x values - load flow will fail"
                        : "All lines have impedance values"
        );
    }

    private QualityCheck checkMissingRatings() {
        String sparql = """
                PREFIX cim: <%s>
                SELECT (COUNT(DISTINCT ?line) as ?count) WHERE {
                    ?line a cim:ACLineSegment .
                    FILTER NOT EXISTS { ?line cim:Conductor.normalRating ?r }
                }
                """.formatted(cimNamespace);
        long count = queryCount(sparql);
        return new QualityCheck(
                "Missing Thermal Ratings", "Thermal Ratings",
                count > 0 ? "warning" : "ok",
                count,
                count > 0
                        ? count + " line(s) missing normalRating - OPF violations may be incorrect"
                        : "All lines have thermal ratings"
        );
    }

    private QualityCheck checkUnconnectedLines() {
        String sparql = """
                PREFIX cim: <%s>
                SELECT (COUNT(DISTINCT ?line) as ?count) WHERE {
                    ?line a cim:ACLineSegment .
                    OPTIONAL { ?t cim:Terminal.ConductingEquipment ?line }
                }
                GROUP BY ?line
                HAVING (COUNT(?t) < 2)
                """.formatted(cimNamespace);
        long count = queryCount(sparql);
        return new QualityCheck(
                "Unconnected Lines", "Connectivity",
                count > 0 ? "warning" : "ok",
                count,
                count > 0
                        ? count + " line(s) with fewer than 2 terminals - isolated segments"
                        : "All lines are fully connected"
        );
    }

    private QualityCheck checkBusesWithoutInjections() {
        String sparql = """
                PREFIX cim: <%s>
                SELECT (COUNT(DISTINCT ?bus) as ?count) WHERE {
                    ?bus a cim:ConnectivityNode .
                    FILTER NOT EXISTS {
                        ?t cim:Terminal.ConnectivityNode ?bus .
                        ?t cim:Terminal.ConductingEquipment ?eq .
                        { ?eq a cim:GeneratingUnit . } UNION { ?eq a cim:EnergyConsumer . }
                    }
                }
                """.formatted(cimNamespace);
        long count = queryCount(sparql);
        return new QualityCheck(
                "Transit Buses", "Bus Injections",
                count > 10 ? "info" : "ok",
                count,
                count > 0
                        ? count + " bus(es) without generation or load (transit/pass-through buses)"
                        : "All buses have at least one injection"
        );
    }

    private int computeQualityScore(List<QualityCheck> checks) {
        int score = 100;
        for (QualityCheck c : checks) {
            if ("error".equals(c.severity()))   score -= 20;
            else if ("warning".equals(c.severity())) score -= 10;
            else if ("info".equals(c.severity()))    score -= 3;
        }
        return Math.max(0, score);
    }

    // ── Top connected entities ─────────────────────────────────────────────

    private List<TopEntity> fetchTopConnectedEntities() {
        String sparql = """
                PREFIX cim: <%s>
                SELECT ?entity ?name ?type (COUNT(?connected) as ?connections) WHERE {
                    ?entity rdf:type ?typeUri .
                    FILTER(STRSTARTS(STR(?typeUri), "%s"))
                    OPTIONAL { ?entity cim:IdentifiedObject.name ?name }
                    OPTIONAL { ?entity ?p ?connected . FILTER(isURI(?connected)) }
                    BIND(STRAFTER(STR(?typeUri), "#") AS ?type)
                }
                GROUP BY ?entity ?name ?type
                ORDER BY DESC(?connections)
                LIMIT 10
                """.formatted(cimNamespace, cimNamespace);

        try {
            List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
            List<TopEntity> entities = new ArrayList<>();
            for (Map<String, String> row : rows) {
                String uri  = row.getOrDefault("entity", "");
                String name = row.getOrDefault("name", extractLocalName(uri));
                String type = row.getOrDefault("type", "Unknown");
                long conn   = parseLong(row.getOrDefault("connections", "0"));
                entities.add(new TopEntity(uri, name, type, conn));
            }
            return entities;
        } catch (Exception e) {
            log.warn("Top connected entities query failed: {}", e.getMessage());
            return List.of();
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private long queryCount(String sparql) {
        try {
            List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
            if (!rows.isEmpty()) return parseLong(rows.get(0).getOrDefault("count", "0"));
        } catch (Exception e) {
            log.warn("Count query failed: {}", e.getMessage());
        }
        return 0;
    }

    private long parseLong(String s) {
        if (s == null) return 0;
        // Fuseki returns typed literals like "5"^^xsd:integer
        String clean = s.replaceAll("\"?(\\d+)\"?.*", "$1");
        try { return Long.parseLong(clean); } catch (NumberFormatException e) { return 0; }
    }

    private String extractLocalName(String uri) {
        if (uri == null) return "";
        int i = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
        return i >= 0 ? uri.substring(i + 1) : uri;
    }
}
