import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Real services are mocked so the hook can be tested in isolation.
vi.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: vi.fn(() => ({
    data: { totals: {}, timeseries: [], byModel: [], byProvider: [] },
    totals: {},
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));
vi.mock('../../services/goalService', () => ({
  listGoals: vi.fn(async () => []),
  getLoops: vi.fn(async () => []),
}));
vi.mock('../../services/teamTaskBackend', () => ({ loadTeamTasks: vi.fn(async () => []) }));
vi.mock('../../services/myAgentsService', () => ({ getMyAgents: vi.fn(async () => []) }));
vi.mock('../../services/communicatorService', () => ({
  getActivityFeed: vi.fn(async () => []),
  getRecentAgentMessages: vi.fn(async () => []),
}));
vi.mock('../../services/auditLogBackend', () => ({
  loadKnowledgeOperations: vi.fn(async () => []),
  loadActivityOperations: vi.fn(async () => []),
  loadAgentOperations: vi.fn(async () => []),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'tester@example.com' } }),
}));

import { listGoals } from '../../services/goalService';
import { getRecentAgentMessages } from '../../services/communicatorService';
import { loadAgentOperations, loadActivityOperations } from '../../services/auditLogBackend';
import { useLlmUsage } from '../../hooks/useLlmUsage';
import useHomeData from './useHomeData';

const DEFAULT_LLM = () => ({
  data: { totals: {}, timeseries: [], byModel: [], byProvider: [] },
  totals: {},
  loading: false,
  error: null,
  refresh: vi.fn(),
});

