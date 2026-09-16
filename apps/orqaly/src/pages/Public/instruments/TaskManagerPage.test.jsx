import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import TaskManagerPage from './TaskManagerPage';
import { TASK_MANAGER_PILLARS, TASK_MANAGER_HUB_INTRO } from '../../../data/taskManagerPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <TaskManagerPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public TaskManagerPage', () => {
  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText(TASK_MANAGER_HUB_INTRO.eyebrow)).toBeInTheDocument();
    expect(screen.getAllByText(/One task list for every process/i).length).toBeGreaterThanOrEqual(1);
    TASK_MANAGER_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders four spotlights including agent review', () => {
    renderPage();
    expect(screen.getByText(/Workflows, projects, partners/i)).toBeInTheDocument();
    expect(screen.getByText('Agent assignment')).toBeInTheDocument();
    expect(screen.getAllByText(/Iterate without losing/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Filter fast/i)).toBeInTheDocument();
  });

  it('renders feature mosaic and closing CTA', () => {
    renderPage();
    expect(screen.getByText('Everything in one control surface')).toBeInTheDocument();
    expect(screen.getByText('Put every task in one place.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in app/i })).toHaveAttribute('href', '/task-manager');
  });
});
