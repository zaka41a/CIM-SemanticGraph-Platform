import { useState, useRef, useEffect, useCallback } from 'react';
import { apiService } from '@/services/api';
import { storageGet, storageSet } from '@/utils/storage';
import { ChatMessage, ToolCallEvent } from '@/types';

const FOLLOWUP_MAP: Record<string, string[]> = {
  substation: ['What lines are connected to this substation?', 'Show the voltage level at this substation', 'What transformers are here?'],
  generator: ['What is the total generation capacity?', 'Calculate load flow at this generator bus', 'Show connected transmission lines'],
  loadflow: ['Show voltage violations in the network', 'Which bus has the lowest voltage?', 'What are the system losses?'],
  line: ['What is the loading percentage of this line?', 'Show connected substations', 'Are there any overloads?'],
  default: ['Show me all substations', 'Calculate load flow for the network', 'What is the total generation capacity?'],
};

function inferFollowUps(question: string, answer: string): string[] {
  const combined = (question + ' ' + answer).toLowerCase();
  if (combined.includes('substation') || combined.includes('umspannwerk')) return FOLLOWUP_MAP.substation;
  if (combined.includes('generator') || combined.includes('generation')) return FOLLOWUP_MAP.generator;
  if (combined.includes('load flow') || combined.includes('voltage') || combined.includes('spannung')) return FOLLOWUP_MAP.loadflow;
  if (combined.includes('line') || combined.includes('leitung') || combined.includes('transmission')) return FOLLOWUP_MAP.line;
  return FOLLOWUP_MAP.default;
}

export const useChatMessages = (sessionId: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

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

  const loadFromLocalStorage = (sid: string) => {
    const stored = storageGet<ChatMessage[]>(`graphrag-chat-${sid}`);
    if (stored && stored.length > 0) {
      setMessages(stored.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
    } else {
      setMessages([]);
    }
  };

  const loadChatHistory = async (sid: string) => {
    try {
      const history = await apiService.getChatHistory(sid);
      if (history.length > 0) {
        const loadedMessages: ChatMessage[] = history.map((chat: any) => [
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
      } else {
        // Backend has no record — restore from localStorage
        loadFromLocalStorage(sid);
      }
    } catch {
      loadFromLocalStorage(sid);
    }
  };

  const saveChatHistory = (sid: string, msgs: ChatMessage[]) => {
    storageSet(`graphrag-chat-${sid}`, msgs);
  };

  const stopGeneration = useCallback(() => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
    }
  }, []);

  const sendMessage = useCallback(async (
    question: string,
    onSessionTitleUpdate?: (title: string) => void,
  ) => {
    if (!question.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
      toolCalls: [],
      toolResults: {},
    };

    setMessages(prev => {
      const updated = [...prev, userMessage, assistantMessage];
      if (prev.length === 0 && onSessionTitleUpdate) {
        const title = question.length > 50 ? question.substring(0, 50) + '...' : question;
        onSessionTitleUpdate(title);
      }
      return updated;
    });

    setIsLoading(true);

    const stop = apiService.streamGraphRAG(question, {
      onToolCall: (tool, input) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), { tool, input } as ToolCallEvent] }
            : m,
        ));
      },
      onToolResult: (tool, chars) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, toolResults: { ...(m.toolResults ?? {}), [tool]: chars } }
            : m,
        ));
      },
      onText: (text) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + text } : m,
        ));
      },
      onDone: (sources, confidence, executionTimeMs) => {
        stopRef.current = null;
        setIsLoading(false);
        setMessages(prev => {
          const updated = prev.map(m => {
            if (m.id !== assistantId) return m;
            const followUpSuggestions = inferFollowUps(question, m.content);
            return { ...m, streaming: false, sources, confidence, executionTimeMs, followUpSuggestions };
          });
          saveChatHistory(sessionId, updated);
          return updated;
        });
      },
      onError: (message) => {
        stopRef.current = null;
        setIsLoading(false);
        setMessages(prev => {
          const updated = prev.map(m =>
            m.id === assistantId
              ? { ...m, streaming: false, content: m.content || `Error: ${message}` }
              : m,
          );
          saveChatHistory(sessionId, updated);
          return updated;
        });
      },
    });

    stopRef.current = stop;
  }, [isLoading, sessionId]);

  const setFeedback = useCallback((messageId: string, feedback: 'up' | 'down') => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, feedback: m.feedback === feedback ? null : feedback } : m,
    ));
  }, []);

  const getLastUserQuestion = useCallback((): string => {
    const userMessages = messages.filter(m => m.role === 'user');
    return userMessages[userMessages.length - 1]?.content ?? '';
  }, [messages]);

  return {
    messages,
    isLoading,
    messagesEndRef,
    sendMessage,
    stopGeneration,
    setFeedback,
    getLastUserQuestion,
    clearMessages: () => {
      setMessages([]);
      saveChatHistory(sessionId, []);
    },
  };
};
