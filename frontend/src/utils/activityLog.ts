import { storageGet, storageSet, storageRemove } from './storage';

/**
 * Local activity journal shared by every service of the platform.
 *
 * The backend keeps no record of most operations (a generated report, a SPARQL run,
 * a load flow, a validation pass), so without this the work done in a session is lost
 * on reload. Entries are append only, capped, and kept newest first.
 */

const STORAGE_KEY = 'cim-activity-log';
const MAX_ENTRIES = 500;

export type ActivityService =
  | 'report'
  | 'sparql'
  | 'import'
  | 'loadflow'
  | 'validation'
  | 'diagnostics'
  | 'datafixer'
  | 'chat';

export type ActivityStatus = 'success' | 'error';

export interface ActivityEntry {
  id: string;
  service: ActivityService;
  /** Short human label, e.g. "Full CIM Network Report". */
  action: string;
  status: ActivityStatus;
  /** ISO timestamp. */
  timestamp: string;
  /** Error message, filename, row count: whatever makes the entry actionable later. */
  detail?: string;
  /** Small numeric or string facts worth showing as chips. */
  meta?: Record<string, string | number>;
}

export const SERVICE_LABELS: Record<ActivityService, string> = {
  report: 'Reports',
  sparql: 'SPARQL',
  import: 'Data import',
  loadflow: 'Load flow',
  validation: 'Validation',
  diagnostics: 'Diagnostics',
  datafixer: 'Data fixer',
  chat: 'GraphRAG chat',
};

type Listener = (entries: ActivityEntry[]) => void;
const listeners = new Set<Listener>();

function read(): ActivityEntry[] {
  return storageGet<ActivityEntry[]>(STORAGE_KEY) ?? [];
}

function write(entries: ActivityEntry[]): void {
  storageSet(STORAGE_KEY, entries);
  listeners.forEach(listener => listener(entries));
}

/** Record one operation. Never throws: logging must not break the calling flow. */
export function logActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): void {
  try {
    const full: ActivityEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    write([full, ...read()].slice(0, MAX_ENTRIES));
  } catch {
    // A full quota must not take down the page that was doing real work.
  }
}

export function getActivity(service?: ActivityService): ActivityEntry[] {
  const entries = read();
  return service ? entries.filter(e => e.service === service) : entries;
}

export function clearActivity(): void {
  storageRemove(STORAGE_KEY);
  listeners.forEach(listener => listener([]));
}

/** Subscribe to changes, including writes made in another browser tab. */
export function subscribeActivity(listener: Listener): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(read());
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
