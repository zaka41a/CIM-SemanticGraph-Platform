package com.cim.semanticgraph.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class OllamaService {

    @Value("${ollama.api.base-url:http://host.docker.internal:11434}")
    private String ollamaBaseUrl;

    @Value("${ollama.api.model:mistral:latest}")
    private String ollamaModel;

    @Value("${ollama.request.temperature:0.7}")
    private double temperature;

    @Value("${ollama.prompt.system-message:You are an expert assistant for analyzing CIM (Common Information Model) power system data. Provide clear, accurate, and technical responses based on the knowledge graph data provided.}")
    private String systemMessage;

    private final ObjectMapper objectMapper;

    public String queryWithContext(String userQuestion, String graphContext) {
        log.info("Querying Ollama with context. Question: {}", userQuestion);

        try {
            String userPrompt = buildPromptWithContext(userQuestion, graphContext);
            String response = callOllamaApi(userPrompt);
            log.info("Ollama response received successfully");
            return response;
        } catch (Exception e) {
            log.error("Error querying Ollama API", e);
            throw new RuntimeException("Ollama API call failed: " + e.getMessage(), e);
        }
    }

    public String simpleQuery(String question) {
        log.info("Simple Ollama query: {}", question);
        return callOllamaApi(question);
    }

    private String callOllamaApi(String userMessage) {
        WebClient webClient = WebClient.builder()
            .baseUrl(ollamaBaseUrl)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", ollamaModel);
        requestBody.put("prompt", userMessage);
        requestBody.put("stream", false);

        Map<String, Object> options = new HashMap<>();
        options.put("temperature", temperature);
        requestBody.put("options", options);

        requestBody.put("system", systemMessage);

        try {
            log.debug("Calling Ollama API with model: {}", ollamaModel);

            String responseJson = webClient.post()
                .uri("/api/generate")
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(String.class)
                .block();

            JsonNode root = objectMapper.readTree(responseJson);
            String responseText = root.path("response").asText();

            log.debug("Ollama response length: {} characters", responseText.length());
            return responseText;

        } catch (Exception e) {
            log.error("Ollama API call failed", e);
            throw new RuntimeException("Failed to call Ollama API: " + e.getMessage() +
                ". Make sure Ollama is running on " + ollamaBaseUrl, e);
        }
    }

    private String buildPromptWithContext(String question, String graphContext) {
        return """
            Here is relevant information from the CIM Knowledge Graph:

            %s

            Based on this knowledge graph data, please answer the following question:

            %s

            Provide a clear, accurate answer based on the graph data. Reference specific equipment IDs
            or resource URIs when relevant. If the graph data doesn't contain enough information to
            answer the question fully, clearly state what information is missing.
            """.formatted(graphContext, question);
    }

    public String explainSparqlResults(String sparqlQuery, String results, String userQuestion) {
        log.info("Generating explanation for SPARQL results");

        String prompt = """
            A user asked: "%s"

            This SPARQL query was executed:
            ```sparql
            %s
            ```

            The query returned these results:
            %s

            Please provide a clear, natural language explanation of these results that answers
            the user's question. Include:
            1. A direct answer to their question
            2. Key insights from the data
            3. Any notable patterns or relationships
            4. Recommendations if applicable
            """.formatted(userQuestion, sparqlQuery, results);

        return simpleQuery(prompt);
    }

    public String generateSparqlFromNaturalLanguage(String naturalLanguageQuery, String schemaInfo) {
        log.info("Generating SPARQL from natural language");

        String prompt = """
            You are a SPARQL query expert for CIM (Common Information Model) power systems data.

            CIM Schema Information:
            %s

            User Question: "%s"

            Generate a SPARQL query that answers this question. Return ONLY the SPARQL query,
            no explanation or additional text. Use standard CIM prefixes:
            - cim: for CIM classes and properties
            - rdf: for RDF types
            - rdfs: for RDFS labels

            The query should be efficient and return relevant results.
            """.formatted(schemaInfo, naturalLanguageQuery);

        return simpleQuery(prompt);
    }

    public String analyzeImpact(String equipmentId, String connections) {
        log.info("Analyzing impact for equipment: {}", equipmentId);

        String prompt = """
            Analyze the potential impact of a failure in this power system equipment:

            Equipment ID: %s

            Connected Equipment and Dependencies:
            %s

            Provide:
            1. Critical components that would be affected
            2. Severity assessment (Critical/High/Medium/Low)
            3. Recommended mitigation actions
            4. Priority of response
            """.formatted(equipmentId, connections);

        return simpleQuery(prompt);
    }

    public String verifyConsistency(String networkData) {
        log.info("Verifying network consistency");

        String prompt = """
            Analyze this power network configuration for consistency and potential issues:

            %s

            Check for:
            1. Configuration inconsistencies
            2. Missing required connections
            3. Voltage level mismatches
            4. Isolated equipment
            5. Redundancy issues

            Provide a structured report with findings and recommendations.
            """.formatted(networkData);

        return simpleQuery(prompt);
    }

    public boolean healthCheck() {
        try {
            log.debug("Performing Ollama API health check");
            String response = simpleQuery("Hello");
            return response != null && !response.isEmpty();
        } catch (Exception e) {
            log.error("Ollama API health check failed", e);
            return false;
        }
    }
}
