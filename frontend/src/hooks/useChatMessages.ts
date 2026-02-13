import { useState, useRef, useEffect } from 'react';
import { apiService } from '@/services/api';
import { ChatMessage as ChatMessageType } from '@/types';

export const useChatMessages = (sessionId: string) => {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (sessionId) {
      loadChatHistory(sessionId);
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  const loadChatHistory = async (sid: string) => {
    try {
      const history = await apiService.getChatHistory(sid);
      const loadedMessages: ChatMessageType[] = history.map((chat: any) => [
        {
          id: `${chat.id}-q`,
          role: 'user' as const,
          content: chat.question,
          timestamp: new Date(chat.timestamp),
        },
        {
          id: `${chat.id}-a`,
          role: 'assistant' as const,
          content: chat.answer,
          timestamp: new Date(chat.timestamp),
          sources: chat.sources,
          confidence: chat.confidence,
        },
      ]).flat();
      setMessages(loadedMessages);
    } catch (err) {
      // Fallback to localStorage if API fails
      const stored = localStorage.getItem(`graphrag-chat-${sid}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      } else {
        setMessages([]);
      }
    }
  };

  const saveChatHistory = (sid: string, msgs: ChatMessageType[]) => {
    localStorage.setItem(`graphrag-chat-${sid}`, JSON.stringify(msgs));
  };

  const sendMessage = async (question: string, onSessionTitleUpdate?: (title: string) => void) => {
    if (!question.trim() || isLoading) return;

    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages(prev => {
      const updated = [...prev, userMessage];
      saveChatHistory(sessionId, updated);
      return updated;
    });

    setIsLoading(true);

    try {
      const response = await apiService.askGraphRAG(question, sessionId);
      
      const assistantMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        sources: response.sources,
        confidence: response.confidence,
      };

      setMessages(prev => {
        const updated = [...prev, assistantMessage];
        saveChatHistory(sessionId, updated);
        
        // Update session title from first question
        if (prev.length === 0 && onSessionTitleUpdate) {
          const title = question.length > 50 ? question.substring(0, 50) + '...' : question;
          onSessionTitleUpdate(title);
        }
        
        return updated;
      });
    } catch (err: any) {
      const errorMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${err.message || 'Please try again later.'}`,
        timestamp: new Date(),
      };
      setMessages(prev => {
        const updated = [...prev, errorMessage];
        saveChatHistory(sessionId, updated);
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    messagesEndRef,
    sendMessage,
    clearMessages: () => {
      setMessages([]);
      saveChatHistory(sessionId, []);
    },
  };
};
