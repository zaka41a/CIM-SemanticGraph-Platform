import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatSession } from '@/hooks/useChatSession';

describe('useChatSession', () => {
  beforeEach(() => localStorage.clear());

  it('creates a new session on first load', () => {
    const { result } = renderHook(() => useChatSession());
    expect(result.current.sessionId).not.toBe('');
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].title).toBe('New Chat');
  });

  it('createNewSession adds to sessions list', () => {
    const { result } = renderHook(() => useChatSession());
    const initial = result.current.sessions.length;
    act(() => { result.current.createNewSession(); });
    expect(result.current.sessions).toHaveLength(initial + 1);
  });

  it('updateSessionTitle renames a session', () => {
    const { result } = renderHook(() => useChatSession());
    const sid = result.current.sessionId;
    act(() => { result.current.updateSessionTitle(sid, 'My Query'); });
    const session = result.current.sessions.find(s => s.id === sid);
    expect(session?.title).toBe('My Query');
  });

  it('deleteSession removes it from the list', () => {
    const { result } = renderHook(() => useChatSession());
    act(() => { result.current.createNewSession(); });
    expect(result.current.sessions).toHaveLength(2);
    const sidToDelete = result.current.sessions[1].id;
    act(() => { result.current.deleteSession(sidToDelete); });
    expect(result.current.sessions.find(s => s.id === sidToDelete)).toBeUndefined();
  });

  it('deleteSession on current session switches to another', () => {
    const { result } = renderHook(() => useChatSession());
    act(() => { result.current.createNewSession(); });
    const currentSid = result.current.sessionId;
    act(() => { result.current.deleteSession(currentSid); });
    expect(result.current.sessionId).not.toBe(currentSid);
  });

  it('selectSession changes the active session', () => {
    const { result } = renderHook(() => useChatSession());
    act(() => { result.current.createNewSession(); });
    const secondSid = result.current.sessions[0].id; // newest is first
    act(() => { result.current.selectSession(secondSid); });
    expect(result.current.sessionId).toBe(secondSid);
  });
});
