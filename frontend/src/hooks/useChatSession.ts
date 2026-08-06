import { useState, useEffect } from 'react';
import { apiService } from '@/services/api';
import { storageGet, storageSet, storageRemove } from '@/utils/storage';

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
}

const KEY_SESSION_ID = 'graphrag-session-id';
const KEY_SESSIONS   = 'graphrag-sessions';

export const useChatSession = () => {
  const [sessionId, setSessionId] = useState<string>('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    const stored = storageGet<ChatSession[]>(KEY_SESSIONS);
    const loadedSessions: ChatSession[] = stored
      ? stored.map(s => ({ ...s, timestamp: new Date(s.timestamp) }))
      : [];
    setSessions(loadedSessions);

    const storedSessionId = storageGet<string>(KEY_SESSION_ID);
    if (storedSessionId && loadedSessions.some(s => s.id === storedSessionId)) {
      setSessionId(storedSessionId);
    } else {
      // Create a new session with the correctly loaded sessions list
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      storageSet(KEY_SESSION_ID, newSessionId);
      setSessionId(newSessionId);
      const newSession: ChatSession = { id: newSessionId, title: 'New Chat', timestamp: new Date() };
      const updated = [newSession, ...loadedSessions];
      storageSet(KEY_SESSIONS, updated);
      setSessions(updated);
    }
  }, []);

  const saveSessions = (newSessions: ChatSession[]) => {
    storageSet(KEY_SESSIONS, newSessions);
    setSessions(newSessions);
  };

  const createSession = (existingSessions: ChatSession[]) => {
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    storageSet(KEY_SESSION_ID, newSessionId);
    setSessionId(newSessionId);

    const newSession: ChatSession = {
      id: newSessionId,
      title: 'New Chat',
      timestamp: new Date(),
    };
    saveSessions([newSession, ...existingSessions]);
    return newSessionId;
  };

  const createNewSession = () => createSession(sessions);

  const selectSession = (sid: string) => {
    setSessionId(sid);
    storageSet(KEY_SESSION_ID, sid);
  };

  const deleteSession = (sid: string) => {
    const updated = sessions.filter(s => s.id !== sid);
    saveSessions(updated);
    storageRemove(`graphrag-chat-${sid}`);
    void apiService.deleteChatSession(sid).catch(() => undefined);

    if (sessionId === sid) {
      if (updated.length > 0) {
        selectSession(updated[0].id);
      } else {
        createSession(updated);
      }
    }
  };

  const updateSessionTitle = (sid: string, title: string) => {
    const updated = sessions.map(s => (s.id === sid ? { ...s, title } : s));
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
