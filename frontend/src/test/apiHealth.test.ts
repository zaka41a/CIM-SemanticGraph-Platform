import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService } from '@/services/api';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  },
}));

describe('backend health probe', () => {
  beforeEach(() => { get.mockReset(); });

  it('uses the application health endpoint without querying the graph', async () => {
    get.mockResolvedValue({ data: { status: 'UP' } });

    expect(await apiService.checkBackendHealth()).toBe(true);
    expect(get).toHaveBeenCalledWith('/actuator/health', { timeout: 3000 });
  });

  it.each([{ status: 'DOWN' }, {}, '<!doctype html><html></html>'])(
    'does not report an unhealthy or unrelated response as online: %j',
    async data => {
      get.mockResolvedValue({ data });
      expect(await apiService.checkBackendHealth()).toBe(false);
    },
  );

  it('reports offline when the request fails', async () => {
    get.mockRejectedValue(new Error('connection refused'));
    expect(await apiService.checkBackendHealth()).toBe(false);
  });
});
