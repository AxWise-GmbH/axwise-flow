import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import LandingRoot from './LandingRoot';

function renderRoot() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <LandingRoot />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('LandingRoot', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // The Full variant renders StickyNav, whose active-anchor tracking uses
    // IntersectionObserver (absent in jsdom). Scoped to this file rather than
    // global setup, since useInView.test.js relies on it being undefined by
    // default to test the fallback path.
    globalThis.IntersectionObserver = class IntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    delete globalThis.IntersectionObserver;
  });

  it('renders the full landing page', () => {
    renderRoot();
    expect(screen.getByText('AI-Driven Success')).toBeInTheDocument();
  });

  it('renders the full landing page even when localStorage remembers the simple variant', () => {
    window.localStorage.setItem('orqaly_landing_variant', 'simple');
    renderRoot();
    expect(screen.getByText('AI-Driven Success')).toBeInTheDocument();
    expect(screen.queryByText('Your AI team, ready to work.')).not.toBeInTheDocument();
  });

  it('renders no Simple/Full variant switcher', () => {
    renderRoot();
    expect(screen.queryByRole('group', { name: 'Landing page style' })).not.toBeInTheDocument();
  });
});
