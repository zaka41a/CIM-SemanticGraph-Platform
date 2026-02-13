import { useState, useEffect } from 'react';

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
}

export const useChatSession = () => {
  const [sessionId, setSessionId] = useState<string>('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    loadSessions();
    const storedSessionId = localStorage.getItem('graphrag-session-id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
    } else {
      createNewSession();
    }
  }, []);

  const loadSessions = () => {
    const stored = localStorage.getItem('graphrag-sessions');
    if (stored) {
      const parsed = JSON.parse(stored);
      setSessions(parsed.map((s: any) => ({
        ...s,
        timestamp: new Date(s.timestamp)
      })));
    }
  };

  const saveSessions = (newSessions: ChatSession[]) => {
    localStorage.setItem('graphrag-sessions', JSON.stringify(newSessions));
    setSessions(newSessions);
  };

  const createNewSession = () => {
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('graphrag-session-id', newSessionId);
    setSessionId(newSessionId);

    const newSession: ChatSession = {
      id: newSessionId,
      title: 'New Chat',
      timestamp: new Date()
    };
    saveSessions([newSession, ...sessions]);
    return newSessionId;
  };

  const selectSession = (sid: string) => {
    setSessionId(sid);
    localStorage.setItem('graphrag-session-id', sid);
  };

  const deleteSession = (sid: string) => {
    const updated = sessions.filter(s => s.id !== sid);
    saveSessions(updated);
    
    if (sessionId === sid) {
      if (updated.length > 0) {
        selectSession(updated[0].id);
      } else {
        createNewSession();
      }
    }
  };

  const updateSessionTitle = (sid: string, title: string) => {
    const updated = sessions.map(s => 
      s.id === sid ? { ...s, title } : s
    );
    saveSessions(updated);
  };

  return {
    sessionId,
    sessions,
    createNewSession,
    selectSession,
    deleteSession,
    updateSessionTitle,
  };
};
