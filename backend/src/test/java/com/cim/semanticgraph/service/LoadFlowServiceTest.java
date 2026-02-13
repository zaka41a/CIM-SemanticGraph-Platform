package com.cim.semanticgraph.service;

import com.cim.semanticgraph.loadflow.extractor.CIMNetworkExtractor;
import com.cim.semanticgraph.loadflow.model.Bus;
import com.cim.semanticgraph.loadflow.model.NetworkModel;
import com.cim.semanticgraph.loadflow.solver.SimplifiedLoadFlowSolver;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for LoadFlowService
 */
@ExtendWith(MockitoExtension.class)
class LoadFlowServiceTest {

    @Mock
    private JenaService jenaService;

    @Mock
    private CIMNetworkExtractor networkExtractor;

    @Mock
    private SimplifiedLoadFlowSolver loadFlowSolver;

    @Mock
    private PandapowerService pandapowerService;

    private LoadFlowService loadFlowService;

    @BeforeEach
    void setUp() {
        // Create LoadFlowService with mocked dependencies
        loadFlowService = new LoadFlowService(networkExtractor, loadFlowSolver, jenaService, pandapowerService);
    }

    @Test
    void testCalculateLoadFlowWithEmptyModel() {
        // Mock empty model
        when(jenaService.getModelCopy()).thenReturn(ModelFactory.createDefaultModel());

        // Should handle gracefully
        var result = loadFlowService.calculateLoadFlow();
        
        assertNotNull(result, "Result should not be null");
        assertFalse(result.isConverged(), "Should not converge with empty model");
    }

    @Test
    void testCalculateLoadFlowWithValidNetwork() {
        // Create a mock network model
        NetworkModel networkModel = NetworkModel.builder()
                .buses(new java.util.ArrayList<>(
                        java.util.List.of(createBus("BUS_1"))
                ))
                .branches(new java.util.ArrayList<>())
                .build();
        
        // Mock the extractor to return network model
        when(jenaService.getModelCopy()).thenReturn(createNonEmptyModel());
        when(networkExtractor.extractNetwork(any())).thenReturn(networkModel);
        when(loadFlowSolver.solve(any())).thenReturn(SimplifiedLoadFlowSolver.LoadFlowResult.builder()
                .converged(true)
                .iterations(5)
                .executionTimeMs(10)
                .tolerance(0.001)
                .build());
        
        // Execute
        var result = loadFlowService.calculateLoadFlow();
        
        assertNotNull(result, "Result should not be null");
    }

    @Test
    void testCalculateLoadFlowForSpecificBus() {
        // Create a mock network model with a bus
        var bus = createBus("BUS_1");
        
        NetworkModel networkModel = NetworkModel.builder()
                .buses(java.util.List.of(bus))
                .branches(new java.util.ArrayList<>())
                .build();
        
        when(jenaService.getModelCopy()).thenReturn(createNonEmptyModel());
        when(networkExtractor.extractNetwork(any())).thenReturn(networkModel);
        when(loadFlowSolver.solve(any())).thenReturn(SimplifiedLoadFlowSolver.LoadFlowResult.builder()
                .converged(true)
                .iterations(5)
                .executionTimeMs(10)
                .tolerance(0.001)
                .build());
        
        // Execute with specific bus
        var result = loadFlowService.calculateLoadFlow("BUS_1");
        
        assertNotNull(result, "Result should not be null");
        assertEquals("BUS_1", result.getTargetBusId(), "Target bus ID should match");
    }
    private Model createNonEmptyModel() {
        Model model = ModelFactory.createDefaultModel();
        model.createResource("http://test.com/resource")
                .addProperty(model.createProperty("http://test.com/prop"), "value");
        return model;
    }
    private Bus createBus(String id) {
        return Bus.builder()
                .id(id)
                .name("Test Bus")
                .type(Bus.BusType.PQ)
                .voltageMagnitude(1.0)
                .voltageAngle(0.0)
                .voltageMax(1.1)
                .voltageMin(0.9)
                .generationMw(0.0)
                .loadMw(0.0)
                .build();
    }

}
