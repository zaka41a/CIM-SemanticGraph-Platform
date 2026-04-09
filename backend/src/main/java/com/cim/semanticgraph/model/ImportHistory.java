package com.cim.semanticgraph.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportHistory {
    private String id;
    private String fileName;
    private long fileSize;
    private LocalDateTime importDate;
    private ImportStatus status;
    private Long triplesCount;
    private Double duration;
    private String errorMessage;
    private String format;
    /** Named graph URI where this import's triples are stored for rollback (e.g. urn:import:{id}) */
    private String graphUri;
    /** Whether rollback is available (graphUri exists in Fuseki) */
    private boolean rollbackAvailable;

    public enum ImportStatus {
        SUCCESS, FAILED, PROCESSING, ROLLED_BACK
    }
}
