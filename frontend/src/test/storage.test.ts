import { describe, it, expect, beforeEach } from 'vitest';
import { storageGet, storageSet, storageRemove } from '@/utils/storage';

describe('storage utility', () => {
  beforeEach(() => localStorage.clear());

  it('returns null for missing key', () => {
    expect(storageGet('missing')).toBeNull();
  });

  it('round-trips a value', () => {
    storageSet('k', { x: 1 });
    expect(storageGet<{ x: number }>('k')).toEqual({ x: 1 });
  });

  it('removes a key', () => {
    storageSet('k', 42);
    storageRemove('k');
    expect(storageGet('k')).toBeNull();
  });

  it('discards expired entries', () => {
    storageSet('k', 'data');
    // Manually overwrite timestamp to be 2 hours ago
    const raw = JSON.parse(localStorage.getItem('k')!);
    raw.t = Date.now() - 2 * 3_600_000;
    localStorage.setItem('k', JSON.stringify(raw));

    expect(storageGet('k', 3_600_000)).toBeNull(); // 1h TTL → expired
  });

  it('keeps entries within TTL', () => {
    storageSet('k', 'fresh');
    expect(storageGet('k', 3_600_000)).toBe('fresh');
  });

  it('discards entries with wrong schema version', () => {
    localStorage.setItem('k', JSON.stringify({ v: 0, t: Date.now(), d: 'old' }));
    expect(storageGet('k')).toBeNull();
  });

  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem('k', 'not-json{{');
    expect(storageGet('k')).toBeNull();
    expect(localStorage.getItem('k')).toBeNull(); // cleaned up
  });
});
