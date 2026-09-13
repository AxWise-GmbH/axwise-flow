import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoGoalCommandCenter, { GOAL_DETAIL_TABS } from './DemoGoalCommandCenter';

describe('DemoGoalCommandCenter', () => {
  it('renders goal detail tabs and pipeline', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoGoalCommandCenter />
      </ThemeProvider>,
    );
    GOAL_DETAIL_TABS.forEach((tab) => {
      expect(screen.getByText(tab)).toBeInTheDocument();
    });
    expect(screen.getByText('app.orqaly.com / job-pool')).toBeInTheDocument();
    expect(screen.getByText(/Create a landing page for AaaS/i)).toBeInTheDocument();
    expect(screen.getByText(/Budget:/i)).toBeInTheDocument();
    expect(screen.getAllByText('Team Formation').length).toBeGreaterThanOrEqual(1);
  });
});
