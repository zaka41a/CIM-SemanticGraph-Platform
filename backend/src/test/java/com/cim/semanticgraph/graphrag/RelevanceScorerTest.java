package com.cim.semanticgraph.graphrag;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RelevanceScorerTest {

    private final RelevanceScorer scorer = new RelevanceScorer();

    @Test
    void exactEntityMatchOutranksUnrelatedSemanticCandidate() {
        RelevanceScorer.Candidate unrelated = candidate(
                "urn:substation:beta", "Substation Beta", "Substation", 0.96, 1, 0);
        RelevanceScorer.Candidate exact = candidate(
                "urn:transformer:alpha", "Transformer Alpha", "PowerTransformer", 0.55, 2, 1);

        List<RelevanceScorer.RankedCandidate> ranked = scorer.rankResults(
                "Show transformer Alpha",
                List.of(unrelated, exact),
                2
        );

        assertEquals(exact.uri(), ranked.get(0).candidate().uri());
        assertTrue(ranked.get(0).score() > ranked.get(1).score());
    }

    @Test
    void agreementBetweenRetrieversImprovesRanking() {
        RelevanceScorer.Candidate vectorOnly = candidate(
                "urn:line:a", "Line A", "ACLineSegment", 0.75, 1, 0);
        RelevanceScorer.Candidate hybrid = candidate(
                "urn:line:b", "Line B", "ACLineSegment", 0.75, 1, 1);

        List<RelevanceScorer.RankedCandidate> ranked = scorer.rankResults(
                "transmission line",
                List.of(vectorOnly, hybrid),
                2
        );

        assertEquals(hybrid.uri(), ranked.get(0).candidate().uri());
    }

    @Test
    void rankingAppliesLimitAndStableTieBreaking() {
        RelevanceScorer.Candidate second = candidate(
                "urn:transformer:b", "Transformer", "PowerTransformer", 0.70, 2, 0);
        RelevanceScorer.Candidate first = candidate(
                "urn:transformer:a", "Transformer", "PowerTransformer", 0.70, 2, 0);

        List<RelevanceScorer.RankedCandidate> ranked = scorer.rankResults(
                "transformer",
                List.of(second, first),
                1
        );

        assertEquals(1, ranked.size());
        assertEquals(first.uri(), ranked.get(0).candidate().uri());
    }

    private RelevanceScorer.Candidate candidate(
            String uri,
            String label,
            String type,
            double semanticScore,
            int vectorRank,
            int keywordRank
    ) {
        return new RelevanceScorer.Candidate(
                uri,
                label,
                type,
                type + " " + label,
                semanticScore,
                vectorRank,
                keywordRank
        );
    }
}
