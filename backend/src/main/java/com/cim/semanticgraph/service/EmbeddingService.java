package com.cim.semanticgraph.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import jakarta.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class EmbeddingService {

    @Value("${openai.api.key:}")
    private String openAiApiKey;

    @Value("${openai.api.base-url:https://api.openai.com/v1}")
    private String openAiBaseUrl;

    @Value("${openai.api.embedding-model:text-embedding-3-small}")
    private String embeddingModel;

    @Value("${openai.api.embedding-dimension:1536}")
    private int embeddingDimension;

    @Value("${graphrag.embedding.cache-enabled:true}")
    private boolean cacheEnabled;

    private WebClient webClient;
    private final Map<String, float[]> embeddingCache = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        this.webClient = WebClient.builder()
                .baseUrl(openAiBaseUrl)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();
        log.info("EmbeddingService initialized. Model: {}, Dimension: {}, OpenAI configured: {}",
                embeddingModel, embeddingDimension, isConfigured());
    }

    public boolean isConfigured() {
        return openAiApiKey != null && !openAiApiKey.isBlank();
    }

    public float[] generateEmbedding(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("Embedding text cannot be blank");
        }

        requireConfiguration();

        String cacheKey = text;
        if (cacheEnabled && embeddingCache.containsKey(cacheKey)) {
            return embeddingCache.get(cacheKey);
        }

        try {
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", embeddingModel);
            requestBody.put("input", text);

            OpenAIEmbeddingResponse response = webClient.post()
                    .uri("/embeddings")
                    .header("Authorization", "Bearer " + openAiApiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(requestBody)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, clientResponse ->
                            clientResponse.bodyToMono(String.class)
                                    .map(body -> new RuntimeException("OpenAI API error: " + body)))
                    .bodyToMono(OpenAIEmbeddingResponse.class)
                    .block();

            if (response == null || response.data() == null || response.data().isEmpty()) {
                throw new IllegalStateException("OpenAI returned no embedding");
            }

            float[] vector = toEmbedding(response.data().get(0).embedding());

            if (cacheEnabled) {
                embeddingCache.put(cacheKey, vector);
            }

            return vector;

        } catch (Exception e) {
            log.error("Error calling OpenAI embeddings API: {}", e.getMessage());
            if (e instanceof IllegalStateException illegalStateException) {
                throw illegalStateException;
            }
            throw new IllegalStateException("Embedding generation failed", e);
        }
    }

    public List<float[]> batchGenerateEmbeddings(List<String> texts) {
        if (texts == null || texts.isEmpty()) return List.of();

        requireConfiguration();
        if (texts.stream().anyMatch(text -> text == null || text.isBlank())) {
            throw new IllegalArgumentException("Embedding text cannot be blank");
        }

        List<float[]> results = new ArrayList<>(texts.size());
        int batchSize = 100;

        for (int i = 0; i < texts.size(); i += batchSize) {
            List<String> batch = texts.subList(i, Math.min(i + batchSize, texts.size()));
            List<float[]> batchResult = callOpenAIBatch(batch);
            results.addAll(batchResult);

            int processed = Math.min(i + batchSize, texts.size());
            log.info("Embedding progress: {}/{} texts processed", processed, texts.size());

            if (processed < texts.size()) {
                try { Thread.sleep(200); } catch (InterruptedException ignored) {}
            }
        }

        return results;
    }

    private List<float[]> callOpenAIBatch(List<String> texts) {
        try {
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", embeddingModel);
            requestBody.put("input", texts);

            OpenAIEmbeddingResponse response = webClient.post()
                    .uri("/embeddings")
                    .header("Authorization", "Bearer " + openAiApiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(requestBody)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, clientResponse ->
                            clientResponse.bodyToMono(String.class)
                                    .map(body -> new RuntimeException("OpenAI batch error: " + body)))
                    .bodyToMono(OpenAIEmbeddingResponse.class)
                    .block();

            if (response == null || response.data() == null) {
                throw new IllegalStateException("OpenAI returned no embeddings");
            }

            List<EmbeddingData> orderedEmbeddings = response.data().stream()
                    .sorted(Comparator.comparingInt(EmbeddingData::index))
                    .toList();

            if (orderedEmbeddings.size() != texts.size()) {
                throw new IllegalStateException("OpenAI returned an incomplete embedding batch");
            }

            List<float[]> results = new ArrayList<>(orderedEmbeddings.size());
            for (int i = 0; i < orderedEmbeddings.size(); i++) {
                EmbeddingData embeddingData = orderedEmbeddings.get(i);
                if (embeddingData.index() != i) {
                    throw new IllegalStateException("OpenAI returned an invalid embedding index");
                }
                results.add(toEmbedding(embeddingData.embedding()));
            }
            return results;

        } catch (Exception e) {
            log.error("OpenAI batch embedding failed for {} texts: {}", texts.size(), e.getMessage());
            if (e instanceof IllegalStateException illegalStateException) {
                throw illegalStateException;
            }
            throw new IllegalStateException("Batch embedding generation failed", e);
        }
    }

    private void requireConfiguration() {
        if (!isConfigured()) {
            throw new IllegalStateException("OpenAI embeddings are not configured");
        }
    }

    public void clearCache() {
        int size = embeddingCache.size();
        embeddingCache.clear();
        log.info("Embedding cache cleared ({} entries removed)", size);
    }

    public int getCacheSize() {
        return embeddingCache.size();
    }

    public int getEmbeddingDimension() {
        return embeddingDimension;
    }

    private float[] toEmbedding(List<Double> values) {
        if (values == null || values.size() != embeddingDimension) {
            throw new IllegalStateException("OpenAI returned an embedding with an invalid dimension");
        }

        float[] result = new float[values.size()];
        for (int i = 0; i < values.size(); i++) {
            Double value = values.get(i);
            if (value == null || !Double.isFinite(value)) {
                throw new IllegalStateException("OpenAI returned an invalid embedding value");
            }
            result[i] = value.floatValue();
        }
        return result;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OpenAIEmbeddingResponse(
            List<EmbeddingData> data,
            String model,
            EmbeddingUsage usage
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EmbeddingData(
            List<Double> embedding,
            int index,
            String object
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EmbeddingUsage(
            @JsonProperty("prompt_tokens") int promptTokens,
            @JsonProperty("total_tokens") int totalTokens
    ) {}
}
