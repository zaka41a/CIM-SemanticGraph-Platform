package com.cim.semanticgraph.exception;

public class CimException extends RuntimeException {

    private final String errorCode;

    public CimException(String message) {
        super(message);
        this.errorCode = "CIM_ERROR";
    }

    public CimException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public CimException(String message, Throwable cause) {
        super(message, cause);
        this.errorCode = "CIM_ERROR";
    }

    public CimException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
