import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoAgentHubMap, { HUB_TAB_LABELS } from './DemoAgentHubMap';

describe('DemoAgentHubMap', () => {
  it('renders all seven tab labels', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoAgentHubMap />
      </ThemeProvider>,
    );
    HUB_TAB_LABELS.forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('app.orqaly.com / agent-hub')).toBeInTheDocument();
    expect(screen.getByText('Agent orchestration hub')).toBeInTheDocument();
  });
});
