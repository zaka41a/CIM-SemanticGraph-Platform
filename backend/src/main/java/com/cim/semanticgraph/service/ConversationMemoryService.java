package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.model.ChatHistory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationMemoryService {

    private static final Set<String> REFERENCES = Set.of(
            "it", "its", "one", "ones", "they", "their", "them", "this", "that",
            "these", "those", "same", "former", "latter", "above", "previous", "there"
    );

    private final ChatHistoryService chatHistoryService;

    @Value("${graphrag.memory.maxTurns:6}")
    private int maxTurns;

    @Value("${graphrag.memory.maxCharacters:12000}")
    private int maxCharacters;

    @Value("${graphrag.memory.retrievalTurns:2}")
    private int retrievalTurns;

    public List<Turn> getRecentTurns(String sessionId) {
        if (sessionId == null || sessionId.isBlank() || maxTurns <= 0 || maxCharacters < 2) {
            return List.of();
        }

        try {
            List<ChatHistory> history = chatHistoryService.getChatHistoryBySession(sessionId);
            if (history.isEmpty()) {
                return List.of();
            }

            int start = Math.max(0, history.size() - maxTurns);
            List<ChatHistory> recent = history.subList(start, history.size());
            int turnBudget = Math.max(1, maxCharacters / recent.size());
            int questionBudget = Math.max(1, turnBudget / 3);
            int answerBudget = Math.max(0, turnBudget - questionBudget);

            return recent.stream()
                    .map(entry -> new Turn(
                            trim(entry.getQuestion(), questionBudget),
                            trim(entry.getAnswer(), answerBudget)
                    ))
                    .filter(turn -> !turn.question().isBlank() || !turn.answer().isBlank())
                    .toList();
        } catch (Exception e) {
            log.warn("Conversation memory could not be loaded for session {}: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    public String contextualizeQuery(String question, List<Turn> turns) {
        if (question == null || turns.isEmpty() || !requiresContext(question)) {
            return Objects.requireNonNullElse(question, "");
        }

        int start = Math.max(0, turns.size() - Math.max(1, retrievalTurns));
        StringBuilder context = new StringBuilder();
        for (Turn turn : turns.subList(start, turns.size())) {
            context.append("Previous question: ")
                    .append(trim(turn.question(), 400))
                    .append('\n');
            context.append("Previous answer: ")
                    .append(trim(turn.answer(), 800))
                    .append('\n');
        }
        context.append("Current question: ").append(question);
        return context.toString();
    }

    public void remember(String sessionId, GraphRAGResponse response) {
        if (sessionId == null || sessionId.isBlank() || response == null) {
            return;
        }

        try {
            ChatHistory entry = ChatHistory.create(
                    sessionId,
                    response.getQuestion(),
                    response.getAnswer(),
                    response.getSources(),
                    response.getConfidence(),
                    response.getTriplesRetrieved(),
                    response.getExecutionTimeMs(),
                    response.getLlmModel()
            );
            chatHistoryService.saveChatHistory(entry);
        } catch (Exception e) {
            log.warn("Conversation memory could not be saved for session {}: {}", sessionId, e.getMessage());
        }
    }

    private boolean requiresContext(String question) {
        String normalized = question.toLowerCase(Locale.ROOT).trim();
        if (normalized.startsWith("and ")
                || normalized.startsWith("what about")
                || normalized.startsWith("how about")) {
            return true;
        }

        return Arrays.stream(normalized.split("[^a-z0-9]+"))
                .anyMatch(REFERENCES::contains);
    }

    private String trim(String value, int limit) {
        if (value == null || limit <= 0) {
            return "";
        }
        if (value.length() <= limit) {
            return value;
        }
        return value.substring(0, limit).stripTrailing();
    }

    public record Turn(String question, String answer) {
        public Turn {
            question = Objects.requireNonNullElse(question, "");
            answer = Objects.requireNonNullElse(answer, "");
        }
    }
}
