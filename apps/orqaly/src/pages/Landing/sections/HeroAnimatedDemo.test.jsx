import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import HeroAnimatedDemo, { HERO_DEMO_FIRST_PROMPT } from './HeroAnimatedDemo';

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

function renderDemo() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <HeroAnimatedDemo />
    </ThemeProvider>
  );
}

describe('HeroAnimatedDemo', () => {
  let matchMediaSpy;

  beforeEach(() => {
    matchMediaSpy = mockReducedMotion(true);
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  it('renders ships to label', () => {
    renderDemo();
    expect(screen.getByText(/ships to:/i)).toBeInTheDocument();
  });

  it('shows first case prompt and completed step when reduced motion is preferred', () => {
    renderDemo();
    expect(screen.getByText(HERO_DEMO_FIRST_PROMPT)).toBeInTheDocument();
    expect(screen.getByText('Tool: Framer')).toBeInTheDocument();
    expect(screen.getByText('Hero designed')).toBeInTheDocument();
    expect(screen.getByText('Live on your domain')).toBeInTheDocument();
  });
});
