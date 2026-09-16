/**
 * Tests for loop-refine-parent.js — verifies the refinement cap is driven by
 * the per-loop refineMaxVersions (default 2) rather than hardcoded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const refineStart = vi.fn(async () => ({ status: 200, data: { version: 2 } }));
vi.mock('../api-handlers/deliverable-refine.js', () => ({
  handleStart: (...args) => refineStart(...args),
}));

import { handleLoopRefineParentDeliverables } from './loop-refine-parent.js';

function makeAdmin({ goals, artifacts = [], landings = [], docs = [] } = {}) {
  const rowsByTable = {
    goals: goals || [
      {
        id: 'parent-1',
        user_id: 'user-1',
        continuation_goal_id: 'child-1',
      },
      {
        id: 'child-1',
        user_id: 'user-1',
        parent_goal_id: 'parent-1',
      },
    ],
    goal_artifacts: artifacts,
    landing_pages: landings,
    knowledge_documents: docs,
  };
  const reads = [];

  function filteredRows(table, filters) {
    return (rowsByTable[table] || []).filter((row) =>
      filters.every(({ column, value, operator }) => {
        if (column === 'metadata->>goal_id') return row.metadata?.goal_id === value;
        if (operator === 'is' && value === null) return row[column] == null;
        return row[column] === value;
      })
    );
  }

  return {
    reads,
    from(table) {
      if (!(table in rowsByTable)) throw new Error(`unmocked table ${table}`);
      const filters = [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column, value) => {
          filters.push({ column, value });
          return query;
        }),
        is: vi.fn((column, value) => {
          filters.push({ column, value, operator: 'is' });
          return query;
        }),
        filter: vi.fn((column, _operator, value) => {
          filters.push({ column, value });
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          reads.push({ table, filters: [...filters] });
          return { data: filteredRows(table, filters)[0] || null, error: null };
        }),
        then(resolve, reject) {
          reads.push({ table, filters: [...filters] });
          return Promise.resolve({ data: filteredRows(table, filters), error: null }).then(
            resolve,
            reject
          );
        },
      };
      return query;
    },
  };
}

const basePayload = {
  parentGoalId: 'parent-1',
  continuationGoalId: 'child-1',
  projectOverview: { next_steps: ['x'] },
  _userId: 'user-1',
};

describe('handleLoopRefineParentDeliverables — refineMaxVersions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to a cap of 2 when refineMaxVersions is absent', async () => {
    const admin = makeAdmin({
      artifacts: [
        {
          id: 'a1',
          goal_id: 'parent-1',
          user_id: 'user-1',
          kind: 'report',
          title: 'A1',
          refinement_count: 1,
        }, // 1 < 2 → kept
        {
          id: 'a2',
          goal_id: 'parent-1',
          user_id: 'user-1',
          kind: 'report',
          title: 'A2',
          refinement_count: 2,
        }, // 2 >= 2 → skipped
      ],
    });
    const res = await handleLoopRefineParentDeliverables(admin, basePayload, null, 'user-1');
    expect(res.totalTargets).toBe(1);
    expect(refineStart).toHaveBeenCalledTimes(1);
  });

  it('honors a lower refineMaxVersions cap', async () => {
    const admin = makeAdmin({
      artifacts: [
        {
          id: 'a1',
          goal_id: 'parent-1',
          user_id: 'user-1',
          kind: 'report',
          title: 'A1',
          refinement_count: 0,
        }, // 0 < 1 → kept
        {
          id: 'a2',
          goal_id: 'parent-1',
          user_id: 'user-1',
          kind: 'report',
          title: 'A2',
          refinement_count: 1,
        }, // 1 >= 1 → skipped
      ],
    });
    const res = await handleLoopRefineParentDeliverables(
      admin,
      { ...basePayload, refineMaxVersions: 1 },
      null,
      'user-1'
    );
    expect(res.totalTargets).toBe(1);
    expect(refineStart).toHaveBeenCalledTimes(1);
    expect(refineStart.mock.calls[0][2]).toMatchObject({
      parent_id: 'a1',
      source_goal_id: 'child-1',
    });
  });

  it('allows more versions with a higher cap', async () => {
    const admin = makeAdmin({
      artifacts: [
        {
          id: 'a1',
          goal_id: 'parent-1',
          user_id: 'user-1',
          kind: 'report',
          title: 'A1',
          refinement_count: 2,
        }, // 2 < 3 → kept
        {
          id: 'a2',
          goal_id: 'parent-1',
          user_id: 'user-1',
          kind: 'report',
          title: 'A2',
          refinement_count: 3,
        }, // 3 >= 3 → skipped
      ],
    });
    const res = await handleLoopRefineParentDeliverables(
      admin,
      { ...basePayload, refineMaxVersions: 3 },
      null,
      'user-1'
    );
    expect(res.totalTargets).toBe(1);
  });

  it('rejects a victim parent before reading or refining any deliverable', async () => {
    const admin = makeAdmin({
      goals: [
        {
          id: 'parent-1',
          user_id: 'victim-user',
          continuation_goal_id: 'child-1',
        },
        {
          id: 'child-1',
          user_id: 'victim-user',
          parent_goal_id: 'parent-1',
        },
      ],
      artifacts: [{ id: 'victim-artifact', goal_id: 'parent-1', user_id: 'victim-user' }],
    });

    const res = await handleLoopRefineParentDeliverables(
      admin,
      { ...basePayload, _userId: 'attacker-user' },
      null,
      'attacker-user'
    );

    expect(res.error).toContain('owned linked refinement chain');
    expect(refineStart).not.toHaveBeenCalled();
    expect(admin.reads.map(({ table }) => table)).toEqual(['goals', 'goals']);
  });

  it('does not treat the payload owner as durable authority', async () => {
    const admin = makeAdmin();

    const res = await handleLoopRefineParentDeliverables(admin, basePayload, null);

    expect(res.error).toContain('expected owner user_id is required');
    expect(admin.reads).toEqual([]);
    expect(refineStart).not.toHaveBeenCalled();
  });

  it('rejects same-owner goals whose reciprocal continuation link does not match', async () => {
    const admin = makeAdmin({
      goals: [
        {
          id: 'parent-1',
          user_id: 'user-1',
          continuation_goal_id: 'different-child',
        },
        {
          id: 'child-1',
          user_id: 'user-1',
          parent_goal_id: 'parent-1',
        },
      ],
    });

    const res = await handleLoopRefineParentDeliverables(admin, basePayload, null, 'user-1');

    expect(res.error).toContain('owned linked refinement chain');
    expect(refineStart).not.toHaveBeenCalled();
    expect(admin.reads.map(({ table }) => table)).toEqual(['goals', 'goals']);
  });

  it('scopes every deliverable source to the durable owner', async () => {
    const admin = makeAdmin({
      artifacts: [
        {
          id: 'owned-artifact',
          goal_id: 'parent-1',
          user_id: 'user-1',
          kind: 'report',
          refinement_count: 0,
        },
        {
          id: 'victim-artifact',
          goal_id: 'parent-1',
          user_id: 'victim-user',
          kind: 'report',
          refinement_count: 0,
        },
      ],
      landings: [
        {
          id: 'victim-landing',
          goal_id: 'parent-1',
          user_id: 'victim-user',
          refinement_count: 0,
        },
      ],
      docs: [
        {
          id: 'victim-doc',
          user_id: 'victim-user',
          metadata: { goal_id: 'parent-1' },
          refinement_count: 0,
        },
      ],
    });

    const res = await handleLoopRefineParentDeliverables(admin, basePayload, null, 'user-1');

    expect(res.totalTargets).toBe(1);
    expect(refineStart).toHaveBeenCalledTimes(1);
    expect(refineStart).toHaveBeenCalledWith(
      admin,
      'user-1',
      expect.objectContaining({ parent_id: 'owned-artifact', source_goal_id: 'child-1' })
    );
    for (const read of admin.reads.filter(({ table }) => table !== 'goals')) {
      expect(read.filters).toContainEqual({ column: 'user_id', value: 'user-1' });
    }
  });
});
