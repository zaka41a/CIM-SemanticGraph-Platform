package com.cim.semanticgraph.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * QdrantService - interacts with Qdrant vector database via REST API.
 *
 * Provides:
 *  - Collection initialization
 *  - Vector upsert (batch)
 *  - Semantic similarity search
 *  - Collection management
 */
@Slf4j
@Service
public class QdrantService {

    @Value("${qdrant.url:http://localhost:6333}")
    private String qdrantUrl;

    @Value("${qdrant.collection-name:cim_entities}")
    private String collectionName;

    @Value("${qdrant.vector-size:1536}")
    private int vectorSize;

    private WebClient webClient;
    // Cached availability - checked once at startup, reset on upsert/clear errors
    private volatile boolean available = false;
    // Cached point count - updated after upsert/clear, avoids HTTP call per query
    private volatile long cachedPointCount = 0;

    @PostConstruct
    public void init() {
        this.webClient = WebClient.builder()
                .baseUrl(qdrantUrl)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(50 * 1024 * 1024))
                .build();

        this.available = checkAvailability();
        if (available) {
            ensureCollectionExists();
            this.cachedPointCount = fetchPointCount();
            log.info("Qdrant ready at {}. Collection '{}' has {} points.", qdrantUrl, collectionName, cachedPointCount);
        } else {
            log.warn("Qdrant is not available at {}. Vector search will be disabled.", qdrantUrl);
        }
    }

    /**
     * Returns cached availability - no HTTP call.
     */
    public boolean isAvailable() {
        return available;
    }

    /**
     * Returns cached point count - no HTTP call.
     */
    public long countPoints() {
        return cachedPointCount;
    }

    /**
     * Actually checks Qdrant via HTTP - only called at startup.
     */
    private boolean checkAvailability() {
        try {
            webClient.get()
                    .uri("/healthz")
                    .retrieve()
                    .toBodilessEntity()
                    .block();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Create the CIM collection if it doesn't exist yet.
     */
    public void ensureCollectionExists() {
        try {
            webClient.get()
                    .uri("/collections/" + collectionName)
                    .retrieve()
                    .toBodilessEntity()
                    .block();
            log.info("Qdrant collection '{}' already exists", collectionName);
        } catch (WebClientResponseException.NotFound e) {
            createCollection();
        } catch (Exception e) {
            log.warn("Could not verify Qdrant collection, attempting creation: {}", e.getMessage());
            try {
                createCollection();
            } catch (Exception ex) {
                log.error("Failed to create Qdrant collection '{}': {}", collectionName, ex.getMessage());
            }
        }
    }

    private void createCollection() {
        Map<String, Object> body = Map.of(
                "vectors", Map.of(
                        "size", vectorSize,
                        "distance", "Cosine"
                )
        );

        webClient.put()
                .uri("/collections/" + collectionName)
                .header("Content-Type", "application/json")
                .bodyValue(body)
                .retrieve()
                .toBodilessEntity()
                .block();

        log.info("Qdrant collection '{}' created (vectorSize={})", collectionName, vectorSize);
    }

    /**
     * Upsert a batch of points into the collection.
     * Uses batch size of 100 to avoid request size limits.
     */
    public void upsertPoints(List<QdrantPoint> points) {
        if (points == null || points.isEmpty()) return;

        int batchSize = 100;
        for (int i = 0; i < points.size(); i += batchSize) {
            List<QdrantPoint> batch = points.subList(i, Math.min(i + batchSize, points.size()));
            upsertBatch(batch);
        }

        this.cachedPointCount = fetchPointCount();
        log.info("Upserted {} points to Qdrant collection '{}'. Total: {}", points.size(), collectionName, cachedPointCount);
    }

    private void upsertBatch(List<QdrantPoint> batch) {
        List<Map<String, Object>> qdrantPoints = batch.stream()
                .map(p -> {
                    Map<String, Object> point = new HashMap<>();
                    point.put("id", p.id());
                    point.put("vector", toDoubleList(p.vector()));
                    point.put("payload", p.payload());
                    return point;
                })
                .toList();

        Map<String, Object> body = Map.of("points", qdrantPoints);

        webClient.put()
                .uri("/collections/" + collectionName + "/points")
                .header("Content-Type", "application/json")
                .bodyValue(body)
                .retrieve()
                .toBodilessEntity()
                .block();
    }

    /**
     * Search for the most similar vectors to the query vector.
     *
     * @param queryVector  The query embedding
     * @param topK         Maximum number of results
     * @param scoreThreshold Minimum similarity score (0.0 to 1.0)
     * @return List of search results with payload and score
     */
    public List<SearchResult> search(float[] queryVector, int topK, double scoreThreshold) {

        Map<String, Object> body = new HashMap<>();
        body.put("vector", toDoubleList(queryVector));
        body.put("limit", topK);
        body.put("with_payload", true);
        body.put("score_threshold", scoreThreshold);

        try {
            Map<?, ?> response = webClient.post()
                    .uri("/collections/" + collectionName + "/points/search")
                    .header("Content-Type", "application/json")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (response == null || !response.containsKey("result")) {
                return List.of();
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> results = (List<Map<String, Object>>) response.get("result");

            return results.stream()
                    .map(r -> {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> payload = (Map<String, Object>) r.get("payload");
                        double score = r.get("score") instanceof Number n ? n.doubleValue() : 0.0;
                        return new SearchResult(String.valueOf(r.get("id")), score, payload);
                    })
                    .toList();

        } catch (Exception e) {
            log.error("Qdrant search failed: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Fetch point count from Qdrant via HTTP - used internally to refresh cache.
     */
    private long fetchPointCount() {
        try {
            Map<?, ?> response = webClient.get()
                    .uri("/collections/" + collectionName)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (response != null && response.containsKey("result")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> result = (Map<String, Object>) response.get("result");
                Object count = result.get("points_count");
                if (count instanceof Number n) return n.longValue();
            }
        } catch (Exception e) {
            log.warn("Failed to fetch Qdrant point count: {}", e.getMessage());
        }
        return 0;
    }

    /**
     * Delete all points and recreate the collection (full re-index scenario).
     */
    public void clearCollection() {
        try {
            webClient.delete()
                    .uri("/collections/" + collectionName)
                    .retrieve()
                    .toBodilessEntity()
                    .block();
            log.info("Qdrant collection '{}' deleted", collectionName);
        } catch (Exception e) {
            log.warn("Failed to delete collection: {}", e.getMessage());
        }
        createCollection();
        this.cachedPointCount = 0;
    }

    /**
     * Generate a deterministic UUID from a URI string.
     * Same URI always produces the same UUID - safe for re-indexing.
     */
    public static String uriToId(String uri) {
        return UUID.nameUUIDFromBytes(uri.getBytes(StandardCharsets.UTF_8)).toString();
    }

    private List<Double> toDoubleList(float[] vector) {
        List<Double> list = new ArrayList<>(vector.length);
        for (float f : vector) list.add((double) f);
        return list;
    }

    // ---- Domain types ----

    public record QdrantPoint(
            String id,
            float[] vector,
            Map<String, Object> payload
    ) {}

    public record SearchResult(
            String id,
            double score,
            Map<String, Object> payload
    ) {
        public String getUri() {
            return payload != null ? (String) payload.get("uri") : null;
        }

        public String getLabel() {
            return payload != null ? (String) payload.get("label") : null;
        }

        public String getCimType() {
            return payload != null ? (String) payload.get("type") : null;
        }
    }
}
