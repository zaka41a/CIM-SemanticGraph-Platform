import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '@/pages/Settings';
import { apiService } from '@/services/api';
import { ToastProvider } from '@/components/Toast';

vi.mock('@/services/api', () => ({
  API_BASE_URL: 'http://localhost:8080/api',
  apiService: {
    checkBackendHealth: vi.fn(), getStatistics: vi.fn(), getIndexingStatus: vi.fn(),
    getPowerflowHealth: vi.fn(), getLlmProviders: vi.fn(), getSystemHealth: vi.fn(),
  },
}));

async function renderSettings() {
  await act(async () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ToastProvider><Settings /></ToastProvider></MemoryRouter>);
  });
}

describe('settings service status', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiService.checkBackendHealth).mockResolvedValue(true);
    vi.mocked(apiService.getStatistics).mockResolvedValue({ totalTriples: 0, totalSubjects: 0, totalClasses: 0, totalPredicates: 0 });
    vi.mocked(apiService.getIndexingStatus).mockResolvedValue({ qdrantAvailable: true, indexedEntities: 0, collectionName: 'cim_entities', status: 'CONNECTED' });
    vi.mocked(apiService.getPowerflowHealth).mockResolvedValue({ status: 'operational', dcSolver: true, pandapowerAvailable: true });
    vi.mocked(apiService.getLlmProviders).mockResolvedValue([
      { id: 'gpt5', label: 'GPT-5.5 (KI Connect NRW)', model: 'gpt-5.5', available: true, isDefault: true },
      { id: 'groq', label: 'Groq', model: 'llama', available: false, isDefault: false },
    ]);
    vi.mocked(apiService.getSystemHealth).mockResolvedValue({ status: 'UP', providers: { kiconnect: true, groq: false, claude: false, openai: true } });
  });
  afterEach(cleanup);

  it('shows KI Connect configuration independently of the Groq key', async () => {
    await renderSettings();
    const kiConnect = screen.getByRole('heading', { name: 'GPT-5.5 (KI Connect NRW)' }).parentElement!;
    expect(within(kiConnect).getByText('Configured')).toBeInTheDocument();
    const groq = screen.getByRole('heading', { name: 'Groq' }).parentElement!;
    expect(within(groq).getByText('Not configured')).toBeInTheDocument();
  });

  it('keeps an empty dataset explicit and disables exporting it', async () => {
    await renderSettings();
    expect(screen.getByText('Your graph is empty. Import a network to begin.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export RDF/XML' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Import network data' })).toHaveAttribute('href', '/import');
  });

  it('shows unknown configuration when probes fail, without hiding healthy services', async () => {
    vi.mocked(apiService.getLlmProviders).mockRejectedValue(new Error('unavailable'));
    vi.mocked(apiService.getSystemHealth).mockRejectedValue(new Error('unavailable'));
    await renderSettings();
    const providers = screen.getByRole('heading', { name: 'Chat providers' }).parentElement!;
    expect(within(providers).getByText('Unknown')).toBeInTheDocument();
    const backend = screen.getByRole('heading', { name: 'Backend API' }).parentElement!;
    expect(within(backend).getByText('Available')).toBeInTheDocument();
  });
});
