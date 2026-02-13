package com.cim.semanticgraph.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatHistory {

    private String id;
    private String sessionId;
    private String question;
    private String answer;
    private List<String> sources;
    private Double confidence;
    private Integer triplesRetrieved;
    private Long executionTimeMs;
    private String llmModel;
    private LocalDateTime timestamp;

    public static ChatHistory create(String sessionId, String question, String answer,
                                     List<String> sources, Double confidence,
                                     Integer triplesRetrieved, Long executionTimeMs,
                                     String llmModel) {
        return ChatHistory.builder()
                .id(UUID.randomUUID().toString())
                .sessionId(sessionId)
                .question(question)
                .answer(answer)
                .sources(sources)
                .confidence(confidence)
                .triplesRetrieved(triplesRetrieved)
                .executionTimeMs(executionTimeMs)
                .llmModel(llmModel)
                .timestamp(LocalDateTime.now())
                .build();
    }
}
