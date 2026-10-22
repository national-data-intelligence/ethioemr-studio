import { describe, expect, it } from 'vitest';
import { identityViolations, isLocked, newFormSchema } from './identity';
import { type FormDraft } from './types';

const UUID = '648f95f8-6acb-4e5d-8962-1212a78d9ecf';

describe('form identity', () => {
  it('starts a new form with the header and the Visit Details page', () => {
    const schema = newFormSchema(UUID);
    expect(schema.uuid).toBe(UUID);
    expect(schema.processor).toBe('EncounterFormProcessor');
    expect(schema.pages[0].label).toBe('Visit Details');
    expect(schema.pages[0].sections[0].questions.map((q) => q.id)).toEqual(['encDate', 'encProvider', 'encLocation']);
  });

  it('locks uuid, name, encounter type and version only when editing', () => {
    expect(isLocked('edit', 'uuid')).toBe(true);
    expect(isLocked('edit', 'version')).toBe(true);
    expect(isLocked('edit', 'description')).toBe(false);
    expect(isLocked('new', 'uuid')).toBe(false);
  });

  it('reports a renamed shipped form and a changed Visit Details page', () => {
    const original = {
      ...newFormSchema(UUID),
      name: 'Adult History and Physical Examination',
      encounter: 'Consultation',
    };
    const schema = structuredClone(original);
    schema.name = 'Adult History';
    schema.pages[0].sections[0].questions[1].readonly = true;
    const draft: FormDraft = { mode: 'edit', original, schema };

    const problems = identityViolations(draft);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/name changed/);
    expect(problems[1]).toMatch(/Visit Details/);
  });

  it('allows any change on a new form', () => {
    const schema = newFormSchema(UUID);
    expect(identityViolations({ mode: 'new', schema: { ...schema, name: 'Anything' } })).toEqual([]);
  });
});
