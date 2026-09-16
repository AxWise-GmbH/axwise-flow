import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./GcpStandardNav.jsx', () => ({
  default: () => <aside data-testid="workspace-nav" />,
}));

import GcpStandartShell from './GcpStandartShell.jsx';

const theme = createTheme({ palette: { mode: 'dark' } });

afterEach(() => {
  cleanup();
});

describe('GcpStandartShell', () => {
  it('uses one full-height side shell with no separate application header', () => {
    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <GcpStandartShell />
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('gcp-workspace-shell')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-nav')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'gcp-main');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#gcp-main'
    );
  });
});
