import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoOrgCommandCenter, { ORG_DRAWER_TABS } from './DemoOrgCommandCenter';

describe('DemoOrgCommandCenter', () => {
  it('renders drawer tabs and org metrics', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoOrgCommandCenter />
      </ThemeProvider>,
    );
    ORG_DRAWER_TABS.forEach((tab) => {
      expect(screen.getAllByText(tab).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('app.orqaly.com / organizations')).toBeInTheDocument();
    expect(screen.getAllByText('Roastedco').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Active goals')).toBeInTheDocument();
    expect(screen.getByText('KB docs')).toBeInTheDocument();
  });
});
