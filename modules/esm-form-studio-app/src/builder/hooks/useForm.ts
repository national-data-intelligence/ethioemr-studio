// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/useForm.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import useSWR from 'swr/immutable';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { Form } from '../types';

export const useForm = (uuid: string) => {
  const url = `${restBaseUrl}/form/${uuid}?v=full`;

  const { data, error, isLoading, isValidating, mutate } = useSWR<{ data: Form }, Error>(
    uuid ? url : null,
    openmrsFetch,
  );

  return {
    form: data?.data,
    formError: error,
    isLoadingForm: isLoading,
    isValidatingForm: isValidating,
    mutate,
  };
};
