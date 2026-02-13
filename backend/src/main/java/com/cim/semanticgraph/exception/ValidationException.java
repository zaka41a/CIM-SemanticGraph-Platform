package com.cim.semanticgraph.exception;

import java.util.List;

public class ValidationException extends CimException {

    private final List<String> validationErrors;

    public ValidationException(String message, List<String> validationErrors) {
        super("VALIDATION_ERROR", message);
        this.validationErrors = validationErrors;
    }

    public ValidationException(String message, List<String> validationErrors, Throwable cause) {
        super("VALIDATION_ERROR", message, cause);
        this.validationErrors = validationErrors;
    }

    public List<String> getValidationErrors() {
        return validationErrors;
    }
}
