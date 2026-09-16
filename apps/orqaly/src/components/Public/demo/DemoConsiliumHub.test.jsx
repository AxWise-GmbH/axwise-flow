import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoConsiliumHub, { CONSILIUM_TAB_LABELS } from './DemoConsiliumHub';

describe('DemoConsiliumHub', () => {
  it('renders consilium tabs and metrics', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoConsiliumHub />
      </ThemeProvider>,
    );
    expect(screen.getByText('app.orqaly.com / consilium')).toBeInTheDocument();
    CONSILIUM_TAB_LABELS.forEach((tab) => {
      expect(screen.getAllByText(tab).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Product Launch Board')).toBeInTheDocument();
    expect(screen.getByText('Total boards')).toBeInTheDocument();
  });
});
