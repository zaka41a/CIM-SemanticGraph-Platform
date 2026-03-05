package com.cim.semanticgraph.service;

import com.cim.semanticgraph.service.QdrantService.QdrantPoint;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;

/**
 * CIMIndexingService — indexes all CIM entities from Fuseki into Qdrant.
 *
 * Called automatically after each CIM import. Each entity is described as text,
 * embedded via OpenAI text-embedding-3-small, and stored in Qdrant for semantic search.
 *
 * Flow:
 *   CIM Import done → indexAllEntitiesAsync() → SPARQL query Fuseki
 *       → build text descriptions → OpenAI batch embeddings → Qdrant upsert
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CIMIndexingService {

    private final JenaService jenaService;
    private final EmbeddingService embeddingService;
    private final QdrantService qdrantService;

    @Value("${cim.namespaces.cim:http://iec.ch/TC57/CIM100#}")
    private String cimNamespace;

    /**
     * Async indexing — called after CIM import so it doesn't block the HTTP response.
     */
    @Async
    public CompletableFuture<IndexingResult> indexAllEntitiesAsync() {
        log.info("Starting async CIM entity indexing to Qdrant...");
        IndexingResult result = indexAllEntities();
        log.info("Async indexing completed: {}", result);
        return CompletableFuture.completedFuture(result);
    }

    /**
     * Synchronous indexing — queries all CIM entities, builds embeddings, upserts to Qdrant.
     */
    public IndexingResult indexAllEntities() {
        long startTime = System.currentTimeMillis();

        if (!qdrantService.isAvailable()) {
            log.warn("Qdrant not available, skipping entity indexing");
            return new IndexingResult(0, 0, "Qdrant unavailable", false);
        }

        if (!embeddingService.isConfigured()) {
            log.warn("OpenAI not configured — skipping vector indexing. Keyword search (SPARQL fallback) will be used instead.");
            return new IndexingResult(0, 0, "OpenAI API key not configured — using keyword search fallback", false);
        }

        try {
            // Step 1: Query all CIM entities with their type, label and description
            List<EntityInfo> entities = fetchAllEntities();
            log.info("Fetched {} CIM entities from Fuseki", entities.size());

            if (entities.isEmpty()) {
                return new IndexingResult(0, 0, "No CIM entities found in Fuseki", true);
            }

            // Step 2: Clear existing index to avoid stale data
            qdrantService.clearCollection();
            log.info("Cleared existing Qdrant index");

            // Step 3: Build text descriptions for embedding
            List<String> texts = entities.stream()
                    .map(this::buildEntityText)
                    .toList();

            // Step 4: Generate embeddings in batches (OpenAI)
            log.info("Generating embeddings for {} entities...", entities.size());
            List<float[]> embeddings = embeddingService.batchGenerateEmbeddings(texts);

            // Step 5: Build Qdrant points and upsert
            List<QdrantPoint> points = new ArrayList<>();
            for (int i = 0; i < entities.size(); i++) {
                EntityInfo entity = entities.get(i);
                float[] embedding = embeddings.get(i);

                Map<String, Object> payload = new HashMap<>();
                payload.put("uri", entity.uri());
                payload.put("label", entity.label() != null ? entity.label() : "");
                payload.put("type", entity.type() != null ? entity.type() : "");
                payload.put("description", entity.description() != null ? entity.description() : "");
                payload.put("text", texts.get(i));

                points.add(new QdrantPoint(
                        QdrantService.uriToId(entity.uri()),
                        embedding,
                        payload
                ));
            }

            qdrantService.upsertPoints(points);

            long duration = System.currentTimeMillis() - startTime;
            log.info("Indexing complete: {} entities in {}ms", points.size(), duration);

            return new IndexingResult(entities.size(), points.size(),
                    String.format("Success in %dms", duration), true);

        } catch (Exception e) {
            log.error("CIM indexing failed", e);
            return new IndexingResult(0, 0, "Error: " + e.getMessage(), false);
        }
    }

    /**
     * Query all named CIM entities from Fuseki.
     * Gets entity URI, CIM type (local name), rdfs:label or IdentifiedObject.name, and description.
     */
    private List<EntityInfo> fetchAllEntities() {
        String sparql = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

                SELECT DISTINCT ?entity ?type ?label ?description WHERE {
                    ?entity rdf:type ?type .
                    FILTER(STRSTARTS(STR(?type), "%s"))
                    OPTIONAL { ?entity cim:IdentifiedObject.name ?label }
                    OPTIONAL { ?entity cim:IdentifiedObject.description ?description }
                }
                LIMIT 10000
                """.formatted(cimNamespace, cimNamespace);

        try {
            List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);

            return rows.stream()
                    .filter(row -> row.get("entity") != null)
                    .map(row -> new EntityInfo(
                            row.get("entity"),
                            extractLocalName(row.get("type")),
                            row.get("label"),
                            row.get("description")
                    ))
                    .toList();

        } catch (Exception e) {
            log.error("Failed to fetch CIM entities from Fuseki: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Build a rich text description for an entity that produces meaningful embeddings.
     *
     * Example output:
     *   "Substation: Berlin 380kV | Type: Substation | Description: Main 380kV node in NRW region"
     */
    private String buildEntityText(EntityInfo entity) {
        StringBuilder text = new StringBuilder();

        if (entity.type() != null && !entity.type().isBlank()) {
            text.append(entity.type()).append(": ");
        }

        if (entity.label() != null && !entity.label().isBlank()) {
            text.append(entity.label());
        } else {
            // Use local name from URI as fallback
            text.append(extractLocalName(entity.uri()));
        }

        if (entity.description() != null && !entity.description().isBlank()) {
            text.append(" | ").append(entity.description());
        }

        if (entity.type() != null) {
            text.append(" | CIM type: ").append(entity.type());
        }

        return text.toString().trim();
    }

    private String extractLocalName(String uri) {
        if (uri == null) return "";
        int hash = uri.lastIndexOf('#');
        int slash = uri.lastIndexOf('/');
        int sep = Math.max(hash, slash);
        return sep >= 0 && sep < uri.length() - 1 ? uri.substring(sep + 1) : uri;
    }

    // ---- Domain types ----

    public record EntityInfo(String uri, String type, String label, String description) {}

    public record IndexingResult(
            int entitiesFetched,
            int entitiesIndexed,
            String message,
            boolean success
    ) {}
}
