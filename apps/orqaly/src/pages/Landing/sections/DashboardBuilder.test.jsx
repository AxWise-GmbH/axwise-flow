import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import DashboardBuilder from './DashboardBuilder';

function renderSection() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <DashboardBuilder />
      </ThemeProvider>
    </MemoryRouter>
  );
}

const CATEGORIES = ['AI Costs', 'Marketing', 'Operational', 'Accountant', 'Partners', 'Custom'];

describe('DashboardBuilder section', () => {
  it('renders the section heading', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: 'One sentence in. A live dashboard out.' })
    ).toBeInTheDocument();
  });

  it('renders all six category titles', () => {
    renderSection();
    CATEGORIES.forEach((title) => {
      // "AI Costs" also appears as a starter chip, so allow >= 1 match.
      expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders the primary CTA linking to /signup with prompt', () => {
    renderSection();
    const cta = screen.getByRole('link', { name: /Build your first dashboard/i });
    expect(cta).toBeInTheDocument();
    expect(cta.getAttribute('href')).toMatch(/^\/signup\?/);
  });
});
