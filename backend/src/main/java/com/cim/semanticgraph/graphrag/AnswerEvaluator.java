package com.cim.semanticgraph.graphrag;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * RAGAS-lite answer quality evaluator for GraphRAG responses.
 *
 * Computes two lightweight heuristic metrics without requiring additional LLM calls:
 *
 * - faithfulness: fraction of answer sentences that are grounded in the retrieved context.
 *   Computed as: (sentences with ≥1 keyword overlap with context) / total sentences.
 *
 * - answerRelevance: fraction of non-stop question keywords that appear in the answer.
 *   Computed as: (question keywords present in answer) / total question keywords.
 *
 * These are approximations of the official RAGAS metrics (which use LLM-based NLI),
 * but they run without any external calls and are useful for ranking responses.
 */
@Slf4j
@Component
public class AnswerEvaluator {

    private static final Pattern SENTENCE_SPLIT = Pattern.compile("[.!?]+\\s+");

    private static final Set<String> STOP_WORDS = new HashSet<>(Arrays.asList(
            "what", "is", "the", "a", "an", "in", "on", "at", "to", "for", "of", "with",
            "from", "by", "if", "when", "where", "how", "why", "are", "was", "were",
            "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "can", "there", "their", "they",
            "this", "that", "these", "those", "it", "its", "all", "any", "no", "not",
            "show", "me", "tell", "give", "list", "many", "much", "some", "and", "or"
    ));

    public record EvaluationResult(double faithfulness, double answerRelevance, String summary) {}

    /**
     * Evaluate the quality of a GraphRAG answer.
     *
     * @param question  original user question
     * @param context   retrieved graph context used to answer
     * @param answer    LLM-generated answer
     * @return EvaluationResult with faithfulness and answer relevance scores [0.0 - 1.0]
     */
    public EvaluationResult evaluate(String question, String context, String answer) {
        if (answer == null || answer.isBlank()) {
            return new EvaluationResult(0.0, 0.0, "Empty answer");
        }

        double faithfulness = computeFaithfulness(answer, context);
        double relevance = computeAnswerRelevance(question, answer);

        String summary = String.format(
                "faithfulness=%.2f, answer_relevance=%.2f", faithfulness, relevance);

        log.debug("Answer evaluation: {}", summary);
        return new EvaluationResult(faithfulness, relevance, summary);
    }

    /**
     * Faithfulness: fraction of answer sentences grounded in the context.
     * A sentence is "grounded" if it shares ≥2 meaningful tokens with the context
     * (or ≥1 token for very short sentences).
     */
    private double computeFaithfulness(String answer, String context) {
        if (context == null || context.isBlank()) return 0.0;

        String[] sentences = SENTENCE_SPLIT.split(answer.trim());
        if (sentences.length == 0) return 0.0;

        Set<String> contextTokens = tokenize(context);
        int groundedCount = 0;

        for (String sentence : sentences) {
            if (sentence.isBlank()) continue;
            Set<String> sentenceTokens = tokenize(sentence);
            sentenceTokens.retainAll(contextTokens);
            int overlapRequired = sentenceTokens.size() <= 3 ? 1 : 2;
            if (sentenceTokens.size() >= overlapRequired) {
                groundedCount++;
            }
        }

        return (double) groundedCount / sentences.length;
    }

    /**
     * Answer relevance: fraction of meaningful question keywords present in the answer.
     */
    private double computeAnswerRelevance(String question, String answer) {
        if (question == null || question.isBlank()) return 0.0;

        Set<String> questionKeywords = tokenize(question);
        questionKeywords.removeAll(STOP_WORDS);

        if (questionKeywords.isEmpty()) return 1.0;

        Set<String> answerTokens = tokenize(answer);
        long matched = questionKeywords.stream().filter(answerTokens::contains).count();

        return (double) matched / questionKeywords.size();
    }

    /** Tokenize text into lowercase words (≥2 chars, alphanumeric). */
    private Set<String> tokenize(String text) {
        Set<String> tokens = new HashSet<>();
        for (String word : text.toLowerCase().split("[^a-z0-9]+")) {
            if (word.length() >= 2) tokens.add(word);
        }
        return tokens;
    }
}
