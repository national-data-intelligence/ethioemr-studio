import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { navigate } from '@openmrs/esm-framework';
import FormStudioNavTile from './form-studio-nav-tile.component';

it('closes the menu and opens Form Studio', async () => {
  window.spaBase = '/openmrs/spa';
  const hideOverlay = vi.fn();
  render(<FormStudioNavTile hideOverlay={hideOverlay} />);

  await userEvent.click(screen.getByRole('button', { name: /form studio/i }));

  expect(hideOverlay).toHaveBeenCalledWith(false);
  expect(navigate).toHaveBeenCalledWith({ to: '/openmrs/spa/form-studio' });
});
