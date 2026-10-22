import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useConfig } from '@openmrs/esm-framework';
import { type Config } from './config-schema';
import Root from './root.component';

// the editor page (Ace code editor, file-loader imports) is exercised in the browser, not in this page test
vi.mock('./builder/components/form-editor/form-editor.component', () => ({ default: () => null }));

const mockUseConfig = vi.mocked(useConfig<Config>);

it('renders the start page: banner, the three starting points', () => {
  mockUseConfig.mockReturnValue({
    allowedEncounterTypeUuids: [],
    blockedQuestionConceptClasses: [],
    descriptionWordRange: { min: 18, max: 40 },
    showTestInstanceBanner: true,
  } as Config); // only the settings this page reads

  // The router only renders under its base path, as in the browser: /openmrs/spa/form-studio
  window.spaBase = '/openmrs/spa';
  window.history.pushState({}, '', '/openmrs/spa/form-studio');

  render(<Root />);

  expect(screen.getByRole('heading', { name: /^form studio$/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /create a new form/i })).toBeInTheDocument();
  for (const start of [/from scratch/i, /from a bahmni export/i, /from an excel template/i]) {
    expect(screen.getByRole('link', { name: start })).toHaveAttribute(
      'href',
      expect.stringContaining('/form-studio/new'),
    );
  }
  expect(screen.getByText(/for test instances only/i)).toBeInTheDocument();
});
