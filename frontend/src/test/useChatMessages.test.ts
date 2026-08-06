import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatMessages } from '@/hooks/useChatMessages';
import { apiService } from '@/services/api';

// Mock apiService - getChatHistory resolves with empty array (no race with sendMessage)
vi.mock('@/services/api', () => ({
  apiService: {
    getChatHistory: vi.fn().mockResolvedValue([]),
    streamGraphRAG: vi.fn((_q, callbacks) => {
      // Simulate: tool_call → text → done (all synchronous so act() captures them)
      callbacks.onToolCall('sparql_query', { query: 'SELECT ...' });
      callbacks.onText('The voltage is 1.02 pu');
      callbacks.onDone(['http://example.com/Bus1'], 0.9, 250);
      return () => {};
    }),
  },
}));

describe('useChatMessages', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts with empty messages', () => {
    const { result } = renderHook(() => useChatMessages('session-1'));
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('sendMessage adds user + assistant messages', async () => {
    const { result } = renderHook(() => useChatMessages('session-1'));
    await waitFor(() => result.current.isLoading === false); // wait for initial load

    await act(async () => { result.current.sendMessage('What is the voltage?'); });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('What is the voltage?');
    expect(result.current.messages[1].role).toBe('assistant');
  });

  it('populates tool calls during streaming', async () => {
    const { result } = renderHook(() => useChatMessages('session-1'));
    // Wait for initial getChatHistory to settle
    await waitFor(() => result.current.isLoading === false);

    await act(async () => { result.current.sendMessage('Show voltage'); });

    const assistant = result.current.messages.find(m => m.role === 'assistant');
    expect(assistant?.toolCalls?.[0].tool).toBe('sparql_query');
  });

  it('completes with text and sets isLoading false', async () => {
    const { result } = renderHook(() => useChatMessages('session-1'));
    await waitFor(() => result.current.isLoading === false);

    await act(async () => { result.current.sendMessage('Show voltage'); });

    const assistant = result.current.messages.find(m => m.role === 'assistant');
    expect(assistant?.content).toBe('The voltage is 1.02 pu');
    expect(assistant?.streaming).toBe(false);
    expect(assistant?.sources).toEqual(['http://example.com/Bus1']);
    expect(result.current.isLoading).toBe(false);
  });

  it('setFeedback toggles feedback on a message', async () => {
    const { result } = renderHook(() => useChatMessages('session-1'));
    await waitFor(() => result.current.isLoading === false);
    await act(async () => { result.current.sendMessage('test'); });

    const assistantId = result.current.messages.find(m => m.role === 'assistant')!.id;
    act(() => { result.current.setFeedback(assistantId, 'up'); });
    expect(result.current.messages.find(m => m.id === assistantId)?.feedback).toBe('up');

    // Toggle off
    act(() => { result.current.setFeedback(assistantId, 'up'); });
    expect(result.current.messages.find(m => m.id === assistantId)?.feedback).toBeNull();
  });

  it('getLastUserQuestion returns the last user message', async () => {
    const { result } = renderHook(() => useChatMessages('session-1'));
    await waitFor(() => result.current.isLoading === false);
    await act(async () => { result.current.sendMessage('first question'); });

    expect(result.current.getLastUserQuestion()).toBe('first question');
  });

  it('forwards the active session to the stream', async () => {
    const { result } = renderHook(() => useChatMessages('session-1', 'gpt5'));
    await waitFor(() => result.current.isLoading === false);

    await act(async () => { result.current.sendMessage('Show voltage'); });

    expect(apiService.streamGraphRAG).toHaveBeenCalledWith(
      'Show voltage',
      expect.any(Object),
      'session-1',
      'gpt5',
    );
  });

  it('stopGeneration halts streaming', async () => {
    const { result } = renderHook(() => useChatMessages('session-1'));
    act(() => { result.current.sendMessage('Show voltage'); });
    act(() => { result.current.stopGeneration(); });

    expect(result.current.isLoading).toBe(false);
    const assistant = result.current.messages.find(m => m.role === 'assistant');
    expect(assistant?.streaming).toBe(false);
  });
});
