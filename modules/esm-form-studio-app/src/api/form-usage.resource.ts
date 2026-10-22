import useSWRImmutable from 'swr/immutable';
import { restBaseUrl } from '@openmrs/esm-framework';
import { type FormQuestion, type FormSchema } from '../form-model/types';
import { fetchAllForms, fetchFormSchema, SCHEMA_RESOURCE_NAME, type FormSummary } from './forms.resource';

/** Concept uuid (lower case) -> names of the forms that use it, as a question or as an answer. */
export type FormUsage = Map<string, Array<string>>;

const PARALLEL_REQUESTS = 6;

/** Every concept a form refers to: question concepts and answer concepts, in nested groups too. */
export function conceptsInForm(schema: FormSchema): Set<string> {
  const found = new Set<string>();
  const visit = (questions: Array<FormQuestion> = []) => {
    for (const question of questions) {
      const options = question.questionOptions ?? { rendering: '' };
      if (typeof options.concept === 'string' && options.concept) {
        found.add(options.concept.toLowerCase());
      }
      for (const answer of options.answers ?? []) {
        if (answer?.concept) {
          found.add(answer.concept.toLowerCase());
        }
      }
      visit(question.questions);
    }
  };
  for (const page of schema.pages ?? []) {
    for (const section of page.sections ?? []) {
      visit(section.questions);
    }
  }
  return found;
}

export async function fetchFormUsage(): Promise<FormUsage> {
  const forms = (
    await fetchAllForms(
      `${restBaseUrl}/form?v=custom:(uuid,name,version,published,retired,resources:(uuid,name,dataType,valueReference))`,
    )
  ).filter((form) => !form.retired && form.resources?.some((r) => r.name === SCHEMA_RESOURCE_NAME));
  const usage: FormUsage = new Map();
  let next = 0;
  const worker = async () => {
    while (next < forms.length) {
      const form: FormSummary = forms[next++];
      try {
        const schema = await fetchFormSchema(form);
        conceptsInForm(schema).forEach((uuid) => {
          const list = usage.get(uuid) ?? [];
          list.push(form.name);
          usage.set(uuid, list);
        });
      } catch {
        // a form whose JSON cannot be read simply contributes nothing
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker));
  usage.forEach((names) => names.sort((a, b) => a.localeCompare(b)));
  return usage;
}

export function useFormUsage() {
  const { data, error, isLoading } = useSWRImmutable<FormUsage, Error>('form-studio/form-usage', fetchFormUsage);
  return { usage: data, error, isLoading };
}
