import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import { HERO, MISSION, PILLARS, ROADMAP, VALUES, TRACTION_TITLE } from '../../data/about';

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

import About from './About';

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <About />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('About public page', () => {
  it('renders the hero title and mission section', () => {
    renderPage();
    expect(screen.getByText(HERO.title)).toBeInTheDocument();
    expect(screen.getByText(MISSION.title)).toBeInTheDocument();
    expect(screen.getByText(MISSION.tagline)).toBeInTheDocument();
  });

  it('renders hero CTAs', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Get started/i })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: /Contact us/i })).toHaveAttribute('href', '/contact');
  });

  it('renders the about hero demo', () => {
    renderPage();
    expect(screen.getByText('Operating system for goals')).toBeInTheDocument();
  });

  it('renders all five pillar sections with correct links', () => {
    renderPage();
    PILLARS.forEach((pillar) => {
      expect(screen.getByText(pillar.title)).toBeInTheDocument();
      const link = screen.getByRole('link', { name: new RegExp(pillar.cta, 'i') });
      expect(link.getAttribute('href')).toBe(pillar.to);
    });
  });

  it('renders pillar product demos', () => {
    renderPage();
    expect(screen.getByText(/Should we launch the Pro tier/i)).toBeInTheDocument();
  });

  it('renders the Now / Next / Later roadmap columns', () => {
    renderPage();
    ROADMAP.forEach((col) => {
      expect(screen.getByText(col.period)).toBeInTheDocument();
    });
    expect(screen.getByText('Public beta')).toBeInTheDocument();
    expect(screen.getByText('Multi-language support')).toBeInTheDocument();
    expect(screen.getByText('Blockchain DataBase')).toBeInTheDocument();
    expect(screen.getByText('Build Second brain')).toBeInTheDocument();
    expect(screen.getByText('Self-hosted Orqaly')).toBeInTheDocument();
  });

  it('renders values and traction stats', () => {
    renderPage();
    VALUES.forEach((value) => {
      expect(screen.getByText(value.title)).toBeInTheDocument();
    });
    expect(screen.getByText(TRACTION_TITLE)).toBeInTheDocument();
    expect(screen.getByText('industries served')).toBeInTheDocument();
    expect(screen.getByText('creator split')).toBeInTheDocument();
  });

  it('renders the closing CTA with a contact link', () => {
    renderPage();
    const contactLinks = screen.getAllByRole('link', { name: /Open contact form/i });
    expect(contactLinks.length).toBeGreaterThanOrEqual(1);
    expect(contactLinks[0].getAttribute('href')).toBe('/contact');
  });
});
