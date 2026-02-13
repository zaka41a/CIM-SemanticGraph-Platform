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

    public enum ImportStatus {
        SUCCESS, FAILED, PROCESSING
    }
}
