import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import TokenTrackingBanner from './TokenTrackingBanner';

function renderSection() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <TokenTrackingBanner />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('TokenTrackingBanner landing section', () => {
  it('renders the Token Tracking eyebrow and hero copy', () => {
    renderSection();
    expect(screen.getByText('Token Tracking')).toBeInTheDocument();
    expect(screen.getByText('Spend - We Track')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Track individual moments inside your goal, monitor the results, and switch models/i
      )
    ).toBeInTheDocument();
  });

  it('renders feature tiles', () => {
    renderSection();
    expect(screen.getByText('Per-step usage')).toBeInTheDocument();
    expect(screen.getByText('Phase totals')).toBeInTheDocument();
    expect(screen.getByText('Model switch')).toBeInTheDocument();
  });

  it('renders the token tracking demo mock', () => {
    renderSection();
    expect(screen.getByText(/Launch Pro tier pricing page/i)).toBeInTheDocument();
    expect(screen.getByText('Groq')).toBeInTheDocument();
    expect(screen.getAllByText('GPT-4o').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Switch model')).toBeInTheDocument();
  });

  it('renders enriched token summary footer', () => {
    renderSection();
    expect(screen.getByText('Amount of tokens')).toBeInTheDocument();
    expect(screen.getByText(/4,220 in · 1,890 out/i)).toBeInTheDocument();
    expect(screen.getByText('By model')).toBeInTheDocument();
    expect(screen.getByText(/Groq 1\.2k/i)).toBeInTheDocument();
    expect(screen.getByText(/48%/)).toBeInTheDocument();
    expect(screen.getByText(/Best result on Draft copy/i)).toBeInTheDocument();
  });

  it('links the CTA to the goals page', () => {
    renderSection();
    expect(screen.getByRole('link', { name: /Open goals/i })).toHaveAttribute('href', '/goals');
  });

  describe('mobile layout', () => {
    let matchMediaSpy;

    beforeEach(() => {
      matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        matches: typeof query === 'string' && query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    });

    afterEach(() => {
      matchMediaSpy.mockRestore();
    });

    it('hides feature tiles until Read More is pressed', () => {
      renderSection();

      expect(screen.queryByText('Per-step usage')).not.toBeInTheDocument();
      expect(screen.queryByText('Phase totals')).not.toBeInTheDocument();
      expect(screen.queryByText('Model switch')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Read More' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Read More' }));

      expect(screen.getByText('Per-step usage')).toBeInTheDocument();
      expect(screen.getByText('Phase totals')).toBeInTheDocument();
      expect(screen.getByText('Model switch')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Read Less' })).toBeInTheDocument();
    });
  });
});
