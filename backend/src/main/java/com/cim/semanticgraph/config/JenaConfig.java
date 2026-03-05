package com.cim.semanticgraph.config;

import lombok.extern.slf4j.Slf4j;
import org.apache.jena.ontology.OntModel;
import org.apache.jena.ontology.OntModelSpec;
import org.apache.jena.query.Dataset;
import org.apache.jena.query.DatasetFactory;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.rdfconnection.RDFConnection;
import org.apache.jena.rdfconnection.RDFConnectionRemote;
import org.apache.jena.reasoner.Reasoner;
import org.apache.jena.reasoner.ReasonerRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.io.InputStream;
import java.net.Authenticator;
import java.net.PasswordAuthentication;
import java.net.http.HttpClient;

@Slf4j
@Configuration
public class JenaConfig {

    @Value("${jena.reasoning.enabled}")
    private boolean reasoningEnabled;

    @Value("${jena.reasoning.reasoner-type}")
    private String reasonerType;

    @Value("${cim.schema.ontology-path}")
    private String cimOntologyPath;

    @Value("${cim.schema.base-uri}")
    private String cimBaseUri;

    @Value("${jena.storage-mode:remote}")
    private String storageMode;

    @Value("${jena.fuseki.remote-url:}")
    private String fusekiRemoteUrl;

    @Value("${jena.fuseki.dataset-name:cim}")
    private String fusekiDatasetName;

    @Value("${jena.fuseki.username:admin}")
    private String fusekiUsername;

    @Value("${jena.fuseki.password:admin}")
    private String fusekiPassword;

    private final ResourceLoader resourceLoader;
    private Dataset dataset;
    private RDFConnection rdfConnection;

    public JenaConfig(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @PostConstruct
    public void init() {
        log.info("Storage Mode: {}", storageMode);
        log.info("Reasoning Enabled: {}", reasoningEnabled);
        log.info("Fuseki Endpoint: {}/{}", fusekiRemoteUrl, fusekiDatasetName);
    }

    public boolean isRemoteMode() {
        return "remote".equalsIgnoreCase(storageMode);
    }

    public RDFConnection getRdfConnection() {
        return rdfConnection;
    }

    @Bean
    public Dataset dataset() {
        dataset = DatasetFactory.createTxnMem();
        log.info("Initialized in-memory dataset placeholder for remote Fuseki mode");
        return dataset;
    }

    @Bean
    public RDFConnection rdfConnection() {
        if (!isRemoteMode()) {
            log.warn("Remote Fuseki mode disabled; RDFConnection not created.");
            return null;
        }

        if (fusekiRemoteUrl == null || fusekiRemoteUrl.isBlank()) {
            throw new IllegalStateException("jena.fuseki.remote-url must be configured when storage mode is remote");
        }

        String base = fusekiRemoteUrl.endsWith("/") ? fusekiRemoteUrl : fusekiRemoteUrl + "/";
        String endpoint = base + fusekiDatasetName;
        log.info("Connecting to remote Fuseki endpoint: {} (user: {})", endpoint, fusekiUsername);

        HttpClient httpClient = HttpClient.newBuilder()
                .authenticator(new Authenticator() {
                    @Override
                    protected PasswordAuthentication getPasswordAuthentication() {
                        return new PasswordAuthentication(fusekiUsername, fusekiPassword.toCharArray());
                    }
                })
                .build();

        rdfConnection = RDFConnectionRemote.newBuilder()
                .destination(endpoint)
                .queryEndpoint(endpoint + "/query")
                .updateEndpoint(endpoint + "/update")
                .gspEndpoint(endpoint + "/data")
                .httpClient(httpClient)
                .build();

        return rdfConnection;
    }

    @Bean
    public OntModel ontModel(Dataset dataset) {
        OntModelSpec spec = reasoningEnabled ? getOntModelSpec() : OntModelSpec.OWL_MEM;
        OntModel ontModel = ModelFactory.createOntologyModel(spec);

        try {
            loadCimOntology(ontModel);
        } catch (Exception e) {
            log.warn("Could not load CIM ontology: {}", e.getMessage());
        }

        return ontModel;
    }

    @Bean
    public Reasoner reasoner() {
        if (!reasoningEnabled) {
            return null;
        }

        return switch (reasonerType.toUpperCase()) {
            case "OWL_MEM_RULE_INF" -> ReasonerRegistry.getOWLMicroReasoner();
            case "RDFS_INF" -> ReasonerRegistry.getRDFSReasoner();
            case "OWL_DL_MEM" -> ReasonerRegistry.getOWLReasoner();
            case "TRANSITIVE" -> ReasonerRegistry.getTransitiveReasoner();
            default -> ReasonerRegistry.getOWLMicroReasoner();
        };
    }

    private OntModelSpec getOntModelSpec() {
        return switch (reasonerType.toUpperCase()) {
            case "OWL_MEM_RULE_INF" -> OntModelSpec.OWL_MEM_RULE_INF;
            case "RDFS_INF" -> OntModelSpec.OWL_MEM_RDFS_INF;
            case "OWL_DL_MEM" -> OntModelSpec.OWL_DL_MEM;
            default -> OntModelSpec.OWL_MEM_RULE_INF;
        };
    }

    private void loadCimOntology(OntModel ontModel) throws IOException {
        Resource resource = resourceLoader.getResource(cimOntologyPath);
        if (resource.exists()) {
            try (InputStream is = resource.getInputStream()) {
                ontModel.read(is, cimBaseUri, "RDF/XML");
                log.info("CIM ontology loaded: {} statements", ontModel.size());
            }
        }
    }

    @PreDestroy
    public void cleanup() {
        log.info("Shutting down Jena resources...");
        closeQuietly(rdfConnection, "RDFConnection");
        if (dataset != null) {
            try {
                dataset.close();
            } catch (Exception e) {
                log.warn("Error closing Dataset: {}", e.getMessage());
            }
        }
    }

    private void closeQuietly(AutoCloseable resource, String name) {
        if (resource != null) {
            try { resource.close(); } catch (Exception e) { log.warn("Error closing {}: {}", name, e.getMessage()); }
        }
    }

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
