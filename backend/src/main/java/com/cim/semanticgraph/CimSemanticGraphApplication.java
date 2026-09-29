package com.cim.semanticgraph;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;
import io.swagger.v3.oas.annotations.servers.Server;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

import java.util.Locale;

@SpringBootApplication
@EnableAsync
@OpenAPIDefinition(
    info = @Info(
        title = "CIM-SemanticGraph-Platform API",
        version = "1.0.0",
        description = """
            RESTful API for CIM Semantic Knowledge Graph Platform with GraphRAG and LLM Integration.

            This API provides endpoints for:
            - Importing and transforming CIM data to RDF/OWL
            - Querying the knowledge graph with SPARQL
            - Natural language querying via GraphRAG and Claude AI
            - Visualizing network topology
            - Analyzing power grid impact and consistency
            """,
        contact = @Contact(
            name = "Zakaria",
            email = "zaksab98@gmail.com",
            url = "https://github.com/zaka41a/CIM-SemanticGraph-Platform"
        ),
        license = @License(
            name = "MIT License",
            url = "https://opensource.org/licenses/MIT"
        )
    ),
    servers = {
        @Server(url = "http://localhost:8080/api", description = "Development Server")
    }
)
public class CimSemanticGraphApplication {

    public static void main(String[] args) {
        // All generated output (logs, PDF reports, API payloads) is English, so number and date
        // formatting must not follow the host locale. Without this a German host renders "794,8 MW".
        Locale.setDefault(Locale.ROOT);

        SpringApplication.run(CimSemanticGraphApplication.class, args);
    }
}
