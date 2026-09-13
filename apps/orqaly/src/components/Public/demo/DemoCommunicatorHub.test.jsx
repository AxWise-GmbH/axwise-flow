import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoCommunicatorHub, { WORKSPACE_SECTION_LABELS, COMMUNICATOR_SECTION_LABELS } from './DemoCommunicatorHub';

describe('DemoCommunicatorHub', () => {
  it('renders both views and workspace sections', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoCommunicatorHub />
      </ThemeProvider>,
    );
    expect(screen.getByText('app.orqaly.com / communicator')).toBeInTheDocument();
    expect(screen.getAllByText('Agent Workspace').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Communicator').length).toBeGreaterThanOrEqual(1);
    WORKSPACE_SECTION_LABELS.forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Live activity').length).toBeGreaterThanOrEqual(1);
  });

  it('exports communicator section labels', () => {
    expect(COMMUNICATOR_SECTION_LABELS).toContain('Channels');
    expect(COMMUNICATOR_SECTION_LABELS).toContain('Audit Log');
  });
});
