import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoMarketplaceHub, { MARKETPLACE_TAB_LABELS } from './DemoMarketplaceHub';

describe('DemoMarketplaceHub', () => {
  it('renders marketplace tabs and listings', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoMarketplaceHub />
      </ThemeProvider>,
    );
    expect(screen.getByText('app.orqaly.com / marketplace')).toBeInTheDocument();
    MARKETPLACE_TAB_LABELS.forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText(/creators earn crypto/i)).toBeInTheDocument();
  });
});
