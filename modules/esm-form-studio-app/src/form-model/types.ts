/**
 * The shape of an AMPATH (O3) form JSON, as far as Form Studio needs it. Field names match the files in
 * content/configuration/backend_configuration/ampathforms/.
 */

export interface FormSchema {
  name: string;
  uuid: string;
  version: string;
  description: string;
  processor: 'EncounterFormProcessor';
  /** Encounter type by name. Shipped forms also carry `encounterType` (uuid); keep both as found. */
  encounter: string;
  encounterType?: string;
  published: boolean;
  retired: boolean;
  referencedForms: Array<unknown>;
  pages: Array<FormPage>;
}

export interface FormPage {
  label: string;
  sections: Array<FormSection>;
}

export interface FormSection {
  label: string;
  isExpanded: string;
  questions: Array<FormQuestion>;
}

export type QuestionType =
  | 'obs'
  | 'obsGroup'
  | 'encounterDatetime'
  | 'encounterProvider'
  | 'encounterLocation'
  | 'markdown';

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required?: string | boolean;
  readonly?: boolean | string;
  questionOptions: {
    rendering: string;
    concept?: string;
    answers?: Array<{ concept: string; label: string }>;
    [key: string]: unknown;
  };
  validators?: Array<Record<string, unknown>>;
  questions?: Array<FormQuestion>;
  [key: string]: unknown;
}

/** Whether the user started from a blank or imported form or opened a form that already ships. */
export type StudioMode = 'new' | 'edit';

/** The working copy the steps pass around. `original` is the form as loaded, for identity checks on edit. */
export interface FormDraft {
  mode: StudioMode;
  schema: FormSchema;
  original?: FormSchema;
}
