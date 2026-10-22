import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

/**
 * Concept search on the server the user is logged into, which is what a facility actually holds: reuse what
 * exists before creating anything.
 */
export interface ConceptHit {
  uuid: string;
  display: string;
  retired: boolean;
  datatype: { display: string };
  conceptClass: { display: string };
  answers: Array<{ uuid: string; display: string }>;
}

const conceptRepresentation =
  'custom:(uuid,display,retired,datatype:(display),conceptClass:(display),answers:(uuid,display))';

export function useConceptSearch(query: string) {
  const term = query.trim();
  const url =
    term.length >= 2 ? `${restBaseUrl}/concept?q=${encodeURIComponent(term)}&v=${conceptRepresentation}` : null;
  const { data, error, isLoading } = useSWR<{ data: { results: Array<ConceptHit> } }, Error>(url, openmrsFetch);
  return { concepts: data?.data?.results ?? [], error, isLoading };
}
