import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

function mockReducedMotion(matches) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

import HowItWorks from './HowItWorks';

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <HowItWorks />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('HowItWorks public page', () => {
  let matchMediaSpy;

  beforeEach(() => {
    matchMediaSpy = mockReducedMotion(true);
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  it('renders the hero title and subtitle in the animated demo block', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'From idea - to ready business' })).toBeInTheDocument();
    expect(
      screen.getByText('No prompts, No PRDs. Describe a goal - agents do the rest.'),
    ).toBeInTheDocument();
  });

  it('renders the landing hero animated demo', () => {
    renderPage();
    expect(screen.getByText(/ships to:/i)).toBeInTheDocument();
    expect(screen.getByText('I want to build a landing page for my SaaS')).toBeInTheDocument();
    expect(screen.getByText('Tool: Framer')).toBeInTheDocument();
  });

  it('does not render duplicate hero Start free or See features buttons', () => {
    renderPage();
    expect(screen.getAllByRole('link', { name: /Start free/i })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /See features/i })).toHaveLength(1);
  });

  it('renders the four step deep-dive titles', () => {
    renderPage();
    // Each deep-dive renders the step title as its own h2 (Define, Plan, Execute, Deliver).
    // The reused landing HowItWorks section also surfaces the labels, so we look for
    // both occurrences without asserting uniqueness.
    ['Define', 'Plan', 'Execute', 'Deliver'].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it('renders the behind-the-scenes timeline title', () => {
    renderPage();
    expect(screen.getByText('What happens behind the scenes.')).toBeInTheDocument();
  });

  it('renders the BeforeAfter title', () => {
    renderPage();
    expect(screen.getByText('Two paths to the same outcome.')).toBeInTheDocument();
  });

  it('renders the closing CTA pointing at signup', () => {
    renderPage();
    const startLinks = screen.getAllByRole('link', { name: /Start free/i });
    expect(startLinks.length).toBeGreaterThanOrEqual(1);
    expect(startLinks[0].getAttribute('href')).toBe('/signup');
  });

  it('sets the document title', () => {
    renderPage();
    expect(document.title).toBe('How it works - Orqaly');
  });
});
