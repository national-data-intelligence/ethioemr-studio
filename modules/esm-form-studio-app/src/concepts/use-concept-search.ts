/**
 * The question dialog's concept search. The server's text search (`?q=`) misses exact names when
 * its search index is behind: on the local EthioEMR, "heart rate" finds 2 concepts and not the one named
 * "Heart Rate", which `?name=` finds. So both are asked and merged; a uuid typed in is looked up directly.
 */
import { useEffect } from 'react';
import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type ConceptIndexEntry } from '../api/concept-index.resource';
import { ensureWholeDictionary, useWholeDictionary } from '../api/whole-dictionary';
import { type SearchConcept } from './concept-rules';

/**
 * Matches in the whole dictionary read from the database (api/whole-dictionary.ts), when it has been read: every
 * word typed must appear in one of the concept's names. These come first: the server's search index can miss most
 * concepts (api/search-index-health.ts).
 */
export function searchWholeDictionary(
  entries: Array<ConceptIndexEntry>,
  query: string,
  limit = 50,
): Array<SearchConcept> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = query.trim().toLowerCase();
  const hits: Array<{ e: ConceptIndexEntry; rank: number }> = [];
  for (const e of entries) {
    const names = [e.name, ...e.names].map((n) => n.toLowerCase());
    if (!words.every((w) => names.some((n) => n.includes(w)))) continue;
    const rank = names.some((n) => n === q) ? 0 : names.some((n) => n.startsWith(q)) ? 1 : 2;
    hits.push({ e, rank });
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.e.name.length - b.e.name.length)
    .slice(0, limit)
    .map(({ e }) => ({
      uuid: e.uuid,
      display: e.name,
      retired: e.retired,
      set: e.set,
      datatype: { display: e.datatype },
      conceptClass: { display: e.className },
      names: e.names.map((name) => ({ name, display: name })),
    }));
}

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$|^\d+A{4,}$/i;

export async function searchConcepts(query: string): Promise<Array<SearchConcept>> {
  const q = query.trim();
  if (!q) return [];
  const get = (url: string) =>
    openmrsFetch<{ results?: Array<SearchConcept> } & SearchConcept>(url).then(
      (r) => r.data,
      () => undefined,
    );
  if (UUID.test(q)) {
    const one = await get(`${restBaseUrl}/concept/${encodeURIComponent(q)}?v=full`);
    return one?.uuid ? [one] : [];
  }
  const [byName, byText] = await Promise.all([
    get(`${restBaseUrl}/concept?name=${encodeURIComponent(q)}&v=full`),
    get(`${restBaseUrl}/concept?q=${encodeURIComponent(q)}&v=full`),
  ]);
  return [...(byName?.results ?? []), ...(byText?.results ?? [])];
}

export function useConceptSearch(query: string) {
  const whole = useWholeDictionary();
  useEffect(() => {
    ensureWholeDictionary();
  }, []);
  const { data, error, isLoading } = useSWR<Array<SearchConcept>, Error>(
    query?.trim() ? ['form-studio-concept-search', query.trim()] : null,
    ([, q]: [string, string]) => searchConcepts(q),
  );
  const local = whole.entries && query?.trim() ? searchWholeDictionary(whole.entries, query) : [];
  const seen = new Set(local.map((c) => c.uuid));
  const concepts = [...local, ...(data ?? []).filter((c) => !seen.has(c.uuid))];
  return {
    concepts,
    conceptLookupError: local.length ? undefined : error,
    isLoadingConcepts: isLoading && !local.length,
  };
}
