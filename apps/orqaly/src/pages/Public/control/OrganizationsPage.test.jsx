import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import OrganizationsPage from './OrganizationsPage';
import { ORG_PILLARS } from '../../../data/organizationsPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <OrganizationsPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public OrganizationsPage', () => {
  it('renders the org command center hero copy', () => {
    renderPage();
    expect(screen.getByText('One organization. Every goal, team, and doc in one place.')).toBeInTheDocument();
    expect(screen.getByText(/Open an org command center/i)).toBeInTheDocument();
    expect(screen.getByText(/Row-Level Security at the database/i)).toBeInTheDocument();
  });

  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText('Org command center')).toBeInTheDocument();
    ORG_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders goal, team, and KB spotlights', () => {
    renderPage();
    expect(screen.getByText(/Every goal for this business/i)).toBeInTheDocument();
    expect(screen.getByText(/Review who worked/i)).toBeInTheDocument();
    expect(screen.getByText(/One knowledge base per organization/i)).toBeInTheDocument();
  });

  it('renders workspace switcher and RLS sections', () => {
    renderPage();
    expect(screen.getByText(/One login\. A separate hub per org/i)).toBeInTheDocument();
    expect(screen.getByText(/Workspace switcher/i)).toBeInTheDocument();
    expect(screen.getAllByText(/RLS at the database/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/WHERE org_id = current_user.org/i)).toBeInTheDocument();
  });

  it('renders closing CTA and related grid', () => {
    renderPage();
    expect(screen.getByText(/Stand up one org/i)).toBeInTheDocument();
    expect(screen.getAllByText('Job Pool').length).toBeGreaterThanOrEqual(1);
  });
});
