import React from 'react';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { showModal } from '@openmrs/esm-framework';
import { standardFormSchema } from '../../form-model/standard-template';
import EditablePreview, { needsConcept } from './editable-preview.component';

const schema = standardFormSchema({ name: 'Cardiac Follow Up', description: '', encounter: 'Consultation' });
// a group with two children, so sub-question numbers can be checked
schema.pages[1].sections[0].questions.push({
  id: 'bp',
  label: 'Blood pressure',
  type: 'obsGroup',
  questionOptions: { rendering: 'group', concept: 'c-bp' },
  questions: [
    { id: 'sys', label: 'Systolic', type: 'obs', questionOptions: { rendering: 'number', concept: 'c-sys' } },
    {
      id: 'dia',
      label: 'Diastolic',
      type: 'obs',
      questionOptions: { rendering: 'number', concept: '__UNMAPPED___dia_1' },
    },
  ],
});

const lastModal = () => vi.mocked(showModal).mock.calls.at(-1);

it('draws every page, section and question of the schema', () => {
  render(<EditablePreview schema={schema} onSchemaChange={vi.fn()} />);
  expect(screen.getByText('Visit Details')).toBeInTheDocument();
  expect(screen.getByText('Vital Signs & Assessment')).toBeInTheDocument();
  expect(screen.getByText('Basic Information')).toBeInTheDocument();
  for (const id of ['encDate', 'encProvider', 'encLocation', 'dateTimeFormFilled', 'bp', 'sys', 'dia']) {
    expect(screen.getByTestId(`preview-question-${id}`)).toBeInTheDocument();
  }
  // an unmapped concept is flagged, a mapped one is not
  expect(within(screen.getByTestId('preview-question-dia')).getByText(/concept not mapped/i)).toBeInTheDocument();
  expect(within(screen.getByTestId('preview-question-sys')).queryByText(/concept not mapped/i)).not.toBeInTheDocument();
});

it('opens the builder dialogs with the item position in the schema', async () => {
  const user = userEvent.setup();
  const onSchemaChange = vi.fn();
  render(<EditablePreview schema={schema} onSchemaChange={onSchemaChange} />);

  await user.click(within(screen.getByTestId('preview-question-dia')).getByRole('button', { name: /edit question/i }));
  expect(lastModal()[0]).toBe('form-studio-question-modal');
  expect(lastModal()[1]).toMatchObject({
    pageIndex: 1,
    sectionIndex: 0,
    questionIndex: 1,
    subQuestionIndex: 1,
    schema,
  });

  await user.click(within(screen.getByTestId('preview-page-1')).getAllByRole('button', { name: /add question/i })[0]);
  expect(lastModal()[0]).toBe('form-studio-question-modal');
  expect(lastModal()[1]).toMatchObject({ pageIndex: 1, sectionIndex: 0 });
  expect(lastModal()[1]).not.toHaveProperty('formField');

  await user.click(within(screen.getByTestId('preview-page-0')).getByRole('button', { name: /edit section/i }));
  expect(lastModal()[0]).toBe('form-studio-new-section-modal');
  expect(lastModal()[1]).toMatchObject({ pageIndex: 0, sectionIndex: 0, modalType: 'edit' });

  await user.click(within(screen.getByTestId('preview-page-1')).getByRole('button', { name: /edit page/i }));
  expect(lastModal()[0]).toBe('form-studio-page-label-modal');
  expect(lastModal()[1]).toMatchObject({ pageIndex: 1, onSchemaChange });

  await user.click(screen.getByRole('button', { name: /add page/i }));
  expect(lastModal()[0]).toBe('form-studio-new-page-modal');
});

it('shows a hint instead of a preview when there is no form yet', () => {
  render(<EditablePreview schema={undefined} onSchemaChange={vi.fn()} />);
  expect(screen.getByText(/nothing to preview yet/i)).toBeInTheDocument();
});

it('needs a concept only for obs questions without a real one', () => {
  expect(needsConcept({ type: 'obs', questionOptions: { concept: '' } })).toBe(true);
  expect(needsConcept({ type: 'obs', questionOptions: { concept: '__UNMAPPED___x_1' } })).toBe(true);
  expect(needsConcept({ type: 'obs', questionOptions: { concept: 'abc' } })).toBe(false);
  expect(needsConcept({ type: 'encounterDatetime', questionOptions: {} })).toBe(false);
});

it('adds a repeating group at the end of a section, and shows repeating groups', async () => {
  const user = userEvent.setup();
  const form = standardFormSchema({ name: 'R', description: '', encounter: 'Consultation' });
  form.pages[1].sections[0].questions.push({
    id: 'drain',
    label: 'Drain',
    type: 'obsGroup',
    questionOptions: { rendering: 'repeating', concept: 'set-1' },
    questions: [{ id: 'site', label: 'Site', type: 'obs', questionOptions: { rendering: 'text', concept: 'c' } }],
  });
  render(<EditablePreview schema={form} onSchemaChange={vi.fn()} />);
  expect(within(screen.getByTestId('preview-question-drain')).getByText(/repeating group/i)).toBeInTheDocument();

  await user.click(within(screen.getByTestId('preview-page-1')).getByRole('button', { name: /add repeating group/i }));
  expect(lastModal()[0]).toBe('form-studio-question-modal');
  expect(lastModal()[1]).toMatchObject({
    pageIndex: 1,
    sectionIndex: 0,
    questionIndex: 2,
    formField: { type: 'obsGroup', questionOptions: { rendering: 'repeating' }, questions: [] },
  });

  await user.click(
    within(screen.getByTestId('preview-question-drain')).getByRole('button', { name: /add a question to this group/i }),
  );
  expect(lastModal()[1]).toMatchObject({ questionIndex: 1, formField: { id: 'drain' } });
});
