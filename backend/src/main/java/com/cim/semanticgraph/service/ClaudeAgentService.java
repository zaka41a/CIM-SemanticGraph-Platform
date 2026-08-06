package com.cim.semanticgraph.service;

import com.cim.semanticgraph.dto.GraphRAGResponse;
import com.cim.semanticgraph.dto.LoadFlowResponse;
import com.cim.semanticgraph.graphrag.ContextBuilder;
import com.cim.semanticgraph.graphrag.GraphTraverser;
import com.cim.semanticgraph.graphrag.RelevanceScorer;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.rdf.model.Model;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

/**
 * ClaudeAgentService - AI Agent powered by Claude Fable 5 with native Tool Calling.
 *
 * Architecture:
 *   Question → Claude (with 5 tools) → Tool loop (max N rounds) → Structured answer
 *
 * Tools:
 *   1. semantic_search    → Qdrant vector search
 *   2. sparql_query       → Apache Fuseki SPARQL endpoint
 *   3. load_flow          → Python pandapower service
 *   4. get_entity_details → Jena triple store
 *   5. graph_traverse     → GraphTraverser subgraph extraction
 *
 * SSE stream events:
 *   {"type":"tool_call",   "tool":"...", "input":{...}}
 *   {"type":"tool_result", "tool":"...", "chars":N}
 *   {"type":"text",        "text":"..."}
 *   {"type":"done",        "sources":[...], "confidence":0.9, "execution_time_ms":1234}
 *   {"type":"error",       "message":"..."}
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClaudeAgentService {

    private final JenaService       jenaService;
    private final EmbeddingService  embeddingService;
    private final QdrantService     qdrantService;
    private final GraphTraverser    graphTraverser;
    private final ContextBuilder    contextBuilder;
    private final RelevanceScorer   relevanceScorer;
    private final LoadFlowService   loadFlowService;

    @Value("${claude.api.key:}")
    private String claudeApiKey;

    @Value("${claude.api.model:claude-fable-5}")
    private String claudeModel;

    @Value("${claude.api.max-tokens:4096}")
    private int maxTokens;

    @Value("${claude.agent.max-tool-rounds:5}")
    private int maxToolRounds;

    @Value("${graphrag.reranking.candidateMultiplier:3}")
    private int candidateMultiplier;

    @Value("${cim.namespaces.cim:http://iec.ch/TC57/CIM100#}")
    private String cimNamespace;

    private WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ─────────────────────────────────────────────────────────────────────
    // System prompt - expert power systems persona
    // ─────────────────────────────────────────────────────────────────────
    private static final String SYSTEM_PROMPT = """
            You are an expert power systems engineer and CIM (Common Information Model) analyst \
            with deep knowledge of IEC 61970/61968 standards.
            You have access to a live CIM Knowledge Graph containing electrical network data: \
            substations, transformers, transmission lines, generators, loads, and their topological connections.

            IMPORTANT - DATA ACCESS RULES:
            - The user message starts with [DATA CONTEXT: ...] giving you the triple count and available CIM types.
            - If triple count > 0, data IS available - you MUST use sparql_query to retrieve it.
            - Base URI for data entities: http://cim-platform.com/network/
            - CIM namespace prefix: cim: = <http://iec.ch/TC57/CIM100#>
            - Common class queries:
              * Substations:       SELECT ?s ?n WHERE { ?s a cim:Substation . ?s cim:IdentifiedObject.name ?n }
              * Lines:             SELECT ?s ?n WHERE { ?s a cim:ACLineSegment . ?s cim:IdentifiedObject.name ?n }
              * Transformers:      SELECT ?s ?n WHERE { ?s a cim:PowerTransformer . ?s cim:IdentifiedObject.name ?n }
              * Generators:        SELECT ?s ?n WHERE { ?s a cim:GeneratingUnit . ?s cim:IdentifiedObject.name ?n }
              * Loads:             SELECT ?s ?n WHERE { ?s a cim:EnergyConsumer . ?s cim:IdentifiedObject.name ?n }
              * Buses/Nodes:       SELECT ?s ?n WHERE { ?s a cim:BusbarSection . ?s cim:IdentifiedObject.name ?n }

            STRATEGY - use tools in this order:
            1. sparql_query      → ALWAYS start here using the class queries above (data IS available if context shows triples > 0)
            2. semantic_search   → find entities by meaning (only if Qdrant is indexed)
            3. get_entity_details → inspect a specific entity URI from SPARQL results
            4. graph_traverse    → explore relationships from an entity URI
            5. load_flow         → ONLY for power flow / voltage / current / thermal calculations

            RULES:
            - Always use PREFIX cim: <http://iec.ch/TC57/CIM100#> and PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            - Always base answers on data actually retrieved from tools - never guess
            - Format responses in clean markdown with tables where appropriate
            - If a SPARQL query returns no results, try a simpler query or different class name
            - Never say "I could not find" without first trying at least 2 different SPARQL queries
            """;

    @PostConstruct
    public void init() {
        this.webClient = WebClient.builder()
                .baseUrl("https://api.anthropic.com")
                .defaultHeader("anthropic-version", "2023-06-01")
                .defaultHeader("content-type", "application/json")
                .codecs(c -> c.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();
        log.info("ClaudeAgentService ready. model={}, configured={}", claudeModel, isConfigured());
    }

    public boolean isConfigured() {
        return claudeApiKey != null && !claudeApiKey.isBlank()
                && !claudeApiKey.equals("your-claude-api-key-here");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Streaming entry point (SSE)
    // ─────────────────────────────────────────────────────────────────────

    public Flux<String> processQueryStreaming(String question, String sessionId) {
        String ctx = buildDataContext();
        return processQueryStreamingWithContext(question, sessionId, ctx);
    }

    private Flux<String> processQueryStreamingWithContext(String question, String sessionId, String dataContext) {
        return Flux.<String>create(sink ->
                Schedulers.boundedElastic().schedule(() -> {
                    try {
                        runAgentLoop(question, dataContext, sink);
                    } catch (Exception e) {
                        log.error("Agent loop fatal error", e);
                        sink.next(sseEvent("error", Map.of("message", e.getMessage())));
                    } finally {
                        sink.complete();
                    }
                })
        );
    }

    /**
     * Queries Fuseki for a triple count + type inventory to give Claude upfront context.
     * Returns null if the graph is empty.
     */
    private String buildDataContext() {
        try {
            List<Map<String, String>> countResult = jenaService.executeSparqlSelect(
                    "SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }");
            long tripleCount = 0;
            if (!countResult.isEmpty()) {
                String raw = countResult.get(0).getOrDefault("n", "0");
                tripleCount = Long.parseLong(raw.replaceAll("[^0-9]", ""));
            }
            if (tripleCount == 0) return null;

            // Quick type inventory
            List<Map<String, String>> types = jenaService.executeSparqlSelect(
                    "PREFIX cim: <" + cimNamespace + "> " +
                    "SELECT ?type (COUNT(?s) AS ?count) WHERE { " +
                    "  ?s a ?type . FILTER(STRSTARTS(STR(?type), \"" + cimNamespace + "\")) " +
                    "} GROUP BY ?type ORDER BY DESC(?count) LIMIT 12");

            StringBuilder ctx = new StringBuilder();
            ctx.append("[DATA CONTEXT: Knowledge graph contains ").append(tripleCount).append(" RDF triples.");
            if (!types.isEmpty()) {
                ctx.append(" CIM entity counts - ");
                types.forEach(t -> {
                    String typeName = localName(t.get("type"));
                    String count    = t.get("count");
                    if (typeName != null && count != null) ctx.append(typeName).append(":").append(count).append(", ");
                });
            }
            ctx.append("Base URI: http://cim-platform.com/network/ - CIM namespace: ").append(cimNamespace).append("]\n\n");
            log.info("Data context built: {} triples, {} types", tripleCount, types.size());
            return ctx.toString();
        } catch (Exception e) {
            log.warn("Could not build data context: {}", e.getMessage());
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Blocking entry point (for existing /ask endpoint)
    // ─────────────────────────────────────────────────────────────────────

    public GraphRAGResponse processQuery(String question, String sessionId) {
        long startTime = System.currentTimeMillis();

        // Pre-flight: check data exists in Fuseki
        String dataContext = buildDataContext();
        if (dataContext == null) {
            log.warn("Knowledge graph is empty - returning no-data response");
            return GraphRAGResponse.builder()
                    .question(question)
                    .answer("The knowledge graph is empty. Please **import CIM data** first via the **Data Import** page, then try again.")
                    .sources(List.of())
                    .confidence(0.0)
                    .executionTimeMs(System.currentTimeMillis() - startTime)
                    .llmModel(claudeModel)
                    .timestamp(LocalDateTime.now())
                    .build();
        }

        List<String> sources   = new ArrayList<>();
        List<String> toolsUsed = new ArrayList<>();
        AtomicReference<String> finalAnswer = new AtomicReference<>("");

        // Collect SSE stream synchronously (with data context injected)
        processQueryStreamingWithContext(question, sessionId, dataContext)
                .doOnNext(event -> {
                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> map = objectMapper.readValue(event, Map.class);
                        String type = (String) map.get("type");
                        if ("text".equals(type) && map.get("text") instanceof String t) {
                            finalAnswer.set(t);
                        } else if ("error".equals(type) && map.get("message") instanceof String m) {
                            log.warn("Agent error event captured: {}", m);
                            finalAnswer.set("Agent error: " + m);
                        } else if ("done".equals(type)) {
                            if (map.get("sources") instanceof List<?> s) {
                                s.forEach(u -> sources.add(String.valueOf(u)));
                            }
                            if (map.get("tools_used") instanceof List<?> t) {
                                t.forEach(u -> toolsUsed.add(String.valueOf(u)));
                            }
                        }
                    } catch (Exception ignored) {}
                })
                .blockLast();

        return GraphRAGResponse.builder()
                .question(question)
                .answer(finalAnswer.get().isBlank()
                        ? "The AI agent completed but produced no answer. Check backend logs for details. " +
                          "Tools used: " + (toolsUsed.isEmpty() ? "none" : String.join(", ", toolsUsed))
                        : finalAnswer.get())
                .sources(sources)
                .confidence(computeConfidence(toolsUsed, sources, finalAnswer.get()))
                .executionTimeMs(System.currentTimeMillis() - startTime)
                .llmModel(claudeModel)
                .timestamp(LocalDateTime.now())
                .build();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Agent loop
    // ─────────────────────────────────────────────────────────────────────

    private void runAgentLoop(String question, String dataContext, reactor.core.publisher.FluxSink<String> sink) {
        long startTime = System.currentTimeMillis();
        List<Map<String, Object>> messages = new ArrayList<>();
        // Prepend data context so Claude knows what data is available before first tool call
        String initialContent = (dataContext != null && !dataContext.isBlank())
                ? dataContext + question
                : question;
        messages.add(Map.of("role", "user", "content", initialContent));

        List<String> usedTools  = new ArrayList<>();
        List<String> sourceUris = new ArrayList<>();
        String finalAnswer      = "";

        for (int round = 0; round < maxToolRounds; round++) {
            log.debug("Agent round {}/{} for: {}", round + 1, maxToolRounds, question);

            Map<String, Object> response = callClaude(messages);
            if (response == null) {
                sink.next(sseEvent("error", Map.of("message", "Claude API unavailable")));
                return;
            }

            String stopReason = (String) response.get("stop_reason");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> content =
                    (List<Map<String, Object>>) response.get("content");
            if (content == null) content = List.of();

            // Collect text and tool uses from this response
            StringBuilder textBuffer  = new StringBuilder();
            List<Map<String, Object>> toolUses = new ArrayList<>();

            for (Map<String, Object> block : content) {
                String type = (String) block.get("type");
                if ("text".equals(type) && block.get("text") instanceof String t) {
                    textBuffer.append(t);
                } else if ("tool_use".equals(type)) {
                    toolUses.add(block);
                }
            }

            // Emit text if present
            String partialText = textBuffer.toString().trim();
            if (!partialText.isEmpty()) {
                finalAnswer = partialText;
                sink.next(sseEvent("text", Map.of("text", partialText)));
            }

            // No tool calls → conversation complete
            if ("end_turn".equals(stopReason) || toolUses.isEmpty()) {
                break;
            }

            // Execute each tool and build tool_result messages
            List<Map<String, Object>> toolResults = new ArrayList<>();
            for (Map<String, Object> toolUse : toolUses) {
                String toolName = (String) toolUse.get("name");
                String toolId   = (String) toolUse.get("id");
                @SuppressWarnings("unchecked")
                Map<String, Object> input = toolUse.get("input") instanceof Map<?,?> m
                        ? (Map<String, Object>) m : Map.of();

                usedTools.add(toolName);
                sink.next(sseEvent("tool_call",
                        Map.of("tool", toolName, "input", sanitizeInput(input))));

                String result = executeTool(toolName, input, sourceUris);
                sink.next(sseEvent("tool_result",
                        Map.of("tool", toolName, "chars", result.length())));

                toolResults.add(Map.of(
                        "type",        "tool_result",
                        "tool_use_id", toolId != null ? toolId : "",
                        "content",     result
                ));
            }

            // Append assistant turn + tool results to conversation
            messages.add(Map.of("role", "assistant", "content", content));
            messages.add(Map.of("role", "user",      "content", toolResults));
        }

        // If all rounds exhausted without a text answer, force final synthesis
        if (finalAnswer.isEmpty() && !usedTools.isEmpty()) {
            log.info("No text generated after {} tool rounds - forcing synthesis call", usedTools.size());
            messages.add(Map.of("role", "user", "content",
                    "Based on all the tool results above, please provide a clear and comprehensive answer to the original question. " +
                    "If data was found, summarize it. If not, explain what was tried."));
            Map<String, Object> synthResponse = callClaudeNoTools(messages);
            if (synthResponse != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> synthContent =
                        (List<Map<String, Object>>) synthResponse.get("content");
                if (synthContent != null) {
                    for (Map<String, Object> block : synthContent) {
                        if ("text".equals(block.get("type")) && block.get("text") instanceof String t && !t.isBlank()) {
                            finalAnswer = t.trim();
                            sink.next(sseEvent("text", Map.of("text", finalAnswer)));
                            break;
                        }
                    }
                }
            }
        }

        // Emit done
        long elapsed    = System.currentTimeMillis() - startTime;
        double confidence = computeConfidence(usedTools, sourceUris, finalAnswer);
        sink.next(sseEvent("done", Map.of(
                "sources",          sourceUris.stream().distinct().limit(10).toList(),
                "tools_used",       usedTools,
                "confidence",       confidence,
                "execution_time_ms", elapsed
        )));
    }

    // ─────────────────────────────────────────────────────────────────────
    // Claude API call (blocking)
    // ─────────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> callClaude(List<Map<String, Object>> messages) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model",      claudeModel);
            body.put("max_tokens", maxTokens);
            body.put("system",     SYSTEM_PROMPT);
            body.put("tools",      buildTools());
            body.put("messages",   messages);

            String json = webClient.post()
                    .uri("/v1/messages")
                    .header("x-api-key", claudeApiKey)
                    .bodyValue(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, resp ->
                            resp.bodyToMono(String.class)
                                .map(err -> new RuntimeException("Claude API error: " + err)))
                    .bodyToMono(String.class)
                    .block();

            return objectMapper.readValue(json, Map.class);

        } catch (Exception e) {
            log.error("Claude API call failed: {}", e.getMessage());
            return null;
        }
    }

    /** Simple non-agentic Claude call with graph context - used as LLM fallback in GraphRAGService. */
    @SuppressWarnings("unchecked")
    public String queryWithContext(String question, String graphContext) {
        String userMsg = "Context from CIM Knowledge Graph:\n" + graphContext
                + "\n\nQuestion: " + question;
        List<Map<String, Object>> messages = List.of(Map.of("role", "user", "content", userMsg));
        Map<String, Object> response = callClaudeNoTools(messages);
        if (response == null) return "Claude API call failed.";
        List<Map<String, Object>> content = (List<Map<String, Object>>) response.get("content");
        if (content == null || content.isEmpty()) return "No response from Claude.";
        return content.stream()
                .filter(b -> "text".equals(b.get("type")))
                .map(b -> (String) b.get("text"))
                .findFirst().orElse("No text response from Claude.");
    }

    /** Call Claude with no tools - forces a plain text response. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> callClaudeNoTools(List<Map<String, Object>> messages) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model",      claudeModel);
            body.put("max_tokens", maxTokens);
            body.put("system",     SYSTEM_PROMPT);
            body.put("messages",   messages);
            // Deliberately no "tools" key → text-only response

            String json = webClient.post()
                    .uri("/v1/messages")
                    .header("x-api-key", claudeApiKey)
                    .bodyValue(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, resp ->
                            resp.bodyToMono(String.class)
                                .map(err -> new RuntimeException("Claude API error (no-tools): " + err)))
                    .bodyToMono(String.class)
                    .block();

            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            log.error("Claude no-tools call failed: {}", e.getMessage());
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Tool execution dispatcher
    // ─────────────────────────────────────────────────────────────────────

    private String executeTool(String name, Map<String, Object> input, List<String> sourceUris) {
        try {
            return switch (name) {
                case "semantic_search"    -> toolSemanticSearch(input, sourceUris);
                case "sparql_query"       -> toolSparqlQuery(input, sourceUris);
                case "load_flow"          -> toolLoadFlow(input);
                case "get_entity_details" -> toolGetEntityDetails(input, sourceUris);
                case "graph_traverse"     -> toolGraphTraverse(input, sourceUris);
                default -> "Unknown tool: " + name;
            };
        } catch (Exception e) {
            log.warn("Tool '{}' failed: {}", name, e.getMessage());
            return "Tool execution error: " + e.getMessage();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Tool implementations
    // ─────────────────────────────────────────────────────────────────────

    private String toolSemanticSearch(Map<String, Object> input, List<String> sourceUris) {
        String query = stringParam(input, "query");
        if (query.isBlank()) return "Error: 'query' parameter is required.";

        if (!qdrantService.isAvailable() || qdrantService.countPoints() == 0) {
            return "Vector search not available - no entities indexed in Qdrant. " +
                   "Try importing CIM data first, or use sparql_query instead.";
        }

        float[] embedding = embeddingService.generateEmbedding(query);
        int resultLimit = 10;
        int candidateLimit = resultLimit * Math.max(1, candidateMultiplier);
        List<QdrantService.SearchResult> candidates = qdrantService.search(embedding, candidateLimit, 0.30);

        if (candidates.isEmpty()) {
            return "No entities found semantically similar to: \"" + query + "\"";
        }

        List<RelevanceScorer.Candidate> scoringCandidates = new ArrayList<>();
        for (int i = 0; i < candidates.size(); i++) {
            QdrantService.SearchResult result = candidates.get(i);
            scoringCandidates.add(new RelevanceScorer.Candidate(
                    result.getUri(),
                    result.getLabel(),
                    result.getCimType(),
                    result.getText(),
                    result.score(),
                    i + 1,
                    0
            ));
        }
        List<RelevanceScorer.RankedCandidate> hits = relevanceScorer.rankResults(
                query,
                scoringCandidates,
                resultLimit
        );

        StringBuilder sb = new StringBuilder();
        sb.append("Found ").append(hits.size()).append(" semantically similar entities:\n\n");
        for (RelevanceScorer.RankedCandidate hit : hits) {
            RelevanceScorer.Candidate r = hit.candidate();
            String uri = r.uri();
            if (uri != null) sourceUris.add(uri);
            sb.append(String.format("- [relevance=%.3f] %s (type=%s)\n  URI: %s\n",
                    hit.score(),
                    r.label().isBlank() ? "unnamed" : r.label(),
                    r.type().isBlank() ? "unknown" : r.type(),
                    uri != null ? uri : "n/a"));
        }
        return sb.toString();
    }

    private String toolSparqlQuery(Map<String, Object> input, List<String> sourceUris) {
        String sparql = stringParam(input, "sparql");
        if (sparql.isBlank()) return "Error: 'sparql' parameter is required.";

        // Security: only SELECT allowed
        String upper = sparql.trim().toUpperCase();
        if (!upper.contains("SELECT")) {
            return "Security error: only SPARQL SELECT queries are allowed.";
        }
        if (upper.contains("DROP") || upper.contains("DELETE") ||
                upper.contains("INSERT") || upper.contains("CLEAR")) {
            return "Security error: write operations are not permitted.";
        }

        // Auto-add LIMIT if missing
        if (!upper.contains("LIMIT")) {
            sparql = sparql.trim() + "\nLIMIT 100";
        }

        List<Map<String, String>> rows = jenaService.executeSparqlSelect(sparql);
        if (rows.isEmpty()) return "Query returned no results.";

        StringBuilder sb = new StringBuilder();
        sb.append("Query returned ").append(rows.size()).append(" row(s):\n\n");

        // Header
        Set<String> cols = rows.get(0).keySet();
        sb.append(String.join(" | ", cols)).append("\n");
        sb.append("─".repeat(Math.min(cols.stream().mapToInt(String::length).sum() * 2, 80))).append("\n");

        for (Map<String, String> row : rows) {
            sb.append(String.join(" | ", row.values())).append("\n");
            row.values().stream()
                    .filter(v -> v != null && (v.startsWith("http://") || v.startsWith("https://")))
                    .forEach(sourceUris::add);
        }
        return sb.toString();
    }

    private String toolLoadFlow(Map<String, Object> input) {
        String busId = input.get("bus_id") instanceof String s ? s.strip() : null;

        LoadFlowResponse r = busId != null && !busId.isBlank()
                ? loadFlowService.calculateLoadFlow(busId)
                : loadFlowService.calculateLoadFlow();

        if (r == null) return "Load flow calculation failed or service unavailable.";

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("Load flow result: converged=%s, method=%s, iterations=%d\n",
                r.isConverged(), r.getCalculationMethod(), r.getIterations()));

        LoadFlowResponse.SystemStatistics s = r.getStatistics();
        if (s != null) {
            sb.append(String.format("Network: %d buses, %d branches\n",
                    s.getTotalBuses(), s.getTotalBranches()));
            sb.append(String.format("Power: generation=%.2f MW, load=%.2f MW, losses=%.4f MW (%.2f%%)\n",
                    s.getTotalGenerationMw(), s.getTotalLoadMw(),
                    s.getTotalLossesMw(), s.getLossPercentage()));
            sb.append(String.format("Voltage: min=%.4f pu (%s), max=%.4f pu (%s), avg=%.4f pu\n",
                    s.getMinVoltagePu(), s.getMinVoltageBus(),
                    s.getMaxVoltagePu(), s.getMaxVoltageBus(),
                    s.getAvgVoltagePu()));
        }

        if (busId != null && r.getBusResults() != null) {
            r.getBusResults().stream()
                    .filter(b -> busId.equalsIgnoreCase(b.getBusId()))
                    .findFirst()
                    .ifPresent(b -> sb.append(String.format(
                            "\nTarget bus '%s': V=%.4f pu (%.2f kV), angle=%.2f°, " +
                            "P=%.2f MW, Q=%.2f MVAr, within_limits=%s\n",
                            b.getBusId(), b.getVoltageMagnitude(), b.getVoltageKv(),
                            b.getVoltageAngle(), b.getActivePowerMw(),
                            b.getReactivePowerMvar(), b.isWithinLimits())));
        }

        if (r.getViolations() != null && !r.getViolations().isEmpty()) {
            sb.append(String.format("\n%d violation(s):\n", r.getViolations().size()));
            r.getViolations().forEach(v -> sb.append(String.format(
                    "  [%s] %s: actual=%.3f, limit=%.3f\n",
                    v.getSeverity(), v.getDescription(),
                    v.getActualValue(), v.getLimitValue())));
        }

        return sb.toString();
    }

    private String toolGetEntityDetails(Map<String, Object> input, List<String> sourceUris) {
        String uri = stringParam(input, "uri");
        if (uri.isBlank()) return "Error: 'uri' parameter is required.";

        sourceUris.add(uri);
        List<Map<String, String>> triples = jenaService.getResourceTriples(uri);
        if (triples.isEmpty()) return "No data found for URI: " + uri;

        StringBuilder sb = new StringBuilder();
        sb.append("Entity: ").append(uri).append("\n");
        sb.append("Properties (").append(triples.size()).append(" total):\n\n");
        triples.stream().limit(60).forEach(t ->
                sb.append(String.format("  %-35s → %s\n",
                        localName(t.get("p")),
                        truncate(t.get("o"), 120))));
        if (triples.size() > 60) {
            sb.append("  ... (").append(triples.size() - 60).append(" more properties)\n");
        }
        return sb.toString();
    }

    private String toolGraphTraverse(Map<String, Object> input, List<String> sourceUris) {
        String uri = stringParam(input, "uri");
        if (uri.isBlank()) return "Error: 'uri' parameter is required.";

        int depth = input.get("depth") instanceof Number n
                ? Math.min(Math.max(n.intValue(), 1), 3) : 2;

        sourceUris.add(uri);
        Model subgraph = graphTraverser.traverse(uri, depth);

        if (subgraph.isEmpty()) {
            return "No graph data found starting from URI: " + uri;
        }

        String context = contextBuilder.buildContext(subgraph, 300);
        return String.format("Graph traversal from <%s> (depth=%d, %d triples):\n\n%s",
                uri, depth, subgraph.size(), context);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Tool definitions (JSON schemas for Claude)
    // ─────────────────────────────────────────────────────────────────────

    private List<Map<String, Object>> buildTools() {
        return List.of(
            tool("semantic_search",
                "Search for CIM entities semantically similar to a query. " +
                "Returns entity URIs, labels, CIM types, and similarity scores. " +
                "Use this first to discover relevant entities.",
                Map.of("type", "object",
                       "properties", Map.of(
                           "query", Map.of("type", "string",
                               "description", "Natural language search query, e.g. 'transformer 380kV'")
                       ),
                       "required", List.of("query"))),

            tool("sparql_query",
                "Execute a SPARQL SELECT query against the CIM knowledge graph. " +
                "Always use PREFIX cim: <http://iec.ch/TC57/CIM100#> and " +
                "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>",
                Map.of("type", "object",
                       "properties", Map.of(
                           "sparql", Map.of("type", "string",
                               "description", "Valid SPARQL SELECT query with prefixes")
                       ),
                       "required", List.of("sparql"))),

            tool("load_flow",
                "Calculate power flow for the CIM network using pandapower. " +
                "Returns bus voltages, branch flows, losses, and violations. " +
                "Use only for power flow calculations.",
                Map.of("type", "object",
                       "properties", Map.of(
                           "bus_id", Map.of("type", "string",
                               "description", "Optional: specific bus ID to show detailed results for")
                       ))),

            tool("get_entity_details",
                "Get all RDF properties of a specific CIM entity by its URI. " +
                "Use after semantic_search to inspect an entity in depth.",
                Map.of("type", "object",
                       "properties", Map.of(
                           "uri", Map.of("type", "string",
                               "description", "Full CIM entity URI, e.g. http://iec.ch/TC57/CIM100#BusbarSection.1")
                       ),
                       "required", List.of("uri"))),

            tool("graph_traverse",
                "Traverse the knowledge graph starting from an entity, " +
                "exploring its connected entities up to N hops. " +
                "Useful for understanding topology and relationships.",
                Map.of("type", "object",
                       "properties", Map.of(
                           "uri",   Map.of("type", "string",
                               "description", "Starting entity URI"),
                           "depth", Map.of("type", "integer",
                               "description", "Traversal depth 1-3 (default 2)",
                               "minimum", 1, "maximum", 3)
                       ),
                       "required", List.of("uri")))
        );
    }

    private Map<String, Object> tool(String name, String description, Map<String, Object> schema) {
        return Map.of("name", name, "description", description, "input_schema", schema);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    private String sseEvent(String type, Map<String, Object> data) {
        try {
            Map<String, Object> event = new LinkedHashMap<>(data);
            event.put("type", type);
            return objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            return "{\"type\":\"" + type + "\",\"error\":\"serialization failed\"}";
        }
    }

    private Map<String, Object> sanitizeInput(Map<String, Object> input) {
        if (input == null) return Map.of();
        Map<String, Object> safe = new LinkedHashMap<>();
        input.forEach((k, v) -> {
            String s = String.valueOf(v);
            safe.put(k, s.length() > 120 ? s.substring(0, 120) + "…" : s);
        });
        return safe;
    }

    private double computeConfidence(List<String> tools, List<String> sources, String answer) {
        if (answer == null || answer.isBlank()) return 0.0;
        double toolScore   = Math.min(1.0, tools.size()   / 3.0);
        double sourceScore = Math.min(1.0, sources.size() / 5.0);
        return Math.round((toolScore * 0.4 + sourceScore * 0.6) * 100.0) / 100.0;
    }

    private String stringParam(Map<String, Object> input, String key) {
        return input.get(key) instanceof String s ? s.strip() : "";
    }

    private String localName(String uri) {
        if (uri == null) return "";
        int sep = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
        return sep >= 0 && sep < uri.length() - 1 ? uri.substring(sep + 1) : uri;
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }
}
