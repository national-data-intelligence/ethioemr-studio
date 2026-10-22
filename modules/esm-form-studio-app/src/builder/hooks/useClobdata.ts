// Copied from @openmrs/esm-form-builder-app 3.5.1 (MPL-2.0): src/hooks/useClobdata.ts
// Form Studio changes are marked FORM STUDIO; keep them small so the copy can be refreshed from upstream.
import useSWRImmutable from 'swr/immutable';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { Form, Schema } from '../types';

export const useClobdata = (form?: Form) => {
  const valueReferenceUuid = form?.resources?.find(({ name }) => name === 'JSON schema')?.valueReference;
  const formHasResources = form && form?.resources?.length > 0 && valueReferenceUuid;
  const url = `${restBaseUrl}/clobdata/${valueReferenceUuid}`;

  const { data, error, isLoading, isValidating, mutate } = useSWRImmutable<{ data: Schema }, Error>(
    formHasResources ? url : null,
    openmrsFetch,
  );

  return {
    clobdata: data?.data,
    clobdataError: error,
    isLoadingClobdata: isLoading,
    isValidatingClobdata: isValidating,
    mutate: mutate,
  };
};