const POLL_MS = 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useHomeData', () => {
  it('rolls models beyond the top 6 into an Other donut slice that sums to the total', async () => {
    const byModel = Array.from({ length: 8 }, (_, i) => ({
      model: `m${i}`,
      provider: 'p',
      tokens: 100,
      cost: 1,
    }));
    useLlmUsage.mockImplementation(() => ({
      data: { totals: { tokens: 800, cost: 8 }, timeseries: [], byModel, byProvider: [] },
      totals: { tokens: 800 },
      loading: false,
      error: null,
      refresh: vi.fn(),
    }));
    try {
      const { result, unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
      await act(async () => {});
      const rows = result.current.usageDonut.rows;
      // Top 6 named slices + one rolled-up "Other".
      expect(rows).toHaveLength(7);
      expect(rows[6]).toMatchObject({ group: 'Other', value: 200 });
      // The donut now sums to the real total (matches the all-models token count).
      expect(rows.reduce((s, r) => s + r.value, 0)).toBe(800);
      unmount();
    } finally {
      useLlmUsage.mockImplementation(DEFAULT_LLM);
    }
  });

  it('bypasses the network and returns deterministic demo data when demo is on', () => {
    const { result } = renderHook(() => useHomeData({ demo: true, windowDays: 7 }));

    expect(listGoals).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(false);
    expect(result.current.loading).toBe(false);
    // Deterministic demo snapshot: 6 KPIs, 6 spark stats.
    expect(result.current.kpis).toHaveLength(6);
    expect(result.current.sparkStats).toHaveLength(6);
    expect(result.current.kpis[0].label).toBe('Total Revenue');
    // Data Operations: new Type/Action/Agent/User/Date shape, with the platform
    // email injected into the User column.
    const op = result.current.dataOps.rows[0];
    // _id is hidden row metadata (opens the KB doc dialog); not a displayed column.
    expect(Object.keys(op)).toEqual([
      '_id',
      'type',
      'name',
      'action',
      'agentName',
      'agentPosition',
      'agentId',
      'user',
      'date',
    ]);
    expect(op.user).toBe('tester@example.com');
    expect(op.agentName).toBeTruthy();
    // No polling timer scheduled in demo mode.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetches and polls real data in live mode', async () => {
    const { unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));

    // Flush the mount effect's initial fetch (fake timers deadlock waitFor).
    await act(async () => {});
    expect(listGoals).toHaveBeenCalledTimes(1);
    // A poll interval is now scheduled.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    // Advancing past the interval triggers another fetch.
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(listGoals).toHaveBeenCalledTimes(2);

    // Cleanup clears the interval (no leaked timers).
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps a goal status to the 4-stage lifecycle phase (Pipeline/Work Log/Report/Result)', async () => {
    listGoals.mockResolvedValueOnce([
      // 'active' -> stage 2 (Work Log); recent so it passes the day-window filter.
      {
        id: 'g1',
        title: 'Build thing',
        status: 'active',
        updated_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);
    const { result, unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
    await act(async () => {});
    const row = result.current.goals.rows[0];
    // No plan on the goal → falls back to the 4-stage lifecycle (active = stage 2).
    expect(row.phase).toMatchObject({ current: 2, total: 4, title: 'Work Log' });
    // Date column: "dd.mm\nhh:mm:ss" (time stacked under the date via pre-line).
    expect(row.date).toMatch(/^\d{2}\.\d{2}\n\d{2}:\d{2}:\d{2}$/);
    unmount();
  });

  it('shows all goals (any status) with real status label/color and plan-phase progress', async () => {
    listGoals.mockResolvedValueOnce([
      {
        id: 'c1',
        title: 'Done goal',
        status: 'completed',
        updated_at: new Date(Date.now() - 1000).toISOString(),
        plan: { phases: [{ status: 'completed' }, { status: 'completed' }] },
      },
      {
        id: 'x1',
        title: 'Cancelled goal',
        status: 'cancelled',
        updated_at: new Date(Date.now() - 2000).toISOString(),
        plan: { phases: [{ status: 'pending' }, { status: 'pending' }, { status: 'pending' }] },
      },
    ]);
    const { result, unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
    await act(async () => {});
    const rows = result.current.goals.rows;
    // Terminal goals are included now (not just active).
    expect(rows).toHaveLength(2);
    const done = rows.find((r) => r._id === 'c1');
    expect(done.status).toEqual({ label: 'Completed', color: 'success' });
    expect(done.phase).toMatchObject({ current: 2, total: 2 });
    const cancelled = rows.find((r) => r._id === 'x1');
    expect(cancelled.status).toEqual({ label: 'Cancelled', color: 'error' });
    expect(cancelled.phase).toMatchObject({ current: 0, total: 3 });
    unmount();
  });

  it('orders Goals in Action newest-first regardless of API order', async () => {
    const ago = (mins) => new Date(Date.now() - mins * 60_000).toISOString();
    // Returned out of order: middle, oldest, newest.
    listGoals.mockResolvedValueOnce([
      { id: 'g-mid', title: 'Middle', status: 'active', updated_at: ago(120) },
      { id: 'g-old', title: 'Oldest', status: 'active', updated_at: ago(600) },
      { id: 'g-new', title: 'Newest', status: 'active', updated_at: ago(5) },
    ]);
    const { result, unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
    await act(async () => {});
    expect(result.current.goals.rows.map((r) => r.goal)).toEqual(['Newest', 'Middle', 'Oldest']);
    unmount();
  });

  it('shows active goals even when older than the date window', async () => {
    // Active but last touched 40 days ago (outside the default 7-day window).
    listGoals.mockResolvedValueOnce([
      {
        id: 'g-old',
        title: 'Stale but active',
        status: 'needs_human',
        updated_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      },
    ]);
    const { result, unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
    await act(async () => {});
    expect(result.current.goals.rows.map((r) => r.goal)).toContain('Stale but active');
    unmount();
  });

  it('merges agent ops into activity.rows (Agents tab) within the day window', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    loadAgentOperations.mockResolvedValueOnce([
      {
        id: 't1',
        instrument: 'Tasks',
        action: 'create',
        personaName: 'Frontend Developer',
        personaPosition: 'Development',
        personaKind: 'Agent',
        agentId: 'a1',
        date: recent,
      },
    ]);
    // A human audit op with the same window — both should surface, deduped by id.
    loadActivityOperations.mockResolvedValueOnce([
      {
        id: 'h1',
        instrument: 'Organizations',
        action: 'write',
        personaName: 'tester@example.com',
        personaPosition: 'User',
        personaKind: 'User',
        agentId: '',
        date: recent,
      },
    ]);
    const { result, unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
    await act(async () => {});
    const rows = result.current.activity.rows;
    const agentRow = rows.find((r) => r.id === 't1');
    expect(agentRow).toMatchObject({
      instrument: 'Tasks',
      action: 'create',
      personaKind: 'Agent',
      agentId: 'a1',
    });
    expect(agentRow.date).toMatch(/^\d{2}\.\d{2}\n\d{2}:\d{2}:\d{2}$/);
    expect(rows.find((r) => r.id === 'h1')).toMatchObject({ personaKind: 'User' });
    unmount();
  });

  it('builds chat messages from recent agent (goal) messages', async () => {
    getRecentAgentMessages.mockResolvedValueOnce([
      {
        id: 'gm1',
        goal_id: 'goal-1',
        sender_name: 'Frontend Developer',
        sender_agent_id: 'a1',
        channel: 'lead-consilium',
        message: 'Phase 2 PASSED — quality 92/100.',
        message_type: 'feedback',
        // Recent (within the default 7-day window) so it isn't filtered out.
        created_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);
    const { result, unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
    await act(async () => {});
    const msg = result.current.chat.messages[0];
    expect(msg).toMatchObject({
      id: 'gm1',
      sender: 'Frontend Developer',
      agentId: 'a1',
      category: 'Consilium',
      content: 'Phase 2 PASSED — quality 92/100.',
      reviewHref: '/communicator?view=workspace&section=rooms&goal=goal-1',
    });
    expect(msg.datetime).toBeTruthy();
    unmount();
  });

  it('filters chat messages by the selected day window', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString(); // 40 days ago
    const msgs = [
      {
        id: 'new',
        goal_id: 'g',
        sender_name: 'A',
        channel: 'team-room',
        message: 'new',
        created_at: recent,
      },
      {
        id: 'old',
        goal_id: 'g',
        sender_name: 'B',
        channel: 'team-room',
        message: 'old',
        created_at: old,
      },
    ];
    getRecentAgentMessages.mockResolvedValue(msgs);

    const sevenDay = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));
    await act(async () => {});
    expect(sevenDay.result.current.chat.messages.map((m) => m.id)).toEqual(['new']); // old (40d) excluded
    sevenDay.unmount();

    const ninetyDay = renderHook(() => useHomeData({ demo: false, windowDays: 90 }));
    await act(async () => {});
    expect(ninetyDay.result.current.chat.messages.map((m) => m.id).sort()).toEqual(['new', 'old']); // both within 90d
    ninetyDay.unmount();
  });

  it('does not start the poll interval while the tab is hidden', async () => {
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    const { unmount } = renderHook(() => useHomeData({ demo: false, windowDays: 7 }));

    // Initial fetch still happens, but no recurring interval is armed.
    await act(async () => {});
    expect(listGoals).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    unmount();
    spy.mockRestore();
  });
});
