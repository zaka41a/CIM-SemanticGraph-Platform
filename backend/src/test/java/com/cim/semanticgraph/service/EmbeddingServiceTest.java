package com.cim.semanticgraph.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class EmbeddingServiceTest {

    private EmbeddingService embeddingService;

    @BeforeEach
    void setUp() {
        embeddingService = new EmbeddingService();
        ReflectionTestUtils.setField(embeddingService, "openAiApiKey", "");
        ReflectionTestUtils.setField(embeddingService, "embeddingDimension", 3);
        ReflectionTestUtils.setField(embeddingService, "cacheEnabled", true);
    }

    @Test
    void rejectsBlankText() {
        assertThrows(IllegalArgumentException.class, () -> embeddingService.generateEmbedding(" "));
    }

    @Test
    void rejectsRequestsWithoutOpenAIConfiguration() {
        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> embeddingService.generateEmbedding("transformer")
        );

        assertEquals("OpenAI embeddings are not configured", exception.getMessage());
    }

    @Test
    void cachesCompleteTextKeysWithoutPrefixCollisions() {
        AtomicInteger requests = new AtomicInteger();
        configureClient(requests, "{\"data\":[{\"embedding\":[0.1,0.2,0.3],\"index\":0}]}");

        String sharedPrefix = "a".repeat(200);
        float[] first = embeddingService.generateEmbedding(sharedPrefix + "first");
        float[] cached = embeddingService.generateEmbedding(sharedPrefix + "first");
        float[] second = embeddingService.generateEmbedding(sharedPrefix + "second");

        assertArrayEquals(new float[]{0.1f, 0.2f, 0.3f}, first);
        assertArrayEquals(first, cached);
        assertArrayEquals(first, second);
        assertEquals(2, requests.get());
    }

    @Test
    void rejectsUnexpectedEmbeddingDimensions() {
        AtomicInteger requests = new AtomicInteger();
        configureClient(requests, "{\"data\":[{\"embedding\":[0.1,0.2],\"index\":0}]}");

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> embeddingService.generateEmbedding("transformer")
        );

        assertEquals("OpenAI returned an embedding with an invalid dimension", exception.getMessage());
        assertEquals(1, requests.get());
    }

    @Test
    void preservesEmbeddingBatchOrder() {
        AtomicInteger requests = new AtomicInteger();
        configureClient(
                requests,
                "{\"data\":[{\"embedding\":[0.4,0.5,0.6],\"index\":1},{\"embedding\":[0.1,0.2,0.3],\"index\":0}]}"
        );

        List<float[]> embeddings = embeddingService.batchGenerateEmbeddings(List.of("first", "second"));

        assertArrayEquals(new float[]{0.1f, 0.2f, 0.3f}, embeddings.get(0));
        assertArrayEquals(new float[]{0.4f, 0.5f, 0.6f}, embeddings.get(1));
        assertEquals(1, requests.get());
    }

    private void configureClient(AtomicInteger requests, String responseBody) {
        ReflectionTestUtils.setField(embeddingService, "openAiApiKey", "test-key");
        WebClient webClient = WebClient.builder()
                .exchangeFunction(request -> {
                    requests.incrementAndGet();
                    return Mono.just(ClientResponse.create(HttpStatus.OK)
                            .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                            .body(responseBody)
                            .build());
                })
                .build();
        ReflectionTestUtils.setField(embeddingService, "webClient", webClient);
    }
}
