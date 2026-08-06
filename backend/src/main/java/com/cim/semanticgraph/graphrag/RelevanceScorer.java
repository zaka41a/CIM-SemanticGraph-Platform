package com.cim.semanticgraph.graphrag;

import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Component
public class RelevanceScorer {

    private static final double SEMANTIC_WEIGHT = 0.40;
    private static final double LEXICAL_WEIGHT = 0.35;
    private static final double RANK_WEIGHT = 0.15;
    private static final double EXACT_WEIGHT = 0.05;
    private static final double AGREEMENT_WEIGHT = 0.05;

    private static final Set<String> STOP_WORDS = Set.of(
            "a", "about", "all", "an", "and", "answer", "are", "at", "by", "can",
            "current", "do", "for", "from", "give", "how", "in", "is", "me", "of",
            "on", "please", "previous", "question", "show", "tell", "the", "to", "what",
            "when", "where", "which", "with"
    );

    public List<RankedCandidate> rankResults(String query, List<Candidate> candidates, int limit) {
        Set<String> queryTokens = tokenize(query);
        String normalizedQuery = normalize(query);

        return candidates.stream()
                .filter(candidate -> candidate != null && !candidate.uri().isBlank())
                .map(candidate -> new RankedCandidate(candidate, score(candidate, queryTokens, normalizedQuery)))
                .sorted(Comparator.comparingDouble(RankedCandidate::score)
                        .reversed()
                        .thenComparing(result -> result.candidate().uri()))
                .limit(Math.max(0, limit))
                .toList();
    }

    double score(Candidate candidate, Set<String> queryTokens, String normalizedQuery) {
        String document = String.join(" ", candidate.label(), candidate.type(), candidate.text(), candidate.uri());
        Set<String> documentTokens = tokenize(document);
        double lexicalScore = lexicalCoverage(queryTokens, documentTokens);
        double semanticScore = clamp(candidate.semanticScore());
        double rankScore = rankScore(candidate.vectorRank(), candidate.keywordRank());
        double exactScore = exactScore(candidate, normalize(document), normalizedQuery);
        double agreementScore = candidate.vectorRank() > 0 && candidate.keywordRank() > 0 ? 1.0 : 0.0;

        return semanticScore * SEMANTIC_WEIGHT
                + lexicalScore * LEXICAL_WEIGHT
                + rankScore * RANK_WEIGHT
                + exactScore * EXACT_WEIGHT
                + agreementScore * AGREEMENT_WEIGHT;
    }

    private double lexicalCoverage(Set<String> queryTokens, Set<String> documentTokens) {
        if (queryTokens.isEmpty() || documentTokens.isEmpty()) {
            return 0.0;
        }

        long matches = queryTokens.stream().filter(documentTokens::contains).count();
        return matches / (double) queryTokens.size();
    }

    private double rankScore(int vectorRank, int keywordRank) {
        double total = 0.0;
        int sources = 0;

        if (vectorRank > 0) {
            total += reciprocalRank(vectorRank);
            sources++;
        }
        if (keywordRank > 0) {
            total += reciprocalRank(keywordRank);
            sources++;
        }

        return sources == 0 ? 0.0 : total / sources;
    }

    private double reciprocalRank(int rank) {
        return 1.0 / Math.sqrt(rank);
    }

    private double exactScore(Candidate candidate, String normalizedDocument, String normalizedQuery) {
        if (normalizedQuery.isBlank()) {
            return 0.0;
        }

        String normalizedLabel = normalize(candidate.label());
        if (!normalizedLabel.isBlank()
                && (normalizedQuery.contains(normalizedLabel) || normalizedLabel.contains(normalizedQuery))) {
            return 1.0;
        }

        return normalizedDocument.contains(normalizedQuery) ? 0.75 : 0.0;
    }

    private Set<String> tokenize(String value) {
        String normalized = normalize(value);
        if (normalized.isBlank()) {
            return Set.of();
        }

        Set<String> tokens = new LinkedHashSet<>();
        Arrays.stream(normalized.split("\\s+"))
                .map(this::stem)
                .filter(token -> token.length() > 1)
                .filter(token -> !STOP_WORDS.contains(token))
                .forEach(tokens::add);
        return tokens;
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }

        String separated = value.replaceAll("([a-z0-9])([A-Z])", "$1 $2");
        return Normalizer.normalize(separated, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replaceAll("[^A-Za-z0-9]+", " ")
                .toLowerCase(Locale.ROOT)
                .trim();
    }

    private String stem(String token) {
        if (token.endsWith("ies") && token.length() > 4) {
            return token.substring(0, token.length() - 3) + "y";
        }
        if (token.endsWith("ses") && token.length() > 4) {
            return token.substring(0, token.length() - 2);
        }
        if (token.endsWith("s") && token.length() > 3) {
            return token.substring(0, token.length() - 1);
        }
        return token;
    }

    private double clamp(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }

    public record Candidate(
            String uri,
            String label,
            String type,
            String text,
            double semanticScore,
            int vectorRank,
            int keywordRank
    ) {
        public Candidate {
            uri = Objects.requireNonNullElse(uri, "");
            label = Objects.requireNonNullElse(label, "");
            type = Objects.requireNonNullElse(type, "");
            text = Objects.requireNonNullElse(text, "");
        }

        public Candidate withKeywordRank(int rank) {
            return new Candidate(uri, label, type, text, semanticScore, vectorRank, rank);
        }
    }

    public record RankedCandidate(Candidate candidate, double score) {
    }
}
