package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.graphrag.AnswerEvaluator;
import com.cim.semanticgraph.graphrag.ContextBuilder;
import com.cim.semanticgraph.graphrag.GraphTraverser;
import com.cim.semanticgraph.graphrag.RelevanceScorer;
import com.cim.semanticgraph.loadflow.model.CalculationMethod;
import com.cim.semanticgraph.model.ChatHistory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class GraphRAGService {

    private final JenaService jenaService;
    private final OllamaService ollamaService;
    private final GroqService groqService;
    private final ClaudeAgentService claudeAgentService;
    private final EmbeddingService embeddingService;
    private final QdrantService qdrantService;
    private final GraphTraverser graphTraverser;
    private final ContextBuilder contextBuilder;
    private final RelevanceScorer relevanceScorer;
    private final AnswerEvaluator answerEvaluator;
    private final ChatHistoryService chatHistoryService;
    private final LoadFlowService loadFlowService;

    @Value("${graphrag.retrieval.top-k}")
    private int topK;

    @Value("${graphrag.retrieval.max-depth}")
    private int maxDepth;

    @Value("${graphrag.context.max-triples}")
    private int maxTriples;

    @Value("${graphrag.retrieval.similarity-threshold:0.35}")
    private double similarityThreshold;

    @Value("${graphrag.reranking.candidateMultiplier:3}")
    private int candidateMultiplier;

    @Value("${groq.api.model:${ollama.api.model:unknown}}")
    private String llmModel;

    @Value("${cim.namespaces.cim:http://iec.ch/TC57/CIM100#}")
    private String cimNamespace;

    public GraphRAGResponse processQuery(String question, String sessionId) {
        return processQuery(question, sessionId, null);
    }

    public GraphRAGResponse processQuery(String question, String sessionId, String provider) {
        log.info("Processing GraphRAG query: {} for session: {} (provider: {})",
                question, sessionId, provider == null ? "default" : provider);
        long startTime = System.currentTimeMillis();

        try {
            if (isLoadFlowRequest(question)) {
                log.info("Detected load flow calculation request");
                return handleLoadFlowRequest(question, sessionId, startTime);
            }

            log.debug("Step 1: Retrieving relevant entities");
            List<String> relevantEntities = findRelevantEntities(question);

            log.debug("Step 1b: Building direct SPARQL context for aggregate questions");
            String sparqlContext = buildSparqlContext(question);

            GraphRAGResponse response;
            if (relevantEntities.isEmpty() && sparqlContext.isEmpty()) {
                log.warn("No relevant entities found for query");
                response = buildFallbackResponse(question, startTime, provider);
            } else {
                log.debug("Step 3: Building LLM context");
                String graphContext;
                long subgraphSize = 0;
                if (!sparqlContext.isEmpty() && relevantEntities.isEmpty()) {
                    // SPARQL already has the answer - skip loading the full RDF model
                    graphContext = sparqlContext;
                    log.info("Using SPARQL-only context ({} chars)", graphContext.length());
                } else {
                    Model subgraph = relevantEntities.isEmpty()
                            ? jenaService.getModelCopy()
                            : retrieveSubgraph(relevantEntities);
                    subgraphSize = subgraph.size();
                    graphContext = contextBuilder.buildContext(subgraph, maxTriples);
                    if (!sparqlContext.isEmpty()) {
                        graphContext = sparqlContext + "\n\n---\n\n" + graphContext;
                    }
                }
                // Hard cap: Groq free tier limit ~12k TPM → keep context under ~24k chars (~6k tokens)
                graphContext = truncateContext(graphContext, 24_000);

                // Prepended after truncation so the authoritative totals always survive,
                // whatever the sample below them gets cut down to.
                graphContext = buildInventoryContext() + graphContext;

                log.debug("Step 4: Querying LLM");
                String answer;
                if (groqService.isConfigured(provider)) {
                    log.info("Using LLM provider '{}' for query", provider == null ? "default" : provider);
                    answer = groqService.queryWithContext(question, graphContext, provider);
                } else if (claudeAgentService.isConfigured()) {
                    log.info("Using Claude API for LLM query (Groq not configured)");
                    answer = claudeAgentService.queryWithContext(question, graphContext);
                } else {
                    log.warn("No LLM configured (Groq/Claude keys missing). Trying Ollama as last resort.");
                    try {
                        answer = ollamaService.queryWithContext(question, graphContext);
                    } catch (Exception ollamaEx) {
                        throw new RuntimeException(
                            "No LLM service is available. Please configure CLAUDE_API_KEY or GROQ_API_KEY " +
                            "in backend/.env and restart the backend with: source backend/.env && mvn spring-boot:run", ollamaEx);
                    }
                }

                long executionTime = System.currentTimeMillis() - startTime;
                log.info("GraphRAG query completed in {}ms", executionTime);

                AnswerEvaluator.EvaluationResult eval =
                        answerEvaluator.evaluate(question, graphContext, answer);
                log.info("Answer quality: {}", eval.summary());

                response = GraphRAGResponse.builder()
                        .answer(answer)
                        .question(question)
                        .graphContext(graphContext)
                        .sources(relevantEntities)
                        .triplesRetrieved((int) subgraphSize)
                        .executionTimeMs(executionTime)
                        .llmModel(groqService.isConfigured(provider) ? groqService.modelFor(provider) : llmModel)
                        .inferenceUsed(true)
                        .confidence(calculateConfidence(relevantEntities.size(), subgraphSize))
                        .faithfulness(eval.faithfulness())
                        .answerRelevance(eval.answerRelevance())
                        .timestamp(LocalDateTime.now())
                        .build();
            }

            saveChatHistory(sessionId, response);

            return response;

        } catch (Exception e) {
            log.error("Error processing GraphRAG query", e);
            throw new RuntimeException("GraphRAG processing failed: " + e.getMessage(), e);
        }
    }

    private void saveChatHistory(String sessionId, GraphRAGResponse response) {
        try {
            ChatHistory chatHistory = ChatHistory.create(
                    sessionId,
                    response.getQuestion(),
                    response.getAnswer(),
                    response.getSources(),
                    response.getConfidence(),
                    response.getTriplesRetrieved(),
                    response.getExecutionTimeMs(),
                    response.getLlmModel()
            );
            chatHistoryService.saveChatHistory(chatHistory);
            log.debug("Chat history saved for session: {}", sessionId);
        } catch (Exception e) {
            // Don't fail the request if history save fails
            log.error("Failed to save chat history", e);
        }
    }

    public GraphRAGResponse analyzeEquipmentImpact(String equipmentId) {
        log.info("Analyzing impact for equipment: {}", equipmentId);
        long startTime = System.currentTimeMillis();

        try {
            String sparql = """
                SELECT ?eq ?name ?type WHERE {
                    ?eq a cim:Equipment .
                    ?eq cim:IdentifiedObject.name ?name .
                    ?eq a ?type .
                    FILTER(CONTAINS(STR(?eq), "%s") || CONTAINS(?name, "%s"))
                }
                LIMIT 1
                """.formatted(equipmentId, equipmentId);

            List<Map<String, String>> results = jenaService.executeSparqlSelect(sparql);

            if (results.isEmpty()) {
                throw new RuntimeException("Equipment not found: " + equipmentId);
            }

            String equipmentUri = results.get(0).get("eq");

            Model subgraph = graphTraverser.traverse(equipmentUri, maxDepth);
            String context = contextBuilder.buildContext(subgraph, maxTriples);

            String answer;
            if (groqService.isConfigured()) {
                answer = groqService.analyzeImpact(equipmentId, context);
            } else if (claudeAgentService.isConfigured()) {
                answer = claudeAgentService.queryWithContext("Analyze the impact of equipment: " + equipmentId, context);
            } else {
                answer = ollamaService.analyzeImpact(equipmentId, context);
            }

            long executionTime = System.currentTimeMillis() - startTime;

            return GraphRAGResponse.builder()
                    .answer(answer)
                    .question("Analyze impact of " + equipmentId + " failure")
                    .graphContext(context)
                    .sources(List.of(equipmentUri))
                    .triplesRetrieved((int) subgraph.size())
                    .executionTimeMs(executionTime)
                    .llmModel(llmModel)
                    .build();

        } catch (Exception e) {
            log.error("Error analyzing equipment impact", e);
            throw new RuntimeException("Impact analysis failed: " + e.getMessage(), e);
        }
    }

    public GraphRAGResponse verifyNetworkConsistency() {
        log.info("Verifying network consistency");
        long startTime = System.currentTimeMillis();

        try {
            String sparql = """
                SELECT ?s ?p ?o WHERE {
                    ?s ?p ?o .
                    ?s a cim:Equipment .
                }
                LIMIT 1000
                """;

            List<Map<String, String>> results = jenaService.executeSparqlSelect(sparql);

            StringBuilder context = new StringBuilder();
            context.append("Network Configuration:\n");
            for (Map<String, String> row : results) {
                context.append(String.format("- %s %s %s\n",
                    row.get("s"), row.get("p"), row.get("o")));
            }

            String answer;
            if (groqService.isConfigured()) {
                answer = groqService.verifyConsistency(context.toString());
            } else if (claudeAgentService.isConfigured()) {
                answer = claudeAgentService.queryWithContext("Verify network consistency", context.toString());
            } else {
                answer = ollamaService.verifyConsistency(context.toString());
            }

            long executionTime = System.currentTimeMillis() - startTime;

            return GraphRAGResponse.builder()
                    .answer(answer)
                    .question("Verify network consistency")
                    .graphContext(context.toString())
                    .triplesRetrieved(results.size())
                    .executionTimeMs(executionTime)
                    .llmModel(llmModel)
                    .build();

        } catch (Exception e) {
            log.error("Error verifying network consistency", e);
            throw new RuntimeException("Consistency verification failed: " + e.getMessage(), e);
        }
    }

    /**
     * Truncate context to maxChars to stay within LLM token limits.
     * Cuts at the last newline before the limit to avoid mid-line truncation.
     */
    private String truncateContext(String context, int maxChars) {
        if (context.length() <= maxChars) return context;
        int cutAt = context.lastIndexOf('\n', maxChars);
        if (cutAt < maxChars / 2) cutAt = maxChars;
        log.warn("Context truncated from {} to {} chars to stay within LLM token limit", context.length(), cutAt);
        return context.substring(0, cutAt) + "\n\n[Context truncated to fit token limit]";
    }

    private List<String> findRelevantEntities(String question) {
        log.debug("Finding relevant entities for: {}", question);

        int candidateLimit = Math.max(topK, topK * Math.max(1, candidateMultiplier));
        Map<String, RelevanceScorer.Candidate> candidates = new LinkedHashMap<>();

        boolean vectorSearchDone = false;
        if (qdrantService.isAvailable() && qdrantService.countPoints() > 0) {
            try {
                float[] queryEmbedding = embeddingService.generateEmbedding(question);
                List<QdrantService.SearchResult> results =
                        qdrantService.search(queryEmbedding, candidateLimit, similarityThreshold);

                if (!results.isEmpty()) {
                    log.info("Vector search found {} entities (top score: {})",
                            results.size(), String.format("%.3f", results.get(0).score()));
                    for (int i = 0; i < results.size(); i++) {
                        QdrantService.SearchResult r = results.get(i);
                        if (r.getUri() != null) {
                            candidates.put(r.getUri(), new RelevanceScorer.Candidate(
                                    r.getUri(),
                                    r.getLabel(),
                                    r.getCimType(),
                                    r.getText(),
                                    r.score(),
                                    i + 1,
                                    0
                            ));
                        }
                    }
                    vectorSearchDone = true;
                } else {
                    log.warn("Vector search returned no results above threshold {}", similarityThreshold);
                }
            } catch (Exception e) {
                log.warn("Vector search error: {}", e.getMessage());
            }
        } else if (!qdrantService.isAvailable()) {
            log.info("Qdrant not available, using keyword search only");
        } else {
            log.info("Qdrant index is empty (run a CIM import to index entities), using keyword search only");
        }

        List<String> keywordEntities = findEntitiesByKeywords(question, candidateLimit);
        if (!keywordEntities.isEmpty()) {
            for (int i = 0; i < keywordEntities.size(); i++) {
                String uri = keywordEntities.get(i);
                RelevanceScorer.Candidate candidate = candidates.get(uri);
                if (candidate == null) {
                    candidate = new RelevanceScorer.Candidate(uri, "", "", uri, 0.0, 0, i + 1);
                } else {
                    candidate = candidate.withKeywordRank(i + 1);
                }
                candidates.put(uri, candidate);
            }
        }

        if (candidates.isEmpty()) {
            return List.of();
        }

        List<String> ranked = relevanceScorer.rankResults(question, List.copyOf(candidates.values()), topK)
                .stream()
                .map(result -> result.candidate().uri())
                .toList();

        log.info("Reranked {} candidates into {} entities (vector={}, keyword={})",
                candidates.size(), ranked.size(), vectorSearchDone, !keywordEntities.isEmpty());

        return ranked;
    }

    // Maps natural language terms → CIM class names for type-based lookup
    private static final Map<String, List<String>> CIM_TYPE_MAP;
    static {
        CIM_TYPE_MAP = new LinkedHashMap<>();
        CIM_TYPE_MAP.put("substation", List.of("Substation"));
        CIM_TYPE_MAP.put("substations", List.of("Substation"));
        CIM_TYPE_MAP.put("poste", List.of("Substation"));
        CIM_TYPE_MAP.put("postes", List.of("Substation"));
        CIM_TYPE_MAP.put("umspannwerk", List.of("Substation"));
        CIM_TYPE_MAP.put("line", List.of("ACLineSegment"));
        CIM_TYPE_MAP.put("lines", List.of("ACLineSegment"));
        CIM_TYPE_MAP.put("ligne", List.of("ACLineSegment"));
        CIM_TYPE_MAP.put("lignes", List.of("ACLineSegment"));
        CIM_TYPE_MAP.put("transmission", List.of("ACLineSegment"));
        CIM_TYPE_MAP.put("cable", List.of("ACLineSegment"));
        CIM_TYPE_MAP.put("transformer", List.of("PowerTransformer"));
        CIM_TYPE_MAP.put("transformers", List.of("PowerTransformer"));
        CIM_TYPE_MAP.put("transfo", List.of("PowerTransformer"));
        CIM_TYPE_MAP.put("transformateur", List.of("PowerTransformer"));
        CIM_TYPE_MAP.put("generator", List.of("GeneratingUnit", "SynchronousMachine"));
        CIM_TYPE_MAP.put("generators", List.of("GeneratingUnit", "SynchronousMachine"));
        CIM_TYPE_MAP.put("generation", List.of("GeneratingUnit", "SynchronousMachine"));
        CIM_TYPE_MAP.put("generateur", List.of("GeneratingUnit", "SynchronousMachine"));
        CIM_TYPE_MAP.put("load", List.of("EnergyConsumer"));
        CIM_TYPE_MAP.put("loads", List.of("EnergyConsumer"));
        CIM_TYPE_MAP.put("charge", List.of("EnergyConsumer"));
        CIM_TYPE_MAP.put("consumption", List.of("EnergyConsumer"));
        CIM_TYPE_MAP.put("bus", List.of("BusbarSection", "ConnectivityNode"));
        CIM_TYPE_MAP.put("buses", List.of("BusbarSection", "ConnectivityNode"));
        CIM_TYPE_MAP.put("busbar", List.of("BusbarSection"));
        CIM_TYPE_MAP.put("node", List.of("ConnectivityNode"));
        CIM_TYPE_MAP.put("nodes", List.of("ConnectivityNode"));
        CIM_TYPE_MAP.put("equipment", List.of("ConductingEquipment"));
        CIM_TYPE_MAP.put("voltage", List.of("VoltageLevel", "BaseVoltage"));
        CIM_TYPE_MAP.put("network", List.of("Substation", "ACLineSegment", "PowerTransformer"));
        CIM_TYPE_MAP.put("reseau", List.of("Substation", "ACLineSegment", "PowerTransformer"));
        CIM_TYPE_MAP.put("netz", List.of("Substation", "ACLineSegment", "PowerTransformer"));
    }

    private List<String> findEntitiesByKeywords(String question, int limit) {
        String[] keywords = extractKeywords(question);
        List<String> entities = new ArrayList<>();

        // Strategy 1: URI/literal string contains (original)
        for (String keyword : keywords) {
            if (keyword.length() < 3) continue;
            String sparql = """
                SELECT DISTINCT ?s WHERE {
                    ?s ?p ?o .
                    FILTER(
                        CONTAINS(LCASE(STR(?s)), LCASE("%s")) ||
                        CONTAINS(LCASE(STR(?o)), LCASE("%s"))
                    )
                }
                LIMIT %d
                """.formatted(keyword, keyword, limit);
            try {
                List<Map<String, String>> results = jenaService.executeSparqlSelect(sparql);
                for (Map<String, String> row : results) {
                    String entity = row.get("s");
                    if (entity != null && !entities.contains(entity)) entities.add(entity);
                }
            } catch (Exception e) {
                log.warn("URI/literal search for '{}' failed: {}", keyword, e.getMessage());
            }
        }

        // Strategy 2: IdentifiedObject.name label search
        for (String keyword : keywords) {
            if (keyword.length() < 3) continue;
            String sparql = """
                PREFIX cim: <%s>
                SELECT DISTINCT ?s WHERE {
                    ?s cim:IdentifiedObject.name ?name .
                    FILTER(CONTAINS(LCASE(?name), LCASE("%s")))
                }
                LIMIT %d
                """.formatted(cimNamespace, keyword, limit);
            try {
                List<Map<String, String>> results = jenaService.executeSparqlSelect(sparql);
                for (Map<String, String> row : results) {
                    String entity = row.get("s");
                    if (entity != null && !entities.contains(entity)) entities.add(entity);
                }
            } catch (Exception e) {
                log.warn("Label search for '{}' failed: {}", keyword, e.getMessage());
            }
        }

        // Strategy 3: CIM type-based lookup when entities still sparse
        if (entities.size() < limit) {
            for (String keyword : keywords) {
                List<String> cimTypes = CIM_TYPE_MAP.get(keyword.toLowerCase());
                if (cimTypes == null) continue;
                for (String cimType : cimTypes) {
                    String sparql = """
                        PREFIX cim: <%s>
                        SELECT DISTINCT ?s WHERE {
                            ?s a cim:%s .
                        }
                        LIMIT %d
                        """.formatted(cimNamespace, cimType, limit);
                    try {
                        List<Map<String, String>> results = jenaService.executeSparqlSelect(sparql);
                        for (Map<String, String> row : results) {
                            String entity = row.get("s");
                            if (entity != null && !entities.contains(entity)) entities.add(entity);
                        }
                        if (!results.isEmpty()) {
                            log.info("Type-based search for '{}' (cim:{}) found {} entities",
                                    keyword, cimType, results.size());
                        }
                    } catch (Exception e) {
                        log.warn("Type-based search for cim:{} failed: {}", cimType, e.getMessage());
                    }
                }
            }
        }

        log.info("Keyword search total: {} relevant entities for keywords: {}",
                entities.size(), String.join(", ", keywords));
        return entities;
    }

    private Model retrieveSubgraph(List<String> entityUris) {
        log.debug("Retrieving subgraph for {} entities using GraphTraverser", entityUris.size());

        Model combinedModel = ModelFactory.createDefaultModel();

        // Deep traversal for top-3 most relevant entities (highest similarity rank)
        int deepCount = Math.min(3, entityUris.size());
        for (int i = 0; i < deepCount; i++) {
            Model traversed = graphTraverser.traverse(entityUris.get(i), maxDepth);
            combinedModel.add(traversed);
            log.debug("Deep traverse [{}]: {} triples from {}", i, traversed.size(), entityUris.get(i));
        }

        // Immediate neighborhood for remaining entities
        for (int i = deepCount; i < entityUris.size(); i++) {
            Model neighborhood = graphTraverser.getNeighborhood(entityUris.get(i));
            combinedModel.add(neighborhood);
        }

        log.info("GraphTraverser subgraph: {} triples ({} deep + {} neighborhood)",
                combinedModel.size(), deepCount, entityUris.size() - deepCount);

        return combinedModel;
    }

    private String[] extractKeywords(String question) {
        String[] stopWords = {"what", "is", "the", "a", "an", "in", "on", "at", "to", "for",
                              "of", "with", "from", "by", "if", "when", "where", "how", "why"};

        String normalized = question.toLowerCase()
                .replaceAll("[^a-z0-9\\s]", " ")
                .trim();

        List<String> keywords = new ArrayList<>();
        for (String word : normalized.split("\\s+")) {
            if (word.length() > 2 && !isStopWord(word, stopWords)) {
                keywords.add(word);
            }
        }

        return keywords.toArray(new String[0]);
    }

    private boolean isStopWord(String word, String[] stopWords) {
        for (String stopWord : stopWords) {
            if (word.equals(stopWord)) {
                return true;
            }
        }
        return false;
    }

    private Double calculateConfidence(int entitiesFound, long triplesRetrieved) {
        if (entitiesFound == 0 || triplesRetrieved == 0) {
            return 0.0;
        }

        double entityScore = Math.min(1.0, entitiesFound / (double) topK);
        double tripleScore = Math.min(1.0, triplesRetrieved / (double) maxTriples);

        return (entityScore + tripleScore) / 2.0;
    }

    private GraphRAGResponse buildFallbackResponse(String question, long startTime, String provider) {
        String fallbackAnswer;
        String modelUsed = llmModel;
        if (groqService.isConfigured(provider)) {
            fallbackAnswer = groqService.simpleQuery(question, provider);
            modelUsed = groqService.modelFor(provider);
        } else if (claudeAgentService.isConfigured()) {
            fallbackAnswer = claudeAgentService.queryWithContext(question, "No specific CIM graph context available.");
        } else {
            fallbackAnswer = ollamaService.simpleQuery(question);
        }

        return GraphRAGResponse.builder()
                .answer(fallbackAnswer)
                .question(question)
                .graphContext("No relevant data found in knowledge graph")
                .sources(List.of())
                .triplesRetrieved(0)
                .executionTimeMs(System.currentTimeMillis() - startTime)
                .llmModel(modelUsed)
                .confidence(0.3)
                .build();
    }

    /**
     * Class-level counts for the whole graph.
     *
     * The entity listings that follow in the context are a retrieved sample capped by
     * max-triples, and the LLM has no way to tell a sample from a complete set. Without
     * these totals it reports the sample size as the answer, which is how "how many
     * busbar sections" came back as 9 for a graph that holds 292.
     */
    private String buildInventoryContext() {
        String sparql = """
            PREFIX cim: <%s>
            SELECT ?class (COUNT(DISTINCT ?entity) AS ?count) WHERE {
                ?entity a ?class .
                FILTER(STRSTARTS(STR(?class), "%s"))
            }
            GROUP BY ?class
            ORDER BY DESC(?count)
            """.formatted(cimNamespace, cimNamespace);

        try {
            List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
            if (rows.isEmpty()) {
                return "";
            }

            StringBuilder ctx = new StringBuilder();
            ctx.append("## Graph Inventory (authoritative totals for the ENTIRE knowledge graph)\n");
            ctx.append("These counts come from a COUNT over the full graph. Use them verbatim for any\n");
            ctx.append("\"how many\" or \"list all\" question. Everything below this block is a partial\n");
            ctx.append("sample: never report the number of entities shown there as a total.\n");
            for (Map<String, String> row : rows) {
                String className = simplifyClassUri(row.get("class"));
                String count = stripLiteralSuffix(row.get("count"));
                if (className != null && count != null) {
                    ctx.append(String.format("- %s: %s%n", className, count));
                }
            }
            ctx.append("\n");
            return ctx.toString();
        } catch (Exception e) {
            log.warn("SPARQL inventory query failed: {}", e.getMessage());
            return "";
        }
    }

    private String simplifyClassUri(String uri) {
        if (uri == null) return null;
        int split = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
        return (split >= 0 && split < uri.length() - 1) ? uri.substring(split + 1) : uri;
    }

    private String stripLiteralSuffix(String rawValue) {
        if (rawValue == null) return null;
        return rawValue.replaceAll("\\^\\^.*", "").replace("\"", "").trim();
    }

    private String buildSparqlContext(String question) {
        String q = question.toLowerCase();
        StringBuilder ctx = new StringBuilder();

        boolean wantsGenerators = q.contains("generat") || q.contains("power plant") || q.contains("capacity");
        boolean wantsLoads = q.contains("load") || q.contains("consum") || q.contains("charge");
        boolean wantsLines = q.contains("line") || q.contains("transmission") || q.contains("ligne");
        boolean wantsSubstations = q.contains("substation") || q.contains("poste") || q.contains("umspann");
        boolean wantsTransformers = q.contains("transform");
        // wantsAll only when NO specific type is mentioned - prevents fetching all categories for e.g. "total generation"
        boolean specificTypeDetected = wantsGenerators || wantsLoads || wantsLines || wantsSubstations || wantsTransformers;
        boolean wantsAll = !specificTypeDetected &&
                           (q.contains("all") || q.contains("total") || q.contains("every") ||
                            q.contains("how many") || q.contains("count") || q.contains("list"));

        if (wantsGenerators || wantsAll) {
            String sparql = """
                PREFIX cim: <%s>
                SELECT ?name ?maxP ?minP WHERE {
                    ?g a cim:GeneratingUnit .
                    ?g cim:IdentifiedObject.name ?name .
                    OPTIONAL { ?g cim:GeneratingUnit.maxOperatingP ?maxP }
                    OPTIONAL { ?g cim:GeneratingUnit.minOperatingP ?minP }
                }
                ORDER BY ?name
                """.formatted(cimNamespace);
            try {
                List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
                if (!rows.isEmpty()) {
                    ctx.append("## All Generating Units (from SPARQL)\n");
                    double total = 0;
                    for (Map<String, String> row : rows) {
                        String name = row.getOrDefault("name", "?");
                        String maxP = row.getOrDefault("maxP", "?");
                        String minP = row.getOrDefault("minP", "?");
                        ctx.append(String.format("- %s | maxOperatingP=%s MW | minOperatingP=%s MW\n", name, maxP, minP));
                        try { total += Double.parseDouble(maxP); } catch (NumberFormatException ignored) {}
                    }
                    ctx.append(String.format("**Total max generation capacity: %.1f MW (%d units)**\n\n", total, rows.size()));
                }
            } catch (Exception e) {
                log.warn("SPARQL generator query failed: {}", e.getMessage());
            }
        }

        if (wantsLoads || wantsAll) {
            String sparql = """
                PREFIX cim: <%s>
                SELECT ?name ?p ?q WHERE {
                    ?l a cim:EnergyConsumer .
                    ?l cim:IdentifiedObject.name ?name .
                    OPTIONAL { ?l cim:EnergyConsumer.p ?p }
                    OPTIONAL { ?l cim:EnergyConsumer.q ?q }
                }
                ORDER BY ?name
                """.formatted(cimNamespace);
            try {
                List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
                if (!rows.isEmpty()) {
                    ctx.append("## All Loads / Energy Consumers (from SPARQL)\n");
                    double total = 0;
                    for (Map<String, String> row : rows) {
                        String name = row.getOrDefault("name", "?");
                        String pMw = row.getOrDefault("p", "?");
                        String qMvar = row.getOrDefault("q", "?");
                        ctx.append(String.format("- %s | p=%s MW | q=%s MVAr\n", name, pMw, qMvar));
                        try { total += Double.parseDouble(pMw); } catch (NumberFormatException ignored) {}
                    }
                    ctx.append(String.format("**Total load: %.1f MW (%d consumers)**\n\n", total, rows.size()));
                }
            } catch (Exception e) {
                log.warn("SPARQL load query failed: {}", e.getMessage());
            }
        }

        if (wantsLines || wantsAll) {
            String sparql = """
                PREFIX cim: <%s>
                SELECT ?name ?r ?x ?length WHERE {
                    ?l a cim:ACLineSegment .
                    ?l cim:IdentifiedObject.name ?name .
                    OPTIONAL { ?l cim:ACLineSegment.r ?r }
                    OPTIONAL { ?l cim:ACLineSegment.x ?x }
                    OPTIONAL { ?l cim:Conductor.length ?length }
                }
                ORDER BY ?name
                """.formatted(cimNamespace);
            try {
                List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
                if (!rows.isEmpty()) {
                    ctx.append("## All AC Line Segments (from SPARQL)\n");
                    for (Map<String, String> row : rows) {
                        String name = row.getOrDefault("name", "?");
                        String r = row.getOrDefault("r", "?");
                        String x = row.getOrDefault("x", "?");
                        String len = row.getOrDefault("length", "?");
                        ctx.append(String.format("- %s | r=%s Ω | x=%s Ω | length=%s km\n", name, r, x, len));
                    }
                    ctx.append(String.format("**Total: %d transmission lines**\n\n", rows.size()));
                }
            } catch (Exception e) {
                log.warn("SPARQL line query failed: {}", e.getMessage());
            }
        }

        if (wantsSubstations || wantsAll) {
            String sparql = """
                PREFIX cim: <%s>
                SELECT ?name WHERE {
                    ?s a cim:Substation .
                    ?s cim:IdentifiedObject.name ?name .
                }
                ORDER BY ?name
                """.formatted(cimNamespace);
            try {
                List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
                if (!rows.isEmpty()) {
                    ctx.append("## All Substations (from SPARQL)\n");
                    for (Map<String, String> row : rows) {
                        ctx.append(String.format("- %s\n", row.getOrDefault("name", "?")));
                    }
                    ctx.append(String.format("**Total: %d substations**\n\n", rows.size()));
                }
            } catch (Exception e) {
                log.warn("SPARQL substation query failed: {}", e.getMessage());
            }
        }

        if (wantsTransformers || wantsAll) {
            String sparql = """
                PREFIX cim: <%s>
                SELECT ?name WHERE {
                    ?t a cim:PowerTransformer .
                    ?t cim:IdentifiedObject.name ?name .
                }
                ORDER BY ?name
                """.formatted(cimNamespace);
            try {
                List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
                if (!rows.isEmpty()) {
                    ctx.append("## All Power Transformers (from SPARQL)\n");
                    for (Map<String, String> row : rows) {
                        ctx.append(String.format("- %s\n", row.getOrDefault("name", "?")));
                    }
                    ctx.append(String.format("**Total: %d transformers**\n\n", rows.size()));
                }
            } catch (Exception e) {
                log.warn("SPARQL transformer query failed: {}", e.getMessage());
            }
        }

        return ctx.toString();
    }

    private boolean isLoadFlowRequest(String question) {
        String lowerQuestion = question.toLowerCase();
        return lowerQuestion.contains("load flow") ||
               lowerQuestion.contains("loadflow") ||
               lowerQuestion.contains("power flow") ||
               lowerQuestion.contains("powerflow") ||
               (lowerQuestion.contains("calculate") && lowerQuestion.contains("flow")) ||
               (lowerQuestion.contains("calcul") && lowerQuestion.contains("flux")) ||
               lowerQuestion.contains("voltage at") ||
               lowerQuestion.contains("tension à") ||
               lowerQuestion.contains("tension au") ||
               (lowerQuestion.contains("bus") && (lowerQuestion.contains("voltage") || lowerQuestion.contains("tension"))) ||
               (lowerQuestion.contains("voltage") && lowerQuestion.contains("bus")) ||
               (lowerQuestion.contains("tension") && (lowerQuestion.contains("bus") || lowerQuestion.contains("noeud")));
    }

    private String extractTargetBus(String question) {
        String lowerQuestion = question.toLowerCase();
        String extractedBus = null;

        // Priority 1: Standalone bus ID (e.g., "BUS_CENTRAL_400", "BUS_1", "BUS_2_CN")
        java.util.regex.Pattern pattern3b = java.util.regex.Pattern.compile(
            "\\b(BUS_[\\w_\\-]+(?:_CN)?)\\b",
            java.util.regex.Pattern.CASE_INSENSITIVE
        );
        java.util.regex.Matcher matcher3b = pattern3b.matcher(question);
        if (matcher3b.find()) {
            extractedBus = matcher3b.group(1).trim();
            log.debug("Extracted bus from pattern 3b (explicit BUS_ID): {}", extractedBus);
        }

        // Priority 2: "busBUS_X" pattern (no space between keyword and ID)
        if (extractedBus == null) {
            java.util.regex.Pattern pattern3a = java.util.regex.Pattern.compile(
                "(?:bus|noeud|node)(BUS_[\\w_\\-]+(?:_CN)?)",
                java.util.regex.Pattern.CASE_INSENSITIVE
            );
            java.util.regex.Matcher matcher3a = pattern3a.matcher(question);
            if (matcher3a.find()) {
                extractedBus = matcher3a.group(1).trim();
                log.debug("Extracted bus from pattern 3a (no space): {}", extractedBus);
            }
        }

        if (extractedBus == null) {
            java.util.regex.Pattern pattern1 = java.util.regex.Pattern.compile(
                "(?:at|au)\\s+(?:bus|noeud|node)?\\s*[\"']?([\\w_\\-]+)[\"']?",
                java.util.regex.Pattern.CASE_INSENSITIVE
            );
            java.util.regex.Matcher matcher1 = pattern1.matcher(question);
            if (matcher1.find()) {
                String candidate = matcher1.group(1).trim();
                if (!isCommonWord(candidate)) {
                    extractedBus = candidate;
                    log.debug("Extracted bus from pattern 1: {}", extractedBus);
                }
            }
        }

        if (extractedBus == null) {
            java.util.regex.Pattern pattern1b = java.util.regex.Pattern.compile(
                "(?:at|au)\\s+(?:bus|noeud|node)([\\w_\\-]+)",
                java.util.regex.Pattern.CASE_INSENSITIVE
            );
            java.util.regex.Matcher matcher1b = pattern1b.matcher(question);
            if (matcher1b.find()) {
                String candidate = matcher1b.group(1).trim();
                if (!isCommonWord(candidate)) {
                    extractedBus = candidate;
                    log.debug("Extracted bus from pattern 1b (no space): {}", extractedBus);
                }
            }
        }

        if (extractedBus == null) {
            java.util.regex.Pattern pattern2 = java.util.regex.Pattern.compile(
                "(?:voltage|tension)\\s+(?:at|à|au|of|de)?\\s*(?:bus|noeud|node)?\\s*[\"']?([\\w_\\-]+(?:\\s+\\d+kV)?)[\"']?",
                java.util.regex.Pattern.CASE_INSENSITIVE
            );
            java.util.regex.Matcher matcher2 = pattern2.matcher(question);
            if (matcher2.find()) {
                extractedBus = matcher2.group(1).trim();
                log.debug("Extracted bus from pattern 2: {}", extractedBus);
            }
        }

        if (extractedBus == null) {
            java.util.regex.Pattern pattern2b = java.util.regex.Pattern.compile(
                "(?:voltage|tension)\\s+(?:at|à|au|of|de)?\\s+(?:bus|noeud|node)(?:\\s+)?([\\w_\\-]+)",
                java.util.regex.Pattern.CASE_INSENSITIVE
            );
            java.util.regex.Matcher matcher2b = pattern2b.matcher(question);
            if (matcher2b.find()) {
                extractedBus = matcher2b.group(1).trim();
                log.debug("Extracted bus from pattern 2b: {}", extractedBus);
            }
        }

        if (extractedBus == null) {
            java.util.regex.Pattern pattern4 = java.util.regex.Pattern.compile(
                "bus\\s+(\\d+)",
                java.util.regex.Pattern.CASE_INSENSITIVE
            );
            java.util.regex.Matcher matcher4 = pattern4.matcher(question);
            if (matcher4.find()) {
                extractedBus = "BUS_" + matcher4.group(1);
                log.debug("Extracted bus from pattern 4: {}", extractedBus);
            }
        }

        if (extractedBus != null && !extractedBus.isEmpty()) {
            if (isCommonWord(extractedBus)) {
                log.debug("Ignoring common word '{}' as bus ID", extractedBus);
                extractedBus = null;
            } else {
                String foundBusId = findBusInGraph(extractedBus);
                if (foundBusId != null) {
                    log.info("Found bus in graph: {} (extracted: {})", foundBusId, extractedBus);
                    return foundBusId;
                } else {
                    log.warn("Bus '{}' not found in graph, will try with original ID", extractedBus);
                    return normalizeBusId(extractedBus);
                }
            }
        }

        // Fallback: try matching known NRW city names to construct bus IDs
        String[] nrwCities = {"düsseldorf", "dusseldorf", "koln", "köln", "cologne", "essen",
                              "dortmund", "duisburg", "bonn", "aachen", "münster", "munster",
                              "bielefeld", "paderborn", "wuppertal", "hamm", "neuss", "wesel",
                              "brauweiler", "neurath", "niederaussem", "weisweiler"};
        for (String city : nrwCities) {
            if (lowerQuestion.contains(city)) {
                String cityBusId;
                if (lowerQuestion.contains("380")) {
                    cityBusId = "BUS_" + city.toUpperCase().replace("Ü", "U").replace("Ö", "O") + "_380";
                } else if (lowerQuestion.contains("220")) {
                    cityBusId = "BUS_" + city.toUpperCase().replace("Ü", "U").replace("Ö", "O") + "_220";
                } else if (lowerQuestion.contains("110")) {
                    cityBusId = "BUS_" + city.toUpperCase().replace("Ü", "U").replace("Ö", "O") + "_110";
                } else {
                    cityBusId = "BUS_" + city.toUpperCase().replace("Ü", "U").replace("Ö", "O") + "_220";
                }

                String foundBusId = findBusInGraph(cityBusId);
                if (foundBusId != null) {
                    return foundBusId;
                }
                return cityBusId;
            }
        }

        return null;
    }

    private String findBusInGraph(String busIdentifier) {
        try {
            String normalizedId = normalizeBusId(busIdentifier);

            String query = """
                PREFIX cim: <%s>
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

                SELECT DISTINCT ?node ?name
                WHERE {
                    { ?node rdf:type cim:TopologicalNode }
                    UNION
                    { ?node rdf:type cim:ConnectivityNode }
                    UNION
                    { ?node rdf:type cim:BusbarSection }
                    OPTIONAL { ?node cim:IdentifiedObject.name ?name }
                }
                """.formatted(cimNamespace);

            List<Map<String, String>> results = jenaService.executeSparqlSelect(query);

            for (Map<String, String> result : results) {
                String nodeUri = result.get("node");
                String name = result.get("name");

                if (nodeUri != null) {
                    String localName = nodeUri.substring(nodeUri.lastIndexOf("/") + 1);
                    String busId = normalizeBusId(localName);

                    if (busId.equalsIgnoreCase(normalizedId)) {
                        log.debug("Found exact bus match: {}", busId);
                        return busId;
                    }

                    if (busId.toLowerCase().contains(normalizedId.toLowerCase()) ||
                        normalizedId.toLowerCase().contains(busId.toLowerCase())) {
                        log.debug("Found partial bus match: {} (searched: {})", busId, normalizedId);
                        return busId;
                    }

                    if (name != null && (name.toLowerCase().contains(normalizedId.toLowerCase()) ||
                        normalizedId.toLowerCase().contains(name.toLowerCase()))) {
                        log.debug("Found bus by name match: {} (name: {}, searched: {})", busId, name, normalizedId);
                        return busId;
                    }
                }
            }

            log.debug("Bus '{}' not found in graph", busIdentifier);
            return null;

        } catch (Exception e) {
            log.warn("Error searching for bus in graph: {}", e.getMessage());
            return null;
        }
    }

    private boolean isCommonWord(String word) {
        if (word == null || word.isEmpty()) {
            return true;
        }

        String lower = word.toLowerCase();
        String[] commonWords = {
            "the", "network", "entire", "whole", "all", "this", "that", "these", "those",
            "a", "an", "for", "of", "to", "in", "on", "at", "by", "with", "from",
            "le", "la", "les", "un", "une", "des", "du", "de", "pour", "avec"
        };

        for (String common : commonWords) {
            if (lower.equals(common)) {
                return true;
            }
        }

        // Too short and doesn't look like a bus ID
        if (word.length() < 3 && !word.toUpperCase().startsWith("BUS_")) {
            return true;
        }

        return false;
    }

    private String normalizeBusId(String busId) {
        if (busId == null || busId.isEmpty()) {
            return busId;
        }

        String normalized = busId.endsWith("_CN") ? busId.substring(0, busId.length() - 3) : busId;

        if (!normalized.toUpperCase().startsWith("BUS_")) {
            if (normalized.matches("\\d+")) {
                normalized = "BUS_" + normalized;
            }
        }

        return normalized.toUpperCase();
    }

    private GraphRAGResponse handleLoadFlowRequest(String question, String sessionId, long startTime) {
        try {
            // Primary: semantic search via Qdrant (Python service)
            String targetBusId = loadFlowService.findBusForQuestion(question);

            // Fallback: regex extraction if semantic search unavailable
            if (targetBusId == null) {
                log.info("Semantic bus search unavailable, falling back to regex extraction");
                targetBusId = extractTargetBus(question);
            }

            if (targetBusId != null) {
                log.info("Executing load flow calculation for bus: {} (extracted from question: '{}')", targetBusId, question);
            } else {
                log.info("Executing load flow calculation for entire network (no specific bus found in: '{}')", question);
            }

            // Chat load flow questions are almost always about voltages, and DC power flow
            // holds every magnitude at 1.000 pu by construction, so a DC run answers
            // "what is the voltage at this bus" with a constant. AC is the only method that
            // produces a real magnitude; LoadFlowService still falls back to DC on its own
            // when the pandapower service is down.
            com.cim.semanticgraph.dto.LoadFlowResponse lfResult = targetBusId != null
                    ? loadFlowService.calculateLoadFlow(targetBusId, CalculationMethod.AC_NEWTON_RAPHSON)
                    : loadFlowService.calculateLoadFlow(null, CalculationMethod.AC_NEWTON_RAPHSON);

            StringBuilder answer = new StringBuilder();

            if (targetBusId != null) {
                answer.append("## Load Flow Results for Bus: ").append(targetBusId).append("\n\n");
            } else {
                answer.append("## Load Flow Calculation Results\n\n");
            }

            if (!lfResult.isConverged()) {
                answer.append("**Warning**: Load flow calculation did not converge.\n\n");
            } else {
                answer.append("**Converged** in ").append(lfResult.getIterations())
                      .append(" iterations (").append(lfResult.getExecutionTimeMs()).append(" ms)\n\n");
            }

            if (targetBusId != null && lfResult.getBusResults() != null) {
                final String finalTargetBusId = targetBusId;
                String normalizedTargetId = targetBusId.toUpperCase().replace("_CN", "");
                log.debug("Searching for target bus: {} (normalized: {})", targetBusId, normalizedTargetId);

                var targetBus = lfResult.getBusResults().stream()
                        .filter(b -> {
                            String busId = b.getBusId() != null ? b.getBusId().toUpperCase().replace("_CN", "") : "";
                            String busName = b.getBusName() != null ? b.getBusName().toUpperCase() : "";
                            boolean matches = busId.equals(normalizedTargetId) ||
                                   busId.contains(normalizedTargetId) ||
                                   normalizedTargetId.contains(busId) ||
                                   busName.contains(normalizedTargetId) ||
                                   normalizedTargetId.contains(busName);
                            if (matches) {
                                log.debug("Found matching bus: {} (ID: {}, Name: {})", finalTargetBusId, busId, busName);
                            }
                            return matches;
                        })
                        .findFirst();

                if (targetBus.isPresent()) {
                    var bus = targetBus.get();
                    answer.append("### Target Bus Details: ").append(bus.getBusName() != null ? bus.getBusName() : bus.getBusId()).append("\n\n");
                    answer.append("| Property | Value |\n");
                    answer.append("|----------|-------|\n");
                    answer.append("| **Bus ID** | ").append(bus.getBusId()).append(" |\n");
                    answer.append("| **Name** | ").append(bus.getBusName() != null ? bus.getBusName() : "N/A").append(" |\n");
                    answer.append("| **Type** | ").append(bus.getBusType()).append(" |\n");
                    answer.append("| **Voltage** | ").append(String.format("%.4f pu", bus.getVoltageMagnitude()))
                          .append(" (").append(String.format("%.2f kV", bus.getVoltageKv())).append(") |\n");
                    answer.append("| **Angle** | ").append(String.format("%.2f°", bus.getVoltageAngle())).append(" |\n");
                    answer.append("| **Active Power (P)** | ").append(String.format("%.2f MW", bus.getActivePowerMw())).append(" |\n");
                    answer.append("| **Reactive Power (Q)** | ").append(String.format("%.2f MVAr", bus.getReactivePowerMvar())).append(" |\n");
                    answer.append("| **Generation** | ").append(String.format("%.2f MW / %.2f MVAr", bus.getGenerationMw(), bus.getGenerationMvar())).append(" |\n");
                    answer.append("| **Load** | ").append(String.format("%.2f MW / %.2f MVAr", bus.getLoadMw(), bus.getLoadMvar())).append(" |\n");
                    answer.append("| **Status** | ").append(bus.isWithinLimits() ? "OK" : "Violation").append(" |\n\n");
                } else {
                    answer.append("### Bus Not Found\n\n");
                    answer.append("Bus '").append(targetBusId).append("' was not found in the network.\n\n");
                    answer.append("**Available buses in the network:**\n");
                    lfResult.getBusResults().stream()
                            .limit(10)
                            .forEach(b -> answer.append("- ").append(b.getBusId())
                                    .append(b.getBusName() != null ? " (" + b.getBusName() + ")" : "")
                                    .append("\n"));
                    answer.append("\n");
                }
            }

            if (lfResult.getStatistics() != null) {
                var stats = lfResult.getStatistics();
                answer.append("### System Overview\n");
                answer.append("- **Buses**: ").append(stats.getTotalBuses())
                      .append(" (").append(stats.getPvBuses()).append(" PV, ")
                      .append(stats.getPqBuses()).append(" PQ, ")
                      .append(stats.getSlackBuses()).append(" Slack)\n");
                answer.append("- **Branches**: ").append(stats.getTotalBranches()).append("\n");
                answer.append("- **Generation**: ").append(String.format("%.2f", stats.getTotalGenerationMw()))
                      .append(" MW, ").append(String.format("%.2f", stats.getTotalGenerationMvar())).append(" MVAr\n");
                answer.append("- **Load**: ").append(String.format("%.2f", stats.getTotalLoadMw()))
                      .append(" MW, ").append(String.format("%.2f", stats.getTotalLoadMvar())).append(" MVAr\n");
                answer.append("- **Losses**: ").append(String.format("%.2f", stats.getTotalLossesMw()))
                      .append(" MW (").append(String.format("%.2f", stats.getLossPercentage())).append("%)\n");
                answer.append("- **Voltage Range**: ").append(String.format("%.3f", stats.getMinVoltagePu()))
                      .append(" to ").append(String.format("%.3f", stats.getMaxVoltagePu())).append(" pu\n\n");
            }

            if (lfResult.getViolations() != null && !lfResult.getViolations().isEmpty()) {
                answer.append("### Violations Detected\n");
                for (var violation : lfResult.getViolations()) {
                    answer.append("- **").append(violation.getType()).append("** (")
                          .append(violation.getSeverity()).append("): ")
                          .append(violation.getDescription()).append("\n");
                }
                answer.append("\n");
            } else {
                answer.append("### No Violations\n");
                answer.append("All voltages and branch loadings are within limits.\n\n");
            }

            if (lfResult.getBusResults() != null && !lfResult.getBusResults().isEmpty()) {
                answer.append("### Bus Voltages (Top 5)\n");
                lfResult.getBusResults().stream()
                        .sorted((a, b) -> Double.compare(b.getVoltageMagnitude(), a.getVoltageMagnitude()))
                        .limit(5)
                        .forEach(bus -> {
                            answer.append("- **").append(bus.getBusName()).append("**: ")
                                  .append(String.format("%.3f pu", bus.getVoltageMagnitude()))
                                  .append(" (").append(String.format("%.2f°", bus.getVoltageAngle())).append(")\n");
                        });
                answer.append("\n");
            }

            GraphRAGResponse response = GraphRAGResponse.builder()
                    .answer(answer.toString())
                    .question(question)
                    .graphContext("Load flow calculation performed on CIM network model")
                    .sources(List.of("Load Flow Solver", "CIM Network Model"))
                    .triplesRetrieved(lfResult.getBusResults() != null ? lfResult.getBusResults().size() : 0)
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .llmModel("Load Flow Calculator")
                    .inferenceUsed(false)
                    .confidence(lfResult.isConverged() ? 0.95 : 0.6)
                    .timestamp(LocalDateTime.now())
                    .build();

            saveChatHistory(sessionId, response);

            return response;

        } catch (Exception e) {
            log.error("Error in load flow calculation", e);
            return GraphRAGResponse.builder()
                    .answer("Error calculating load flow: " + e.getMessage())
                    .question(question)
                    .graphContext("Load flow calculation failed")
                    .sources(List.of())
                    .triplesRetrieved(0)
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .llmModel("Load Flow Calculator")
                    .confidence(0.0)
                    .build();
        }
    }
}
