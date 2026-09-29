import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoadFlow } from '@/hooks/useLoadFlow';
import { apiService } from '@/services/api';
import type { LoadFlowResponse } from '@/types';

vi.mock('@/services/api', () => ({ apiService: {
  getStatistics: vi.fn(), getAvailableMethods: vi.fn(),
  calculateLoadFlow: vi.fn(), calculateLoadFlowForBus: vi.fn(),
} }));

const emptyGraph = { totalTriples: 0, totalSubjects: 0, totalPredicates: 0, totalClasses: 0 };
const response: LoadFlowResponse = {
  converged: true, iterations: 1, tolerance: 0.001, executionTimeMs: 5, calculationMethod: 'SIMPLIFIED_DC',
  busResults: [{
    busId: 'BUS_1', busName: 'Bus 1', busType: 'SLACK', voltageMagnitude: 1, voltageAngle: 0,
    voltageKv: 110, activePowerMw: 0, reactivePowerMvar: 0, generationMw: 0, generationMvar: 0,
    loadMw: 0, loadMvar: 0, withinLimits: true, voltagePercentage: 100,
  }],
  branchResults: [], violations: [], statistics: {
    totalBuses: 1, totalBranches: 0, pvBuses: 0, pqBuses: 0, slackBuses: 1,
    totalGenerationMw: 0, totalGenerationMvar: 0, totalLoadMw: 0, totalLoadMvar: 0,
    totalLossesMw: 0, totalLossesMvar: 0, lossPercentage: 0,
    minVoltagePu: 1, maxVoltagePu: 1, avgVoltagePu: 1, minVoltageBus: 'BUS_1', maxVoltageBus: 'BUS_1',
  },
};

describe('load flow dataset lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(apiService.getStatistics).mockResolvedValue(emptyGraph);
    vi.mocked(apiService.getAvailableMethods).mockResolvedValue([
      { id: 'DC', name: 'DC Power Flow', description: 'DC', available: true },
      { id: 'AC_NEWTON_RAPHSON', name: 'AC', description: 'AC', available: false },
    ]);
    vi.mocked(apiService.calculateLoadFlow).mockResolvedValue(response);
  });

  afterEach(cleanup);

  it('discards saved results and refuses calculation on an empty graph', async () => {
    localStorage.setItem('cim_load_flow_results', JSON.stringify(response));
    const { result } = renderHook(useLoadFlow);
    await waitFor(() => expect(result.current.networkStatus).toBe('empty'));

    expect(result.current.results).toBeNull();
    expect(localStorage.getItem('cim_load_flow_results')).toBeNull();
    await act(async () => { await result.current.calculateLoadFlow(); });
    expect(apiService.calculateLoadFlow).not.toHaveBeenCalled();
  });

  it('shows a graph read failure instead of claiming the graph is empty', async () => {
    vi.mocked(apiService.getStatistics).mockRejectedValue(new Error('Fuseki offline'));
    const { result } = renderHook(useLoadFlow);
    await waitFor(() => expect(result.current.networkStatus).toBe('error'));
    expect(result.current.error).toContain('Unable to check the network');
  });

  it('uses an available method and clears results when the dataset changes', async () => {
    vi.mocked(apiService.getStatistics).mockResolvedValue({ ...emptyGraph, totalTriples: 20 });
    const { result } = renderHook(useLoadFlow);
    await waitFor(() => expect(result.current.networkStatus).toBe('ready'));
    expect(result.current.selectedMethod).toBe('DC');
    await act(async () => { await result.current.calculateLoadFlow(); });
    expect(apiService.calculateLoadFlow).toHaveBeenCalledWith('DC');
    expect(result.current.results).toEqual(response);

    vi.mocked(apiService.getStatistics).mockResolvedValue(emptyGraph);
    await act(async () => { window.dispatchEvent(new Event('cim_data_imported')); });
    expect(result.current.networkStatus).toBe('empty');
    expect(result.current.results).toBeNull();
  });

  it('ignores a calculation that finishes after the dataset was cleared', async () => {
    vi.mocked(apiService.getStatistics).mockResolvedValue({ ...emptyGraph, totalTriples: 20 });
    let finish!: (value: LoadFlowResponse) => void;
    vi.mocked(apiService.calculateLoadFlow).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(useLoadFlow);
    await waitFor(() => expect(result.current.networkStatus).toBe('ready'));
    act(() => { void result.current.calculateLoadFlow(); });
    expect(result.current.isCalculating).toBe(true);

    vi.mocked(apiService.getStatistics).mockResolvedValue(emptyGraph);
    await act(async () => { window.dispatchEvent(new Event('cim_data_imported')); });
    await act(async () => { finish(response); });
    expect(result.current.networkStatus).toBe('empty');
    expect(result.current.results).toBeNull();
    expect(result.current.isCalculating).toBe(false);
  });

  it('displays the missing-network reason without a table of zero results', async () => {
    vi.mocked(apiService.getStatistics).mockResolvedValue({ ...emptyGraph, totalTriples: 20 });
    vi.mocked(apiService.calculateLoadFlow).mockResolvedValue({
      ...response, converged: false, busResults: [], calculationMethod: 'NOT_CALCULATED',
      violations: [{ type: 'DATA_ERROR', severity: 'CRITICAL', elementId: '', elementName: '',
        actualValue: 0, limitValue: 0, violationPercentage: 0, description: 'No connected buses found.' }],
    });
    const { result } = renderHook(useLoadFlow);
    await waitFor(() => expect(result.current.networkStatus).toBe('ready'));
    await act(async () => { await result.current.calculateLoadFlow(); });
    expect(result.current.results).toBeNull();
    expect(result.current.error).toBe('No connected buses found.');
  });
});
