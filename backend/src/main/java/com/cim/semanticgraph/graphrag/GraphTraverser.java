package com.cim.semanticgraph.graphrag;

import com.cim.semanticgraph.service.JenaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

/**
 * Graph Traverser for GraphRAG
 *
 * Traverses the knowledge graph to retrieve relevant subgraphs
 * around specific entities
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GraphTraverser {

    private final JenaService jenaService;

    @Value("${graphrag.traversal.max-hops}")
    private int maxHops;

    @Value("${graphrag.traversal.strategy}")
    private String strategy;

    /**
     * Traverse graph from a starting node
     *
     * @param startNode Starting node URI
     * @param depth     Maximum depth to traverse
     * @return Subgraph model
     */
    public Model traverse(String startNode, int depth) {
        log.debug("Traversing graph from node: {}, depth: {}", startNode, depth);

        Model result = ModelFactory.createDefaultModel();
        Set<String> visited = new HashSet<>();

        try {
            traverseRecursive(startNode, depth, result, visited);
            log.info("Graph traversal completed. Retrieved {} triples", result.size());
            return result;
        } catch (Exception e) {
            log.error("Error during graph traversal", e);
            return result;
        }
    }

    /**
     * Recursive traversal implementation
     */
    private void traverseRecursive(String node, int remainingDepth, Model result, Set<String> visited) {
        if (remainingDepth <= 0 || visited.contains(node)) {
            return;
        }

        visited.add(node);

        // Get all triples where node is subject
        String constructQuery = """
            CONSTRUCT { ?s ?p ?o }
            WHERE {
                ?s ?p ?o .
                FILTER(?s = <%s>)
            }
            """.formatted(node);

        try {
            Model nodeTriples = jenaService.executeSparqlConstruct(constructQuery);
            result.add(nodeTriples);

            // Get connected nodes for next level
            if (remainingDepth > 1) {
                String selectQuery = """
                    SELECT DISTINCT ?connected WHERE {
                        {
                            <%s> ?p ?connected .
                            FILTER(isURI(?connected))
                        } UNION {
                            ?connected ?p <%s> .
                        }
                    }
                    LIMIT 10
                    """.formatted(node, node);

                var connectedNodes = jenaService.executeSparqlSelect(selectQuery);
                for (var row : connectedNodes) {
                    String connectedNode = row.get("connected");
                    if (connectedNode != null && !visited.contains(connectedNode)) {
                        traverseRecursive(connectedNode, remainingDepth - 1, result, visited);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Error traversing node {}: {}", node, e.getMessage());
        }
    }

    /**
     * Bidirectional search between two nodes
     *
     * @param startNode Start node URI
     * @param endNode   End node URI
     * @return Subgraph containing path
     */
    public Model bidirectionalSearch(String startNode, String endNode) {
        log.debug("Bidirectional search from {} to {}", startNode, endNode);

        String constructQuery = """
            CONSTRUCT { ?s ?p ?o }
            WHERE {
                ?s ?p ?o .
                {
                    <%s> ?p* ?s .
                    ?s ?p* <%s> .
                }
            }
            LIMIT 500
            """.formatted(startNode, endNode);

        try {
            Model path = jenaService.executeSparqlConstruct(constructQuery);
            log.info("Found path with {} triples", path.size());
            return path;
        } catch (Exception e) {
            log.error("Error in bidirectional search", e);
            return ModelFactory.createDefaultModel();
        }
    }

    /**
     * Get immediate neighborhood of a node
     *
     * @param node Node URI
     * @return Subgraph of immediate neighbors
     */
    public Model getNeighborhood(String node) {
        log.debug("Getting neighborhood for node: {}", node);

        String constructQuery = """
            CONSTRUCT { ?s ?p ?o }
            WHERE {
                {
                    <%s> ?p ?o .
                    BIND(<%s> as ?s)
                } UNION {
                    ?s ?p <%s> .
                    BIND(<%s> as ?o)
                }
            }
            """.formatted(node, node, node, node);

        try {
            Model neighborhood = jenaService.executeSparqlConstruct(constructQuery);
            log.info("Neighborhood contains {} triples", neighborhood.size());
            return neighborhood;
        } catch (Exception e) {
            log.error("Error getting neighborhood", e);
            return ModelFactory.createDefaultModel();
        }
    }
}
