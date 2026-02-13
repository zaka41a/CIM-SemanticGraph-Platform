package com.cim.semanticgraph.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class GroqService {

    private final RestTemplate restTemplate;

    @Value("${groq.api.base-url:https://api.groq.com/openai/v1}")
    private String baseUrl;

    @Value("${groq.api.key:}")
    private String apiKey;

    @Value("${groq.api.model:llama-3.3-70b-versatile}")
    private String model;

    @Value("${groq.request.temperature:0.7}")
    private double temperature;

    @Value("${groq.request.max-tokens:4096}")
    private int maxTokens;

    @Value("${groq.prompt.system-message:You are an expert assistant for power grid analysis.}")
    private String systemMessage;

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isEmpty() && !apiKey.equals("your-groq-api-key");
    }

    public String queryWithContext(String question, String graphContext) {
        log.info("Querying Groq with context for: {}", question);

        String prompt = """
            Based on the following knowledge graph data about a power system network:

            %s

            Answer this question: %s

            Provide a clear, accurate answer based on the data. If the data doesn't contain enough information, say so.
            Format your response in markdown for readability.
            """.formatted(graphContext, question);

        return chat(systemMessage, prompt);
    }

    public String simpleQuery(String question) {
        log.info("Simple Groq query: {}", question);
        return chat(systemMessage, question);
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

        return chat("You are a SPARQL expert. Return only valid SPARQL queries.", prompt);
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

            Format as markdown.
            """.formatted(equipmentId, connections);

        return chat(systemMessage, prompt);
    }

    public String verifyConsistency(String networkData) {
        log.info("Verifying network consistency");

        String prompt = """
            Verify the consistency of this power network configuration:

            %s

            Check for:
            1. Disconnected equipment
            2. Invalid voltage levels
            3. Missing critical connections
            4. Potential configuration errors

            Provide a detailed consistency report in markdown.
            """.formatted(networkData);

        return chat(systemMessage, prompt);
    }

    @SuppressWarnings("unchecked")
    private String chat(String systemPrompt, String userMessage) {
        if (!isConfigured()) {
            log.warn("Groq API key not configured. Using fallback response.");
            return "Groq API is not configured. Please set GROQ_API_KEY environment variable.\n\n" +
                   "Get your free API key at: https://console.groq.com/keys";
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("temperature", temperature);
            requestBody.put("max_tokens", maxTokens);
            requestBody.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userMessage)
            ));

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

            long startTime = System.currentTimeMillis();
            ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/chat/completions",
                HttpMethod.POST,
                request,
                Map.class
            );
            long duration = System.currentTimeMillis() - startTime;

            log.info("Groq response received in {} ms", duration);

            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (!choices.isEmpty()) {
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                    return (String) message.get("content");
                }
            }

            return "No response from Groq API";

        } catch (Exception e) {
            log.error("Error calling Groq API: {}", e.getMessage(), e);
            return "Error: " + e.getMessage();
        }
    }
}
