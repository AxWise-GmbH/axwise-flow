import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../_shared/embeddings.js', () => ({
  generateEmbedding: (...args) => mocks.generateEmbedding(...args),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: mocks.warn, info: vi.fn(), error: vi.fn() }),
}));

import { retrieveRelevant } from './retrieve.js';

function thenableQuery(result, state) {
  const query = {
    select(fields) {
      state.select = fields;
      return this;
    },
    eq(column, value) {
      state.filters.push(['eq', column, value]);
      return this;
    },
    in(column, value) {
      state.filters.push(['in', column, value]);
      return this;
    },
    order(column, options) {
      state.order = [column, options];
      return this;
    },
    limit(value) {
      state.limit = value;
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(typeof result === 'function' ? result() : result).then(
        resolve,
        reject
      );
    },
  };
  return query;
}

function makeAdmin({ rpc, sourceGoals = [], fallbackRows = [], fallbackError = null }) {
  const state = { goalQueries: [], fallbackQueries: [] };
  return {
    rpc: vi.fn(async () => rpc),
    from: vi.fn((table) => {
      if (table === 'goals') {
        const queryState = { filters: [] };
        state.goalQueries.push(queryState);
        return thenableQuery(
          () => ({
            data: typeof sourceGoals === 'function' ? sourceGoals() : sourceGoals,
            error: null,
          }),
          queryState
        );
      }
      if (table === 'goal_memory') {
        const queryState = { filters: [] };
        state.fallbackQueries.push(queryState);
        return thenableQuery({ data: fallbackRows, error: fallbackError }, queryState);
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    __debug: state,
  };
}

function memory(id, goalId, overrides = {}) {
  return {
    id,
    goal_id: goalId,
    kind: 'summary',
    content: id,
    metadata: {},
    created_at: '2026-08-24T12:00:00.000Z',
    business_type: 'research',
    similarity: 0.9,
    ...overrides,
  };
}

describe('goal memory retrieval source invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateEmbedding.mockResolvedValue([0.1, 0.2]);
  });

  it('post-validates RPC rows against the current exact-user completed goals', async () => {
    const rpcRows = [
      memory('eligible', 'goal-completed'),
      memory('cancelled', 'goal-cancelled'),
      memory('stale', 'goal-active'),
      memory('forged-owner', 'goal-user-2'),
      memory('orphan', 'goal-missing'),
    ];
    const admin = makeAdmin({
      rpc: { data: rpcRows, error: null },
      // Return deliberately unfiltered rows to exercise the client-side guard
      // in addition to asserting the query predicates below.
      sourceGoals: [
        { id: 'goal-completed', user_id: 'user-1', status: 'completed' },
        { id: 'goal-cancelled', user_id: 'user-1', status: 'cancelled' },
        { id: 'goal-active', user_id: 'user-1', status: 'active' },
        { id: 'goal-user-2', user_id: 'user-2', status: 'completed' },
      ],
    });

    const rows = await retrieveRelevant(admin, {
      userId: 'user-1',
      businessType: 'research',
      query: 'new report',
      k: 8,
    });

    expect(rows).toEqual([memory('eligible', 'goal-completed')]);
    expect(admin.rpc).toHaveBeenCalledWith('match_goal_memory', {
      query_embedding: [0.1, 0.2],
      match_user_id: 'user-1',
      match_business_type: 'research',
      match_count: 8,
    });
    expect(admin.__debug.goalQueries).toEqual([
      expect.objectContaining({
        select: 'id, user_id, status',
        filters: [
          ['eq', 'user_id', 'user-1'],
          ['eq', 'status', 'completed'],
          ['in', 'id', rpcRows.map((row) => row.goal_id)],
        ],
      }),
    ]);
  });

  it('immediately excludes an indexed source after completed changes to cancelled', async () => {
    let status = 'completed';
    const admin = makeAdmin({
      rpc: { data: [memory('same-row', 'goal-1')], error: null },
      sourceGoals: () => [{ id: 'goal-1', user_id: 'user-1', status }],
    });

    const first = await retrieveRelevant(admin, { userId: 'user-1', query: 'query' });
    status = 'cancelled';
    const second = await retrieveRelevant(admin, { userId: 'user-1', query: 'query' });

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  it('keeps the recency fallback joined to exact-user completed source goals', async () => {
    mocks.generateEmbedding.mockResolvedValue(null);
    const fallbackRows = [
      memory('eligible', 'goal-completed', {
        user_id: 'user-1',
        goals: { id: 'goal-completed', user_id: 'user-1', status: 'completed' },
      }),
      memory('cancelled', 'goal-cancelled', {
        user_id: 'user-1',
        goals: { id: 'goal-cancelled', user_id: 'user-1', status: 'cancelled' },
      }),
      memory('stale', 'goal-active', {
        user_id: 'user-1',
        goals: { id: 'goal-active', user_id: 'user-1', status: 'active' },
      }),
      memory('forged-source-owner', 'goal-user-2', {
        user_id: 'user-1',
        goals: { id: 'goal-user-2', user_id: 'user-2', status: 'completed' },
      }),
      memory('forged-memory-owner', 'goal-completed', {
        user_id: 'user-2',
        goals: { id: 'goal-completed', user_id: 'user-1', status: 'completed' },
      }),
      memory('orphan', 'goal-missing', { user_id: 'user-1', goals: null }),
    ];
    const admin = makeAdmin({
      rpc: { data: null, error: new Error('RPC unavailable') },
      fallbackRows,
    });

    const rows = await retrieveRelevant(admin, {
      userId: 'user-1',
      businessType: 'research',
      query: 'new report',
      k: 4,
      kinds: ['summary'],
    });

    expect(rows).toEqual([
      memory('eligible', 'goal-completed', {
        similarity: 0.9,
      }),
    ]);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.__debug.fallbackQueries).toEqual([
      expect.objectContaining({
        select: expect.stringContaining('goals!inner(id, user_id, status)'),
        filters: expect.arrayContaining([
          ['eq', 'user_id', 'user-1'],
          ['eq', 'goals.user_id', 'user-1'],
          ['eq', 'goals.status', 'completed'],
          ['eq', 'business_type', 'research'],
          ['in', 'kind', ['summary']],
        ]),
        limit: 12,
      }),
    ]);
  });

  it('requires an explicit user even for service-role clients', async () => {
    const admin = makeAdmin({ rpc: { data: [], error: null } });

    await expect(retrieveRelevant(admin, { query: 'query' })).resolves.toEqual([]);

    expect(mocks.generateEmbedding).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });
});
