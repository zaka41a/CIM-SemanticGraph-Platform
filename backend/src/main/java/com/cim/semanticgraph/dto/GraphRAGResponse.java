package com.cim.semanticgraph.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GraphRAGResponse {

    private String answer;
    private String question;
    private String graphContext;

    @Builder.Default
    private List<String> sources = new ArrayList<>();

    private Double confidence;
    private Integer triplesRetrieved;
    private Long executionTimeMs;

    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    private String llmModel;

    @Builder.Default
    private Boolean inferenceUsed = false;

    private Object metadata;
}
