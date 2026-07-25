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

    @Value("${llm.default-provider:gpt5}")
    private String defaultProvider;

    // KI Connect NRW (gpt-5.5)
    @Value("${kiconnect.api.base-url:https://chat.kiconnect.nrw/api/v1}")
    private String kiBaseUrl;
    @Value("${kiconnect.api.key:}")
    private String kiKey;
    @Value("${kiconnect.api.model:gpt-5.5}")
    private String kiModel;

    // Groq (llama)
    @Value("${groq.api.base-url:https://api.groq.com/openai/v1}")
    private String groqBaseUrl;
    @Value("${groq.api.key:}")
    private String groqKey;
    @Value("${groq.api.model:llama-3.3-70b-versatile}")
    private String groqModel;

    @Value("${groq.request.temperature:0.7}")
    private double temperature;

    @Value("${groq.request.max-tokens:4096}")
    private int maxTokens;

    @Value("${groq.prompt.system-message:You are an expert assistant for power grid analysis.}")
    private String systemMessage;

    /** Resolved configuration for one OpenAI-compatible provider. */
    private record ProviderCfg(String id, String label, String baseUrl, String key, String model,
                               boolean supportsCustomTemperature) {
        boolean configured() {
            return key != null && !key.isBlank() && !key.startsWith("your-");
        }
    }

    private ProviderCfg resolve(String provider) {
        String p = (provider == null || provider.isBlank()) ? defaultProvider : provider;
        if ("groq".equalsIgnoreCase(p)) {
            return new ProviderCfg("groq", "Groq (" + groqModel + ")", groqBaseUrl, groqKey, groqModel, true);
        }
        // default: KI Connect gpt-5.5 (accepts "gpt5" or "kiconnect").
        // GPT-5.5 only accepts the default temperature, so custom values are not sent.
        return new ProviderCfg("gpt5", "GPT-5.5 (KI Connect NRW)", kiBaseUrl, kiKey, kiModel, false);
    }

    /** True if the given provider (or the default when null) has a usable API key. */
    public boolean isConfigured(String provider) {
        return resolve(provider).configured();
    }

    /** The model id for the given provider (or the default when null). */
    public String modelFor(String provider) {
        return resolve(provider).model();
    }

    public boolean isConfigured() {
        return isConfigured(null);
    }

    /** Providers exposed to the UI selector, with their availability. */
    public List<Map<String, Object>> availableProviders() {
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (String id : List.of("gpt5", "groq")) {
            ProviderCfg c = resolve(id);
            out.add(Map.of(
                "id", c.id(),
                "label", c.label(),
                "model", c.model(),
                "available", c.configured(),
                "isDefault", c.id().equalsIgnoreCase(resolve(null).id())
            ));
        }
        return out;
    }

    public String queryWithContext(String question, String graphContext) {
        return queryWithContext(question, graphContext, null);
    }

    public String queryWithContext(String question, String graphContext, String provider) {
        log.info("Querying LLM provider '{}' with context for: {}", resolve(provider).id(), question);

        String prompt = """
            Based on the following knowledge graph data about a power system network:

            %s

            Answer this question: %s

            Provide a clear, accurate answer based on the data. If the data doesn't contain enough information, say so.
            Format your response in markdown for readability.
            """.formatted(graphContext, question);

        return chat(systemMessage, prompt, provider);
    }

    public String simpleQuery(String question) {
        return simpleQuery(question, null);
    }

    public String simpleQuery(String question, String provider) {
        log.info("Simple LLM query ({}): {}", resolve(provider).id(), question);
        return chat(systemMessage, question, provider);
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

    private String chat(String systemPrompt, String userMessage) {
        return chat(systemPrompt, userMessage, null);
    }

    @SuppressWarnings("unchecked")
    private String chat(String systemPrompt, String userMessage, String provider) {
        ProviderCfg cfg = resolve(provider);
        if (!cfg.configured()) {
            log.warn("LLM provider '{}' has no API key configured.", cfg.id());
            return "The selected LLM provider (" + cfg.label() + ") is not configured. "
                 + "Set its API key in the backend environment.";
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(cfg.key());

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", cfg.model());
            if (cfg.supportsCustomTemperature()) {
                requestBody.put("temperature", temperature);
            }
            requestBody.put("max_tokens", maxTokens);
            requestBody.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userMessage)
            ));

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

            long startTime = System.currentTimeMillis();
            ResponseEntity<Map> response = restTemplate.exchange(
                cfg.baseUrl() + "/chat/completions",
                HttpMethod.POST,
                request,
                Map.class
            );
            long duration = System.currentTimeMillis() - startTime;

            log.info("LLM provider '{}' responded in {} ms", cfg.id(), duration);

            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (!choices.isEmpty()) {
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                    return (String) message.get("content");
                }
            }

            return "No response from the LLM provider.";

        } catch (Exception e) {
            log.error("Error calling LLM provider '{}': {}", cfg.id(), e.getMessage(), e);
            return "Error: " + e.getMessage();
        }
    }
}
