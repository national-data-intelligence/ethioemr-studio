/**
 * The standard every new form starts from. standard-form-template.json is the template exactly as agreed; only
 * name, description, encounter, version and uuid are filled in here.
 */
import { v5 as uuidv5 } from 'uuid';
import template from './standard-form-template.json';
import { type FormSchema } from './types';

/** The project's namespace for new form uuids: the Python converter uses the same one. */
export const FORM_UUID_NAMESPACE = uuidv5('https://emr-forms/bahmni-o3', uuidv5.URL);

/** A new form's uuid comes from its name, so a rebuilt form keeps the same uuid. */
export const newFormUuid = (name: string) => uuidv5(name.trim(), FORM_UUID_NAMESPACE);

export interface NewFormMetadata {
  name: string;
  description: string;
  /** encounter type name, as `encounter` in the shipped forms */
  encounter: string;
  version?: string;
}

export const TEMPLATE_VERSION = template.version;

export function standardFormSchema({ name, description, encounter, version }: NewFormMetadata): FormSchema {
  const schema = structuredClone(template) as unknown as FormSchema;
  return {
    ...schema,
    name: name.trim(),
    description: description.trim(),
    encounter,
    version: version?.trim() || template.version,
    uuid: name.trim() ? newFormUuid(name) : '',
  };
}
