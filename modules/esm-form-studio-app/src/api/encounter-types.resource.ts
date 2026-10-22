import useSWR from 'swr';
import { restBaseUrl } from '@openmrs/esm-framework';
import { fetchAllPages } from './paging';

/**
 * Encounter types are picked from what the server already has; Form Studio never creates one. The project's
 * list ships in
 * content/configuration/backend_configuration/encountertypes/encountertypes_core-demo.csv.
 */
export interface EncounterType {
  uuid: string;
  name: string;
}

export function useEncounterTypes() {
  const url = `${restBaseUrl}/encountertype?v=custom:(uuid,name)`;
  const { data, error, isLoading } = useSWR<Array<EncounterType>, Error>(url, fetchAllPages<EncounterType>);
  const encounterTypes = (data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  return { encounterTypes, error, isLoading };
}
