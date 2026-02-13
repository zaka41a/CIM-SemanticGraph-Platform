package com.cim.semanticgraph.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Embedding Service for GraphRAG
 *
 * Generates vector embeddings for semantic search
 * This is a simplified implementation - in production, you would integrate
 * with OpenAI, Hugging Face, or other embedding models
 */
@Slf4j
@Service
public class EmbeddingService {

    @Value("${graphrag.embedding.dimension}")
    private int embeddingDimension;

    @Value("${graphrag.embedding.cache-enabled}")
    private boolean cacheEnabled;

    // Simple in-memory cache for embeddings
    private final Map<String, float[]> embeddingCache = new HashMap<>();

    /**
     * Generate embedding for text
     *
     * NOTE: This is a simplified implementation using TF-IDF-like approach
     * For production, integrate with:
     * - OpenAI Embeddings API
     * - sentence-transformers (via REST API)
     * - Hugging Face models
     *
     * @param text Input text
     * @return Embedding vector
     */
    @Cacheable(value = "embeddings", condition = "#root.target.cacheEnabled")
    public float[] generateEmbedding(String text) {
        log.debug("Generating embedding for text: {} characters", text.length());

        // Check cache
        if (cacheEnabled && embeddingCache.containsKey(text)) {
            log.debug("Returning cached embedding");
            return embeddingCache.get(text);
        }

        // Simple embedding generation (for demo purposes)
        float[] embedding = generateSimpleEmbedding(text);

        // Cache the embedding
        if (cacheEnabled) {
            embeddingCache.put(text, embedding);
        }

        return embedding;
    }

    /**
     * Calculate cosine similarity between two embeddings
     *
     * @param vec1 First embedding vector
     * @param vec2 Second embedding vector
     * @return Similarity score (0.0 to 1.0)
     */
    public double cosineSimilarity(float[] vec1, float[] vec2) {
        if (vec1.length != vec2.length) {
            throw new IllegalArgumentException("Vectors must have same dimension");
        }

        double dotProduct = 0.0;
        double norm1 = 0.0;
        double norm2 = 0.0;

        for (int i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        if (norm1 == 0.0 || norm2 == 0.0) {
            return 0.0;
        }

        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Find similar entities based on embedding similarity
     *
     * @param queryEmbedding Query embedding
     * @param candidates     Map of entity URIs to their embeddings
     * @param topK           Number of top results to return
     * @return List of similar entity URIs
     */
    public List<String> findSimilarEntities(float[] queryEmbedding,
                                           Map<String, float[]> candidates,
                                           int topK) {
        log.debug("Finding similar entities. Candidates: {}, topK: {}", candidates.size(), topK);

        // Calculate similarities
        Map<String, Double> similarities = new HashMap<>();
        for (Map.Entry<String, float[]> entry : candidates.entrySet()) {
            double similarity = cosineSimilarity(queryEmbedding, entry.getValue());
            similarities.put(entry.getKey(), similarity);
        }

        // Sort by similarity and get top K
        return similarities.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(topK)
                .map(Map.Entry::getKey)
                .toList();
    }

    /**
     * Batch generate embeddings
     *
     * @param texts List of texts
     * @return List of embeddings
     */
    public List<float[]> batchGenerateEmbeddings(List<String> texts) {
        log.info("Generating embeddings for {} texts", texts.size());

        List<float[]> embeddings = new ArrayList<>();
        for (String text : texts) {
            embeddings.add(generateEmbedding(text));
        }

        return embeddings;
    }

    /**
     * Clear embedding cache
     */
    public void clearCache() {
        log.info("Clearing embedding cache. Size: {}", embeddingCache.size());
        embeddingCache.clear();
    }

    /**
     * Get cache size
     */
    public int getCacheSize() {
        return embeddingCache.size();
    }

    /**
     * Simple embedding generation using character n-grams and hashing
     * This is a placeholder for actual embedding model integration
     */
    private float[] generateSimpleEmbedding(String text) {
        float[] embedding = new float[embeddingDimension];

        // Normalize text
        String normalized = text.toLowerCase().trim();

        // Use hash-based approach for simplicity
        // This creates a consistent but simple embedding
        Random random = new Random(normalized.hashCode());

        for (int i = 0; i < embeddingDimension; i++) {
            embedding[i] = (float) (random.nextGaussian() * 0.1);
        }

        // Add some semantic structure based on keywords
        String[] keywords = {"equipment", "substation", "line", "transformer",
                           "voltage", "power", "energy", "network", "grid"};

        for (int i = 0; i < keywords.length && i < embeddingDimension; i++) {
            if (normalized.contains(keywords[i])) {
                embedding[i % embeddingDimension] += 0.5f;
            }
        }

        // Normalize the embedding
        float norm = 0.0f;
        for (float v : embedding) {
            norm += v * v;
        }
        norm = (float) Math.sqrt(norm);

        if (norm > 0) {
            for (int i = 0; i < embedding.length; i++) {
                embedding[i] /= norm;
            }
        }

        return embedding;
    }

    /**
     * TODO: Integration with real embedding models
     *
     * For production deployment, implement integration with:
     *
     * 1. OpenAI Embeddings API:
     *    - Model: text-embedding-ada-002
     *    - Dimension: 1536
     *    - API: https://api.openai.com/v1/embeddings
     *
     * 2. Sentence Transformers (via Python service):
     *    - Model: all-MiniLM-L6-v2 or all-mpnet-base-v2
     *    - Deploy as microservice
     *    - REST API integration
     *
     * 3. Hugging Face Inference API:
     *    - Various models available
     *    - Easy integration with REST API
     *
     * Example OpenAI integration:
     *
     * public float[] generateOpenAIEmbedding(String text) {
     *     WebClient client = WebClient.builder()
     *         .baseUrl("https://api.openai.com/v1")
     *         .defaultHeader("Authorization", "Bearer " + apiKey)
     *         .build();
     *
     *     Map<String, Object> request = Map.of(
     *         "model", "text-embedding-ada-002",
     *         "input", text
     *     );
     *
     *     return client.post()
     *         .uri("/embeddings")
     *         .bodyValue(request)
     *         .retrieve()
     *         .bodyToMono(EmbeddingResponse.class)
     *         .map(response -> response.getData().get(0).getEmbedding())
     *         .block();
     * }
     */
}
