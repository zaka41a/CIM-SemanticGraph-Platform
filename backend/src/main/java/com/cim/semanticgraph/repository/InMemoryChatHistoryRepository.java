package com.cim.semanticgraph.repository;

import com.cim.semanticgraph.model.ChatHistory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * In-memory implementation of ChatHistoryRepository
 * Uses ConcurrentHashMap for thread-safe operations
 */
@Component
public class InMemoryChatHistoryRepository implements ChatHistoryRepository {

    private final Map<String, ChatHistory> storage = new ConcurrentHashMap<>();

    @Override
    public ChatHistory save(ChatHistory chatHistory) {
        storage.put(chatHistory.getId(), chatHistory);
        return chatHistory;
    }

    @Override
    public List<ChatHistory> findAll() {
        return new ArrayList<>(storage.values())
                .stream()
                .sorted(Comparator.comparing(ChatHistory::getTimestamp).reversed())
                .collect(Collectors.toList());
    }

    @Override
    public List<ChatHistory> findBySessionId(String sessionId) {
        return storage.values().stream()
                .filter(chat -> chat.getSessionId().equals(sessionId))
                .sorted(Comparator.comparing(ChatHistory::getTimestamp))
                .collect(Collectors.toList());
    }

    @Override
    public Optional<ChatHistory> findById(String id) {
        return Optional.ofNullable(storage.get(id));
    }

    @Override
    public boolean deleteById(String id) {
        return storage.remove(id) != null;
    }

    @Override
    public void deleteBySessionId(String sessionId) {
        storage.values().removeIf(chat -> chat.getSessionId().equals(sessionId));
    }

    @Override
    public void deleteAll() {
        storage.clear();
    }
}
