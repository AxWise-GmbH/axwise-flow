import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import RequestsPage from './RequestsPage';
import { GOAL_PILLARS } from '../../../data/requestsPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <RequestsPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public RequestsPage', () => {
  it('renders the goal lifecycle hero copy', () => {
    renderPage();
    expect(screen.getByText('Every ask becomes a goal you can run end to end.')).toBeInTheDocument();
    expect(screen.getAllByText(/Smart Request in Job Pool/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Open Job Pool')).toBeInTheDocument();
  });

  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText('Goal lifecycle')).toBeInTheDocument();
    GOAL_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders lifecycle spotlights', () => {
    renderPage();
    expect(screen.getByText(/Smart Request turns the ask into a goal/i)).toBeInTheDocument();
    expect(screen.getByText(/See every stage until agents execute/i)).toBeInTheDocument();
    expect(screen.getByText(/Full control from the actions menu/i)).toBeInTheDocument();
    expect(screen.getByText(/Deliverables, report, and the next ask/i)).toBeInTheDocument();
  });

  it('renders inbox demo and closing CTA', () => {
    renderPage();
    expect(screen.getByText(/Inbox · all routes/i)).toBeInTheDocument();
    expect(screen.getByText(/each becomes a goal in Job Pool/i)).toBeInTheDocument();
    expect(screen.getByText(/Submit one ask/i)).toBeInTheDocument();
  });

  it('renders related grid links', () => {
    renderPage();
    expect(screen.getAllByText('Job Pool').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Organizations').length).toBeGreaterThanOrEqual(1);
  });
});
