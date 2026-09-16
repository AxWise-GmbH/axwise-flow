import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import TrustStrip, { connectMessage, LEFT_ITEMS, RIGHT_ITEMS } from './TrustStrip';

function renderStrip(matchDesktop = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: matchDesktop ? String(query).includes('min-width') : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

  return render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
      <TrustStrip />
    </ThemeProvider>
  );
}

describe('connectMessage', () => {
  it('formats provider and tool messages', () => {
    expect(connectMessage(LEFT_ITEMS[0])).toBe('Provider: OpenAI (Added to Core)');
    expect(connectMessage(RIGHT_ITEMS[0])).toBe('Tool: Figma (Added to Core)');
  });
});

describe('TrustStrip', () => {
  const originalMatchMedia = window.matchMedia;

  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe(target) {
        const rect = target?.getBoundingClientRect?.() ?? { width: 360, height: 140 };
        if (typeof this._cb === 'function') {
          this._cb([{ contentRect: { width: rect.width || 360, height: rect.height || 140 } }]);
        }
      }
      constructor(cb) {
        this._cb = cb;
      }
      disconnect() {}
      unobserve() {}
    };
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows connect dialog when (+) is clicked on an LLM', () => {
    renderStrip(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add OpenAI' }));
    expect(screen.getByText('Provider: OpenAI (Added to Core)')).toBeInTheDocument();
    expect(screen.getByText('Added to Core')).toBeInTheDocument();
  });

  it('shows tool message when (+) is clicked on a tool', () => {
    renderStrip(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add Figma' }));
    expect(screen.getByText('Tool: Figma (Added to Core)')).toBeInTheDocument();
  });

  it('renders kind badges instead of LLMs/Tools topic labels', () => {
    renderStrip(true);
    expect(screen.getAllByText('LLM').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Tool').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('LLMs')).not.toBeInTheDocument();
    expect(screen.queryByText('Tools')).not.toBeInTheDocument();
  });

  it('uses the original paired mobile connector strips', () => {
    renderStrip(false);
    expect(screen.getAllByTestId('mobile-connector-strip')).toHaveLength(2);
    expect(screen.queryByTestId('hub-connector-svg')).not.toBeInTheDocument();
  });
});
