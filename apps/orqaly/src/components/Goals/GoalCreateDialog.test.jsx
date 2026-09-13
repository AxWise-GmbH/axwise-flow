import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material';
import GoalCreateDialog from './GoalCreateDialog';

vi.mock('../../services/goalService', () => ({
  createGoal: vi.fn(),
  createGoalSourceRequestId: vi.fn(),
}));

vi.mock('./ExecutorPicker', () => ({
  default: ({ setOrgId }) => (
    <button type="button" onClick={() => setOrgId('org-1')}>
      Select test organization
    </button>
  ),
}));

vi.mock('./LoopSwitchBlock', () => ({
  default: () => null,
}));

import { createGoal, createGoalSourceRequestId } from '../../services/goalService';

const theme = createTheme();

function renderDialog(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <GoalCreateDialog open onClose={vi.fn()} onCreated={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

async function submitGoal() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Launch Goal' }));
    await Promise.resolve();
  });
}

describe('GoalCreateDialog create idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGoalSourceRequestId
      .mockReturnValueOnce('source-request-1')
      .mockReturnValueOnce('source-request-2');
  });

  it('reuses one source request id for a retry and rotates it when the intent changes', async () => {
    createGoal
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockRejectedValueOnce(new Error('Still reconciling'))
      .mockResolvedValueOnce({ id: 'goal-2', title: 'A changed goal' });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Select test organization' }));
    fireEvent.change(screen.getByLabelText('What do you want to achieve?'), {
      target: { value: 'Create a durable goal' },
    });

    await submitGoal();
    expect(await screen.findByText('Response lost')).toBeInTheDocument();
    await submitGoal();
    expect(await screen.findByText('Still reconciling')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('What do you want to achieve?'), {
      target: { value: 'A changed goal' },
    });
    await submitGoal();

    expect(createGoal.mock.calls.map(([payload]) => payload.source_request_id)).toEqual([
      'source-request-1',
      'source-request-1',
      'source-request-2',
    ]);
    expect(createGoalSourceRequestId).toHaveBeenCalledTimes(2);
  });
});
