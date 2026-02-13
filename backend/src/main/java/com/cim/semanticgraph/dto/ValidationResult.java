package com.cim.semanticgraph.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ValidationResult {

    private boolean valid;

    @Builder.Default
    private List<String> errors = new ArrayList<>();

    @Builder.Default
    private List<String> warnings = new ArrayList<>();

    private String message;

    public boolean hasErrors() {
        return errors != null && !errors.isEmpty();
    }

    public boolean hasWarnings() {
        return warnings != null && !warnings.isEmpty();
    }

    public void addError(String error) {
        if (errors == null) {
            errors = new ArrayList<>();
        }
        errors.add(error);
        this.valid = false;
    }

    public void addWarning(String warning) {
        if (warnings == null) {
            warnings = new ArrayList<>();
        }
        warnings.add(warning);
    }

    public String getSummary() {
        if (valid && !hasWarnings()) {
            return "Validation passed successfully";
        } else if (valid && hasWarnings()) {
            return String.format("Validation passed with %d warnings", warnings.size());
        } else {
            return String.format("Validation failed with %d errors", errors.size());
        }
    }
}
