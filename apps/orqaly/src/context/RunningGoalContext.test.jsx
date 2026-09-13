/**
 * [module: frontend]
 *
 * The wire between the page showing a goal and the app shell heading it up.
 * Its whole job is to carry one goal upward without making the shell re-render
 * every time the page does - a live goal re-renders once a second.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { memo, useState } from 'react';
import { RunningGoalProvider, useRunningGoal, usePublishRunningGoal } from './RunningGoalContext';

// Memoised on purpose: the point of the assertion below is that the shell does
// not re-render when the page does, and an unmemoised child of the harness
// would re-render either way and measure nothing.
const Shell = memo(function Shell({ onRender }) {
  const { goal, handlers } = useRunningGoal();
  onRender?.(goal);
  return (
    <div>
      <span data-testid="shell-goal">{goal ? goal.title : 'none'}</span>
      <button type="button" onClick={() => handlers.onOpenGoal?.('g1')}>
        open
      </button>
    </div>
  );
});

function Page({ goal, handlers }) {
  usePublishRunningGoal(goal, handlers);
  return null;
}

describe('RunningGoalContext', () => {
  it('carries the page goal up to the shell', async () => {
    render(
      <RunningGoalProvider>
        <Shell />
        <Page goal={{ id: 'g1', title: 'Wedding invites', status: 'active' }} />
      </RunningGoalProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId('shell-goal')).toHaveTextContent('Wedding invites');
  });

  // The shell re-rendering once a second for the whole life of a run is the
  // failure this guards. A ticking clock changes the goal object; it does not
  // change anything the shell shows.
  it('ignores a new goal object whose watched fields are unchanged', async () => {
    const onRender = vi.fn();
    function Harness() {
      const [tick, setTick] = useState(0);
      return (
        <RunningGoalProvider>
          <Shell onRender={onRender} />
          {/* A fresh object each tick, same id/title/status. */}
          <Page goal={{ id: 'g1', title: 'Wedding invites', status: 'active', spent_usd: tick }} />
          <button type="button" onClick={() => setTick((t) => t + 1)}>
            tick
          </button>
        </RunningGoalProvider>
      );
    }
    render(<Harness />);
    await act(async () => {});
    const settled = onRender.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: 'tick' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'tick' }).click();
    });

    // The harness re-rendered twice; the shell did not follow it.
    expect(onRender.mock.calls.length).toBe(settled);
  });

  it('follows a field the shell does show', async () => {
    function Harness() {
      const [status, setStatus] = useState('active');
      return (
        <RunningGoalProvider>
          <Shell />
          <Page goal={{ id: 'g1', title: `Invites (${status})`, status }} />
          <button type="button" onClick={() => setStatus('paused')}>
            pause
          </button>
        </RunningGoalProvider>
      );
    }
    render(<Harness />);
    await act(async () => {});
    await act(async () => {
      screen.getByRole('button', { name: 'pause' }).click();
    });
    expect(screen.getByTestId('shell-goal')).toHaveTextContent('Invites (paused)');
  });

  // Navigate away and the shell must stop offering to cancel a goal the user
  // is no longer looking at.
  it('clears when the publishing page unmounts', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <RunningGoalProvider>
          <Shell />
          {open && <Page goal={{ id: 'g1', title: 'Wedding invites', status: 'active' }} />}
          <button type="button" onClick={() => setOpen(false)}>
            leave
          </button>
        </RunningGoalProvider>
      );
    }
    render(<Harness />);
    await act(async () => {});
    expect(screen.getByTestId('shell-goal')).toHaveTextContent('Wedding invites');

    await act(async () => {
      screen.getByRole('button', { name: 'leave' }).click();
    });
    expect(screen.getByTestId('shell-goal')).toHaveTextContent('none');
  });

  // The shell holds these across renders of the page that owns them, so they
  // must dispatch to whatever the page last supplied, not to a stale closure.
  it('calls through to the handler the page currently has', async () => {
    const first = vi.fn();
    const second = vi.fn();
    function Harness() {
      const [swapped, setSwapped] = useState(false);
      return (
        <RunningGoalProvider>
          <Shell />
          <Page
            goal={{ id: 'g1', title: 'Wedding invites', status: 'active' }}
            handlers={{ onOpenGoal: swapped ? second : first }}
          />
          <button type="button" onClick={() => setSwapped(true)}>
            swap
          </button>
        </RunningGoalProvider>
      );
    }
    render(<Harness />);
    await act(async () => {});
    await act(async () => {
      screen.getByRole('button', { name: 'swap' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'open' }).click();
    });
    expect(second).toHaveBeenCalledWith('g1');
    expect(first).not.toHaveBeenCalled();
  });

  it('is inert outside a provider rather than throwing', () => {
    render(<Shell />);
    expect(screen.getByTestId('shell-goal')).toHaveTextContent('none');
  });
});
