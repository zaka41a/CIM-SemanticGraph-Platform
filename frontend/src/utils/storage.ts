/**
 * Versioned localStorage utility.
 * Wraps data in { v, t, d } to detect schema changes and enforce TTLs.
 * Any key written with storageSet uses schema version SCHEMA_VERSION.
 * If the stored version doesn't match, the entry is discarded (clean break).
 */

const SCHEMA_VERSION = 1;

interface StorageEntry<T> {
  v: number;  // schema version
  t: number;  // write timestamp (ms)
  d: T;       // data
}

export function storageGet<T>(key: string, ttlMs?: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry: StorageEntry<T> = JSON.parse(raw);

    // Discard entries from an older schema version
    if (!entry || entry.v !== SCHEMA_VERSION) {
      localStorage.removeItem(key);
      return null;
    }

    // Discard expired entries
    if (ttlMs !== undefined && Date.now() - entry.t > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }

    return entry.d;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function storageSet<T>(key: string, data: T): void {
  try {
    const entry: StorageEntry<T> = { v: SCHEMA_VERSION, t: Date.now(), d: data };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage quota exceeded or other write error - fail silently
  }
}

export function storageRemove(key: string): void {
  localStorage.removeItem(key);
}
