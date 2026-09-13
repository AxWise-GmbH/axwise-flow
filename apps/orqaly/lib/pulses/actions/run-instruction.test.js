import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../goal-handlers/_helpers.js', () => {
  const triggerProcessNext = vi.fn();
  return {
    triggerProcessNext,
    deterministicAgentJobId: vi.fn(
      (namespace, identity) => `${namespace}:${identity.goalId || 'unknown'}`
    ),
    enqueueAgentJob: vi.fn(async (admin, job) => {
      const row = { ...job, status: 'queued', worker_scope: 'production' };
      const { error } = await admin.from('agent_jobs').insert(row);
      if (error) throw error;
      triggerProcessNext({ jobId: row.id });
      return row;
    }),
  };
});

import { handleRunInstruction } from './run-instruction.js';
import { enqueueAgentJob, triggerProcessNext } from '../../goal-handlers/_helpers.js';
import { acceptedNativeGoalFixture } from '../../_shared/native-goal-authority.test-fixture.js';

/**
 * Minimal chainable Supabase admin mock.
 *   - goals .insert().select().single()  -> returns an auto-incrementing goal row
 *   - goals .select().eq().single()      -> returns the configured sourceGoal (repeat_goal)
 *   - agent_jobs .insert()               -> resolves directly
 */
function makeAdmin({
  sourceGoal = null,
  goalErr = null,
  jobErr = null,
  jobRows = [],
  jobReadError = null,
} = {}) {
  const inserts = { goals: [], agent_jobs: [], goal_log: [], goal_unit_members: [] };
  const goalRows = new Map();
  const goalUpdates = [];
  let goalSeq = 0;
  const admin = {
    from(table) {
      return {
        insert(payload) {
          if (table === 'goals') {
            inserts.goals.push(payload);
            const id = `goal-${++goalSeq}`;
            const row = {
              ...payload,
              id,
              updated_at: `2026-08-22T10:00:0${goalSeq}.000Z`,
            };
            goalRows.set(id, row);
            return {
              select() {
                return {
                  single: async () => ({
                    data: goalErr ? null : row,
                    error: goalErr,
                  }),
                };
              },
            };
          }
          if (inserts[table]) inserts[table].push(payload);
          return Promise.resolve({ error: jobErr });
        },
        update(updates) {
          if (table !== 'goals') throw new Error(`unexpected update table: ${table}`);
          const filters = new Map();
          const chain = {
            eq(field, value) {
              filters.set(field, value);
              return chain;
            },
            select() {
              return chain;
            },
            async maybeSingle() {
              const row = goalRows.get(filters.get('id')) || null;
              const exact =
                row &&
                (!filters.has('user_id') || row.user_id === filters.get('user_id')) &&
                (!filters.has('status') || row.status === filters.get('status')) &&
                (!filters.has('updated_at') || row.updated_at === filters.get('updated_at'));
              if (!exact) return { data: null, error: null };
              const updated = { ...row, ...updates };
              goalRows.set(updated.id, updated);
              goalUpdates.push({ updates, filters: Object.fromEntries(filters) });
              return { data: updated, error: null };
            },
          };
          return chain;
        },
        select() {
          const filters = new Map();
          const chain = {
            eq(field, value) {
              filters.set(field, value);
              return chain;
            },
            not() {
              return chain;
            },
            async single() {
              return { data: sourceGoal || goalRows.get(filters.get('id')) || null, error: null };
            },
            async maybeSingle() {
              if (table === 'agent_jobs') {
                if (jobReadError) return { data: null, error: jobReadError };
                return {
                  data: jobRows.find((row) => row.id === filters.get('id')) || null,
                  error: null,
                };
              }
              return { data: goalRows.get(filters.get('id')) || null, error: null };
            },
          };
          return chain;
        },
      };
    },
    _inserts: inserts,
    _goalRows: goalRows,
    _goalUpdates: goalUpdates,
  };
  return admin;
}

const owner = { owner_type: 'agent', owner_id: 'agent-9', owner_name: 'Research Bot' };

function pulse(metadata) {
  return { id: 'pulse-1', user_id: 'user-1', metadata };
}

