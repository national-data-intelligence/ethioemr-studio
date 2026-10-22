import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { newFormSchema } from '../form-model/identity';
import FormStudioPanel, { exportFileName } from './form-studio-panel.component';

// the server's dictionary: every concept exists and fits
vi.mock('../intake/match-concepts', () => ({
  serverConcepts: () => ({
    byUuid: async (uuid: string) => ({
      uuid,
      display: 'Concept',
      datatype: { display: 'Datetime' },
      conceptClass: { display: 'Question' },
    }),
    byName: async () => [],
  }),
}));

beforeEach(() => {
  vi.mocked(useConfig<Config>).mockReturnValue({ blockedQuestionConceptClasses: ['Drug form'] } as Config);
});

const shipped = {
  ...newFormSchema('648f95f8-6acb-4e5d-8962-1212a78d9ecf'),
  name: 'Pre OP Vital Sign',
  encounter: 'Vitals',
};

it('names the export like the content repo does', () => {
  expect(exportFileName('Pre OP Vital Sign')).toBe('Pre_OP_Vital_Sign.json');
});

it('locks a shipped form and blocks export when its identity changed', () => {
  render(<FormStudioPanel original={shipped} schema={{ ...shipped, name: 'Renamed' }} />);
  expect(screen.getByText(/identity locked/i)).toBeInTheDocument();
  expect(screen.getAllByText(/must fix/i).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /download content files/i })).toBeDisabled();
});

it('allows export only after the concept check ran clean on this version', async () => {
  const user = userEvent.setup();
  render(<FormStudioPanel original={shipped} schema={structuredClone(shipped)} />);
  const download = screen.getByRole('button', { name: /download content files/i });
  expect(download).toBeDisabled();
  expect(screen.getByText(/check the concepts on the server first/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /check concepts on the server/i }));
  expect(await screen.findByText(/concepts checked/i)).toBeInTheDocument();
  expect(download).toBeEnabled();
});

it('marks a new form as new', () => {
  render(<FormStudioPanel schema={newFormSchema('')} />);
  expect(screen.getByText(/new form/i)).toBeInTheDocument();
});
