package com.cim.semanticgraph.service;

import org.apache.jena.ontology.OntModel;
import org.apache.jena.ontology.OntModelSpec;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.rdfconnection.RDFConnection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Unit tests for JenaService (Fuseki-only mode)
 */
class JenaServiceTest {

    private JenaService jenaService;
    private OntModel ontModel;
    private RDFConnection rdfConnection;

    // In-memory dataset used to back the mock connection
    private Dataset inMemoryDataset;

    @BeforeEach
    void setUp() {
        ontModel = ModelFactory.createOntologyModel(OntModelSpec.OWL_MEM);

        // Use an in-memory dataset so SPARQL queries work without a real Fuseki server
        inMemoryDataset = DatasetFactory.createTxnMem();

        rdfConnection = mock(RDFConnection.class);

        // Wire load() to add the model into our in-memory dataset
        doAnswer(invocation -> {
            Model m = invocation.getArgument(0);
            inMemoryDataset.getDefaultModel().add(m);
            return null;
        }).when(rdfConnection).load(any(Model.class));

        // Wire query() to run against the in-memory dataset
        when(rdfConnection.query(anyString())).thenAnswer(invocation -> {
            String sparql = invocation.getArgument(0);
            Query q = QueryFactory.create(sparql);
            return QueryExecutionFactory.create(q, inMemoryDataset);
        });

        jenaService = new JenaService(ontModel, rdfConnection);

        ReflectionTestUtils.setField(jenaService, "maxResults", 100);
        ReflectionTestUtils.setField(jenaService, "cimNamespace", "http://iec.ch/TC57/CIM100#");
        ReflectionTestUtils.setField(jenaService, "rdfNamespace", "http://www.w3.org/1999/02/22-rdf-syntax-ns#");
        ReflectionTestUtils.setField(jenaService, "rdfsNamespace", "http://www.w3.org/2000/01/rdf-schema#");
    }

    @Test
    void testAddModel() {
        Model testModel = ModelFactory.createDefaultModel();
        testModel.createResource("http://test.com/resource1")
                .addProperty(testModel.createProperty("http://test.com/hasName"), "Test Resource");

        long initialSize = testModel.size();

        jenaService.addModel(testModel);

        verify(rdfConnection, times(1)).load(testModel);
        assertTrue(inMemoryDataset.getDefaultModel().size() >= initialSize,
                "Triples should be added to the dataset");
    }

    @Test
    void testExecuteSparqlSelect() {
        Model testModel = ModelFactory.createDefaultModel();
        testModel.createResource("http://test.com/resource1")
                .addProperty(testModel.createProperty("http://test.com/hasName"), "Test Resource");

        jenaService.addModel(testModel);

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
        long initialCount = jenaService.getTripleCount();
        assertTrue(initialCount >= 0, "Initial triple count should be >= 0");

        Model testModel = ModelFactory.createDefaultModel();
        testModel.createResource("http://test.com/resource1")
                .addProperty(testModel.createProperty("http://test.com/hasName"), "Test Resource");

        jenaService.addModel(testModel);

        long newCount = jenaService.getTripleCount();
        assertTrue(newCount > initialCount, "Triple count should increase after adding data");
    }
}
