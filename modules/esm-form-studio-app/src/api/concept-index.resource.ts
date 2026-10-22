import useSWRImmutable from 'swr/immutable';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

/**
 * Concepts for the Concept dictionary, found by the server's search index.
 *
 * Measured on the local EthioEMR (85,155 concepts): listing every concept through REST costs about 3 s per 100
 * (over 40 minutes for all), while a search costs 0.2-1.3 s. So the dictionary is search-first: the server finds all
 * matches (every page of them), then the table filters, sorts and pages those in the browser. Full details of
 * one concept are fetched when its row is opened (useConceptDetails).
 */
export interface ConceptIndexEntry {
  uuid: string;
  name: string;
  /** every name in every locale, for filtering within the results */
  names: Array<string>;
  className: string;
  datatype: string;
  retired: boolean;
  set: boolean;
}

interface ConceptRow {
  uuid: string;
  display: string;
  retired: boolean;
  set: boolean;
  datatype?: { display: string };
  conceptClass?: { display: string };
  names?: Array<{ display: string }>;
}

const PAGE_SIZE = 100;
/** a search broader than this asks the user to narrow it rather than loading thousands of rows */
export const MAX_RESULTS = 2000;
export const MIN_QUERY = 2;
const representation = 'custom:(uuid,display,retired,set,datatype:(display),conceptClass:(display),names:(display))';
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$|^\d+A{20,}$/i;

const toEntry = (row: ConceptRow): ConceptIndexEntry => ({
  uuid: row.uuid,
  name: row.display,
  names: (row.names ?? []).map((n) => n.display),
  className: row.conceptClass?.display ?? '',
  datatype: row.datatype?.display ?? '',
  retired: row.retired,
  set: row.set,
});

export interface SearchResult {
  concepts: Array<ConceptIndexEntry>;
  /** how many the server found; more than concepts.length when capped at MAX_RESULTS */
  total: number;
}

export async function searchConcepts(query: string, includeRetired: boolean): Promise<SearchResult> {
  const term = query.trim();
  if (UUID.test(term)) {
    try {
      const one = await openmrsFetch<ConceptRow>(`${restBaseUrl}/concept/${term}?v=${representation}`);
      return { concepts: [toEntry(one.data)], total: 1 };
    } catch {
      return { concepts: [], total: 0 };
    }
  }
  const url = (start: number) =>
    `${restBaseUrl}/concept?q=${encodeURIComponent(term)}${includeRetired ? '&includeAll=true' : ''}` +
    `&limit=${PAGE_SIZE}&startIndex=${start}&totalCount=true&v=${representation}`;
  const first = await openmrsFetch<{ results: Array<ConceptRow>; totalCount?: number }>(url(0));
  const total = first.data.totalCount ?? first.data.results.length;
  const byUuid = new Map<string, ConceptIndexEntry>();
  first.data.results.forEach((row) => byUuid.set(row.uuid, toEntry(row)));
  const starts: Array<number> = [];
  for (let start = PAGE_SIZE; start < Math.min(total, MAX_RESULTS); start += PAGE_SIZE) {
    starts.push(start);
  }
  const pages = await Promise.all(starts.map((start) => openmrsFetch<{ results: Array<ConceptRow> }>(url(start))));
  pages.forEach((page) => page.data.results.forEach((row) => byUuid.set(row.uuid, toEntry(row))));
  // the text search (?q=) misses exact names when the server's index is behind: ask ?name= too, first
  const exact = await openmrsFetch<{ results: Array<ConceptRow> }>(
    `${restBaseUrl}/concept?name=${encodeURIComponent(term)}${includeRetired ? '&includeAll=true' : ''}&v=${representation}`,
  ).then(
    (r) => r.data?.results ?? [],
    () => [] as Array<ConceptRow>,
  );
  const missed = exact.filter((row) => !byUuid.has(row.uuid));
  const concepts = [...missed.map(toEntry), ...Array.from(byUuid.values())];
  return { concepts, total: total + missed.length };
}

export function useConceptSearch(query: string, includeRetired: boolean) {
  const term = query.trim();
  const { data, error, isLoading } = useSWRImmutable<SearchResult, Error>(
    term.length >= MIN_QUERY ? ['form-studio/concept-search', term, includeRetired] : null,
    () => searchConcepts(term, includeRetired),
  );
  return { result: data, error, isLoading };
}

/** Everything about one concept, for its expanded row. */
export interface ConceptDetails {
  uuid: string;
  display: string;
  retired: boolean;
  set: boolean;
  datatype: { display: string };
  conceptClass: { display: string };
  names: Array<{ display: string; locale: string; conceptNameType: string | null; localePreferred: boolean }>;
  descriptions: Array<{ description: string; locale: string }>;
  answers: Array<{ uuid: string; display: string }>;
  setMembers: Array<{ uuid: string; display: string }>;
  mappings: Array<{ display: string }>;
  hiAbsolute?: number;
  hiCritical?: number;
  hiNormal?: number;
  lowAbsolute?: number;
  lowCritical?: number;
  lowNormal?: number;
  units?: string;
  allowDecimal?: boolean;
}

export function useConceptDetails(uuid: string) {
  const { data, error, isLoading } = useSWRImmutable<{ data: ConceptDetails }, Error>(
    uuid ? `${restBaseUrl}/concept/${uuid}?v=full` : null,
    openmrsFetch,
  );
  return { concept: data?.data, error, isLoading };
}
