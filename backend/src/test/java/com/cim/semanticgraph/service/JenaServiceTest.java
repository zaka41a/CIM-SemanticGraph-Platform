package com.cim.semanticgraph.service;

import com.cim.semanticgraph.config.JenaConfig;
import org.apache.jena.query.ReadWrite;
import org.apache.jena.ontology.OntModel;
import org.apache.jena.ontology.OntModelSpec;
import org.apache.jena.query.Dataset;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.tdb2.TDB2Factory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for JenaService
 */
class JenaServiceTest {

    private JenaService jenaService;
    private Dataset dataset;
    private OntModel ontModel;
    private JenaConfig jenaConfig;

    @BeforeEach
    void setUp(@TempDir Path tempDir) {
        // Create TDB2 dataset
        dataset = TDB2Factory.connectDataset(tempDir.toString());

        // Create OntModel
        ontModel = ModelFactory.createOntologyModel(OntModelSpec.OWL_MEM);

        // Mock config (use embedded mode for tests)
        jenaConfig = mock(JenaConfig.class);
        when(jenaConfig.isRemoteMode()).thenReturn(false);

        // Create JenaService with required dependencies
        jenaService = new JenaService(dataset, ontModel, jenaConfig);

        // Inject configuration values normally set via @Value
        ReflectionTestUtils.setField(jenaService, "queryTimeout", 1000L);
        ReflectionTestUtils.setField(jenaService, "maxResults", 100);
        ReflectionTestUtils.setField(jenaService, "cimNamespace", "http://iec.ch/TC57/2013/CIM-schema-cim16#");
        ReflectionTestUtils.setField(jenaService, "rdfNamespace", "http://www.w3.org/1999/02/22-rdf-syntax-ns#");
        ReflectionTestUtils.setField(jenaService, "rdfsNamespace", "http://www.w3.org/2000/01/rdf-schema#");
    }

    @Test
    void testAddModel() {
        // Create a test model
        Model testModel = ModelFactory.createDefaultModel();
        testModel.createResource("http://test.com/resource1")
                .addProperty(testModel.createProperty("http://test.com/hasName"), "Test Resource");
        
        long initialSize = testModel.size();
        
        // Add model (returns void, not long)
        jenaService.addModel(testModel);
        
        // Verify by checking triple count
        long tripleCount = jenaService.getTripleCount();
        assertTrue(tripleCount >= initialSize, "Should add triples to the dataset");
    }

    @Test
    void testGetModel() {
        // Create and add a test model
        Model testModel = ModelFactory.createDefaultModel();
        testModel.createResource("http://test.com/resource1")
                .addProperty(testModel.createProperty("http://test.com/hasName"), "Test Resource");
        
        jenaService.addModel(testModel);
        
        // Get model inside read transaction
        dataset.begin(ReadWrite.READ);
        try {
            Model retrievedModel = jenaService.getModel();
            assertNotNull(retrievedModel, "Retrieved model should not be null");
            assertTrue(retrievedModel.size() > 0, "Retrieved model should contain triples");
            dataset.commit();
        } finally {
            dataset.end();
        }
    }

    @Test
    void testExecuteSparqlSelect() {
        // Create and add test data
        Model testModel = ModelFactory.createDefaultModel();
        testModel.createResource("http://test.com/resource1")
                .addProperty(testModel.createProperty("http://test.com/hasName"), "Test Resource");
        
        jenaService.addModel(testModel);
        
        // Execute SPARQL query
        String query = """
            PREFIX test: <http://test.com/>
            SELECT ?s ?o WHERE {
                ?s test:hasName ?o .
            }
            """;
        
        List<Map<String, String>> results = jenaService.executeSparqlSelect(query);
        
        assertNotNull(results, "Results should not be null");
        assertFalse(results.isEmpty(), "Results should not be empty");
    }

    @Test
    void testGetTripleCount() {
        // Initially should be 0 or small
        long initialCount = jenaService.getTripleCount();
        assertTrue(initialCount >= 0, "Initial triple count should be >= 0");
        
        // Add data
        Model testModel = ModelFactory.createDefaultModel();
        testModel.createResource("http://test.com/resource1")
                .addProperty(testModel.createProperty("http://test.com/hasName"), "Test Resource");
        
        jenaService.addModel(testModel);
        
        // Verify count increased
        long newCount = jenaService.getTripleCount();
        assertTrue(newCount > initialCount, "Triple count should increase after adding data");
    }
}
