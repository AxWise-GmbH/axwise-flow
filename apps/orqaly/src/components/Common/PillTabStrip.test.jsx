import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

import PillTabStrip from './PillTabStrip';

function renderStrip(props = {}, children = <button type="button">All</button>) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <PillTabStrip {...props}>{children}</PillTabStrip>
    </ThemeProvider>
  );
}

describe('PillTabStrip', () => {
  it('renders its tab children', () => {
    renderStrip(
      {},
      <>
        <button type="button">All</button>
        <button type="button">Active</button>
      </>
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
  });

  it('forwards data-* attributes to the outer container', () => {
    renderStrip({ 'data-tour-block': 'org-tabs', 'data-testid': 'strip' });
    expect(screen.getByTestId('strip')).toHaveAttribute('data-tour-block', 'org-tabs');
  });

  it('accepts a custom radius without dropping children', () => {
    renderStrip({ radius: 2.5, 'data-testid': 'strip' });
    expect(screen.getByTestId('strip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });
});
