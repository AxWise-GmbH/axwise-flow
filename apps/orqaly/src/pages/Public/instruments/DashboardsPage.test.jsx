import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import DashboardsPage from './DashboardsPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <DashboardsPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public DashboardsPage', () => {
  it('points the primary hero CTA at the Dashboard Builder', () => {
    renderPage();
    const builderCta = screen.getByRole('link', { name: /Open the Dashboard Builder/i });
    expect(builderCta).toHaveAttribute('href', '/dashboards/new');
  });

  it('highlights builder and templates paths above the fold', () => {
    renderPage();
    expect(screen.getByText('Describe it. Ship it.')).toBeInTheDocument();
    expect(screen.getByText('Start from a category.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the builder/i })).toHaveAttribute('href', '/dashboards/new');
    const templateLinks = screen.getAllByRole('link', { name: /Browse templates|See templates/i });
    expect(templateLinks.some((el) => el.getAttribute('href')?.includes('dashboard-templates'))).toBe(true);
  });

  it('renders the builder section with interactive build CTA', () => {
    renderPage();
    expect(screen.getByText(/One sentence in\. Two quick questions/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Build it/i })).toHaveAttribute('href', '/dashboards/new');
  });

  it('renders the templates gallery with categories', () => {
    renderPage();
    expect(screen.getByText(/Pick a category\. Fork it/i)).toBeInTheDocument();
    expect(screen.getAllByText('AI Costs').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /Browse all templates/i })).toHaveAttribute('href', '/dashboards');
  });

  it('shows category-specific dashboard previews when clicking templates', () => {
    renderPage();
    expect(screen.getByText('Spend by model')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Marketing\s+Leads, ROI, funnel/i }));
    expect(screen.getByText('Conversion funnel')).toBeInTheDocument();
    expect(screen.getByText('ROI by channel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Custom\s+Blank canvas/i }));
    expect(screen.getByText(/Describe your dashboard in plain English/i)).toBeInTheDocument();
    expect(screen.getByText('Chart')).toBeInTheDocument();
  });
});
