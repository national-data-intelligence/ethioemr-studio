// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/uploadBackendTranslations.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { Resource } from '../types';

export async function uploadBackendTranslations(
  formUuid: string,
  langCode: string,
  formName: string,
  translations: Record<string, string>,
): Promise<void> {
  // FORM STUDIO: uploading translations deletes and recreates form resources on the server; blocked.
  // "Download translation" gives the Initializer file for the content repository instead.
  void formUuid;
  void langCode;
  void formName;
  void translations;
  throw new Error('Form Studio does not write to the server. Ship changes as content files (Export) on a branch.');
}