describe('handleRunInstruction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('legacy single-field pulse creates exactly one goal', async () => {
    const admin = makeAdmin();
    const res = await handleRunInstruction(
      admin,
      pulse({
        ...owner,
        instruction: 'Do a research on competitor pricing',
        instrument: { slug: 'task-manager', route: '/task-manager' },
      }),
      {}
    );

    expect(res.status).toBe('done');
    expect(res.count).toBe(1);
    expect(res.goalIds).toEqual(['goal-1']);

    expect(admin._inserts.goals).toHaveLength(1);
    const g = admin._inserts.goals[0];
    expect(g.user_id).toBe('user-1');
    expect(g.status).toBe('feasibility');
    expect(g.data.instrument.slug).toBe('task-manager');
    expect(g.description).toContain('Research Bot');

    expect(admin._inserts.agent_jobs).toHaveLength(1);
    expect(admin._inserts.agent_jobs[0]).toMatchObject({
      user_id: 'user-1',
      payload: {
        type: 'orchestrate-goal',
        _userId: 'user-1',
        userId: 'user-1',
        user_id: 'user-1',
      },
    });
    expect(triggerProcessNext).toHaveBeenCalledTimes(1);
  });

  it('multi-entry pulse creates one goal + job per entry', async () => {
    const admin = makeAdmin();
    const res = await handleRunInstruction(
      admin,
      pulse({
        ...owner,
        entries: [
          {
            kind: 'instrument',
            instrument: { slug: 'task-manager', route: '/t' },
            prompt: 'Check tasks',
            ref: 'TASK-7',
          },
          {
            kind: 'instrument',
            instrument: { slug: 'workflow', route: '/w' },
            prompt: 'Run workflow',
            ref: '',
          },
        ],
      }),
      {}
    );

    expect(res.status).toBe('done');
    expect(res.count).toBe(2);
    expect(res.goalIds).toEqual(['goal-1', 'goal-2']);
    expect(admin._inserts.goals).toHaveLength(2);
    expect(admin._inserts.agent_jobs).toHaveLength(2);
    // reference surfaced in context line of the first entry
    expect(admin._inserts.goals[0].description).toContain('Reference: TASK-7');
    expect(triggerProcessNext).toHaveBeenCalledTimes(2);
  });

  it('repeat_goal entry derives a new goal from a completed source goal', async () => {
    const admin = makeAdmin({
      sourceGoal: {
        id: 'src-1',
        title: 'Landing page',
        description: 'Build LP',
        user_id: 'user-1',
        status: 'completed',
      },
    });
    const res = await handleRunInstruction(
      admin,
      pulse({
        ...owner,
        entries: [
          {
            kind: 'repeat_goal',
            source_goal_id: 'src-1',
            source_goal_title: 'Landing page',
            prompt: 'new color scheme, bolder fonts',
          },
        ],
      }),
      {}
    );

    expect(res.status).toBe('done');
    expect(res.count).toBe(1);
    const g = admin._inserts.goals[0];
    expect(g.data.repeat_of).toBe('src-1');
    expect(g.title).toContain('Repeat');
    expect(g.description).toContain('new color scheme');
  });

  it('repeat_goal same_team clones goal with team executor', async () => {
    const admin = makeAdmin({
      sourceGoal: {
        id: 'src-1',
        title: 'Landing page',
        description: 'Build LP',
        user_id: 'user-1',
        status: 'completed',
        agent_team_id: 'team-99',
        budget_usd: 25,
        parsed_category: 'dev',
      },
    });
    const res = await handleRunInstruction(
      admin,
      pulse({
        ...owner,
        entries: [
          {
            kind: 'repeat_goal',
            source_goal_id: 'src-1',
            prompt: 'Re-run with the same team and brief.',
            repeat_mode: 'same_team',
          },
        ],
      }),
      {}
    );

    expect(res.status).toBe('done');
    expect(res.count).toBe(1);
    const g = admin._inserts.goals[0];
    expect(g.title).toBe('Pulse: Landing page');
    expect(g.executor_type).toBe('team');
    expect(g.executor_id).toBe('team-99');
    expect(g.data.pulse_of).toBe('src-1');
    expect(admin._inserts.agent_jobs[0].payload.context.pulse_mode).toBe('same_team');
  });

  it('repeat_goal consilium sets consilium executor', async () => {
    const admin = makeAdmin({
      sourceGoal: {
        id: 'src-2',
        title: 'Report',
        description: 'Weekly report',
        user_id: 'user-1',
        status: 'active',
        concilium_id: 'board-1',
      },
    });
    const res = await handleRunInstruction(
      admin,
      pulse({
        ...owner,
        entries: [
          {
            kind: 'repeat_goal',
            source_goal_id: 'src-2',
            prompt: 'Fresh agent assignment via Consilium.',
            repeat_mode: 'consilium',
            concilium_id: 'board-1',
          },
        ],
      }),
      {}
    );

    expect(res.status).toBe('done');
    const g = admin._inserts.goals[0];
    expect(g.executor_type).toBe('consilium');
    expect(g.concilium_id).toBe('board-1');
    expect(g.mode).toBe('advanced');
  });

  it('repeat_goal skips a non-completed or foreign source goal', async () => {
    const admin = makeAdmin({
      sourceGoal: {
        id: 'src-1',
        title: 'x',
        description: '',
        user_id: 'someone-else',
        status: 'completed',
      },
    });
    const res = await handleRunInstruction(
      admin,
      pulse({
        ...owner,
        entries: [{ kind: 'repeat_goal', source_goal_id: 'src-1', prompt: 'tweak' }],
      }),
      {}
    );

    expect(res.status).toBe('failed');
    expect(admin._inserts.goals).toHaveLength(0);
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });

  it.each(['prompt_only', 'same_team', 'consilium'])(
    'repeat_goal %s never downgrades a native source into legacy feasibility',
    async (repeatMode) => {
      const sourceGoal = acceptedNativeGoalFixture({
        id: 'src-native',
        user_id: 'user-1',
        status: 'completed',
        title: 'RAW_NATIVE_REPEAT_POISON',
        description: 'RAW_NATIVE_REPEAT_DESCRIPTION_POISON',
        agent_team_id: 'team-1',
        concilium_id: 'board-1',
      });
      const admin = makeAdmin({ sourceGoal });
      const res = await handleRunInstruction(
        admin,
        pulse({
          ...owner,
          entries: [
            {
              kind: 'repeat_goal',
              source_goal_id: sourceGoal.id,
              prompt: 'repeat it',
              repeat_mode: repeatMode,
              concilium_id: 'board-1',
            },
          ],
        }),
        {}
      );

      expect(res.status).toBe('failed');
      expect(res.skipped).toContain('native source requires a newly confirmed AxWise scope');
      expect(admin._inserts.goals).toHaveLength(0);
      expect(admin._inserts.agent_jobs).toHaveLength(0);
      expect(triggerProcessNext).not.toHaveBeenCalled();
    }
  );

  it('skips when no entries and no legacy instruction', async () => {
    const admin = makeAdmin();
    const res = await handleRunInstruction(admin, pulse({ ...owner }), {});
    expect(res.status).toBe('skipped');
    expect(admin._inserts.goals).toHaveLength(0);
  });

  it('skips when no user_id', async () => {
    const admin = makeAdmin();
    const res = await handleRunInstruction(
      admin,
      { ...pulse({ ...owner, instruction: 'x' }), user_id: null },
      {}
    );
    expect(res.status).toBe('skipped');
  });

  it('returns failed when goal insert errors', async () => {
    const admin = makeAdmin({ goalErr: { message: 'boom' } });
    const res = await handleRunInstruction(
      admin,
      pulse({
        ...owner,
        instruction: 'Do a research',
        instrument: { slug: 'task-manager', route: '/t' },
      }),
      {}
    );
    expect(res.status).toBe('failed');
    expect(res.error).toBe('boom');
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });

  it('returns and exactly parks a created goal when its durable job is terminal', async () => {
    const terminalJob = {
      id: 'pulse-goal-feasibility:goal-1',
      user_id: 'user-1',
      status: 'failed',
      worker_scope: 'production',
      payload: {
        type: 'orchestrate-goal',
        action: 'feasibility-analysis',
        goalId: 'goal-1',
        _userId: 'user-1',
        userId: 'user-1',
        user_id: 'user-1',
      },
    };
    const admin = makeAdmin({ jobRows: [terminalJob] });
    enqueueAgentJob.mockRejectedValueOnce(
      Object.assign(new Error('exact job is already failed'), { code: 'AGENT_JOB_TERMINAL' })
    );

    const res = await handleRunInstruction(
      admin,
      pulse({ ...owner, instruction: 'Create a durable pulse goal' }),
      { env: { NODE_ENV: 'test', VERCEL_ENV: 'production' } }
    );

    expect(res).toMatchObject({
      status: 'failed',
      handoffStatus: 'parked',
      goalIds: ['goal-1'],
      count: 1,
      queuedCount: 0,
      parkedGoalIds: ['goal-1'],
      reconciliationRequired: false,
      outcomes: [
        expect.objectContaining({
          goalId: 'goal-1',
          jobId: terminalJob.id,
          status: 'parked',
          reconciliationRequired: false,
        }),
      ],
    });
    expect(admin._goalRows.get('goal-1')).toMatchObject({
      status: 'needs_human',
      data: {
        pulse_handoff: expect.objectContaining({
          status: 'stopped',
          pulse_id: 'pulse-1',
          job_id: terminalJob.id,
          job_state: 'failed',
        }),
      },
    });
    expect(admin._goalUpdates[0].filters).toMatchObject({
      id: 'goal-1',
      user_id: 'user-1',
      status: 'feasibility',
      updated_at: '2026-08-22T10:00:01.000Z',
    });
  });

  it('returns the created goal id and reconciliation outcome without an unsafe park', async () => {
    const admin = makeAdmin({ jobReadError: { message: 'read unavailable' } });
    enqueueAgentJob.mockRejectedValueOnce(new Error('ambiguous enqueue response'));

    const res = await handleRunInstruction(
      admin,
      pulse({ ...owner, instruction: 'Keep this goal visible' }),
      { env: { NODE_ENV: 'test', VERCEL_ENV: 'production' } }
    );

    expect(res).toMatchObject({
      status: 'failed',
      handoffStatus: 'reconciliation_required',
      goalIds: ['goal-1'],
      count: 1,
      queuedCount: 0,
      parkedGoalIds: [],
      reconciliationRequired: true,
      outcomes: [
        expect.objectContaining({
          goalId: 'goal-1',
          status: 'reconciliation_required',
          reconciliationRequired: true,
          reconciliationState: 'unknown',
        }),
      ],
    });
    expect(admin._goalRows.get('goal-1').status).toBe('feasibility');
    expect(admin._goalUpdates).toHaveLength(0);
  });
});
