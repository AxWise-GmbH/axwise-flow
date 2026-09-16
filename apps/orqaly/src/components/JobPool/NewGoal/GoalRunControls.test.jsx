import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../services/goalService', () => ({
  pauseGoal: vi.fn(),
  resumeGoal: vi.fn(),
  retryGoalPickup: vi.fn(),
  cancelGoal: vi.fn(),
  toggleAutopilot: vi.fn(),
  toggleLoop: vi.fn(),
}));

import { pauseGoal, resumeGoal, retryGoalPickup } from '../../../services/goalService';
import GoalRunControls from './GoalRunControls';

function renderControls(goal, props = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <GoalRunControls goal={goal} onRefresh={vi.fn()} {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

const stop = () => screen.getByRole('button', { name: 'Stop the goal' });
const start = () => screen.getByRole('button', { name: 'Start the goal' });

beforeEach(() => {
  vi.clearAllMocks();
  pauseGoal.mockResolvedValue({ id: 'g1', status: 'paused' });
  resumeGoal.mockResolvedValue({ id: 'g1', status: 'active' });
  retryGoalPickup.mockResolvedValue({ id: 'g1', pickup_requested: true });
});

describe('GoalRunControls', () => {
  // One button wearing two faces: whichever action is possible is the one on
  // screen, so there is never a half of a pair that cannot be pressed.
  it('is a stop button while the goal runs', () => {
    renderControls({ id: 'g1', status: 'active' });
    expect(stop()).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start the goal' })).toBeNull();
  });

  it('is a play button once the goal is stopped', () => {
    renderControls({ id: 'g1', status: 'paused' });
    expect(start()).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Stop the goal' })).toBeNull();
  });

  it('stops a running goal', async () => {
    const onRefresh = vi.fn();
    renderControls({ id: 'g1', status: 'active' }, { onRefresh });
    fireEvent.click(stop());
    await waitFor(() => expect(pauseGoal).toHaveBeenCalledWith('g1'));
    // The status chip elsewhere on the surface only moves once the goal is
    // re-read, so the refresh is part of the action, not a nicety.
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('starts a stopped goal', async () => {
    renderControls({ id: 'g1', status: 'paused' });
    fireEvent.click(start());
    await waitFor(() => expect(resumeGoal).toHaveBeenCalledWith('g1'));
    expect(pauseGoal).not.toHaveBeenCalled();
  });

  // The face flips because the status did. Re-rendering with the new status is
  // exactly what the surface does after a refresh.
  it('turns into play after a stop lands', () => {
    const { rerender } = renderControls({ id: 'g1', status: 'active' });
    expect(stop()).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ThemeProvider theme={createTheme()}>
          <GoalRunControls goal={{ id: 'g1', status: 'paused' }} onRefresh={vi.fn()} />
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(start()).toBeInTheDocument();
  });

  // The server pauses an active goal and nothing else, so a live button at any
  // other moment would only ever produce a 409.
  it('is disabled while the goal is neither running nor stopped', () => {
    renderControls({ id: 'g1', status: 'planning' });
    expect(stop()).toBeDisabled();
  });

  it('stays on screen, disabled, before the goal row exists', () => {
    renderControls(null);
    expect(stop()).toBeDisabled();
  });

  // Disabled with the reason, not hidden: the button is where it will be when
  // it goes live, and it explains itself in the meantime.
  it('says why it is unavailable instead of hiding', async () => {
    renderControls({ id: 'g1', status: 'planning' });
    fireEvent.mouseOver(stop().parentElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /only a running goal can be stopped/i
    );
  });

  it('says the goal has not started yet before its row exists', async () => {
    renderControls(null);
    fireEvent.mouseOver(stop().parentElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/has not started yet/i);
  });

  // Nothing will ever pause or resume a finished goal, so a dead button there
  // would be noise rather than information.
  it.each(['completed', 'failed', 'cancelled'])('renders nothing for a %s goal', (status) => {
    renderControls({ id: 'g1', status });
    expect(screen.queryByRole('button', { name: 'Stop the goal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start the goal' })).toBeNull();
  });

  it('surfaces a failed stop rather than leaving the run ambiguous', async () => {
    pauseGoal.mockRejectedValue(new Error('Only an active goal can be paused.'));
    renderControls({ id: 'g1', status: 'active' });
    fireEvent.click(stop());
    expect(await screen.findByText('Only an active goal can be paused.')).toBeInTheDocument();
  });

  it('locks the button while an action is in flight', async () => {
    let release;
    pauseGoal.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ id: 'g1' });
      })
    );
    renderControls({ id: 'g1', status: 'active' });
    fireEvent.click(stop());
    await waitFor(() => expect(stop()).toBeDisabled());
    await act(async () => release());
  });

  it('offers pickup retry only for a stale queued Preview job', async () => {
    renderControls({
      id: 'g1',
      status: 'feasibility',
      worker_pickup: {
        status: 'queued',
        worker_scope: 'preview',
        capability: 'pickup-capability-a',
        updated_at: '2026-08-22T10:00:00.000Z',
        retry_available_at: new Date(Date.now() - 1_000).toISOString(),
      },
    });

    const retry = await screen.findByRole('button', { name: 'Retry pickup' });
    await waitFor(() => expect(retry).not.toBeDisabled());
    expect(retry).toHaveTextContent('Retry pickup');
  });

  it('explains why the visible pickup retry appeared', async () => {
    renderControls({
      id: 'g1',
      status: 'feasibility',
      worker_pickup: {
        status: 'queued',
        worker_scope: 'preview',
        capability: 'pickup-capability-a',
        updated_at: '2026-08-22T10:00:00.000Z',
        retry_available_at: new Date(Date.now() - 1_000).toISOString(),
      },
    });

    const retry = await screen.findByRole('button', { name: 'Retry pickup' });
    await waitFor(() => expect(retry).not.toBeDisabled());
    fireEvent.mouseOver(retry.parentElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /waited too long for a worker.*existing queued job/i
    );
  });

  it('automatically wakes an eligible Preview pickup exactly once per job snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    let view;
    try {
      const goal = {
        id: 'g1',
        status: 'feasibility',
        worker_pickup: {
          status: 'queued',
          worker_scope: 'preview',
          capability: 'pickup-capability-a',
          updated_at: '2026-08-22T10:00:00.000Z',
          retry_available_at: '2026-08-22T10:00:01.000Z',
        },
      };
      view = renderControls(goal);

      expect(retryGoalPickup).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_026);
      });
      expect(retryGoalPickup).toHaveBeenCalledTimes(1);
      expect(retryGoalPickup).toHaveBeenCalledWith('g1', 'pickup-capability-a');

      view.rerender(
        <MemoryRouter>
          <ThemeProvider theme={createTheme()}>
            <GoalRunControls goal={{ ...goal }} onRefresh={vi.fn()} />
          </ThemeProvider>
        </MemoryRouter>
      );
      await act(async () => Promise.resolve());
      expect(retryGoalPickup).toHaveBeenCalledTimes(1);
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('allows one new automatic attempt when the opaque pickup capability changes', async () => {
    const firstGoal = {
      id: 'g1',
      status: 'feasibility',
      worker_pickup: {
        status: 'queued',
        worker_scope: 'preview',
        capability: 'pickup-capability-a',
        updated_at: '2026-08-22T10:00:00.000Z',
        retry_available_at: new Date(Date.now() - 2_000).toISOString(),
      },
    };
    const { rerender } = renderControls(firstGoal);
    await waitFor(() => expect(retryGoalPickup).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ThemeProvider theme={createTheme()}>
          <GoalRunControls
            goal={{
              ...firstGoal,
              worker_pickup: {
                ...firstGoal.worker_pickup,
                capability: 'pickup-capability-b',
                retry_available_at: new Date(Date.now() - 1_000).toISOString(),
              },
            }}
            onRefresh={vi.fn()}
          />
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(retryGoalPickup).toHaveBeenCalledTimes(2));
    expect(retryGoalPickup).toHaveBeenNthCalledWith(1, 'g1', 'pickup-capability-a');
    expect(retryGoalPickup).toHaveBeenNthCalledWith(2, 'g1', 'pickup-capability-b');
  });

  it('automatically recovers a stale running Preview lease once per signed snapshot', async () => {
    const runningGoal = {
      id: 'g1',
      status: 'feasibility',
      worker_pickup: {
        status: 'running',
        worker_scope: 'preview',
        capability: 'running-lease-capability-a',
        updated_at: '2026-08-22T10:00:00.000Z',
        retry_available_at: new Date(Date.now() - 1_000).toISOString(),
      },
    };
    const { rerender } = renderControls(runningGoal);

    await waitFor(() => expect(retryGoalPickup).toHaveBeenCalledTimes(1));
    expect(retryGoalPickup).toHaveBeenCalledWith('g1', 'running-lease-capability-a');
    expect(screen.getByRole('button', { name: 'Recover worker' })).toBeEnabled();

    rerender(
      <MemoryRouter>
        <ThemeProvider theme={createTheme()}>
          <GoalRunControls goal={{ ...runningGoal }} onRefresh={vi.fn()} />
        </ThemeProvider>
      </MemoryRouter>
    );
    await act(async () => Promise.resolve());
    expect(retryGoalPickup).toHaveBeenCalledTimes(1);
  });

  it('keeps verifying a fresh running lease until it crosses the recovery threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    const onRefresh = vi.fn(async () => {});
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: {
            status: 'running',
            worker_scope: 'preview',
            capability: 'running-lease-capability-a',
            updated_at: '2026-08-22T10:00:00.000Z',
            retry_available_at: '2026-08-22T10:05:00.000Z',
          },
        },
        { onRefresh, verifyPickupProjection: true }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
      });
      expect(retryGoalPickup).not.toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30);
      });
      expect(retryGoalPickup).toHaveBeenCalledTimes(1);
      expect(retryGoalPickup).toHaveBeenCalledWith('g1', 'running-lease-capability-a');
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('does not duplicate a host poll unless pickup projection verification is enabled', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn(async () => {});
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: {
            status: 'queued',
            worker_scope: 'preview',
            capability: 'pickup-capability-a',
            updated_at: '2026-08-22T10:00:00.000Z',
            retry_available_at: new Date(Date.now() + 60_000).toISOString(),
          },
        },
        { onRefresh }
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(onRefresh).not.toHaveBeenCalled();
      expect(retryGoalPickup).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('periodically verifies the full goal projection while a Preview snapshot remains', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    const onRefresh = vi.fn(async () => {});
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: {
            status: 'queued',
            worker_scope: 'preview',
            capability: 'pickup-capability-a',
            updated_at: '2026-08-22T10:00:00.000Z',
            retry_available_at: '2026-08-22T10:01:00.000Z',
          },
        },
        { onRefresh, verifyPickupProjection: true }
      );

      expect(onRefresh).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(2);
      expect(retryGoalPickup).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('keeps the last signed verification session alive through A -> null -> sibling B', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    const onRefresh = vi.fn(async () => {});
    const pickup = {
      status: 'queued',
      worker_scope: 'preview',
      updated_at: '2026-08-22T10:00:00.000Z',
      retry_available_at: '2026-08-22T10:01:00.000Z',
    };
    const renderGoal = (workerPickup) => (
      <MemoryRouter>
        <ThemeProvider theme={createTheme()}>
          <GoalRunControls
            goal={{ id: 'g1', status: 'feasibility', worker_pickup: workerPickup }}
            onRefresh={onRefresh}
            verifyPickupProjection
          />
        </ThemeProvider>
      </MemoryRouter>
    );
    let view;
    try {
      view = render(renderGoal({ ...pickup, capability: 'pickup-capability-a' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      // A can briefly disappear between its terminal CAS and the sibling row
      // becoming visible. The session keyed by A must keep verifying instead
      // of unmounting its timer with the now-null projection.
      view.rerender(renderGoal(null));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(2);

      // The next refresh can now discover the queued sibling and hand the
      // verification session over to B's opaque capability.
      view.rerender(renderGoal({ ...pickup, capability: 'pickup-capability-b' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(3);
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('ends a carried pickup verification session at a human gate', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn(async () => {});
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: {
            status: 'queued',
            worker_scope: 'preview',
            capability: 'pickup-capability-a',
            updated_at: '2026-08-22T10:00:00.000Z',
            retry_available_at: new Date(Date.now() + 60_000).toISOString(),
          },
        },
        { onRefresh, verifyPickupProjection: true }
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      view.rerender(
        <MemoryRouter>
          <ThemeProvider theme={createTheme()}>
            <GoalRunControls
              goal={{ id: 'g1', status: 'needs_human', worker_pickup: null }}
              onRefresh={onRefresh}
              verifyPickupProjection
            />
          </ThemeProvider>
        </MemoryRouter>
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('bounds a verification session when no successor ever appears', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    const onRefresh = vi.fn(async () => {});
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: {
            status: 'queued',
            worker_scope: 'preview',
            capability: 'pickup-capability-a',
            updated_at: '2026-08-22T10:00:00.000Z',
            retry_available_at: '2026-08-22T10:05:00.000Z',
          },
        },
        { onRefresh, verifyPickupProjection: true }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(7 * 60_000 + 1);
      });
      const callsAtSessionEnd = onRefresh.mock.calls.length;
      expect(callsAtSessionEnd).toBeGreaterThan(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(callsAtSessionEnd);
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('restarts projection verification for a successive opaque pickup snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    const onRefresh = vi.fn(async () => {});
    const pickup = {
      status: 'queued',
      worker_scope: 'preview',
      updated_at: '2026-08-22T10:00:00.000Z',
      retry_available_at: '2026-08-22T10:01:00.000Z',
    };
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: { ...pickup, capability: 'pickup-capability-a' },
        },
        { onRefresh, verifyPickupProjection: true }
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      view.rerender(
        <MemoryRouter>
          <ThemeProvider theme={createTheme()}>
            <GoalRunControls
              goal={{
                id: 'g1',
                status: 'feasibility',
                worker_pickup: { ...pickup, capability: 'pickup-capability-b' },
              }}
              onRefresh={onRefresh}
              verifyPickupProjection
            />
          </ThemeProvider>
        </MemoryRouter>
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_999);
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(onRefresh).toHaveBeenCalledTimes(2);
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it('does not spend projection-refresh budget while the Smart Request tab is hidden', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const onRefresh = vi.fn(async () => {});
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: {
            status: 'queued',
            worker_scope: 'preview',
            capability: 'pickup-capability-a',
            updated_at: '2026-08-22T10:00:00.000Z',
            retry_available_at: new Date(Date.now() + 60_000).toISOString(),
          },
        },
        { onRefresh, verifyPickupProjection: true }
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(onRefresh).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });

  it('never verifies or retries a Production pickup snapshot', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn(async () => {});
    let view;
    try {
      view = renderControls(
        {
          id: 'g1',
          status: 'feasibility',
          worker_pickup: {
            status: 'queued',
            worker_scope: 'production',
            capability: 'production-capability',
            updated_at: '2026-08-22T10:00:00.000Z',
            retry_available_at: new Date(Date.now() - 1_000).toISOString(),
          },
        },
        { onRefresh, verifyPickupProjection: true }
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(onRefresh).not.toHaveBeenCalled();
      expect(retryGoalPickup).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it.each([
    ['a fresh queue job', { retry_available_at: new Date(Date.now() + 60_000).toISOString() }],
    ['a production job', { worker_scope: 'production' }],
    ['a human gate', { goalStatus: 'needs_human' }],
    ['a terminal goal', { goalStatus: 'completed' }],
    ['a snapshot without a capability', { capability: '' }],
  ])('does not offer pickup retry for %s', (_label, override) => {
    renderControls({
      id: 'g1',
      status: override.goalStatus || 'feasibility',
      worker_pickup: {
        status: override.jobStatus || 'queued',
        worker_scope: override.worker_scope || 'preview',
        capability: override.capability === undefined ? 'pickup-capability-a' : override.capability,
        updated_at: '2026-08-22T10:00:00.000Z',
        retry_available_at:
          override.retry_available_at || new Date(Date.now() - 1_000).toISOString(),
      },
    });

    expect(screen.queryByRole('button', { name: 'Retry pickup' })).toBeNull();
    expect(retryGoalPickup).not.toHaveBeenCalled();
  });

  it('wakes the existing pickup and refreshes the run', async () => {
    const onRefresh = vi.fn();
    renderControls(
      {
        id: 'g1',
        status: 'feasibility',
        worker_pickup: {
          status: 'queued',
          worker_scope: 'preview',
          capability: 'pickup-capability-a',
          updated_at: '2026-08-22T10:00:00.000Z',
          retry_available_at: new Date(Date.now() - 1_000).toISOString(),
        },
      },
      { onRefresh }
    );

    await waitFor(() => expect(retryGoalPickup).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry pickup' })).not.toBeDisabled()
    );
    retryGoalPickup.mockClear();
    onRefresh.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Retry pickup' }));
    await waitFor(() => expect(retryGoalPickup).toHaveBeenCalledWith('g1', 'pickup-capability-a'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('surfaces an automatic pickup wake failure and keeps the manual retry', async () => {
    retryGoalPickup.mockRejectedValue(new Error('The Preview worker could not be woken'));
    renderControls({
      id: 'g1',
      status: 'feasibility',
      worker_pickup: {
        status: 'queued',
        worker_scope: 'preview',
        capability: 'pickup-capability-a',
        updated_at: '2026-08-22T10:00:00.000Z',
        retry_available_at: new Date(Date.now() - 1_000).toISOString(),
      },
    });

    expect(await screen.findByText('The Preview worker could not be woken')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry pickup' })).not.toBeDisabled();
  });
});
