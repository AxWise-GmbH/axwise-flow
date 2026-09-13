import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import ReportsPage from './ReportsPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('Public ReportsPage', () => {
  it('points the primary hero CTA at the Report Builder', () => {
    renderPage();
    const builderCta = screen.getByRole('link', { name: /Open the Report Builder/i });
    expect(builderCta).toHaveAttribute('href', '/reports/builder');
  });

  it('offers a CTA to view a live report result', () => {
    renderPage();
    const viewCta = screen.getByRole('link', { name: /View a live report/i });
    expect(viewCta).toHaveAttribute('href', '/reports');
  });

  it('renders the AI report core spotlight', () => {
    renderPage();
    expect(screen.getByText('AI report core')).toBeInTheDocument();
    expect(
      screen.getByText(/Build the report\. The AI core reads the numbers/i)
    ).toBeInTheDocument();
  });

  it('lets visitors open the result and the builder from the AI core spotlight', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /View the result/i })).toHaveAttribute('href', '/reports');
    expect(screen.getByRole('link', { name: /Open the builder/i })).toHaveAttribute(
      'href',
      '/reports/builder'
    );
  });
});
