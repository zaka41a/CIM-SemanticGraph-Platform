package com.cim.semanticgraph.exception;

public class SparqlException extends CimException {

    private final String query;

    public SparqlException(String message, String query) {
        super("SPARQL_ERROR", message);
        this.query = query;
    }

    public SparqlException(String message, String query, Throwable cause) {
        super("SPARQL_ERROR", message, cause);
        this.query = query;
    }

    public String getQuery() {
        return query;
    }
}
