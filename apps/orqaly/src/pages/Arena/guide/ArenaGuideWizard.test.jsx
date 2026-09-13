import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ArenaGuideWizard from './ArenaGuideWizard';

const theme = createTheme();

// A tiny fixture catalog, so the wizard's navigation and gating is what is
// tested — the same approach AssistantSetupWizard.test.jsx takes.
const CardA = ({ onComplete }) => (
  <button data-testid="card-a" onClick={() => onComplete({ a: true })}>
    finish a
  </button>
);
const CardB = () => <div data-testid="card-b" />;
const CardC = () => <div data-testid="card-c" />;

const STEPS = [
  { key: 'a', label: 'Step A', short: 'A', icon: null, Card: CardA, required: true, desc: 'first' },
  {
    key: 'b',
    label: 'Step B',
    short: 'B',
    icon: null,
    Card: CardB,
    required: false,
    desc: 'second',
  },
  { key: 'c', label: 'Step C', short: 'C', icon: null, Card: CardC, required: true, desc: 'last' },
];

function setup(props = {}) {
  const onComplete = vi.fn(async () => {});
  const onFinish = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <ArenaGuideWizard
        steps={STEPS}
        stepsDone={{}}
        onComplete={onComplete}
        onFinish={onFinish}
        finishLabel="Open the Arena"
        {...props}
      />
    </ThemeProvider>
  );
  return { onComplete, onFinish };
}

describe('ArenaGuideWizard', () => {
  it('starts on the first step', () => {
    setup();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('card-a')).toBeInTheDocument();
  });

  it('opens at a step named by key', () => {
    setup({ initialStep: 'b' });
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });

  it('clamps a numeric initialStep into range', () => {
    setup({ initialStep: 99 });
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
  });

  it('persists then advances when a card completes', async () => {
    const { onComplete } = setup();
    fireEvent.click(screen.getByTestId('card-a'));
    expect(onComplete).toHaveBeenCalledWith('a', { a: true });
    expect(await screen.findByTestId('card-b')).toBeInTheDocument();
  });

  it('offers Skip only on optional steps', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('walks back and forward with the footer', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('shows the custom finish label on the last step and fires onFinish', () => {
    const { onFinish } = setup({ initialStep: 'c' });
    const finish = screen.getByRole('button', { name: /Open the Arena/ });
    fireEvent.click(finish);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('jumps anywhere from the stepper circles', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /C$/ }));
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
  });
});
