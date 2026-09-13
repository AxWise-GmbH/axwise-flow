import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

// CryptoDonateDialog pulls in heavier crypto / dialog deps that are unrelated to
// the page's content surface; stub it out.
vi.mock('../../components/Donate/CryptoDonateDialog', () => ({
  default: () => null,
}));

import Pricing from './Pricing';

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <Pricing />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('Pricing public page', () => {
  it('renders the hero title', () => {
    renderPage();
    expect(screen.getByText('Simple pricing. Free forever for builders.')).toBeInTheDocument();
  });

  it('renders Free tier and Support cards like the landing page', () => {
    renderPage();
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Help us ship.')).toBeInTheDocument();
    expect(screen.queryByText('$5')).not.toBeInTheDocument();
    expect(screen.queryByText('Most popular')).not.toBeInTheDocument();
  });

  it('renders the tier showcase section heading and subtitle', () => {
    renderPage();
    expect(screen.getByText('Everything is Free')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Try our free solution and discover how it can streamline your daily processes/i,
      ),
    ).toBeInTheDocument();
  });

  it('does not render the tier comparison matrix', () => {
    renderPage();
    expect(screen.queryByText('Free vs Paid vs Business')).not.toBeInTheDocument();
    expect(screen.queryByText('Use existing agents')).not.toBeInTheDocument();
  });

  it('does not render the stats row', () => {
    renderPage();
    expect(screen.queryByText('To start')).not.toBeInTheDocument();
    expect(screen.queryByText('Refund window')).not.toBeInTheDocument();
  });

  it('renders the closing CTA with a signup link', () => {
    renderPage();
    expect(screen.getByText('Start free, upgrade when you outgrow it.')).toBeInTheDocument();
    const startLinks = screen.getAllByRole('link', { name: /Start free/i });
    expect(startLinks.length).toBeGreaterThanOrEqual(1);
    expect(startLinks[0].getAttribute('href')).toBe('/signup');
  });

  it('keeps the donate button reachable', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: /Donate/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('sets the document title', () => {
    renderPage();
    expect(document.title).toBe('Pricing - Orqaly');
  });
});
