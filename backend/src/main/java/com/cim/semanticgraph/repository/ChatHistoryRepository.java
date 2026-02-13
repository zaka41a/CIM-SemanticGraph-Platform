package com.cim.semanticgraph.repository;

import com.cim.semanticgraph.model.ChatHistory;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChatHistoryRepository {
    ChatHistory save(ChatHistory chatHistory);
    List<ChatHistory> findAll();
    List<ChatHistory> findBySessionId(String sessionId);
    Optional<ChatHistory> findById(String id);
    boolean deleteById(String id);
    void deleteBySessionId(String sessionId);
    void deleteAll();
}
