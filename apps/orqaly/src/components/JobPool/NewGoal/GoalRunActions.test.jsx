import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const runGoalAction = vi.fn();
// Only the network call is stubbed. availableGoalActions stays real so these
// tests exercise the same precondition table the thread ships with.
vi.mock('../../Goals/goalActions', async (importOriginal) => ({
  ...(await importOriginal()),
  runGoalAction: (...args) => runGoalAction(...args),
}));

import GoalRunActions from './GoalRunActions';

const goal = { id: 'g1', status: 'failed' };

describe('GoalRunActions', () => {
  beforeEach(() => {
    runGoalAction.mockReset();
    runGoalAction.mockResolvedValue({ ok: true });
  });

  it('renders nothing without actions or without a goal', () => {
    const { container, rerender } = render(<GoalRunActions actions={[]} goal={goal} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<GoalRunActions actions={[{ type: 'retry_goal', label: 'Try again' }]} goal={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('runs an action from the message it is attached to', async () => {
    render(
      <GoalRunActions
        actions={[
          { type: 'heal_goal', label: 'Let it try to recover' },
          { type: 'retry_goal', label: 'Try again' },
        ]}
        goal={goal}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(runGoalAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'retry_goal' }),
      goal
    );
    // It reports back in place rather than silently succeeding.
    await waitFor(() => expect(screen.getByText('Try again sent')).toBeInTheDocument());
  });

  it('asks for a value before running an action that needs one', async () => {
    render(
      <GoalRunActions
        actions={[
          {
            type: 'resolve_increase_budget',
            label: 'Add budget',
            field: 'new_budget_usd',
            params: { new_budget_usd: '' },
          },
        ]}
        goal={goal}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add budget' }));
    // The first click opens the field; nothing has been sent yet.
    expect(runGoalAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Add budget'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(runGoalAction).toHaveBeenCalledWith(
      expect.objectContaining({ params: { new_budget_usd: '25' } }),
      goal
    );
  });

  it('opens the scope review instead of approving Gate 1 directly', () => {
    const onReviewContext = vi.fn();
    render(
      <GoalRunActions
        actions={[{ type: 'approve_context', label: 'Review scope' }]}
        goal={{ id: 'g1', status: 'awaiting_context_approval' }}
        onReviewContext={onReviewContext}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review scope' }));

    expect(onReviewContext).toHaveBeenCalledTimes(1);
    expect(runGoalAction).not.toHaveBeenCalled();
  });

  it('says so in the thread when an action does not go through', async () => {
    runGoalAction.mockResolvedValue({ ok: false, error: 'Goal is not in a resolvable state' });
    render(<GoalRunActions actions={[{ type: 'retry_goal', label: 'Try again' }]} goal={goal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(
        screen.getByText(/Try again did not go through: Goal is not in a resolvable state/)
      ).toBeInTheDocument()
    );
  });
});

describe('GoalRunActions hides what the server would refuse', () => {
  it('drops a retry on a needs_human goal and keeps what works', () => {
    // handleRetry wants failed or cancelled. Showing the button anyway means a
    // click that 400s and a user back where they started.
    render(
      <GoalRunActions
        actions={[
          { type: 'heal_goal', label: 'Let it try to recover' },
          { type: 'retry_goal', label: 'Try again' },
        ]}
        goal={{ id: 'g1', status: 'needs_human' }}
      />
    );
    expect(screen.getByRole('button', { name: 'Let it try to recover' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('renders nothing when the status leaves no usable action', () => {
    const { container } = render(
      <GoalRunActions
        actions={[{ type: 'retry_goal', label: 'Try again' }]}
        goal={{ id: 'g1', status: 'active' }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
