package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.model.ChatHistory;
import com.cim.semanticgraph.service.ChatHistoryService;
import com.cim.semanticgraph.service.GraphRAGService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/graphrag")
@RequiredArgsConstructor
@Tag(name = "GraphRAG", description = "Graph Retrieval-Augmented Generation with LLM")
public class GraphRAGController {

    private final GraphRAGService graphRAGService;
    private final ChatHistoryService chatHistoryService;

    @PostMapping("/ask")
    @Operation(summary = "Ask question", description = "Ask a natural language question about the power network")
    public ResponseEntity<?> askQuestion(@RequestBody QuestionRequest request) {
        log.info("GraphRAG question received: {}", request.getQuestion());

        try {
            if (request.getQuestion() == null || request.getQuestion().trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Question cannot be empty"));
            }

            String sessionId = request.getSessionId();
            if (sessionId == null || sessionId.trim().isEmpty()) {
                sessionId = UUID.randomUUID().toString();
            }

            GraphRAGResponse response = graphRAGService.processQuery(request.getQuestion(), sessionId);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error processing GraphRAG question", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Query processing failed: " + e.getMessage()));
        }
    }

    @GetMapping("/history")
    @Operation(summary = "Get chat history", description = "Retrieve all chat history")
    public ResponseEntity<?> getChatHistory() {
        log.info("Chat history requested");

        try {
            List<ChatHistory> history = chatHistoryService.getAllChatHistory();
            return ResponseEntity.ok(history);

        } catch (Exception e) {
            log.error("Error retrieving chat history", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to retrieve chat history: " + e.getMessage()));
        }
    }

    @GetMapping("/history/{sessionId}")
    @Operation(summary = "Get session history", description = "Retrieve chat history for a specific session")
    public ResponseEntity<?> getChatHistoryBySession(@PathVariable String sessionId) {
        log.info("Chat history requested for session: {}", sessionId);

        try {
            List<ChatHistory> history = chatHistoryService.getChatHistoryBySession(sessionId);
            return ResponseEntity.ok(history);

        } catch (Exception e) {
            log.error("Error retrieving chat history for session: {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to retrieve chat history: " + e.getMessage()));
        }
    }

    @DeleteMapping("/history/{id}")
    @Operation(summary = "Delete chat entry", description = "Delete a specific chat history entry")
    public ResponseEntity<?> deleteChatHistory(@PathVariable String id) {
        log.info("Delete chat history entry: {}", id);

        try {
            boolean deleted = chatHistoryService.deleteChatHistory(id);

            if (deleted) {
                return ResponseEntity.ok(Map.of("message", "Chat history deleted successfully"));
            } else {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Chat history entry not found"));
            }

        } catch (Exception e) {
            log.error("Error deleting chat history: {}", id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to delete chat history: " + e.getMessage()));
        }
    }

    @PostMapping("/impact")
    @Operation(summary = "Analyze impact", description = "Analyze impact of equipment failure")
    public ResponseEntity<?> analyzeImpact(@RequestBody ImpactRequest request) {
        log.info("Impact analysis requested for equipment: {}", request.getEquipmentId());

        try {
            if (request.getEquipmentId() == null || request.getEquipmentId().trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Equipment ID cannot be empty"));
            }

            GraphRAGResponse response = graphRAGService.analyzeEquipmentImpact(
                    request.getEquipmentId());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error analyzing impact", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Impact analysis failed: " + e.getMessage()));
        }
    }

    @PostMapping("/verify")
    @Operation(summary = "Verify consistency", description = "Verify network configuration consistency")
    public ResponseEntity<?> verifyConsistency() {
        log.info("Network consistency verification requested");

        try {
            GraphRAGResponse response = graphRAGService.verifyNetworkConsistency();

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error verifying consistency", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Consistency verification failed: " + e.getMessage()));
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuestionRequest {
        private String question;
        private String sessionId;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImpactRequest {
        private String equipmentId;
    }
}
