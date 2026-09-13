import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

// Stub PublicShell so the test does not pull in StickyNav (AiOrb, IntersectionObserver,
// etc.) and only exercises the page's own content.
vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

import Features from './Features';

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <Features />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('Features public page', () => {
  it('renders the hero title', () => {
    renderPage();
    expect(
      screen.getByText('Everything you need to run an AI-powered business.'),
    ).toBeInTheDocument();
  });

  it('renders both hero CTAs', () => {
    renderPage();
    expect(screen.getAllByRole('link', { name: /Start free/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /See pricing/i }).length).toBeGreaterThan(0);
  });

  it('renders all eight feature spotlights', () => {
    renderPage();
    expect(screen.getByText('Describe an outcome. Ship a deliverable.')).toBeInTheDocument();
    expect(screen.getByText('One inbox for every ask.')).toBeInTheDocument();
    expect(screen.getByText('A council of specialists, not one model.')).toBeInTheDocument();
    expect(screen.getByText('Discover, fork, and publish.')).toBeInTheDocument();
    expect(screen.getByText('Talk to your agents, anywhere.')).toBeInTheDocument();
    expect(screen.getByText('Memory that sticks.')).toBeInTheDocument();
    expect(screen.getByText('Charts in English.')).toBeInTheDocument();
    expect(screen.getByText('Multi-tenant from day one.')).toBeInTheDocument();
  });

  it('renders the comparison matrix', () => {
    renderPage();
    expect(screen.getByText('Orqaly vs the stitched-together stack')).toBeInTheDocument();
  });

  it('renders the closing CTA pointing at signup', () => {
    renderPage();
    const closingPrimary = screen.getAllByRole('link', { name: /Start free/i });
    expect(closingPrimary.length).toBeGreaterThanOrEqual(1);
    expect(closingPrimary[0].getAttribute('href')).toBe('/signup');
  });

  it('renders the page-level title via document.title side effect', () => {
    renderPage();
    expect(document.title).toBe('Features - Orqaly');
  });
});
