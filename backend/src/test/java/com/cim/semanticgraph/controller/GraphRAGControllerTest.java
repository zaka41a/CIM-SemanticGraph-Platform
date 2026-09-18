package com.cim.semanticgraph.controller;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.service.ChatHistoryService;
import com.cim.semanticgraph.service.ClaudeAgentService;
import com.cim.semanticgraph.service.GraphRAGService;
import com.cim.semanticgraph.service.GroqService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.codec.ServerSentEvent;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GraphRAGControllerTest {

    @Mock
    private GraphRAGService graphRAGService;

    @Mock
    private ChatHistoryService chatHistoryService;

    @Mock
    private ClaudeAgentService claudeAgentService;

    @Mock
    private GroqService groqService;

    private GraphRAGController controller;

    @BeforeEach
    void setUp() {
        controller = new GraphRAGController(
                graphRAGService,
                chatHistoryService,
                claudeAgentService,
                groqService
        );
    }

    @Test
    void includesRetrievedSourcesInFallbackStream() throws Exception {
        String source = "http://iec.ch/TC57/CIM100#Line1";
        GraphRAGResponse response = GraphRAGResponse.builder()
                .answer("Line 1")
                .sources(List.of(source))
                .confidence(0.84)
                .executionTimeMs(125L)
                .build();
        when(claudeAgentService.isConfigured()).thenReturn(false);
        when(graphRAGService.processQuery("Find the line", "session1", "gpt5"))
                .thenReturn(response);

        List<ServerSentEvent<String>> events = controller
                .streamQuery("Find the line", "session1", "gpt5")
                .collectList()
                .block();

        assertNotNull(events);
        assertEquals(2, events.size());
        JsonNode completion = new ObjectMapper().readTree(events.get(1).data());
        assertEquals("done", completion.get("type").asText());
        assertEquals(source, completion.get("sources").get(0).asText());
        assertEquals(0.84, completion.get("confidence").asDouble());
        assertEquals(125L, completion.get("execution_time_ms").asLong());
    }
}
