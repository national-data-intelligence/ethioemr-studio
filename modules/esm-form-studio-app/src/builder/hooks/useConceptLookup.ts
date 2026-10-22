// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/useConceptLookup.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { Concept } from '../types';

export function useConceptLookup(conceptId: string) {
  const url = `${restBaseUrl}/concept?q=${conceptId}&v=full`;

  const { data, error, isLoading } = useSWR<{ data: { results: Array<Concept> } }, Error>(
    conceptId ? url : null,
    openmrsFetch,
  );

  return {
    concepts: data?.data?.results ?? [],
    conceptLookupError: error,
    isLoadingConcepts: isLoading,
  };
}
