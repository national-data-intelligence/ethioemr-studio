// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/useEncounterTypes.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import useSWRImmutable from 'swr/immutable';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { EncounterType } from '../types';

export const useEncounterTypes = () => {
  const url = `${restBaseUrl}/encountertype?v=custom:(uuid,name)`;

  const { data, error, isLoading } = useSWRImmutable<{ data: { results: Array<EncounterType> } }, Error>(
    url,
    openmrsFetch,
  );

  return {
    encounterTypes: data?.data?.results ?? [],
    encounterTypesError: error,
    isEncounterTypesLoading: isLoading,
  };
};
