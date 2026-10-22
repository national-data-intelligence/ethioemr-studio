/**
 * The whole concept dictionary, read from this EMR's database. The server's search index can't be trusted for
 * that: on the local EthioEMR it found 0 of 8 concepts sampled from the server's own list (search-index-health.ts).
 * Listing concepts reads the database itself, but only 100 at a time (the server's limit), so the first read takes
 * about 25 minutes for 85,155 concepts (measured 2026-10-17; it then reopens in about 1 s). It runs in the
 * background with progress, a few pages in parallel, and is kept in the browser (IndexedDB); Refresh reads it again.
 *
 * Read-only: GET requests only.
 */
import { useSyncExternalStore } from 'react';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type ConceptIndexEntry } from './concept-index.resource';

export const PAGE = 100; // the server's absolute limit per request
const CONCURRENCY = 4; // gentle on a shared server
const REPRESENTATION = 'custom:(uuid,display,retired,set,datatype:(display),conceptClass:(display),names:(display))';

interface Row {
  uuid: string;
  display: string;
  retired: boolean;
  set: boolean;
  datatype?: { display: string };
  conceptClass?: { display: string };
  names?: Array<{ display: string }>;
}
type Fetch = <T>(url: string, init?: { signal?: AbortSignal }) => Promise<{ data: T }>;

const toEntry = (r: Row): ConceptIndexEntry => ({
  uuid: r.uuid,
  name: r.display,
  names: [...new Set((r.names ?? []).map((n) => n.display).filter(Boolean))],
  className: r.conceptClass?.display ?? '',
  datatype: r.datatype?.display ?? '',
  retired: Boolean(r.retired),
  set: Boolean(r.set),
});

export interface PartialRead {
  /** startIndex of every page already read */
  done: Array<number>;
  entries: Array<ConceptIndexEntry>;
}

/**
 * Every concept, retired included, page by page; `onProgress(read, total)` after each page. With `resume`, the
 * pages already read are skipped; `onCheckpoint` gets what has been read so far every `every` pages, so a reload in
 * the middle of the first read continues instead of starting again.
 */
export async function readWholeDictionary(
  fetcher: Fetch = openmrsFetch,
  onProgress?: (read: number, total: number) => void,
  signal?: AbortSignal,
  options: { resume?: PartialRead; onCheckpoint?: (partial: PartialRead) => void; every?: number } = {},
): Promise<Array<ConceptIndexEntry>> {
  const total =
    (
      await fetcher<{ totalCount?: number }>(
        `${restBaseUrl}/concept?limit=1&includeAll=true&totalCount=true&v=custom:(uuid)`,
        { signal },
      )
    ).data.totalCount ?? 0;
  const starts = Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i * PAGE);
  const byUuid = new Map<string, ConceptIndexEntry>((options.resume?.entries ?? []).map((e) => [e.uuid, e]));
  const done = new Set(options.resume?.done ?? []);
  let read = byUuid.size;
  const page = async (start: number) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetcher<{ results: Array<Row> }>(
          `${restBaseUrl}/concept?limit=${PAGE}&startIndex=${start}&includeAll=true&v=${REPRESENTATION}`,
          { signal },
        );
        return res.data.results ?? [];
      } catch (e) {
        if (signal?.aborted || attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt)); // a busy server: wait and try again
      }
    }
  };
  const queue = starts.filter((start) => !done.has(start));
  onProgress?.(Math.min(read, total), total);
  const worker = async () => {
    for (let start = queue.shift(); start !== undefined; start = queue.shift()) {
      const rows = await page(start);
      rows.forEach((r) => byUuid.set(r.uuid, toEntry(r)));
      read += rows.length;
      done.add(start);
      onProgress?.(Math.min(read, total), total);
      if (options.onCheckpoint && done.size % (options.every ?? 20) === 0) {
        options.onCheckpoint({ done: [...done], entries: [...byUuid.values()] });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, starts.length) }, worker));
  return [...byUuid.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// kept in the browser (IndexedDB)
interface Saved {
  readAt: string;
  entries: Array<ConceptIndexEntry>;
}
const DB = 'form-studio';
const STORE = 'whole-dictionary';
const key = () => `${window.location.origin}${restBaseUrl}`; // one copy per EMR

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(undefined);
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve(undefined);
    open.onsuccess = () => {
      const request = run(open.result.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(undefined);
    };
  });
}
const load = () => idb<Saved>('readonly', (s) => s.get(key()));
const save = (saved: Saved) => idb('readwrite', (s) => s.put(saved, key()));
// a first read still under way, so a reload continues it
const loadPartial = () => idb<PartialRead>('readonly', (s) => s.get(`${key()}:partial`));
const savePartial = (partial: PartialRead) => idb('readwrite', (s) => s.put(partial, `${key()}:partial`));
const dropPartial = () => idb('readwrite', (s) => s.delete(`${key()}:partial`));

// one shared copy for every screen
export interface WholeDictionaryState {
  status: 'idle' | 'loading' | 'reading' | 'ready' | 'error';
  entries?: Array<ConceptIndexEntry>;
  readAt?: string;
  read: number;
  total: number;
  error?: string;
}
let state: WholeDictionaryState = { status: 'idle', read: 0, total: 0 };
const listeners = new Set<() => void>();
const set = (next: Partial<WholeDictionaryState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
let running: Promise<void> | undefined;

/** Read the whole dictionary again (keeps the old copy usable until the new one is complete). */
export function refreshWholeDictionary(fetcher?: Fetch, resume?: PartialRead) {
  if (running) return running;
  set({ status: state.entries ? 'ready' : 'reading', read: 0, total: 0, error: undefined });
  running = readWholeDictionary(
    fetcher,
    (read, total) => set({ read, total, status: state.entries ? state.status : 'reading' }),
    undefined,
    { resume, onCheckpoint: (partial) => void savePartial(partial) },
  )
    .then(async (entries) => {
      const readAt = new Date().toISOString();
      set({ status: 'ready', entries, readAt });
      await save({ readAt, entries });
      await dropPartial();
    })
    .catch((e) => set({ status: state.entries ? 'ready' : 'error', error: String(e?.message ?? e) }))
    .finally(() => {
      running = undefined;
    });
  return running;
}

/** The kept copy if there is one; otherwise start reading it. */
export async function ensureWholeDictionary() {
  if (state.status !== 'idle') return;
  set({ status: 'loading' });
  const saved = await load();
  if (saved?.entries?.length) set({ status: 'ready', entries: saved.entries, readAt: saved.readAt });
  else refreshWholeDictionary(undefined, await loadPartial()); // continues a first read a reload interrupted
}

export function useWholeDictionary(): WholeDictionaryState & { refreshing: boolean } {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  return { ...snapshot, refreshing: Boolean(running) && snapshot.status === 'ready' };
}

/** For tests: forget the shared copy. */
export function resetWholeDictionaryForTests() {
  state = { status: 'idle', read: 0, total: 0 };
  running = undefined;
}
