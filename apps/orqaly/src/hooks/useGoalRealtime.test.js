/**
 * [module: frontend]
 * Finding a goal's tasks.
 *
 * Migration 095 gave team_tasks a real `goal_id` column and backfilled it, but
 * nothing ever backfilled `data.goal_id` the other way. This hook read only the
 * data blob, so for every goal written since it came back with no tasks at all
 * - and the surfaces that build deliverables out of them showed nothing, while
 * the goal detail popup, which asks both ways, showed plenty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { acceptedNativeGoalFixture } from '../../lib/_shared/native-goal-authority.test-fixture.js';

const queries = [];

function tableQuery(table) {
  const call = { table, filters: [] };
  const chain = {
    select: (columns) => {
      call.columns = columns;
      return chain;
    },
    eq: (column, value) => {
      call.filters.push(`eq:${column}=${value}`);
      return chain;
    },
    contains: (column, value) => {
      call.filters.push(`contains:${column}=${JSON.stringify(value)}`);
      return chain;
    },
    order: () => {
      queries.push(call);
      return Promise.resolve({ data: rows[table]?.[call.filters[0]] ?? [], error: null });
    },
  };
  return chain;
}

// rows[table][filter] -> what that exact query returns.
let rows = {};

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: {
    from: (table) => tableQuery(table),
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: () => {},
  },
}));

vi.mock('../services/goalService', () => ({
  getGoal: vi.fn(async () => ({ id: 'g1', status: 'completed', data: {}, logs: [] })),
  getGoalMessages: vi.fn(async () => []),
}));

const { default: useGoalRealtime } = await import('./useGoalRealtime');
const { getGoal, getGoalMessages } = await import('../services/goalService');

const BY_COLUMN = 'eq:goal_id=g1';
const BY_BLOB = 'contains:data={"goal_id":"g1"}';
const task = (id) => ({ id, title: id, status: 'done', data: { output: 'x' } });

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  rows = {};
  getGoal.mockResolvedValue({ id: 'g1', status: 'completed', data: {}, logs: [] });
});

describe('useGoalRealtime task lookup', () => {
  it('asks the goal_id column first and stops there when it answers', async () => {
    rows = { team_tasks: { [BY_COLUMN]: [task('t1')] } };
    const { result } = renderHook(() => useGoalRealtime('g1'));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    const taskQueries = queries.filter((q) => q.table === 'team_tasks');
    expect(taskQueries).toHaveLength(1);
    expect(taskQueries[0].filters[0]).toBe(BY_COLUMN);
  });

  it('falls back to the data blob for rows written before the column existed', async () => {
    rows = { team_tasks: { [BY_COLUMN]: [], [BY_BLOB]: [task('t-old')] } };
    const { result } = renderHook(() => useGoalRealtime('g1'));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    expect(result.current.tasks[0].id).toBe('t-old');
    expect(queries.filter((q) => q.table === 'team_tasks').map((q) => q.filters[0])).toEqual([
      BY_COLUMN,
      BY_BLOB,
    ]);
  });

  it('keeps a valid native materialization visible using the complete goal contract', async () => {
    const goal = acceptedNativeGoalFixture({
      id: 'g1',
      status: 'active',
      plan: { phases: [] },
    });
    const scopeHash = goal.data.axwise_customer_intelligence.scope_packet.scope_hash;
    const formation = {
      version: 'orqaly_team_formation_attempt_v1',
      status: 'completed',
      attempt_id: 'formation-current',
      planning_attempt_id: 'planning-current',
      plan_hash: 'a'.repeat(64),
      scope_hash: scopeHash,
    };
    Object.assign(goal.data, {
      native_planning_attempt: {
        version: 'orqaly_native_planning_attempt_v1',
        status: 'completed',
        attempt_id: 'planning-current',
        scope_hash: scopeHash,
        plan_hash: 'a'.repeat(64),
        plan_snapshot: structuredClone(goal.plan),
      },
      team_formation_attempt: formation,
      native_team_formation_attempt: structuredClone(formation),
      team_work_materialization: {
        version: 'orqaly_team_work_materialization_v1',
        formation_attempt: 'formation-current',
        native_scope_hash: scopeHash,
      },
    });
    getGoal.mockResolvedValue(goal);
    rows = {
      team_tasks: {
        [BY_COLUMN]: [
          {
            ...task('native-current'),
            materialization_attempt: 'formation-current',
            data: { materialization_attempt: 'formation-current', output: 'x' },
          },
        ],
      },
    };

    const { result } = renderHook(() => useGoalRealtime('g1'));
    await waitFor(() =>
      expect(result.current.tasks.map((row) => row.id)).toEqual(['native-current'])
    );

    const taskQuery = queries.find((query) => query.table === 'team_tasks');
    expect(taskQuery.columns).toContain('materialization_attempt');
  });

  it('abandons an in-flight load when the consumer unmounts', async () => {
    let resolveGoal;
    getGoal.mockReturnValue(
      new Promise((resolve) => {
        resolveGoal = resolve;
      })
    );

    const { unmount } = renderHook(() => useGoalRealtime('g1'));
    unmount();
    resolveGoal({ id: 'g1', status: 'completed', data: {}, logs: [] });
    await Promise.resolve();
    await Promise.resolve();

    expect(getGoalMessages).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });
});
