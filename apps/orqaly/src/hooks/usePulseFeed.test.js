import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Per-table canned results + a chainable, thenable query-builder stub so the
// same object works whether the chain ends in .limit()/.maybeSingle()/awaited.
const results = {};
const eqCalls = [];
const selectCalls = [];
let supaOn = true;
function builder(table) {
  const res = results[table] ?? { data: [], error: null };
  const b = {
    select: (columns) => {
      selectCalls.push([table, columns]);
      return b;
    },
    eq: (column, value) => {
      eqCalls.push([table, column, value]);
      return b;
    },
    gte: () => b,
    lte: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: () => Promise.resolve(res),
    then: (resolve, reject) => Promise.resolve(res).then(resolve, reject),
  };
  return b;
}
vi.mock('../lib/supabase', () => ({
  hasSupabase: () => supaOn,
  supabase: { from: (t) => builder(t) },
}));

import { usePulseFeed } from './usePulseFeed';
import { clearAxwiseGoalScope, setAxwiseGoalScope } from './useAxwiseGoalScope';

function wrapperFor(path) {
  return ({ children }) => createElement(MemoryRouter, { initialEntries: [path] }, children);
}

const axRow = (over = {}) => ({
  id: 'row1',
  created_at: '2026-07-10T10:00:00Z',
  operation: 'copilot.chat',
  status: 'ok',
  model: 'axwise-stub',
  duration_ms: 40,
  estimated_cost_usd: 0.01,
  agent_name: null,
  consilium_id: null,
  metadata: {},
  ...over,
});

