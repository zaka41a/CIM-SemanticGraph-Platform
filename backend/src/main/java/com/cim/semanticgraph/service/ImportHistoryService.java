package com.cim.semanticgraph.service;

import com.cim.semanticgraph.model.ImportHistory;
import com.cim.semanticgraph.model.ImportHistory.ImportStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Import History Service
 * Manages the history of CIM file imports
 */
@Slf4j
@Service
public class ImportHistoryService {

    // In-memory storage (in production, use a database)
    private final Map<String, ImportHistory> historyStore = new ConcurrentHashMap<>();

    /**
     * Add a new import record
     */
    public ImportHistory addImportRecord(String fileName, long fileSize, String format) {
        String id = UUID.randomUUID().toString();

        ImportHistory record = ImportHistory.builder()
                .id(id)
                .fileName(fileName)
                .fileSize(fileSize)
                .importDate(LocalDateTime.now())
                .status(ImportStatus.PROCESSING)
                .format(format)
                .build();

        historyStore.put(id, record);
        log.info("Created import history record: {}", id);

        return record;
    }

    /**
     * Update import record on success
     */
    public void updateImportSuccess(String id, long triplesCount, double duration) {
        ImportHistory record = historyStore.get(id);
        if (record != null) {
            record.setStatus(ImportStatus.SUCCESS);
            record.setTriplesCount(triplesCount);
            record.setDuration(duration);
            log.info("Updated import history {} to SUCCESS", id);
        }
    }

    /**
     * Update import record on failure
     */
    public void updateImportFailure(String id, String errorMessage) {
        ImportHistory record = historyStore.get(id);
        if (record != null) {
            record.setStatus(ImportStatus.FAILED);
            record.setErrorMessage(errorMessage);
            log.info("Updated import history {} to FAILED", id);
        }
    }

    /**
     * Get all import history records
     */
    public List<ImportHistory> getAllHistory() {
        return historyStore.values().stream()
                .sorted(Comparator.comparing(ImportHistory::getImportDate).reversed())
                .collect(Collectors.toList());
    }

    /**
     * Get import history by ID
     */
    public Optional<ImportHistory> getHistoryById(String id) {
        return Optional.ofNullable(historyStore.get(id));
    }

    /**
     * Set the named graph URI for an import record (enables rollback).
     */
    public void setGraphUri(String id, String graphUri) {
        ImportHistory record = historyStore.get(id);
        if (record != null) {
            record.setGraphUri(graphUri);
            record.setRollbackAvailable(true);
            log.info("Import {} linked to named graph <{}>", id, graphUri);
        }
    }

    /**
     * Mark rollback as done (graph dropped — no longer available).
     */
    public void markRolledBack(String id) {
        ImportHistory record = historyStore.get(id);
        if (record != null) {
            record.setRollbackAvailable(false);
            record.setStatus(ImportHistory.ImportStatus.ROLLED_BACK);
            log.info("Import {} marked as rolled back", id);
        }
    }

    /**
     * Delete import history record
     */
    public boolean deleteHistory(String id) {
        if (historyStore.containsKey(id)) {
            historyStore.remove(id);
            log.info("Deleted import history: {}", id);
            return true;
        }
        return false;
    }

    /**
     * Get statistics about imports
     */
    public Map<String, Object> getImportStatistics() {
        List<ImportHistory> allHistory = getAllHistory();

        long totalImports = allHistory.size();
        long successfulImports = allHistory.stream()
                .filter(h -> h.getStatus() == ImportStatus.SUCCESS)
                .count();
        long failedImports = allHistory.stream()
                .filter(h -> h.getStatus() == ImportStatus.FAILED)
                .count();
        long totalTriples = allHistory.stream()
                .filter(h -> h.getTriplesCount() != null)
                .mapToLong(ImportHistory::getTriplesCount)
                .sum();

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", totalImports);
        stats.put("success", successfulImports);
        stats.put("failed", failedImports);
        stats.put("totalTriples", totalTriples);

        return stats;
    }
}
