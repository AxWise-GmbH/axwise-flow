import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import WorkflowPage from './WorkflowPage';
import { WORKFLOW_PILLARS, WORKFLOW_HUB_INTRO } from '../../../data/workflowPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <WorkflowPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public WorkflowPage', () => {
  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText(WORKFLOW_HUB_INTRO.eyebrow)).toBeInTheDocument();
    expect(screen.getAllByText(WORKFLOW_HUB_INTRO.title).length).toBeGreaterThanOrEqual(1);
    WORKFLOW_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders spotlights and in-app link', () => {
    renderPage();
    expect(screen.getByText(/Trigger, agent, tool, notify/i)).toBeInTheDocument();
    expect(screen.getByText(/See exactly what ran/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open canvas/i })).toHaveAttribute('href', '/workflow');
  });

  it('renders closing CTA', () => {
    renderPage();
    expect(screen.getByText(/Stop writing glue code/i)).toBeInTheDocument();
  });
});
