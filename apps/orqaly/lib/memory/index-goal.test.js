import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../_shared/embeddings.js', () => ({
  generateEmbedding: (...args) => mocks.generateEmbedding(...args),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: mocks.warn, info: mocks.info, error: vi.fn() }),
}));

import { indexCompletedGoal } from './index-goal.js';

function completedGoal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    status: 'completed',
    title: 'Canonical research report',
    parsed_category: 'research',
    data: {
      completed_at: '2026-08-24T12:00:00.000Z',
      project_overview: {
        one_liner: 'Authoritative overview',
        summary: 'Verified source data',
        deliverables: [
          {
            title: 'Final report',
            description: 'The reviewed result',
            type: 'markdown',
          },
        ],
        roadmap: [
          {
            title: 'Publish',
            description: 'Share the final report',
            impact: 'high',
            effort: 'low',
            timeframe: 'now',
          },
        ],
      },
    },
    ...overrides,
  };
}

function makeAdmin({ sourceGoal, sourceError = null, returnSourceUnfiltered = false }) {
  const state = {
    goalRead: null,
    dedupeReads: [],
    inserts: [],
  };

  const admin = {
    from: vi.fn((table) => {
      if (table === 'goals') {
        const query = {
          fields: null,
          filters: [],
          select(fields) {
            this.fields = fields;
            return this;
          },
          eq(column, value) {
            this.filters.push([column, value]);
            return this;
          },
          async maybeSingle() {
            state.goalRead = { fields: this.fields, filters: this.filters };
            if (sourceError) return { data: null, error: sourceError };
            if (returnSourceUnfiltered) return { data: sourceGoal, error: null };
            const matches = this.filters.every(([column, value]) => sourceGoal?.[column] === value);
            return { data: matches ? sourceGoal : null, error: null };
          },
        };
        return query;
      }

      if (table === 'goal_memory') {
        return {
          select(fields) {
            const filters = [];
            return {
              eq(column, value) {
                filters.push([column, value]);
                return this;
              },
              async maybeSingle() {
                state.dedupeReads.push({ fields, filters });
                return { data: null, error: null };
              },
              async single() {
                return { data: { id: `memory-${state.inserts.length}` }, error: null };
              },
            };
          },
          insert(row) {
            state.inserts.push(row);
            return {
              select() {
                return this;
              },
              async single() {
                return { data: { id: `memory-${state.inserts.length}` }, error: null };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    __debug: state,
  };

  return admin;
}

describe('completed goal memory indexing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateEmbedding.mockResolvedValue([0.1, 0.2]);
  });

  it('indexes only the current explicitly user-scoped completed source row', async () => {
    const sourceGoal = completedGoal();
    const admin = makeAdmin({ sourceGoal });
    const forgedSnapshot = completedGoal({
      title: 'FORGED SNAPSHOT CONTENT',
      data: { project_overview: { summary: 'FORGED SUMMARY' } },
    });

    const result = await indexCompletedGoal(admin, forgedSnapshot);

    expect(result).toEqual({ ok: true, businessType: 'research', items: 3 });
    expect(admin.__debug.goalRead).toEqual({
      fields: 'id, user_id, status, title, parsed_category, data',
      filters: [
        ['id', 'goal-1'],
        ['user_id', 'user-1'],
        ['status', 'completed'],
      ],
    });
    expect(admin.__debug.inserts).toHaveLength(3);
    expect(admin.__debug.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-1',
          goal_id: 'goal-1',
          kind: 'project_overview',
          content: expect.stringContaining('Canonical research report'),
        }),
      ])
    );
    expect(admin.__debug.inserts.map((row) => row.content).join('\n')).not.toContain('FORGED');
    expect(admin.__debug.dedupeReads).toHaveLength(3);
    for (const read of admin.__debug.dedupeReads) {
      expect(read.filters).toContainEqual(['user_id', 'user-1']);
      expect(read.filters).toContainEqual(['goal_id', 'goal-1']);
    }
  });

  it.each([
    ['cancelled source', completedGoal({ status: 'cancelled' })],
    ['non-terminal source', completedGoal({ status: 'active' })],
    ['different owner', completedGoal({ user_id: 'user-2' })],
    ['missing source', null],
  ])('refuses a stale completed snapshot when the live row is a %s', async (_label, sourceGoal) => {
    const admin = makeAdmin({ sourceGoal });

    const result = await indexCompletedGoal(admin, completedGoal());

    expect(result).toEqual({
      ok: false,
      reason: 'source goal is not currently completed by user',
    });
    expect(admin.__debug.inserts).toEqual([]);
    expect(mocks.generateEmbedding).not.toHaveBeenCalled();
  });

  it('defensively rejects a forged row returned despite the ownership filters', async () => {
    const admin = makeAdmin({
      sourceGoal: completedGoal({ user_id: 'user-2' }),
      returnSourceUnfiltered: true,
    });

    const result = await indexCompletedGoal(admin, completedGoal());

    expect(result.ok).toBe(false);
    expect(admin.__debug.inserts).toEqual([]);
  });

  it('fails closed when the authoritative source lookup fails', async () => {
    const admin = makeAdmin({
      sourceGoal: completedGoal(),
      sourceError: new Error('database unavailable'),
    });

    const result = await indexCompletedGoal(admin, completedGoal());

    expect(result).toEqual({ ok: false, reason: 'source goal lookup failed' });
    expect(admin.__debug.inserts).toEqual([]);
    expect(mocks.warn).toHaveBeenCalledWith(
      null,
      'memory.source.read-failed',
      expect.objectContaining({ goalId: 'goal-1' })
    );
  });
});
