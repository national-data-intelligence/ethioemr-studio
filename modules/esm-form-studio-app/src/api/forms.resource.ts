import useSWR from 'swr';
import { fetchAllPages } from './paging';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type FormSchema } from '../form-model/types';

/**
 * Forms come from the OpenMRS REST API only. An AMPATH form is a `form` row plus a resource named "JSON schema"
 * whose value is a clob holding the form JSON; this is the same route the Form Builder uses to load a form.
 */
export interface FormSummary {
  uuid: string;
  name: string;
  version: string;
  published: boolean;
  retired: boolean;
  encounterType?: { uuid: string; name: string };
  resources: Array<{ uuid: string; name: string; dataType: string; valueReference: string }>;
}

const formRepresentation =
  'custom:(uuid,name,version,published,retired,encounterType:(uuid,name),resources:(uuid,name,dataType,valueReference))';

export const SCHEMA_RESOURCE_NAME = 'JSON schema';

/** Every form on the server (all pages). */
export const fetchAllForms = (url: string) => fetchAllPages<FormSummary>(url);

export function useForms({ includeRetired = false }: { includeRetired?: boolean } = {}) {
  const url = `${restBaseUrl}/form?v=${formRepresentation}`;
  const { data, error, isLoading, isValidating, mutate } = useSWR<Array<FormSummary>, Error>(url, fetchAllForms);
  const forms = (data ?? [])
    .filter((form) => (includeRetired || !form.retired) && form.resources?.some((r) => r.name === SCHEMA_RESOURCE_NAME))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { forms, error, isLoading, isValidating, mutate };
}

export async function fetchFormSchema(form: FormSummary): Promise<FormSchema> {
  const resource = form.resources.find((r) => r.name === SCHEMA_RESOURCE_NAME);
  if (!resource) {
    throw new Error(`Form "${form.name}" has no "${SCHEMA_RESOURCE_NAME}" resource.`);
  }
  const response = await openmrsFetch<FormSchema>(`${restBaseUrl}/clobdata/${resource.valueReference}`);
  return response.data;
}
