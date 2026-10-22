// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/useConceptId.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { Concept } from '../types';

interface UseConceptNameReturnType {
  concept: Concept | null;
  conceptName: string | null;
  conceptNameLookupError: Error | null;
  isLoadingConcept: boolean;
}

export function useConceptId(conceptId: string | undefined): UseConceptNameReturnType {
  const url = `${restBaseUrl}/concept/${conceptId}?v=full`;

  const { data, error } = useSWR<{ data: Concept }, Error>(conceptId ? url : null, openmrsFetch);

  return {
    concept: data?.data ?? null,
    conceptName: data?.data?.display ?? null,
    conceptNameLookupError: error,
    isLoadingConcept: (conceptId && !data && !error) || false,
  };
}
