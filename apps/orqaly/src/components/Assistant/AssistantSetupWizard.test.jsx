import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Replace the real step catalog (which pulls in every card + its services) with
// a tiny two-step fixture so the wizard's navigation/gating is what's tested.
vi.mock('./setupSteps', () => ({
  ASSISTANT_SETUP_STEPS: [
    {
      key: 'a',
      label: 'First step',
      short: 'A',
      Card: ({ onComplete }) => <button onClick={() => onComplete({ config: {} })}>do-a</button>,
    },
    {
      key: 'keys',
      label: 'Brain step',
      short: 'Brain',
      required: true,
      Card: ({ onComplete }) => <button onClick={() => onComplete({ config: {} })}>do-keys</button>,
    },
  ],
}));

import AssistantSetupWizard from './AssistantSetupWizard';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

let onComplete;
let onFinish;
beforeEach(() => {
  onComplete = vi.fn(async () => ({}));
  onFinish = vi.fn();
});

describe('AssistantSetupWizard', () => {
  it('shows the first step and advances with Next', () => {
    wrap(
      <AssistantSetupWizard
        stepsDone={{}}
        config={{}}
        onComplete={onComplete}
        canFinish={false}
        onFinish={onFinish}
      />
    );
    expect(screen.getByText('First step')).toBeTruthy();
    expect(screen.getByText(/step 1 of 2/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Brain step')).toBeTruthy();
    expect(screen.getByText(/step 2 of 2/i)).toBeTruthy();
  });

  it('persists a completed card and auto-advances', async () => {
    wrap(
      <AssistantSetupWizard
        stepsDone={{}}
        config={{}}
        onComplete={onComplete}
        canFinish={false}
        onFinish={onFinish}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'do-a' }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith('a', expect.objectContaining({ config: {} }))
    );
    expect(screen.getByText(/step 2 of 2/i)).toBeTruthy();
  });

  it('gates Finish until the required step is done', () => {
    const { rerender } = wrap(
      <AssistantSetupWizard
        stepsDone={{}}
        config={{}}
        onComplete={onComplete}
        canFinish={false}
        onFinish={onFinish}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // to last step
    expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();

    rerender(
      <ThemeProvider theme={theme}>
        <AssistantSetupWizard
          stepsDone={{ keys: true }}
          config={{}}
          onComplete={onComplete}
          canFinish
          onFinish={onFinish}
        />
      </ThemeProvider>
    );
    const finish = screen.getByRole('button', { name: /finish/i });
    expect(finish).not.toBeDisabled();
    fireEvent.click(finish);
    expect(onFinish).toHaveBeenCalled();
  });
});
