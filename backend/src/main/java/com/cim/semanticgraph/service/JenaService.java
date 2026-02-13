package com.cim.semanticgraph.service;

import com.cim.semanticgraph.config.JenaConfig;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.ontology.OntModel;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.rdfconnection.RDFConnection;
import org.apache.jena.update.UpdateAction;
import org.apache.jena.update.UpdateFactory;
import org.apache.jena.update.UpdateRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class JenaService {

    private final Dataset dataset;
    private final OntModel ontModel;
    private final JenaConfig jenaConfig;

    @Autowired(required = false)
    private RDFConnection rdfConnection;

    @Value("${jena.query.timeout}")
    private long queryTimeout;

    @Value("${jena.query.max-results}")
    private int maxResults;

    @Value("${cim.namespaces.cim}")
    private String cimNamespace;

    @Value("${cim.namespaces.rdf}")
    private String rdfNamespace;

    @Value("${cim.namespaces.rdfs}")
    private String rdfsNamespace;

    public JenaService(Dataset dataset, OntModel ontModel, JenaConfig jenaConfig) {
        this.dataset = dataset;
        this.ontModel = ontModel;
        this.jenaConfig = jenaConfig;
    }

    public Dataset getDataset() {
        return dataset;
    }

    public void addModel(Model model) {
        long modelSize = model.size();
        log.info("Adding model with {} triples to dataset", modelSize);

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            addModelFuseki(model);
        } else {
            addModelEmbedded(model);
        }
    }

    private void addModelFuseki(Model model) {
        try {
            rdfConnection.load(model);
            log.info("Model added via Fuseki successfully. {} triples were loaded.", model.size());
        } catch (Exception e) {
            log.error("Error adding model via Fuseki", e);
            throw new RuntimeException("Failed to add model via Fuseki: " + e.getMessage(), e);
        }
    }

    private void addModelEmbedded(Model model) {
        long modelSize = model.size();

        if (dataset.isInTransaction()) {
            log.warn("Active transaction detected, ending it before starting new transaction");
            dataset.end();
        }

        dataset.begin(ReadWrite.WRITE);
        try {
            Model datasetModel = dataset.getDefaultModel();
            datasetModel.add(model);
            dataset.commit();
            log.info("Model added successfully. {} triples were added.", modelSize);
        } catch (Exception e) {
            if (dataset.isInTransaction()) {
                try {
                    dataset.abort();
                } catch (Exception abortEx) {
                    log.warn("Could not abort transaction: {}", abortEx.getMessage());
                }
            }
            log.error("Error adding model to dataset", e);
            throw new RuntimeException("Failed to add model: " + e.getMessage(), e);
        } finally {
            if (dataset.isInTransaction()) {
                dataset.end();
            }
        }

        dataset.begin(ReadWrite.READ);
        try {
            long totalSize = dataset.getDefaultModel().size();
            dataset.commit();
            log.info("Total triples in dataset after addition: {}", totalSize);
        } catch (Exception e) {
            dataset.abort();
            log.warn("Could not get total size: {}", e.getMessage());
        } finally {
            if (dataset.isInTransaction()) {
                dataset.end();
            }
        }
    }

    public List<Map<String, String>> executeSparqlSelect(String sparqlQuery) {
        log.debug("Executing SPARQL SELECT query: {}", sparqlQuery);

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            return executeSparqlSelectFuseki(sparqlQuery);
        }
        return executeSparqlSelectEmbedded(sparqlQuery);
    }

    private List<Map<String, String>> executeSparqlSelectFuseki(String sparqlQuery) {
        List<Map<String, String>> results = new ArrayList<>();
        String fullQuery = addPrefixes(sparqlQuery);

        try (QueryExecution qexec = rdfConnection.query(fullQuery)) {
            ResultSet resultSet = qexec.execSelect();

            int count = 0;
            while (resultSet.hasNext() && count < maxResults) {
                QuerySolution solution = resultSet.nextSolution();
                Map<String, String> row = new HashMap<>();

                solution.varNames().forEachRemaining(varName -> {
                    if (solution.get(varName) != null) {
                        row.put(varName, solution.get(varName).toString());
                    }
                });

                results.add(row);
                count++;
            }

            log.info("Fuseki query returned {} results", results.size());
        } catch (Exception e) {
            log.error("Error executing SPARQL query via Fuseki", e);
            throw new RuntimeException("SPARQL query execution failed (Fuseki): " + e.getMessage(), e);
        }

        return results;
    }

    private List<Map<String, String>> executeSparqlSelectEmbedded(String sparqlQuery) {
        List<Map<String, String>> results = new ArrayList<>();

        dataset.begin(ReadWrite.READ);
        try {
            Model model = dataset.getDefaultModel();
            Query query = QueryFactory.create(addPrefixes(sparqlQuery));

            try (QueryExecution qexec = QueryExecution.create()
                    .query(query)
                    .model(model)
                    .timeout(queryTimeout, java.util.concurrent.TimeUnit.MILLISECONDS)
                    .build()) {
                ResultSet resultSet = qexec.execSelect();

                int count = 0;
                while (resultSet.hasNext() && count < maxResults) {
                    QuerySolution solution = resultSet.nextSolution();
                    Map<String, String> row = new HashMap<>();

                    solution.varNames().forEachRemaining(varName -> {
                        if (solution.get(varName) != null) {
                            row.put(varName, solution.get(varName).toString());
                        }
                    });

                    results.add(row);
                    count++;
                }

                log.info("Query returned {} results", results.size());
            }

            dataset.commit();
        } catch (Exception e) {
            dataset.abort();
            log.error("Error executing SPARQL query", e);
            throw new RuntimeException("SPARQL query execution failed: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }

        return results;
    }

    public Model executeSparqlConstruct(String sparqlQuery) {
        log.debug("Executing SPARQL CONSTRUCT query");

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            return executeSparqlConstructFuseki(sparqlQuery);
        }
        return executeSparqlConstructEmbedded(sparqlQuery);
    }

    private Model executeSparqlConstructFuseki(String sparqlQuery) {
        try {
            Model resultModel = rdfConnection.queryConstruct(addPrefixes(sparqlQuery));
            log.info("Fuseki CONSTRUCT query returned {} triples", resultModel.size());
            return resultModel;
        } catch (Exception e) {
            log.error("Error executing SPARQL CONSTRUCT via Fuseki", e);
            throw new RuntimeException("SPARQL CONSTRUCT failed (Fuseki): " + e.getMessage(), e);
        }
    }

    private Model executeSparqlConstructEmbedded(String sparqlQuery) {
        dataset.begin(ReadWrite.READ);
        try {
            Model model = dataset.getDefaultModel();
            Query query = QueryFactory.create(addPrefixes(sparqlQuery));

            try (QueryExecution qexec = QueryExecutionFactory.create(query, model)) {
                Model resultModel = qexec.execConstruct();
                log.info("CONSTRUCT query returned {} triples", resultModel.size());
                dataset.commit();
                return resultModel;
            }
        } catch (Exception e) {
            dataset.abort();
            log.error("Error executing SPARQL CONSTRUCT query", e);
            throw new RuntimeException("SPARQL CONSTRUCT failed: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }
    }

    public boolean executeSparqlAsk(String sparqlQuery) {
        log.debug("Executing SPARQL ASK query");

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            return executeSparqlAskFuseki(sparqlQuery);
        }
        return executeSparqlAskEmbedded(sparqlQuery);
    }

    private boolean executeSparqlAskFuseki(String sparqlQuery) {
        try {
            boolean result = rdfConnection.queryAsk(addPrefixes(sparqlQuery));
            log.info("Fuseki ASK query result: {}", result);
            return result;
        } catch (Exception e) {
            log.error("Error executing SPARQL ASK via Fuseki", e);
            throw new RuntimeException("SPARQL ASK failed (Fuseki): " + e.getMessage(), e);
        }
    }

    private boolean executeSparqlAskEmbedded(String sparqlQuery) {
        dataset.begin(ReadWrite.READ);
        try {
            Model model = dataset.getDefaultModel();
            Query query = QueryFactory.create(addPrefixes(sparqlQuery));

            try (QueryExecution qexec = QueryExecutionFactory.create(query, model)) {
                boolean result = qexec.execAsk();
                log.info("ASK query result: {}", result);
                dataset.commit();
                return result;
            }
        } catch (Exception e) {
            dataset.abort();
            log.error("Error executing SPARQL ASK query", e);
            throw new RuntimeException("SPARQL ASK failed: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }
    }

    public void executeSparqlUpdate(String sparqlUpdate) {
        log.debug("Executing SPARQL UPDATE");

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            executeSparqlUpdateFuseki(sparqlUpdate);
        } else {
            executeSparqlUpdateEmbedded(sparqlUpdate);
        }
    }

    private void executeSparqlUpdateFuseki(String sparqlUpdate) {
        try {
            rdfConnection.update(addPrefixes(sparqlUpdate));
            log.info("Fuseki SPARQL UPDATE executed successfully");
        } catch (Exception e) {
            log.error("Error executing SPARQL UPDATE via Fuseki", e);
            throw new RuntimeException("SPARQL UPDATE failed (Fuseki): " + e.getMessage(), e);
        }
    }

    private void executeSparqlUpdateEmbedded(String sparqlUpdate) {
        dataset.begin(ReadWrite.WRITE);
        try {
            Model model = dataset.getDefaultModel();
            UpdateRequest update = UpdateFactory.create(addPrefixes(sparqlUpdate));
            UpdateAction.execute(update, model);

            dataset.commit();
            log.info("SPARQL UPDATE executed successfully");
        } catch (Exception e) {
            dataset.abort();
            log.error("Error executing SPARQL UPDATE", e);
            throw new RuntimeException("SPARQL UPDATE failed: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }
    }

    public void importRdfData(InputStream inputStream, String format) {
        log.info("Importing RDF data in format: {}", format);

        Model tempModel = ModelFactory.createDefaultModel();
        try {
            tempModel.read(inputStream, null, format);
            log.info("Read {} triples from input stream", tempModel.size());
        } catch (Exception e) {
            log.error("Error reading RDF data", e);
            throw new RuntimeException("Failed to read RDF data: " + e.getMessage(), e);
        }

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            try {
                rdfConnection.load(tempModel);
                log.info("RDF data imported via Fuseki successfully. {} triples loaded.", tempModel.size());
            } catch (Exception e) {
                log.error("Error importing RDF data via Fuseki", e);
                throw new RuntimeException("RDF import failed (Fuseki): " + e.getMessage(), e);
            } finally {
                tempModel.close();
            }
        } else {
            if (dataset.isInTransaction()) {
                log.warn("Active transaction detected, ending it before starting new transaction");
                dataset.end();
            }

            dataset.begin(ReadWrite.WRITE);
            try {
                Model datasetModel = dataset.getDefaultModel();
                datasetModel.add(tempModel);

                long totalTriples = datasetModel.size();
                dataset.commit();
                log.info("RDF data imported successfully. Total triples in dataset: {}", totalTriples);
            } catch (Exception e) {
                if (dataset.isInTransaction()) {
                    try {
                        dataset.abort();
                    } catch (Exception abortEx) {
                        log.warn("Could not abort transaction: {}", abortEx.getMessage());
                    }
                }
                log.error("Error importing RDF data into dataset", e);
                throw new RuntimeException("RDF import failed: " + e.getMessage(), e);
            } finally {
                if (dataset.isInTransaction()) {
                    dataset.end();
                }
                tempModel.close();
            }
        }
    }

    public String exportRdfData(String format) {
        log.info("Exporting RDF data in format: {}", format);

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            try {
                Model model = rdfConnection.fetch();
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                model.write(outputStream, format);
                String result = outputStream.toString();
                log.info("RDF data exported via Fuseki successfully. Size: {} bytes", result.length());
                return result;
            } catch (Exception e) {
                log.error("Error exporting RDF data via Fuseki", e);
                throw new RuntimeException("RDF export failed (Fuseki): " + e.getMessage(), e);
            }
        }

        dataset.begin(ReadWrite.READ);
        try {
            Model model = dataset.getDefaultModel();
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            model.write(outputStream, format);

            dataset.commit();
            String result = outputStream.toString();
            log.info("RDF data exported successfully. Size: {} bytes", result.length());
            return result;
        } catch (Exception e) {
            dataset.abort();
            log.error("Error exporting RDF data", e);
            throw new RuntimeException("RDF export failed: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }
    }

    public Model getModelCopy() {
        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            log.debug("Fetching full model copy from Fuseki");
            try {
                return rdfConnection.queryConstruct("CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }");
            } catch (Exception e) {
                log.error("Error fetching model from Fuseki", e);
                throw new RuntimeException("Failed to fetch model from Fuseki: " + e.getMessage(), e);
            }
        }

        log.debug("Getting model copy from embedded TDB2");
        dataset.begin(ReadWrite.READ);
        try {
            Model copy = ModelFactory.createDefaultModel();
            copy.add(dataset.getDefaultModel());
            dataset.commit();
            return copy;
        } catch (Exception e) {
            dataset.abort();
            throw new RuntimeException("Failed to get model copy: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }
    }

    public Model getModel() {
        return dataset.getDefaultModel();
    }

    @Cacheable("triple-count")
    public long getTripleCount() {
        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            try {
                List<Map<String, String>> results = executeSparqlSelect(
                        "SELECT (COUNT(*) AS ?count) WHERE { ?s ?p ?o }");
                if (!results.isEmpty() && results.get(0).containsKey("count")) {
                    return parseCountValue(results.get(0).get("count"));
                }
                return 0;
            } catch (Exception e) {
                log.error("Error getting triple count from Fuseki", e);
                return 0;
            }
        }

        dataset.begin(ReadWrite.READ);
        try {
            Model model = dataset.getDefaultModel();
            long count = model.size();
            dataset.commit();
            log.debug("Total triples: {}", count);
            return count;
        } finally {
            dataset.end();
        }
    }

    public void clearKnowledgeGraph() {
        log.warn("Clearing entire knowledge graph...");

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            try {
                rdfConnection.update("DROP ALL");
                log.info("Knowledge graph cleared via Fuseki successfully");
            } catch (Exception e) {
                log.error("Error clearing knowledge graph via Fuseki", e);
                throw new RuntimeException("Clear failed (Fuseki): " + e.getMessage(), e);
            }
            return;
        }

        dataset.begin(ReadWrite.WRITE);
        try {
            Model model = dataset.getDefaultModel();
            model.removeAll();
            dataset.commit();
            log.info("Knowledge graph cleared successfully");
        } catch (Exception e) {
            dataset.abort();
            log.error("Error clearing knowledge graph", e);
            throw new RuntimeException("Clear failed: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }
    }

    public List<Map<String, String>> getResourceTriples(String resourceUri) {
        log.debug("Getting triples for resource: {}", resourceUri);

        String query = """
            SELECT ?p ?o
            WHERE {
                <%s> ?p ?o .
            }
            """.formatted(resourceUri);

        return executeSparqlSelect(query);
    }

    private String addPrefixes(String query) {
        if (query.contains("PREFIX")) {
            return query;
        }

        StringBuilder prefixes = new StringBuilder();
        prefixes.append("PREFIX cim: <").append(cimNamespace).append(">\n");
        prefixes.append("PREFIX rdf: <").append(rdfNamespace).append(">\n");
        prefixes.append("PREFIX rdfs: <").append(rdfsNamespace).append(">\n");
        prefixes.append("PREFIX owl: <http://www.w3.org/2002/07/owl#>\n");
        prefixes.append("\n");

        return prefixes + query;
    }

    public Map<String, Object> getGraphStatistics() {
        log.info("Calculating knowledge graph statistics...");

        Map<String, Object> stats = new HashMap<>();

        if (jenaConfig.isRemoteMode() && rdfConnection != null) {
            return getGraphStatisticsFuseki();
        }

        dataset.begin(ReadWrite.READ);
        try {
            Model model = dataset.getDefaultModel();

            stats.put("totalTriples", model.size());
            stats.put("totalSubjects", countDistinctInModel(model, "SELECT (COUNT(DISTINCT ?s) as ?count) WHERE { ?s ?p ?o }"));
            stats.put("totalPredicates", countDistinctInModel(model, "SELECT (COUNT(DISTINCT ?p) as ?count) WHERE { ?s ?p ?o }"));
            stats.put("totalClasses", countDistinctInModel(model, "SELECT (COUNT(DISTINCT ?class) as ?count) WHERE { ?s rdf:type ?class }"));

            stats.put("substations", countCimEntitiesInModel(model, "Substation"));
            stats.put("generators", countCimEntitiesInModel(model, "GeneratingUnit", "SynchronousMachine"));
            stats.put("transmissionLines", countCimEntitiesInModel(model, "ACLineSegment"));
            stats.put("transformers", countCimEntitiesInModel(model, "PowerTransformer"));
            stats.put("breakers", countCimEntitiesInModel(model, "Breaker"));
            stats.put("disconnectors", countCimEntitiesInModel(model, "Disconnector"));
            stats.put("loads", countCimEntitiesInModel(model, "EnergyConsumer"));
            stats.put("connectivityNodes", countCimEntitiesInModel(model, "ConnectivityNode"));
            stats.put("terminals", countCimEntitiesInModel(model, "Terminal"));
            stats.put("busbarSections", countCimEntitiesInModel(model, "BusbarSection"));
            stats.put("baseVoltages", countCimEntitiesInModel(model, "BaseVoltage"));
            stats.put("voltageLevels", countCimEntitiesInModel(model, "VoltageLevel"));

            dataset.commit();
            log.info("Statistics calculated: {}", stats);
        } catch (Exception e) {
            dataset.abort();
            log.error("Error calculating statistics", e);
            throw new RuntimeException("Failed to calculate statistics: " + e.getMessage(), e);
        } finally {
            dataset.end();
        }

        return stats;
    }

    private Map<String, Object> getGraphStatisticsFuseki() {
        Map<String, Object> stats = new HashMap<>();

        stats.put("totalTriples", countFuseki("SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }"));
        stats.put("totalSubjects", countFuseki("SELECT (COUNT(DISTINCT ?s) as ?count) WHERE { ?s ?p ?o }"));
        stats.put("totalPredicates", countFuseki("SELECT (COUNT(DISTINCT ?p) as ?count) WHERE { ?s ?p ?o }"));
        stats.put("totalClasses", countFuseki("SELECT (COUNT(DISTINCT ?class) as ?count) WHERE { ?s rdf:type ?class }"));

        stats.put("substations", countCimEntitiesFuseki("Substation"));
        stats.put("generators", countCimEntitiesFuseki("GeneratingUnit", "SynchronousMachine"));
        stats.put("transmissionLines", countCimEntitiesFuseki("ACLineSegment"));
        stats.put("transformers", countCimEntitiesFuseki("PowerTransformer"));
        stats.put("breakers", countCimEntitiesFuseki("Breaker"));
        stats.put("disconnectors", countCimEntitiesFuseki("Disconnector"));
        stats.put("loads", countCimEntitiesFuseki("EnergyConsumer"));
        stats.put("connectivityNodes", countCimEntitiesFuseki("ConnectivityNode"));
        stats.put("terminals", countCimEntitiesFuseki("Terminal"));
        stats.put("busbarSections", countCimEntitiesFuseki("BusbarSection"));
        stats.put("baseVoltages", countCimEntitiesFuseki("BaseVoltage"));
        stats.put("voltageLevels", countCimEntitiesFuseki("VoltageLevel"));

        log.info("Fuseki statistics calculated: {}", stats);
        return stats;
    }

    private long countFuseki(String queryString) {
        try {
            List<Map<String, String>> results = executeSparqlSelect(queryString);
            if (!results.isEmpty() && results.get(0).containsKey("count")) {
                return parseCountValue(results.get(0).get("count"));
            }
        } catch (Exception e) {
            log.error("Error counting via Fuseki: {}", e.getMessage());
        }
        return 0;
    }

    private long parseCountValue(String rawValue) {
        if (rawValue == null) {
            return 0;
        }

        String sanitized = rawValue
                .replaceAll("\\^\\^.*", "")
                .replace("\"", "")
                .trim();

        if (sanitized.isEmpty()) {
            return 0;
        }

        try {
            return Long.parseLong(sanitized);
        } catch (NumberFormatException ex) {
            log.warn("Unable to parse count value '{}': {}", rawValue, ex.getMessage());
            return 0;
        }
    }

    private long countCimEntitiesFuseki(String... entityTypes) {
        StringBuilder queryBuilder = new StringBuilder();
        queryBuilder.append("SELECT (COUNT(DISTINCT ?entity) as ?count) WHERE { ");

        if (entityTypes.length == 1) {
            queryBuilder.append("?entity rdf:type cim:").append(entityTypes[0]).append(" . ");
        } else {
            queryBuilder.append("{ ");
            for (int i = 0; i < entityTypes.length; i++) {
                if (i > 0) queryBuilder.append(" UNION ");
                queryBuilder.append("{ ?entity rdf:type cim:").append(entityTypes[i]).append(" } ");
            }
            queryBuilder.append("} ");
        }

        queryBuilder.append("}");
        return countFuseki(queryBuilder.toString());
    }

    private long countDistinctInModel(Model model, String queryString) {
        try {
            Query query = QueryFactory.create(addPrefixes(queryString));
            try (QueryExecution qexec = QueryExecutionFactory.create(query, model)) {
                ResultSet results = qexec.execSelect();
                if (results.hasNext()) {
                    QuerySolution solution = results.nextSolution();
                    if (solution.get("count") != null) {
                        return Long.parseLong(solution.get("count").asLiteral().getString());
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error counting in model: {}", e.getMessage());
        }
        return 0;
    }

    private long countCimEntitiesInModel(Model model, String... entityTypes) {
        StringBuilder queryBuilder = new StringBuilder();
        queryBuilder.append("PREFIX cim: <http://iec.ch/TC57/CIM100#> ");
        queryBuilder.append("PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> ");
        queryBuilder.append("SELECT (COUNT(DISTINCT ?entity) as ?count) WHERE { ");

        if (entityTypes.length == 1) {
            queryBuilder.append("?entity rdf:type cim:").append(entityTypes[0]).append(" . ");
        } else {
            queryBuilder.append("{ ");
            for (int i = 0; i < entityTypes.length; i++) {
                if (i > 0) queryBuilder.append(" UNION ");
                queryBuilder.append("{ ?entity rdf:type cim:").append(entityTypes[i]).append(" } ");
            }
            queryBuilder.append("} ");
        }

        queryBuilder.append("}");

        try {
            Query query = QueryFactory.create(queryBuilder.toString());
            try (QueryExecution qexec = QueryExecutionFactory.create(query, model)) {
                ResultSet results = qexec.execSelect();
                if (results.hasNext()) {
                    QuerySolution solution = results.nextSolution();
                    if (solution.get("count") != null) {
                        return Long.parseLong(solution.get("count").asLiteral().getString());
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error counting CIM entities {}: {}", String.join(",", entityTypes), e.getMessage());
        }
        return 0;
    }
}
