package com.cim.semanticgraph.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroqServiceTest {

    @Mock
    private RestTemplate restTemplate;

    private GroqService groqService;

    @BeforeEach
    void setUp() {
        groqService = new GroqService(restTemplate);
        ReflectionTestUtils.setField(groqService, "defaultProvider", "gpt5");
        ReflectionTestUtils.setField(groqService, "kiBaseUrl", "https://example.test/v1");
        ReflectionTestUtils.setField(groqService, "kiKey", "test key");
        ReflectionTestUtils.setField(groqService, "kiModel", "test model");
        ReflectionTestUtils.setField(groqService, "temperature", 0.7);
        ReflectionTestUtils.setField(groqService, "maxTokens", 1000);
        ReflectionTestUtils.setField(groqService, "systemMessage", "System message");
    }

    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void conversationTurnsAreSentBeforeTheCurrentQuestion() {
        Map<String, Object> body = Map.of(
                "choices", List.of(Map.of("message", Map.of("content", "Current answer")))
        );
        when(restTemplate.exchange(
                anyString(),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(Map.class)
        )).thenReturn(ResponseEntity.ok(body));

        String answer = groqService.queryWithContext(
                "What is its voltage?",
                "Transformer Alpha has a rated voltage of 110 kV",
                "gpt5",
                List.of(new ConversationMemoryService.Turn(
                        "Show transformer Alpha",
                        "Transformer Alpha is connected"
                ))
        );

        ArgumentCaptor<HttpEntity> request = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).exchange(
                eq("https://example.test/v1/chat/completions"),
                eq(HttpMethod.POST),
                request.capture(),
                eq(Map.class)
        );
        Map<String, Object> requestBody = (Map<String, Object>) request.getValue().getBody();
        List<Map<String, String>> messages = (List<Map<String, String>>) requestBody.get("messages");

        assertEquals("Current answer", answer);
        assertEquals(List.of("system", "user", "assistant", "user"),
                messages.stream().map(message -> message.get("role")).toList());
        assertEquals("Show transformer Alpha", messages.get(1).get("content"));
        assertEquals("Transformer Alpha is connected", messages.get(2).get("content"));
        assertTrue(messages.get(3).get("content").contains("What is its voltage?"));
    }
}
