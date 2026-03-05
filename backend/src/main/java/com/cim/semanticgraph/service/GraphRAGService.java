package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.graphrag.ContextBuilder;
import com.cim.semanticgraph.graphrag.GraphTraverser;
import com.cim.semanticgraph.model.ChatHistory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.rdf.model.Model;
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
    private final EmbeddingService embeddingService;
    private final QdrantService qdrantService;
    private final GraphTraverser graphTraverser;
    private final ContextBuilder contextBuilder;
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

    @Value("${groq.api.model:${ollama.api.model:unknown}}")
    private String llmModel;

    @Value("${cim.namespaces.cim:http://iec.ch/TC57/CIM100#}")
    private String cimNamespace;

    public GraphRAGResponse processQuery(String question, String sessionId) {
        log.info("Processing GraphRAG query: {} for session: {}", question, sessionId);
        long startTime = System.currentTimeMillis();

        try {
            if (isLoadFlowRequest(question)) {
                log.info("Detected load flow calculation request");
                return handleLoadFlowRequest(question, sessionId, startTime);
            }

            log.debug("Step 1: Retrieving relevant entities");
            List<String> relevantEntities = findRelevantEntities(question);

            GraphRAGResponse response;
            if (relevantEntities.isEmpty()) {
                log.warn("No relevant entities found for query");
                response = buildFallbackResponse(question, startTime);
            } else {
                log.debug("Step 2: Retrieving subgraph. Entities: {}, Depth: {}",
                         relevantEntities.size(), maxDepth);
                Model subgraph = retrieveSubgraph(relevantEntities);

                log.debug("Step 3: Building LLM context");
                String graphContext = contextBuilder.buildContext(subgraph, maxTriples);

                log.debug("Step 4: Querying LLM");
                String answer;
                if (groqService.isConfigured()) {
                    log.info("Using Groq API for LLM query");
                    answer = groqService.queryWithContext(question, graphContext);
                } else {
                    log.info("Using Ollama for LLM query (Groq not configured)");
                    answer = ollamaService.queryWithContext(question, graphContext);
                }

                long executionTime = System.currentTimeMillis() - startTime;
                log.info("GraphRAG query completed in {}ms", executionTime);

                response = GraphRAGResponse.builder()
                        .answer(answer)
                        .question(question)
                        .graphContext(graphContext)
                        .sources(relevantEntities)
                        .triplesRetrieved((int) subgraph.size())
                        .executionTimeMs(executionTime)
                        .llmModel(llmModel)
                        .inferenceUsed(true)
                        .confidence(calculateConfidence(relevantEntities.size(), subgraph.size()))
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

            String answer = groqService.isConfigured()
                    ? groqService.analyzeImpact(equipmentId, context)
                    : ollamaService.analyzeImpact(equipmentId, context);

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

            String answer = groqService.isConfigured()
                    ? groqService.verifyConsistency(context.toString())
                    : ollamaService.verifyConsistency(context.toString());

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

    private List<String> findRelevantEntities(String question) {
        log.debug("Finding relevant entities for: {}", question);

        // --- Primary path: Semantic vector search via Qdrant ---
        if (qdrantService.isAvailable() && qdrantService.countPoints() > 0) {
            try {
                float[] queryEmbedding = embeddingService.generateEmbedding(question);
                List<QdrantService.SearchResult> results =
                        qdrantService.search(queryEmbedding, topK, similarityThreshold);

                if (!results.isEmpty()) {
                    List<String> entities = results.stream()
                            .map(QdrantService.SearchResult::getUri)
                            .filter(Objects::nonNull)
                            .distinct()
                            .toList();

                    log.info("Vector search found {} entities (top score: {})",
                            entities.size(),
                            String.format("%.3f", results.get(0).score()));

                    return entities;
                }

                log.warn("Vector search returned no results above threshold {}, falling back to keyword search",
                        similarityThreshold);
            } catch (Exception e) {
                log.warn("Vector search error, falling back to keyword search: {}", e.getMessage());
            }
        } else if (!qdrantService.isAvailable()) {
            log.info("Qdrant not available, using keyword search");
        } else {
            log.info("Qdrant index is empty (run a CIM import to index entities), using keyword search");
        }

        // --- Fallback path: Keyword-based SPARQL search ---
        return findEntitiesByKeywords(question);
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

    private List<String> findEntitiesByKeywords(String question) {
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
                """.formatted(keyword, keyword, topK);
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
                """.formatted(cimNamespace, keyword, topK);
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
        if (entities.size() < topK) {
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
                        """.formatted(cimNamespace, cimType, topK);
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
        log.debug("Retrieving subgraph for {} entities", entityUris.size());

        StringBuilder constructQuery = new StringBuilder();
        constructQuery.append("CONSTRUCT { ?s ?p ?o } WHERE {\n");
        constructQuery.append("  ?s ?p ?o .\n");
        constructQuery.append("  FILTER (\n");

        for (int i = 0; i < entityUris.size(); i++) {
            if (i > 0) constructQuery.append(" || ");
            constructQuery.append(String.format("?s = <%s>", entityUris.get(i)));
        }

        constructQuery.append("\n  )\n}");

        Model subgraph = jenaService.executeSparqlConstruct(constructQuery.toString());
        log.info("Retrieved subgraph with {} triples", subgraph.size());

        return subgraph;
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

    private GraphRAGResponse buildFallbackResponse(String question, long startTime) {
        String fallbackAnswer = groqService.isConfigured()
                ? groqService.simpleQuery(question)
                : ollamaService.simpleQuery(question);

        return GraphRAGResponse.builder()
                .answer(fallbackAnswer)
                .question(question)
                .graphContext("No relevant data found in knowledge graph")
                .sources(List.of())
                .triplesRetrieved(0)
                .executionTimeMs(System.currentTimeMillis() - startTime)
                .llmModel(llmModel)
                .confidence(0.3)
                .build();
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

            com.cim.semanticgraph.dto.LoadFlowResponse lfResult = targetBusId != null
                    ? loadFlowService.calculateLoadFlow(targetBusId)
                    : loadFlowService.calculateLoadFlow();

            StringBuilder answer = new StringBuilder();

            if (targetBusId != null) {
                answer.append("## Load Flow Results for Bus: ").append(targetBusId).append("\n\n");
            } else {
                answer.append("## Load Flow Calculation Results\n\n");
            }

            if (!lfResult.isConverged()) {
                answer.append("⚠️ **Warning**: Load flow calculation did not converge.\n\n");
            } else {
                answer.append("✅ **Converged** in ").append(lfResult.getIterations())
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
                    answer.append("### 🎯 Target Bus Details: ").append(bus.getBusName() != null ? bus.getBusName() : bus.getBusId()).append("\n\n");
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
                    answer.append("| **Status** | ").append(bus.isWithinLimits() ? "✅ OK" : "⚠️ Violation").append(" |\n\n");
                } else {
                    answer.append("### ⚠️ Bus Not Found\n\n");
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
                answer.append("### ⚠️ Violations Detected\n");
                for (var violation : lfResult.getViolations()) {
                    answer.append("- **").append(violation.getType()).append("** (")
                          .append(violation.getSeverity()).append("): ")
                          .append(violation.getDescription()).append("\n");
                }
                answer.append("\n");
            } else {
                answer.append("### ✅ No Violations\n");
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
                    .answer("❌ Error calculating load flow: " + e.getMessage())
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
