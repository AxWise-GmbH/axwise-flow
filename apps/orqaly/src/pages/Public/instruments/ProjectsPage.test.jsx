import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from './ProjectsPage';
import { PROJECTS_PILLARS, PROJECTS_HUB_INTRO } from '../../../data/projectsPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public ProjectsPage', () => {
  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText(PROJECTS_HUB_INTRO.eyebrow)).toBeInTheDocument();
    expect(screen.getAllByText(PROJECTS_HUB_INTRO.title).length).toBeGreaterThanOrEqual(1);
    PROJECTS_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders spotlights and in-app link', () => {
    renderPage();
    expect(screen.getByText(/Tasks, agents, KB, KPIs/i)).toBeInTheDocument();
    expect(screen.getByText(/Context that stays in the project/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in app/i })).toHaveAttribute('href', '/projects');
  });

  it('renders closing CTA', () => {
    renderPage();
    expect(screen.getByText(/Group your work/i)).toBeInTheDocument();
  });
});
