import { describe, it, expect, vi, beforeAll } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import HomeExplainTour from './HomeExplainTour';

beforeAll(() => {
  // jsdom implements neither, and the tour calls scrollIntoView on each step.
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = (query) => ({
    matches: true, // reduced motion -> deterministic, no smooth scroll
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

const theme = createTheme();
const STEPS = [
  { id: 'goals', label: 'Goals in Action' },
  { id: 'activity', label: 'Activity' },
];

// Controlled harness: renders the block anchors the tour looks for, plus the
// tour itself driven by local step/open state (mirrors HomeOverview).
function Harness({ onClose = () => {}, onAction = () => {} }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  return (
    <ThemeProvider theme={theme}>
      {STEPS.map((s) => (
        <div key={s.id} data-tour-block={s.id}>
          {s.label} block
        </div>
      ))}
      <HomeExplainTour
        open={open}
        steps={STEPS}
        stepIndex={step}
        onBack={() => setStep((n) => Math.max(0, n - 1))}
        onNext={() => setStep((n) => (n >= STEPS.length - 1 ? (setOpen(false), n) : n + 1))}
        onAction={onAction}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
      />
    </ThemeProvider>
  );
}

describe('HomeExplainTour', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <HomeExplainTour open={false} steps={STEPS} stepIndex={0} />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the first block with its explanation copy and step counter', async () => {
    render(<Harness />);
    expect(await screen.findByText('Goals in Action')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Where the data comes from')).toBeInTheDocument();
    expect(screen.getByText(/goals table/i)).toBeInTheDocument();
  });

  it('advances and retreats through steps with Next/Back', async () => {
    render(<Harness />);
    await screen.findByText('Goals in Action');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    // Last step swaps the primary action label to Done.
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Goals in Action')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('Back is disabled on the first step', async () => {
    render(<Harness />);
    await screen.findByText('Goals in Action');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('renders the block CTA and fires onAction with its cta payload', async () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    await screen.findByText('Goals in Action');
    const cta = screen.getByRole('button', { name: 'Create a goal' });
    fireEvent.click(cta);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'navigate', to: '/job-pool?action=create' })
    );
  });

  it('Skip closes the tour', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await screen.findByText('Goals in Action');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Done past the last step closes the tour', async () => {
    render(<Harness />);
    await screen.findByText('Goals in Action');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Activity');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });
});
