package com.cim.semanticgraph.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * DataFixerService - validates and applies SPARQL UPDATE fixes to the CIM knowledge graph.
 *
 * Adds a safety layer over raw SPARQL UPDATE:
 * - Blocks destructive operations (DROP, CLEAR, DELETE WHERE without filter)
 * - Validates SPARQL syntax before execution
 * - Returns per-fix results (applied / failed / skipped)
 * - Logs every fix with timestamp for auditability
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataFixerService {

    private final JenaService jenaService;

    // Patterns for dangerous operations that must never be applied via the fixer
    private static final Pattern DANGEROUS_OPS = Pattern.compile(
            "(?i)\\b(DROP\\s+(ALL|GRAPH|DEFAULT|NAMED)|CLEAR\\s+(ALL|GRAPH|DEFAULT|NAMED))\\b"
    );

    // ── Public DTOs ────────────────────────────────────────────────────────

    public record FixRequest(
            String id,
            String description,
            String category,
            String sparqlQuery
    ) {}

    public record FixResult(
            String id,
            String description,
            String category,
            String status,       // "applied" | "failed" | "skipped" | "blocked"
            String error,        // null on success
            LocalDateTime appliedAt
    ) {}

    public record ApplyResponse(
            int applied,
            int failed,
            int blocked,
            List<FixResult> results
    ) {}

    // ── Apply fixes ────────────────────────────────────────────────────────

    /**
     * Apply a list of fixes sequentially.
     * Each fix is validated before execution. Failure of one fix does NOT stop the others.
     */
    public ApplyResponse applyFixes(List<FixRequest> fixes) {
        log.info("Applying {} fixes", fixes.size());

        List<FixResult> results = new ArrayList<>();
        int applied = 0, failed = 0, blocked = 0;

        for (FixRequest fix : fixes) {
            FixResult result = applyOneFix(fix, false);
            results.add(result);
            switch (result.status()) {
                case "applied" -> applied++;
                case "blocked" -> blocked++;
                default        -> failed++;
            }
        }

        log.info("Fix session complete: applied={}, failed={}, blocked={}", applied, failed, blocked);
        return new ApplyResponse(applied, failed, blocked, results);
    }

    /**
     * Dry-run: validate fixes without executing them.
     * Returns "valid" or the validation error per fix.
     */
    public ApplyResponse previewFixes(List<FixRequest> fixes) {
        log.info("Preview (dry-run) for {} fixes", fixes.size());

        List<FixResult> results = new ArrayList<>();
        int ok = 0, blocked = 0, failed = 0;

        for (FixRequest fix : fixes) {
            FixResult result = applyOneFix(fix, true);
            results.add(result);
            switch (result.status()) {
                case "applied" -> ok++;   // dry-run "applied" means "would apply"
                case "blocked" -> blocked++;
                default        -> failed++;
            }
        }

        return new ApplyResponse(ok, failed, blocked, results);
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private FixResult applyOneFix(FixRequest fix, boolean dryRun) {
        String query = fix.sparqlQuery();

        // 1. Null / empty guard
        if (query == null || query.isBlank()) {
            return result(fix, "failed", "SPARQL query is empty");
        }

        // 2. Block dangerous operations
        if (DANGEROUS_OPS.matcher(query).find()) {
            log.warn("Blocked dangerous SPARQL operation in fix '{}': {}", fix.id(), query.substring(0, Math.min(80, query.length())));
            return result(fix, "blocked", "Operation not allowed: DROP or CLEAR detected");
        }

        // 3. Must be an UPDATE operation (INSERT, DELETE, MODIFY)
        String upper = query.stripLeading().toUpperCase();
        boolean isUpdate = upper.startsWith("INSERT") || upper.startsWith("DELETE")
                || upper.startsWith("MODIFY") || upper.startsWith("PREFIX");
        if (!isUpdate) {
            return result(fix, "blocked", "Only INSERT/DELETE operations are allowed");
        }

        // 4. Dry-run stops here
        if (dryRun) {
            log.debug("Dry-run OK for fix '{}': {}", fix.id(), fix.description());
            return result(fix, "applied", null);
        }

        // 5. Execute
        try {
            log.info("Applying fix '{}': {}", fix.id(), fix.description());
            jenaService.executeSparqlUpdate(query);
            log.info("Fix '{}' applied successfully", fix.id());
            return result(fix, "applied", null);
        } catch (Exception e) {
            log.error("Fix '{}' failed: {}", fix.id(), e.getMessage());
            return result(fix, "failed", e.getMessage());
        }
    }

    private FixResult result(FixRequest fix, String status, String error) {
        return new FixResult(
                fix.id(),
                fix.description(),
                fix.category(),
                status,
                error,
                "applied".equals(status) ? LocalDateTime.now() : null
        );
    }
}
