import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';

import { getEnterpriseTheme } from '../../theme/enterpriseTheme';
import AttachButton from './AttachButton.jsx';

describe('AttachButton surface tone', () => {
  it('uses dark-surface icon ink inside Voice Studio even when the app is light', () => {
    render(
      <ThemeProvider theme={getEnterpriseTheme('light', null)}>
        <AttachButton onAdd={() => {}} onError={() => {}} surfaceTone="dark" />
      </ThemeProvider>
    );

    expect(getComputedStyle(screen.getByLabelText('Attach file')).color).toBe(
      'rgba(255, 255, 255, 0.6)'
    );
  });
});
