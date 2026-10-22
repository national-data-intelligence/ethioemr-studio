import template from './standard-form-template.json';
import { type FormPage } from './types';

/**
 * The first page every form starts with: visit date, provider and location, exactly as in the standard template
 * (standard-form-template.json). Never edit these on a shipped form (identity.ts checks it).
 */
export const VISIT_DETAILS_QUESTION_IDS = ['encDate', 'encProvider', 'encLocation'] as const;

export function visitDetailsPage(): FormPage {
  return structuredClone(template.pages[0]) as unknown as FormPage;
}
