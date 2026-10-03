package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.graphrag.AnswerEvaluator;
import com.cim.semanticgraph.graphrag.ContextBuilder;
import com.cim.semanticgraph.graphrag.GraphTraverser;
import com.cim.semanticgraph.graphrag.RelevanceScorer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GraphRAGServiceTest {
    private final JenaService jena = mock(JenaService.class);
    private final GroqService groq = mock(GroqService.class);
    private final OllamaService ollama = mock(OllamaService.class);
    private final ClaudeAgentService claude = mock(ClaudeAgentService.class);
    private final LoadFlowService loadFlow = mock(LoadFlowService.class);
    private final ConversationMemoryService memory = mock(ConversationMemoryService.class);
    private GraphRAGService service;

    @BeforeEach
    void setUp() {
        service = new GraphRAGService(jena, ollama, groq, claude,
                mock(EmbeddingService.class), mock(QdrantService.class),
                mock(GraphTraverser.class), mock(ContextBuilder.class),
                mock(RelevanceScorer.class), mock(AnswerEvaluator.class), memory, loadFlow);
    }

    @Test
    void emptyGraphRequestsImportWithoutCalculationsOrInventedSources() {
        when(jena.getTripleCount()).thenReturn(0L);

        GraphRAGResponse response = service.processQuery("Calculate load flow for the network", "empty-session");

        assertTrue(response.getAnswer().contains("[Data Import](/import)"));
        assertFalse(response.getAnswer().contains("did not converge"));
        assertTrue(response.getSources().isEmpty());
        assertEquals(0.0, response.getConfidence());
        assertEquals(0, response.getTriplesRetrieved());
        verifyNoInteractions(loadFlow, groq, ollama, claude);
        verify(memory).remember("empty-session", response);
    }

    @Test
    void graphReadFailureIsNotTreatedAsAnEmptyNetwork() {
        when(jena.getTripleCount()).thenThrow(new IllegalStateException("Fuseki offline"));

        RuntimeException error = assertThrows(RuntimeException.class,
                () -> service.processQuery("Calculate load flow", "failed-session"));

        assertTrue(error.getMessage().contains("Fuseki offline"));
        verifyNoInteractions(loadFlow, groq, ollama, claude, memory);
    }
}
