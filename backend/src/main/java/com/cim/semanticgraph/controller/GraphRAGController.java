package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.model.ChatHistory;
import com.cim.semanticgraph.service.ChatHistoryService;
import com.cim.semanticgraph.service.ClaudeAgentService;
import com.cim.semanticgraph.service.GraphRAGService;
import com.cim.semanticgraph.service.GroqService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/graphrag")
@RequiredArgsConstructor
@Tag(name = "GraphRAG", description = "Graph Retrieval-Augmented Generation with LLM")
public class GraphRAGController {

    private final GraphRAGService    graphRAGService;
    private final ChatHistoryService chatHistoryService;
    private final ClaudeAgentService claudeAgentService;
    private final GroqService        groqService;

    /**
     * Streaming SSE endpoint - uses Claude Fable 5 Agent with Tool Calling.
     * Falls back to standard GraphRAG if Claude is not configured.
     *
     * SSE event types:
     *   tool_call   → Claude is calling a tool
     *   tool_result → Tool execution completed
     *   text        → Final answer text
     *   done        → Stream complete (includes sources + confidence)
     *   error       → Unrecoverable error
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Stream answer (SSE)", description = "Stream Claude Agent response via Server-Sent Events")
    public Flux<ServerSentEvent<String>> streamQuery(
            @RequestParam String question,
            @RequestParam(defaultValue = "") String sessionId,
            @RequestParam(defaultValue = "") String provider) {

        log.info("SSE stream request: question='{}', session='{}', provider='{}'", question, sessionId, provider);

        if (question == null || question.isBlank()) {
            return Flux.just(ServerSentEvent.<String>builder()
                    .data("{\"type\":\"error\",\"message\":\"question parameter is required\"}")
                    .build());
        }

        String sid = sessionId.isBlank() ? UUID.randomUUID().toString() : sessionId;

        if (!claudeAgentService.isConfigured()) {
            // Fallback: run standard query and emit as single text event
            return Flux.<String>create(sink -> {
                try {
                    GraphRAGResponse resp = graphRAGService.processQuery(question, sid, provider);
                    sink.next("{\"type\":\"text\",\"text\":" +
                              "\"" + escapeJson(resp.getAnswer()) + "\"}");
                    sink.next("{\"type\":\"done\",\"sources\":[],\"confidence\":"
                              + resp.getConfidence() + ",\"execution_time_ms\":"
                              + resp.getExecutionTimeMs() + "}");
                } catch (Exception e) {
                    sink.next("{\"type\":\"error\",\"message\":\"" + escapeJson(e.getMessage()) + "\"}");
                } finally {
                    sink.complete();
                }
            }).map(data -> ServerSentEvent.<String>builder().data(data).build());
        }

        // Stream via Claude, but if it emits an API-unavailable error, fall back to Groq/Ollama
        return claudeAgentService.processQueryStreaming(question, sid)
                .flatMap(data -> {
                    // Detect Claude credit-exhausted / quota / auth error and switch to fallback stream
                    if (data.contains("\"type\":\"error\"") && streamIndicatesApiUnavailable(data)) {
                        log.warn("Claude unavailable in stream - switching to GraphRAG fallback");
                        return Flux.<String>create(sink -> {
                            try {
                                GraphRAGResponse resp = graphRAGService.processQuery(question, sid, provider);
                                sink.next("{\"type\":\"text\",\"text\":\"" + escapeJson(resp.getAnswer()) + "\"}");
                                sink.next("{\"type\":\"done\",\"sources\":[],\"confidence\":"
                                        + resp.getConfidence() + ",\"execution_time_ms\":"
                                        + resp.getExecutionTimeMs() + "}");
                            } catch (Exception e) {
                                sink.next("{\"type\":\"error\",\"message\":\"" + escapeJson(e.getMessage()) + "\"}");
                            } finally {
                                sink.complete();
                            }
                        });
                    }
                    return Flux.just(data);
                })
                .map(data -> ServerSentEvent.<String>builder().data(data).build())
                .onErrorReturn(ServerSentEvent.<String>builder()
                        .data("{\"type\":\"error\",\"message\":\"Stream error\"}")
                        .build());
    }

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

            String provider = request.getProvider();
            GraphRAGResponse response;
            if (claudeAgentService.isConfigured()) {
                response = claudeAgentService.processQuery(request.getQuestion(), sessionId);
                // Fallback to a selectable LLM provider if Claude is unavailable (credits, quota, etc.)
                if (isApiUnavailable(response.getAnswer())) {
                    log.warn("Claude API unavailable, falling back to GraphRAGService (provider: {})",
                            provider == null ? "default" : provider);
                    response = graphRAGService.processQuery(request.getQuestion(), sessionId, provider);
                }
            } else {
                response = graphRAGService.processQuery(request.getQuestion(), sessionId, provider);
            }

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

    @DeleteMapping("/history/session/{sessionId}")
    @Operation(summary = "Delete session history", description = "Delete all chat history for a session")
    public ResponseEntity<?> deleteChatSession(@PathVariable String sessionId) {
        try {
            chatHistoryService.deleteChatHistoryBySession(sessionId);
            return ResponseEntity.ok(Map.of("message", "Session history deleted successfully"));
        } catch (Exception e) {
            log.error("Error deleting session history: {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to delete session history: " + e.getMessage()));
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

    @GetMapping("/providers")
    @Operation(summary = "List LLM providers", description = "Selectable OpenAI-compatible LLM providers and their availability")
    public ResponseEntity<?> getProviders() {
        return ResponseEntity.ok(Map.of("providers", groqService.availableProviders()));
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuestionRequest {
        private String question;
        private String sessionId;
        private String provider;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImpactRequest {
        private String equipmentId;
    }

    /** Returns true if the answer indicates Claude API is unavailable (credits, quota, etc.) */
    private boolean isApiUnavailable(String answer) {
        if (answer == null) return true;
        return answer.startsWith("Agent error:") ||
               answer.contains("credit balance is too low") ||
               answer.contains("quota") ||
               answer.contains("API unavailable");
    }

    /** Returns true if a streaming SSE error payload indicates Claude is unavailable and a fallback should run. */
    private boolean streamIndicatesApiUnavailable(String data) {
        if (data == null) return false;
        return data.contains("unavailable") ||
               data.contains("credit balance is too low") ||
               data.contains("quota") ||
               data.contains("rate_limit") ||
               data.contains("overloaded") ||
               data.contains("Agent error");
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }
}
