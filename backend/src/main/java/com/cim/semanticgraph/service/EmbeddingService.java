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

/**
 * Embedding Service - generates real vector embeddings using OpenAI text-embedding-3-small.
 * Falls back to a deterministic hash-based embedding if the API key is not configured.
 */
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

    /**
     * Generate a single embedding vector for the given text.
     * Uses OpenAI if configured, otherwise falls back to a deterministic hash-based approach.
     */
    public float[] generateEmbedding(String text) {
        if (text == null || text.isBlank()) {
            return new float[embeddingDimension];
        }

        if (!isConfigured()) {
            log.debug("OpenAI not configured, using fallback embedding");
            return generateFallbackEmbedding(text);
        }

        String cacheKey = text.length() > 200 ? text.substring(0, 200) : text;
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
                log.warn("Empty response from OpenAI, using fallback");
                return generateFallbackEmbedding(text);
            }

            float[] vector = toFloatArray(response.data().get(0).embedding());

            if (cacheEnabled) {
                embeddingCache.put(cacheKey, vector);
            }

            return vector;

        } catch (Exception e) {
            log.error("Error calling OpenAI embeddings API: {}", e.getMessage());
            return generateFallbackEmbedding(text);
        }
    }

    /**
     * Generate embeddings for a list of texts in batches of 100.
     * Returns results in the same order as input.
     */
    public List<float[]> batchGenerateEmbeddings(List<String> texts) {
        if (texts == null || texts.isEmpty()) return List.of();

        if (!isConfigured()) {
            log.warn("OpenAI not configured, generating fallback embeddings for {} texts", texts.size());
            return texts.stream().map(this::generateFallbackEmbedding).toList();
        }

        List<float[]> results = new ArrayList<>(texts.size());
        int batchSize = 100;

        for (int i = 0; i < texts.size(); i += batchSize) {
            List<String> batch = texts.subList(i, Math.min(i + batchSize, texts.size()));
            List<float[]> batchResult = callOpenAIBatch(batch);
            results.addAll(batchResult);

            int processed = Math.min(i + batchSize, texts.size());
            log.info("Embedding progress: {}/{} texts processed", processed, texts.size());

            // Small delay to respect rate limits
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
                return texts.stream().map(this::generateFallbackEmbedding).toList();
            }

            // Sort by index to maintain order, then extract vectors
            return response.data().stream()
                    .sorted(Comparator.comparingInt(EmbeddingData::index))
                    .map(d -> toFloatArray(d.embedding()))
                    .toList();

        } catch (Exception e) {
            log.error("OpenAI batch embedding failed: {}, using fallback for {} texts",
                    e.getMessage(), texts.size());
            return texts.stream().map(this::generateFallbackEmbedding).toList();
        }
    }

    /**
     * Deterministic fallback embedding based on text hash.
     * Used when OpenAI is not configured or unavailable.
     */
    private float[] generateFallbackEmbedding(String text) {
        float[] embedding = new float[embeddingDimension];
        Random random = new Random(text.hashCode());
        float norm = 0f;

        for (int i = 0; i < embeddingDimension; i++) {
            embedding[i] = (float) random.nextGaussian();
            norm += embedding[i] * embedding[i];
        }

        norm = (float) Math.sqrt(norm);
        if (norm > 0) {
            for (int i = 0; i < embeddingDimension; i++) {
                embedding[i] /= norm;
            }
        }

        return embedding;
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

    private float[] toFloatArray(List<Double> doubles) {
        float[] floats = new float[doubles.size()];
        for (int i = 0; i < doubles.size(); i++) {
            floats[i] = doubles.get(i).floatValue();
        }
        return floats;
    }

    // ---- OpenAI response DTOs ----

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
