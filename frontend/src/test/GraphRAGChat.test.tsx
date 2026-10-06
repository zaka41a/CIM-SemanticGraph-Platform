import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GraphRAGChat from '@/pages/GraphRAGChat';
import { apiService } from '@/services/api';
import { storageGet, storageSet } from '@/utils/storage';

vi.mock('@/services/api', () => ({
  apiService: {
    checkBackendHealth: vi.fn(),
    getIndexingStatus: vi.fn(),
    getPowerflowHealth: vi.fn(),
    getLlmProviders: vi.fn(),
    getChatHistory: vi.fn(),
    deleteChatSession: vi.fn(),
  },
}));

const providers = [
  { id: 'primary', label: 'Primary', model: 'primary-model', available: true, isDefault: true },
  { id: 'secondary', label: 'Secondary', model: 'secondary-model', available: true, isDefault: false },
];

const connectedIndex = {
  qdrantAvailable: true,
  indexedEntities: 1234,
  collectionName: 'cim_entities',
  status: 'CONNECTED',
};

async function renderChat() {
  await act(async () => { render(<GraphRAGChat />); });
}

async function refreshStatus() {
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
}

describe('GraphRAG chat service status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(apiService.checkBackendHealth).mockResolvedValue(true);
    vi.mocked(apiService.getIndexingStatus).mockResolvedValue(connectedIndex);
    vi.mocked(apiService.getPowerflowHealth).mockResolvedValue({
      status: 'operational', dcSolver: true, pandapowerAvailable: true,
    });
    vi.mocked(apiService.getLlmProviders).mockResolvedValue(providers);
    vi.mocked(apiService.getChatHistory).mockResolvedValue([]);
    vi.mocked(apiService.deleteChatSession).mockResolvedValue({ status: 'success' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows live index and solver status while preserving a saved model choice', async () => {
    localStorage.setItem('cim_llm_provider', 'secondary');
    await renderChat();

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByTitle('Vector index: 1,234 entities')).toBeInTheDocument();
    expect(screen.getByTitle('Power flow: AC and OPF ready')).toBeInTheDocument();
    expect(screen.getByTitle('Model: secondary-model (configured)')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'LLM provider' })).toHaveValue('secondary');

    vi.mocked(apiService.getIndexingStatus).mockResolvedValue({ ...connectedIndex, indexedEntities: 0 });
    vi.mocked(apiService.getPowerflowHealth).mockResolvedValue({
      status: 'operational', dcSolver: true, pandapowerAvailable: false,
    });
    await refreshStatus();

    expect(screen.getByTitle('Vector index: Index empty')).toBeInTheDocument();
    expect(screen.getByTitle('Power flow: DC solver ready')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'LLM provider' })).toHaveValue('secondary');
  });

  it('clears stale status on failure and recovers on the next poll', async () => {
    localStorage.setItem('cim_llm_provider', 'secondary');
    await renderChat();

    vi.mocked(apiService.checkBackendHealth).mockResolvedValue(false);
    vi.mocked(apiService.getIndexingStatus).mockRejectedValue(new Error('offline'));
    vi.mocked(apiService.getPowerflowHealth).mockRejectedValue(new Error('offline'));
    vi.mocked(apiService.getLlmProviders).mockRejectedValue(new Error('offline'));
    await refreshStatus();

    expect(screen.getByText('Offline')).toBeInTheDocument();
    for (const service of ['Vector index', 'Power flow', 'Model']) {
      expect(screen.getByTitle(`${service}: Unavailable`)).toBeInTheDocument();
    }
    expect(screen.queryByRole('combobox', { name: 'LLM provider' })).not.toBeInTheDocument();

    vi.mocked(apiService.checkBackendHealth).mockResolvedValue(true);
    vi.mocked(apiService.getIndexingStatus).mockResolvedValue(connectedIndex);
    vi.mocked(apiService.getPowerflowHealth).mockResolvedValue({
      status: 'operational', dcSolver: true, pandapowerAvailable: true,
    });
    vi.mocked(apiService.getLlmProviders).mockResolvedValue(providers);
    await refreshStatus();

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByTitle('Vector index: 1,234 entities')).toBeInTheDocument();
    expect(screen.getByTitle('Power flow: AC and OPF ready')).toBeInTheDocument();
    expect(screen.getByTitle('Model: secondary-model (configured)')).toBeInTheDocument();
  });

  it('keeps healthy services visible when the vector index is unavailable', async () => {
    vi.mocked(apiService.getIndexingStatus).mockRejectedValue(new Error('index unavailable'));
    await renderChat();

    expect(screen.getByTitle('Vector index: Unavailable')).toBeInTheDocument();
    expect(screen.getByTitle('Power flow: AC and OPF ready')).toBeInTheDocument();
    expect(screen.getByTitle('Model: primary-model (configured)')).toBeInTheDocument();
  });

  it('uses an available model when the saved default is no longer configured', async () => {
    localStorage.setItem('cim_llm_provider', 'primary');
    vi.mocked(apiService.getLlmProviders).mockResolvedValue([
      { ...providers[0], available: false }, providers[1],
    ]);
    await renderChat();

    expect(screen.getByRole('combobox', { name: 'LLM provider' })).toHaveValue('secondary');
    expect(localStorage.getItem('cim_llm_provider')).toBe('secondary');
    expect(screen.getByRole('option', { name: 'Primary (not configured)' })).toBeDisabled();
  });

  it('distinguishes missing model configuration from an unreachable backend', async () => {
    vi.mocked(apiService.getLlmProviders).mockResolvedValue(
      providers.map(provider => ({ ...provider, available: false })),
    );
    await renderChat();

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByTitle('Model: Not configured')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'LLM provider' })).toHaveValue('primary');
  });

  it('does not overlap slow polls and stops polling after leaving the page', async () => {
    let finishCheck!: (online: boolean) => void;
    vi.mocked(apiService.checkBackendHealth).mockReturnValue(new Promise(resolve => { finishCheck = resolve; }));
    const { unmount } = render(<GraphRAGChat />);
    expect(screen.getByTitle('Model: Checking')).toBeInTheDocument();

    await refreshStatus();
    expect(apiService.checkBackendHealth).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { finishCheck(true); });
    await refreshStatus();
    expect(apiService.checkBackendHealth).toHaveBeenCalledTimes(1);
  });

  it('allows switching, deleting and creating conversations with the compact controls', async () => {
    storageSet('graphrag-sessions', [
      { id: 'one', title: 'First network', timestamp: new Date() },
      { id: 'two', title: 'Second network', timestamp: new Date() },
    ]);
    storageSet('graphrag-session-id', 'one');
    await renderChat();
    const picker = screen.getByRole('combobox', { name: 'Conversation' });

    await act(async () => { fireEvent.change(picker, { target: { value: 'two' } }); });
    expect(storageGet('graphrag-session-id')).toBe('two');
    expect(apiService.getChatHistory).toHaveBeenLastCalledWith('two');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete current conversation' })); });
    expect(apiService.deleteChatSession).toHaveBeenCalledWith('two');
    expect(picker).toHaveValue('one');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'New chat' })); });
    expect(within(picker).getAllByRole('option')).toHaveLength(2);
    expect(picker).not.toHaveValue('one');
    expect(storageGet('graphrag-session-id')).toBe((picker as HTMLSelectElement).value);
  });
});
