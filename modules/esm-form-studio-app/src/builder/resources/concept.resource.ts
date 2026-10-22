// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/resources/concept.resource.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export async function fetchConceptById(uuid: string) {
  const url = `${restBaseUrl}/concept/${uuid}?v=full`;
  return await openmrsFetch(url);
}
