package com.cim.semanticgraph.service;

import com.cim.semanticgraph.model.ChatHistory;
import com.cim.semanticgraph.repository.ChatHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Service for managing ChatHistory operations
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChatHistoryService {

    private final ChatHistoryRepository chatHistoryRepository;

    /**
     * Save a chat history entry
     */
    public ChatHistory saveChatHistory(ChatHistory chatHistory) {
        log.info("Saving chat history for session: {}", chatHistory.getSessionId());
        return chatHistoryRepository.save(chatHistory);
    }

    /**
     * Get all chat history entries
     */
    public List<ChatHistory> getAllChatHistory() {
        log.info("Retrieving all chat history");
        return chatHistoryRepository.findAll();
    }

    /**
     * Get chat history for a specific session
     */
    public List<ChatHistory> getChatHistoryBySession(String sessionId) {
        log.info("Retrieving chat history for session: {}", sessionId);
        return chatHistoryRepository.findBySessionId(sessionId);
    }

    /**
     * Get a specific chat history entry by ID
     */
    public Optional<ChatHistory> getChatHistoryById(String id) {
        log.info("Retrieving chat history by ID: {}", id);
        return chatHistoryRepository.findById(id);
    }

    /**
     * Delete a chat history entry by ID
     */
    public boolean deleteChatHistory(String id) {
        log.info("Deleting chat history with ID: {}", id);
        return chatHistoryRepository.deleteById(id);
    }

    /**
     * Delete all chat history for a session
     */
    public void deleteChatHistoryBySession(String sessionId) {
        log.info("Deleting all chat history for session: {}", sessionId);
        chatHistoryRepository.deleteBySessionId(sessionId);
    }

    /**
     * Delete all chat history
     */
    public void deleteAllChatHistory() {
        log.info("Deleting all chat history");
        chatHistoryRepository.deleteAll();
    }
}
