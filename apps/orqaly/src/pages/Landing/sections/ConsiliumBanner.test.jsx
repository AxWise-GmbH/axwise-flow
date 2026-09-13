import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import ConsiliumBanner from './ConsiliumBanner';

function mockMatchMedia(matches) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: typeof matches === 'function' ? matches(query) : matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderSection() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <ConsiliumBanner />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('ConsiliumBanner landing section', () => {
  it('renders the Consilium eyebrow and hero copy', () => {
    renderSection();
    expect(screen.getByText('Consilium')).toBeInTheDocument();
    expect(screen.getByText('Debate, Vote - Record')).toBeInTheDocument();
  });

  it('renders platform-help tiles', () => {
    renderSection();
    expect(screen.getByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Headhunter')).toBeInTheDocument();
    expect(screen.getByText('Execution')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
  });

  it('renders the council demo mock without the council decision footer', () => {
    renderSection();
    expect(screen.getByText(/Should we launch the Pro tier/i)).toBeInTheDocument();
    expect(screen.queryByText('Council decision')).not.toBeInTheDocument();
    expect(screen.queryByText(/Launch Pro at \$29 with a churn cap/i)).not.toBeInTheDocument();
  });

  it('renders Knowledge and Workflow links on the first three council votes', () => {
    renderSection();
    expect(screen.getAllByText('Knowledge')).toHaveLength(3);
    expect(screen.getAllByText('Workflow')).toHaveLength(3);
  });

  it('links the CTA to the control consilium page', () => {
    renderSection();
    expect(screen.queryByRole('link', { name: /Try a council/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Try Consilium/i })).toHaveAttribute(
      'href',
      '/control/consilium'
    );
  });

  describe('mobile layout', () => {
    let matchMediaSpy;

    beforeEach(() => {
      matchMediaSpy = mockMatchMedia(
        (query) => typeof query === 'string' && query.includes('max-width')
      );
    });

    afterEach(() => {
      matchMediaSpy.mockRestore();
    });

    it('hides platform tiles until Read More is pressed', () => {
      renderSection();

      expect(screen.queryByText('Gateway')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Read More' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Read More' }));

      expect(screen.getByText('Gateway')).toBeInTheDocument();
      expect(screen.getByText('Monitoring')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Read Less' })).toBeInTheDocument();
    });
  });
});
