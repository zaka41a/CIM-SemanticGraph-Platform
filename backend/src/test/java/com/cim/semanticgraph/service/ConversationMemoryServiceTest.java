package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.model.ChatHistory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationMemoryServiceTest {

    @Mock
    private ChatHistoryService chatHistoryService;

    private ConversationMemoryService memoryService;

    @BeforeEach
    void setUp() {
        memoryService = new ConversationMemoryService(chatHistoryService);
        ReflectionTestUtils.setField(memoryService, "maxTurns", 2);
        ReflectionTestUtils.setField(memoryService, "maxCharacters", 12000);
        ReflectionTestUtils.setField(memoryService, "retrievalTurns", 1);
    }

    @Test
    void recentTurnsKeepOnlyTheConfiguredWindow() {
        when(chatHistoryService.getChatHistoryBySession("session1")).thenReturn(List.of(
                history("first question", "first answer"),
                history("second question", "second answer"),
                history("third question", "third answer")
        ));

        List<ConversationMemoryService.Turn> turns = memoryService.getRecentTurns("session1");

        assertEquals(2, turns.size());
        assertEquals("second question", turns.get(0).question());
        assertEquals("third answer", turns.get(1).answer());
    }

    @Test
    void contextualFollowUpIncludesTheLatestTurn() {
        List<ConversationMemoryService.Turn> turns = List.of(
                new ConversationMemoryService.Turn("Show transformer Alpha", "Transformer Alpha is rated at 110 kV")
        );

        String query = memoryService.contextualizeQuery("What is its voltage?", turns);

        assertTrue(query.contains("Show transformer Alpha"));
        assertTrue(query.contains("Transformer Alpha is rated at 110 kV"));
        assertTrue(query.endsWith("Current question: What is its voltage?"));
    }

    @Test
    void independentQuestionRemainsUnchanged() {
        List<ConversationMemoryService.Turn> turns = List.of(
                new ConversationMemoryService.Turn("Show transformer Alpha", "Transformer Alpha")
        );

        String query = memoryService.contextualizeQuery("List all substations", turns);

        assertEquals("List all substations", query);
    }

    @Test
    void recentTurnsRespectTheCharacterBudget() {
        ReflectionTestUtils.setField(memoryService, "maxCharacters", 18);
        when(chatHistoryService.getChatHistoryBySession("session1")).thenReturn(List.of(
                history("first long question", "first long answer"),
                history("second long question", "second long answer")
        ));

        List<ConversationMemoryService.Turn> turns = memoryService.getRecentTurns("session1");
        int characters = turns.stream()
                .mapToInt(turn -> turn.question().length() + turn.answer().length())
                .sum();

        assertTrue(characters <= 18);
    }

    @Test
    void responseIsStoredAsAConversationTurn() {
        GraphRAGResponse response = GraphRAGResponse.builder()
                .question("Show transformer Alpha")
                .answer("Transformer Alpha is available")
                .sources(List.of("urn:transformer:alpha"))
                .confidence(0.9)
                .triplesRetrieved(12)
                .executionTimeMs(50L)
                .llmModel("test model")
                .build();

        memoryService.remember("session1", response);

        ArgumentCaptor<ChatHistory> entry = ArgumentCaptor.forClass(ChatHistory.class);
        verify(chatHistoryService).saveChatHistory(entry.capture());
        assertEquals("session1", entry.getValue().getSessionId());
        assertEquals(response.getQuestion(), entry.getValue().getQuestion());
        assertEquals(response.getAnswer(), entry.getValue().getAnswer());
        assertFalse(entry.getValue().getId().isBlank());
    }

    private ChatHistory history(String question, String answer) {
        return ChatHistory.create("session1", question, answer, List.of(), 0.8, 1, 10L, "test model");
    }
}