describe('usePulseFeed', () => {
  beforeEach(() => {
    supaOn = true;
    for (const k of Object.keys(results)) delete results[k];
    eqCalls.length = 0;
    selectCalls.length = 0;
    clearAxwiseGoalScope();
  });

  it('maps AxWise rows into who/what/where events + summary', async () => {
    results.llm_usage = { data: [axRow()], error: null };
    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/home'),
    });
    await waitFor(() => expect(result.current.events.length).toBe(1));
    const e = result.current.events[0];
    expect(e.kind).toBe('axwise');
    expect(e.where).toBe('copilot.chat');
    expect(e.severity).toBe('ok');
    expect(result.current.summary.axwise).toBe(1);
  });

  it('flags degraded rows as warn severity', async () => {
    results.llm_usage = { data: [axRow({ status: 'degraded' })], error: null };
    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/home'),
    });
    await waitFor(() => expect(result.current.events.length).toBe(1));
    expect(result.current.events[0].severity).toBe('warn');
    expect(result.current.summary.degraded).toBe(1);
    expect(result.current.summary.worst).toBe('warn');
  });

  it('marks divergence when AxWise blocks but local allows', async () => {
    results.llm_usage = {
      data: [axRow({ metadata: { ax_decision: 'denied', local_decision: 'allowed' } })],
      error: null,
    };
    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/home'),
    });
    await waitFor(() => expect(result.current.events.length).toBe(1));
    expect(result.current.events[0].diverged).toBe(true);
    expect(result.current.summary.diverged).toBe(1);
  });

  it('does NOT flag divergence for allowed vs allow (block-ness, not raw string)', async () => {
    results.llm_usage = {
      data: [axRow({ metadata: { ax_decision: 'allowed', local_decision: 'allow' } })],
      error: null,
    };
    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/home'),
    });
    await waitFor(() => expect(result.current.events.length).toBe(1));
    expect(result.current.events[0].diverged).toBe(false);
    expect(result.current.summary.diverged).toBe(0);
  });

  it('adds goal + failed-task events when on a goal route', async () => {
    results.llm_usage = { data: [], error: null };
    results.goals = {
      data: { id: 'g1', title: 'Ship it', status: 'failed', updated_at: '2026-07-10T09:00:00Z' },
    };
    results.team_tasks = {
      data: [
        { id: 'failed-1', status: 'failed', data: {} },
        { id: 'failed-2', status: 'failed', data: {} },
      ],
    };
    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/goals/g1'),
    });
    await waitFor(() => expect(result.current.events.length).toBe(2));
    const kinds = result.current.events.map((e) => e.kind).sort();
    expect(kinds).toEqual(['goal', 'task']);
    expect(result.current.summary.problems).toBe(2);
    expect(eqCalls).toContainEqual(['llm_usage', 'goal_id', 'g1']);
    expect(selectCalls.find(([table]) => table === 'goals')?.[1]).toContain('plan');
    expect(selectCalls.find(([table]) => table === 'team_tasks')?.[1]).toContain(
      'materialization_attempt'
    );
    expect(result.current.scope).toBe('goal');
  });

  it('does not surface failed tasks from a superseded AxWise attempt', async () => {
    results.llm_usage = { data: [], error: null };
    results.goals = {
      data: {
        id: 'g1',
        title: 'Revised goal',
        status: 'active',
        updated_at: '2026-07-10T09:00:00Z',
        data: { axwise_orchestration: { decision_id: 'decision-current' } },
      },
    };
    results.team_tasks = {
      data: [
        {
          id: 'failed-old',
          status: 'failed',
          data: { axwise_decision_id: 'decision-old' },
        },
      ],
    };

    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/goals/g1'),
    });

    await waitFor(() =>
      expect(result.current.events.some((event) => event.kind === 'goal')).toBe(true)
    );
    expect(result.current.events).toContainEqual(
      expect.objectContaining({ kind: 'goal', status: 'active' })
    );
    expect(result.current.events.some((event) => event.kind === 'task')).toBe(false);
  });

  it('scopes AxWise activity to a goal detail modal opened from job pool', async () => {
    results.llm_usage = { data: [], error: null };
    results.goals = {
      data: {
        id: 'g-modal',
        title: 'Bremen commercial goal',
        status: 'awaiting_approval',
        updated_at: '2026-07-10T09:00:00Z',
        data: {
          axwise_orchestration: {
            status: 'shadow',
            applied: false,
            decision_id: 'decision-1',
            created_at: '2026-07-10T08:59:00Z',
          },
        },
      },
    };
    results.team_tasks = { count: 0 };
    setAxwiseGoalScope('g-modal');

    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/job-pool'),
    });

    await waitFor(() => expect(result.current.events.length).toBe(2));
    expect(eqCalls).toContainEqual(['llm_usage', 'goal_id', 'g-modal']);
    expect(eqCalls).toContainEqual(['goals', 'id', 'g-modal']);
    expect(result.current.events.find((event) => event.kind === 'axwise')).toEqual(
      expect.objectContaining({ kind: 'axwise', where: 'goal.orchestrate', goalId: 'g-modal' })
    );
    expect(result.current.scope).toBe('goal');
  });

  it('adds current-goal AxWise fallback state with warning severity', async () => {
    results.llm_usage = { data: [], error: null };
    results.goals = {
      data: {
        id: 'g1',
        title: 'Ship it',
        status: 'awaiting_tools',
        updated_at: '2026-07-10T09:02:00Z',
        data: {
          axwise_customer_intelligence: {
            status: 'degraded',
            degraded: true,
            reason: 'AxWise orchestration API error: HTTP 403',
            updated_at: '2026-07-10T09:00:00Z',
          },
          axwise_orchestration: {
            degraded: true,
            error: 'AxWise orchestration API error: HTTP 403',
            request_id: 'req-1',
            created_at: '2026-07-10T09:01:00Z',
          },
        },
      },
    };
    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/goals/g1'),
    });

    await waitFor(() => expect(result.current.events.length).toBe(3));
    const axwiseEvents = result.current.events.filter((event) => event.kind === 'axwise');
    expect(axwiseEvents).toHaveLength(2);
    expect(axwiseEvents.map((event) => event.where)).toEqual([
      'goal.orchestrate',
      'goal.customer-intelligence',
    ]);
    expect(axwiseEvents.every((event) => event.severity === 'warn')).toBe(true);
    expect(result.current.summary.degraded).toBe(2);
    expect(result.current.summary.worst).toBe('warn');
  });

  it('reports required research blocked as a failed research run, not healthy routing', async () => {
    results.llm_usage = { data: [], error: null };
    results.goals = {
      data: {
        id: 'g1',
        title: 'Estonia launch research',
        status: 'needs_human',
        updated_at: '2026-08-12T23:28:21Z',
        data: {
          axwise_customer_intelligence: {
            status: 'required_research_blocked',
            error: 'provider secret https://internal.example/key=abc',
            routing_mode: 'research_assisted',
            reason: 'provider.internal.exception=secret-value',
            current_stage: 'grounding_market',
            progress_percentage: 3,
            decision_id: 'decision-1',
            updated_at: '2026-08-12T23:28:21Z',
          },
        },
      },
    };
    results.team_tasks = { data: [], error: null };

    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/goals/g1'),
    });

    await waitFor(() =>
      expect(result.current.events.some((event) => event.kind === 'axwise')).toBe(true)
    );
    const event = result.current.events.find((item) => item.kind === 'axwise');
    expect(event).toEqual(
      expect.objectContaining({
        status: 'required_research_blocked',
        severity: 'error',
        routingMode: 'research_assisted',
        stage: 'grounding market',
        progress: 3,
        appliedOutcome: 'blocked',
      })
    );
    expect(event.what).toContain('Research stopped during grounding market');
    expect(event.what).not.toContain('secret-value');
    expect(result.current.summary.worst).toBe('error');
    expect(result.current.summary.degraded).toBe(0);
    expect(result.current.summary.blocked).toBe(1);
  });

  it('is a no-op when Supabase is unavailable', async () => {
    supaOn = false;
    results.llm_usage = { data: [axRow()], error: null };
    const { result } = renderHook(() => usePulseFeed({ enabled: true }), {
      wrapper: wrapperFor('/home'),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.events).toEqual([]);
  });
});
