package com.cim.semanticgraph.exception;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for GlobalExceptionHandler
 */
class GlobalExceptionHandlerTest {

    private GlobalExceptionHandler exceptionHandler;

    @BeforeEach
    void setUp() {
        exceptionHandler = new GlobalExceptionHandler();
    }

    @Test
    void testHandleCimException() {
        CimException ex = new CimException("TEST_ERROR", "Test error message");
        
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            exceptionHandler.handleCimException(ex);
        
        assertNotNull(response);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("TEST_ERROR", response.getBody().getErrorCode());
        assertEquals("Test error message", response.getBody().getMessage());
    }

    @Test
    void testHandleSparqlException() {
        SparqlException ex = new SparqlException("SPARQL query failed", "SELECT * WHERE { ?s ?p ?o }");
        
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            exceptionHandler.handleSparqlException(ex);
        
        assertNotNull(response);
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("SPARQL_ERROR", response.getBody().getErrorCode());
        assertNotNull(response.getBody().getDetails());
    }

    @Test
    void testHandleValidationException() {
        ValidationException ex = new ValidationException(
            "Validation failed", 
            List.of("Error 1", "Error 2")
        );
        
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            exceptionHandler.handleValidationException(ex);
        
        assertNotNull(response);
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("VALIDATION_ERROR", response.getBody().getErrorCode());
    }

    @Test
    void testHandleResourceNotFoundException() {
        ResourceNotFoundException ex = new ResourceNotFoundException("Bus", "BUS_1");
        
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            exceptionHandler.handleResourceNotFoundException(ex);
        
        assertNotNull(response);
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("RESOURCE_NOT_FOUND", response.getBody().getErrorCode());
        assertTrue(response.getBody().getMessage().contains("BUS_1"));
    }

    @Test
    void testHandleGenericException() {
        Exception ex = new RuntimeException("Unexpected error");
        
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            exceptionHandler.handleGenericException(ex);
        
        assertNotNull(response);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("INTERNAL_ERROR", response.getBody().getErrorCode());
    }
}
