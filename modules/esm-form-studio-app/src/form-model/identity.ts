import { type FormDraft, type FormSchema, type StudioMode } from './types';
import { standardFormSchema } from './standard-template';
import { VISIT_DETAILS_QUESTION_IDS } from './visit-details';

/**
 * Form identity is permanent.
 * A shipped form keeps its uuid, name, encounter type and version, and its Visit Details questions, forever:
 * a new uuid under an existing name makes the loader retire the old form, and changed headers break saved data.
 */
export const LOCKED_ON_EDIT = ['uuid', 'name', 'encounter', 'encounterType', 'version'] as const;
export type LockedField = (typeof LOCKED_ON_EDIT)[number];

export function isLocked(mode: StudioMode, field: string): boolean {
  return mode === 'edit' && (LOCKED_ON_EDIT as ReadonlyArray<string>).includes(field);
}

/** A new form from the standard template, not yet named. */
export function newFormSchema(uuid: string): FormSchema {
  return { ...standardFormSchema({ name: '', description: '', encounter: '' }), uuid };
}

/**
 * Every way an edited form has broken its identity, in plain words. Empty means safe. Used by the Check
 * and as a hard stop in Export.
 */
export function identityViolations(draft: FormDraft): Array<string> {
  if (draft.mode !== 'edit' || !draft.original) {
    return [];
  }
  const problems: Array<string> = [];
  for (const field of LOCKED_ON_EDIT) {
    if ((draft.original[field] ?? '') !== (draft.schema[field] ?? '')) {
      problems.push(
        `The form's ${field} changed from "${draft.original[field] ?? ''}" to "${draft.schema[field] ?? ''}".`,
      );
    }
  }
  const visitDetails = (schema: FormSchema) =>
    JSON.stringify(
      schema.pages
        .flatMap((page) => page.sections.flatMap((section) => section.questions))
        .filter((q) => (VISIT_DETAILS_QUESTION_IDS as ReadonlyArray<string>).includes(q.id)),
    );
  if (visitDetails(draft.original) !== visitDetails(draft.schema)) {
    problems.push('The Visit Details questions (visit date, provider, location) changed.');
  }
  return problems;
}
