import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import FormMetadataModal, { countWords } from './form-metadata.modal';

vi.mock('../api/encounter-types.resource', () => ({
  useEncounterTypes: () => ({
    encounterTypes: [
      { uuid: '465a92f2-baf8-42e9-9612-53064be868e8', name: 'Consultation' },
      { uuid: 'aaaaaaaa-0000-0000-0000-000000000000', name: 'Not a project type' },
    ],
    isLoading: false,
  }),
}));
vi.mock('../api/forms.resource', () => ({
  useForms: () => ({ forms: [{ uuid: 'x', name: 'Cardiac History Sheet' }] }),
}));

beforeEach(() => {
  vi.mocked(useConfig<Config>).mockReturnValue({
    allowedEncounterTypeUuids: ['465a92f2-baf8-42e9-9612-53064be868e8'],
    descriptionWordRange: { min: 18, max: 40 },
  } as Config);
});

it('counts description words', () => {
  expect(countWords('  two   words ')).toBe(2);
  expect(countWords('')).toBe(0);
});

it('creates the standard template from the answers, offering project encounter types only', async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  const closeModal = vi.fn();
  render(<FormMetadataModal closeModal={closeModal} onCreate={onCreate} />);

  const create = screen.getByRole('button', { name: /create form/i });
  expect(create).toBeDisabled();

  await user.type(screen.getByLabelText(/form name/i), 'Cardiac Follow Up');
  await user.click(screen.getByRole('combobox', { name: /encounter type/i }));
  expect(screen.queryByText('Not a project type')).not.toBeInTheDocument();
  await user.click(screen.getByText('Consultation'));
  await user.click(create);

  expect(onCreate).toHaveBeenCalledTimes(1);
  const schema = onCreate.mock.calls[0][0];
  expect(schema).toMatchObject({ name: 'Cardiac Follow Up', encounter: 'Consultation', version: '1.1' });
  expect(schema.uuid).toMatch(/^[0-9a-f-]{36}$/);
  expect(schema.pages.map((p) => p.label)).toEqual(['Visit Details', 'Vital Signs & Assessment']);
  expect(closeModal).toHaveBeenCalled();
});

it('refuses a name that already exists, and closing creates nothing', async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  const closeModal = vi.fn();
  render(<FormMetadataModal closeModal={closeModal} onCreate={onCreate} />);
  await user.type(screen.getByLabelText(/form name/i), 'cardiac history sheet');
  expect(screen.getAllByText(/already exists/i).length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: /paste a json/i }));
  expect(closeModal).toHaveBeenCalled();
  expect(onCreate).not.toHaveBeenCalled();
});
