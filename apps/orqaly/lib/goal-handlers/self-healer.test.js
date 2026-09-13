/**
 * Tests for self-healer + all healing strategies (h01/h02/h03/h04/h99).
 * Single consolidated file per plan §4.3.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { healGoal, healAllStuckGoals, STRATEGIES } from './self-healer.js';
import * as h00 from './healing-strategies/h00-terminal-llm-error.js';
import * as h01 from './healing-strategies/h01-transient-error.js';
import * as h02 from './healing-strategies/h02-llm-json-fallback.js';
import * as h03 from './healing-strategies/h03-no-jobs-reform.js';
import * as h04 from './healing-strategies/h04-stuck-no-queue.js';
import * as h99 from './healing-strategies/h99-escalate.js';

// ── Mock admin ──────────────────────────────────────────────────

function makeGoal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'Test Goal',
    status: 'failed',
    updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    budget_usd: 10,
    spent_usd: 0,
    iteration: 0,
    max_iterations: 5,
    plan: { phases: [{ name: 'Phase 1', status: 'pending' }] },
    data: {},
    ...overrides,
  };
}

/**
 * Build a chainable mock admin that tracks all writes.
 */
function makeAdmin({
  goals = [],
  queuedJobs = [],
  agentJobs = [],
  tools = [],
  agents = [],
  browserTaskRuns = [],
  humanTasks = [],
  humanTaskInsertConflict = false,
  humanTaskDowngradeCasLoss = false,
  goalUpdateCasLoss = false,
  queuedJobsError = null,
} = {}) {
  const state = {
    updates: [],
    inserts: [],
    deletes: [],
    queuedJobs, // jobs returned by the queued-job lookup
    agentJobs, // exact jobs returned by trusted legacy browser provenance lookup
    tools, // tool rows returned by tools.select().eq().eq().maybeSingle()
    agents, // agent rows returned by agents.select().eq().eq().maybeSingle()
    browserTaskRuns, // rows returned by browser_task_runs.select().eq().eq().order().limit().maybeSingle()
    humanTasks,
    humanTaskInsertConflict,
    humanTaskDowngradeCasLoss,
    goalUpdateCasLoss,
    queuedJobsError,
    humanTaskInsertSelect: null,
  };

  function fromGoals() {
    return {
      select: () => ({
        not: () => ({
          lt: () => ({
            order: () => ({
              limit: async () => ({ data: goals, error: null }),
            }),
          }),
        }),
        eq: () => ({
          single: async () => ({ data: goals[0], error: null }),
        }),
      }),
      update: (patch) => {
        const filters = new Map();
        let evaluated = false;
        let result;
        const evaluate = async () => {
          if (evaluated) return result;
          evaluated = true;
          state.updates.push({
            table: 'goals',
            id: filters.get('id'),
            patch,
            filters: Object.fromEntries(filters),
          });
          result = {
            data: state.goalUpdateCasLoss ? null : { id: filters.get('id') },
            error: null,
          };
          state.goalUpdateCasLoss = false;
          return result;
        };
        const chain = {
          eq: (column, value) => {
            filters.set(column, value);
            return chain;
          },
          select: () => chain,
          maybeSingle: evaluate,
          then: (onFulfilled, onRejected) => evaluate().then(onFulfilled, onRejected),
        };
        return chain;
      },
    };
  }

  function fromAgentJobs() {
    return {
      select: () => {
        const filters = new Map();
        const chain = {
          eq: (column, value) => {
            filters.set(column, value);
            return chain;
          },
          in: () => chain,
          contains: () => chain,
          limit: async () => ({ data: state.queuedJobs, error: state.queuedJobsError }),
          maybeSingle: async () => ({
            data:
              state.agentJobs.find((job) =>
                [...filters].every(([column, value]) => job[column] === value)
              ) || null,
            error: null,
          }),
        };
        return chain;
      },
      // Supports both bare `.insert(row)` (legacy h03) and
      // `.insert(row).select('id').single()` (h40+).
      insert: (row) => {
        state.inserts.push({ table: 'agent_jobs', row });
        const result = { data: { id: 'job-new' }, error: null };
        const chain = {
          select: () => ({ single: async () => result }),
          then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
        };
        return chain;
      },
    };
  }

  function fromGoalLog() {
    return {
      insert: async (row) => {
        state.inserts.push({ table: 'goal_log', row });
        return { data: { id: 'log-new' }, error: null };
      },
    };
  }

  function fromTeamTasks() {
    return {
      delete: () => ({
        eq: async () => {
          state.deletes.push({ table: 'team_tasks' });
          return { error: null };
        },
      }),
    };
  }

  function fromNotifications() {
    return {
      insert: async (row) => {
        state.inserts.push({ table: 'notifications', row });
        return { data: { id: 'notif-new' }, error: null };
      },
    };
  }

  // Tools + agents use select().eq().eq().maybeSingle() — return the first
  // matching row (tests set up a single-row scenario).
  function fromTools() {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: state.tools[0] || null, error: null }) }),
        }),
      }),
    };
  }

  function fromAgents() {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: state.agents[0] || null, error: null }) }),
        }),
      }),
    };
  }

  function fromHumanTasks() {
    return {
      select: () => {
        const filters = new Map();
        const inFilters = new Map();
        const chain = {
          eq: (column, value) => {
            filters.set(column, value);
            return chain;
          },
          is: (column, value) => {
            filters.set(column, value);
            return chain;
          },
          in: (column, values) => {
            inFilters.set(column, values);
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({
            data:
              state.humanTasks.find(
                (task) =>
                  [...filters].every(([column, value]) => task[column] === value) &&
                  [...inFilters].every(([column, values]) => values.includes(task[column]))
              ) || null,
            error: null,
          }),
        };
        return chain;
      },
      insert: (row) => {
        state.inserts.push({ table: 'human_tasks', row });
        let result;
        if (state.humanTaskInsertConflict) {
          state.humanTasks.push({
            ...row,
            id: 'human-task-race-winner',
            status: 'pending',
            claimed_at: null,
            escalated_at: null,
            updated_at: '2026-08-22T10:00:00.000Z',
          });
          state.humanTaskInsertConflict = false;
          result = { data: null, error: { code: '23505', message: 'duplicate key' } };
        } else {
          result = {
            data: {
              id: 'human-task-new',
              user_id: row.user_id,
              escalation_allowed: row.escalation_allowed,
              escalate_after_seconds: row.escalate_after_seconds,
              status: row.status,
              claimed_at: null,
              escalated_at: null,
              updated_at: '2026-08-22T10:00:00.000Z',
            },
            error: null,
          };
          state.humanTasks.push({ ...row, ...result.data });
        }
        return {
          select: (fields) => {
            state.humanTaskInsertSelect = fields;
            return { single: async () => result };
          },
          then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
        };
      },
      update: (patch) => {
        const filters = new Map();
        let statuses = null;
        let evaluated = false;
        let result;
        const evaluate = async () => {
          if (evaluated) return result;
          evaluated = true;
          state.updates.push({
            table: 'human_tasks',
            patch,
            filters: Object.fromEntries(filters),
          });
          if (state.humanTaskDowngradeCasLoss) {
            state.humanTaskDowngradeCasLoss = false;
            const racedTask = state.humanTasks.find(
              (candidate) => candidate.id === filters.get('id')
            );
            if (racedTask) {
              Object.assign(racedTask, {
                escalation_allowed: false,
                escalate_after_seconds: null,
                updated_at: '2026-08-22T10:01:00.000Z',
                partial_context: {
                  credential_completion: { attempt_id: 'completion-race', status: 'storing' },
                },
              });
            }
            result = { data: null, error: null };
            return result;
          }
          const matched = state.humanTasks.find(
            (task) =>
              [...filters].every(([column, value]) => task[column] === value) &&
              (!statuses || statuses.includes(task.status))
          );
          if (matched) {
            Object.assign(matched, patch, { updated_at: '2026-08-22T10:01:00.000Z' });
          }
          result = { data: matched || null, error: null };
          return result;
        };
        const chain = {
          eq: (column, value) => {
            filters.set(column, value);
            return chain;
          },
          is: (column, value) => {
            filters.set(column, value);
            return chain;
          },
          in: (_column, values) => {
            statuses = values;
            return chain;
          },
          select: () => chain,
          maybeSingle: evaluate,
          then: (onFulfilled, onRejected) => evaluate().then(onFulfilled, onRejected),
        };
        return chain;
      },
    };
  }

  function fromBrowserTaskRuns() {
    return {
      select: () => {
        const filters = new Map();
        const chain = {
          eq: (column, value) => {
            filters.set(column, value);
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({
            data:
              state.browserTaskRuns.find((run) =>
                [...filters].every(([column, value]) => run[column] === value)
              ) || null,
            error: null,
          }),
        };
        return chain;
      },
    };
  }

  function fromNotificationLog() {
    return {
      insert: async (row) => {
        state.inserts.push({ table: 'notification_log', row });
        return { data: { id: 'notif-log-new' }, error: null };
      },
    };
  }

  const admin = {
    _state: state,
    from: vi.fn((table) => {
      if (table === 'goals') return fromGoals();
      if (table === 'agent_jobs') return fromAgentJobs();
      if (table === 'goal_log') return fromGoalLog();
      if (table === 'team_tasks') return fromTeamTasks();
      if (table === 'notifications') return fromNotifications();
      if (table === 'tools') return fromTools();
      if (table === 'agents') return fromAgents();
      if (table === 'human_tasks') return fromHumanTasks();
      if (table === 'browser_task_runs') return fromBrowserTaskRuns();
      if (table === 'notification_log') return fromNotificationLog();
      return {}; // unknown tables — strategies should handle gracefully
    }),
  };
  return admin;
}

// ── h00: terminal LLM errors ────────────────────────────────────

describe('h00-terminal-llm-error', () => {
  const terminalReasons = [
    'LLM anthropic 400: Your credit balance is too low to access the Anthropic API.',
    'OpenAI error: insufficient_quota',
    'invalid_api_key: provided key is rejected',
    'Incorrect API key provided',
    'HTTP 401 Unauthorized',
    'HTTP 403 Forbidden',
    'BYOK_REQUIRED: this user has no LLM API key configured.',
    'SYSTEM_API_KEY_MISSING: ANTHROPIC_API_KEY not configured for system jobs.',
    'claude-code failed and CLAUDE_CODE_LOCAL=all forbids paid-API fallback: stream timeout',
    'authentication_error: invalid bearer',
    // Qwen / dashscope billing patterns added after the "Auto Parts Sales — (Qwen)"
    // goal failed with "Access denied ... Arrearage" and h99 escalated only
    // after the full healer cycle instead of h00 catching it immediately.
    'LLM qwen 400: {"error":{"message":"Access denied, please make sure your account is in good standing","type":"Arrearage"}}',
    'Account suspended — see Plans & Billing',
    'overdue_payment',
    'quota_exceeded for this period',
    'permission_denied: project not authorised for this model',
    // Tier 5 Bug B2 — repeated claude-code SDK stream hang escalation. Pre-call
    // guard in execute-task throws this terminal marker after Opus + Sonnet
    // both hung once on the same goal.
    'CLAUDE_CODE_STREAM_TIMEOUT_TERMINAL: stream has hung 2x on this goal (Opus + Sonnet fallback both stalled). Restart dev:local or switch the goal to a different provider.',
  ];

  it.each(terminalReasons)('matches terminal reason: %s', (reason) => {
    const goal = makeGoal({
      status: 'failed',
      data: { failure_reason: reason, failure_stage: 'pm-planning' },
    });
    expect(h00.matches(goal)).toBe(true);
  });

  it('does not match transient errors (those go to h01)', () => {
    const goal = makeGoal({
      data: { failure_reason: 'ECONNRESET fetch failed', failure_stage: 'po-analysis' },
    });
    expect(h00.matches(goal)).toBe(false);
  });

  it('does not match JSON parse errors (those go to h02)', () => {
    const goal = makeGoal({ data: { failure_reason: 'Unexpected token in JSON at position 42' } });
    expect(h00.matches(goal)).toBe(false);
  });

  it('does not match non-failed status', () => {
    const goal = makeGoal({
      status: 'active',
      data: { failure_reason: 'credit balance is too low' },
    });
    expect(h00.matches(goal)).toBe(false);
  });

  it('apply escalates to needs_human immediately and caps heal_attempts at 6', async () => {
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: 'credit balance is too low',
        failure_stage: 'pm-planning',
        heal_attempts: 0,
      },
    });
    const admin = makeAdmin();
    const result = await h00.apply(admin, goal, { log: null, otherStrategiesTried: [] });

    expect(result.action).toBe('escalated');
    expect(result.classification).toBe('terminal_llm_error');

    // Status + healing metadata move atomically under the exact goal snapshot.
    const goalsUpdates = admin._state.updates.filter((u) => u.table === 'goals');
    expect(goalsUpdates).toHaveLength(1);
    const transition = goalsUpdates[0];
    expect(transition.patch.status).toBe('needs_human');
    expect(transition.patch.data.last_heal_strategy).toBe('h00-terminal-llm-error');
    // Cap at 6 so healAllStuckGoals' filter skips this goal on future scans
    expect(transition.patch.data.heal_attempts).toBe(6);
    expect(transition.filters).toMatchObject({
      id: 'goal-1',
      user_id: 'user-1',
      status: 'failed',
      updated_at: goal.updated_at,
    });

    // goal_log + notification_log both written
    const logInsert = admin._state.inserts.find((i) => i.table === 'goal_log');
    expect(logInsert.row.event_type).toBe('goal_needs_human');
    expect(logInsert.row.details.classification).toBe('terminal_llm_error');

    const notifInsert = admin._state.inserts.find((i) => i.table === 'notification_log');
    expect(notifInsert.row.event_type).toBe('goal_needs_human');
    expect(notifInsert.row.metadata.classification).toBe('terminal_llm_error');
  });

  it('orchestration: credit-balance goal escalates immediately (no h01 retry)', async () => {
    // Regression for "underwear in Russia and Latvia" — without h00 this goal
    // would retry 6× through h01 before h99 escalated after 5 hours.
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: 'LLM anthropic 400: Your credit balance is too low.',
        failure_stage: 'pm-planning',
      },
    });
    const admin = makeAdmin();
    const result = await healGoal(admin, goal);
    expect(result.strategy).toBe('h00-terminal-llm-error');
    expect(result.action).toBe('escalated');
  });

  it('is registered in STRATEGIES with priority 0 (runs first)', () => {
    const found = STRATEGIES.find((s) => s.name === 'h00-terminal-llm-error');
    expect(found).toBeDefined();
    expect(found.priority).toBe(0);
    expect(STRATEGIES[0].name).toBe('h00-terminal-llm-error');
  });
});

// ── h01: transient errors ───────────────────────────────────────

describe('h01-transient-error', () => {
  const transientReasons = [
    'LLM groq 429: rate limit reached',
    'fetch failed: ECONNRESET',
    'Request timed out after 30000ms',
    'HTTP 503 Service Unavailable',
    'network error',
    'overloaded_error: anthropic is overloaded',
  ];

  it.each(transientReasons)('matches transient reason: %s', (reason) => {
    const goal = makeGoal({
      status: 'failed',
      data: { failure_reason: reason, failure_stage: 'po-analysis' },
    });
    expect(h01.matches(goal)).toBe(true);
  });

  it('does not match validation errors', () => {
    const goal = makeGoal({
      data: { failure_reason: 'Code task did not produce a real GitHub repo' },
    });
    expect(h01.matches(goal)).toBe(false);
  });

  it('does not match JSON parse errors', () => {
    const goal = makeGoal({ data: { failure_reason: 'Unexpected token in JSON at position 42' } });
    expect(h01.matches(goal)).toBe(false);
  });

  it('does not match non-failed status', () => {
    const goal = makeGoal({ status: 'active', data: { failure_reason: 'rate limit' } });
    expect(h01.matches(goal)).toBe(false);
  });

  it('apply resets status, clears failure_reason, enqueues stage', async () => {
    const goal = makeGoal({
      data: { failure_reason: 'LLM groq 429', failure_stage: 'po-analysis' },
    });
    const admin = makeAdmin();
    const result = await h01.apply(admin, goal, { log: null });

    expect(result.action).toBe('resumed');
    expect(result.stage).toBe('po-analysis');
    expect(result.healAttempts).toBe(1);

    // Goal updated with reset status
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.status).toBe('analyzing');
    expect(goalUpdate.patch.data.failure_reason).toBeNull();
    expect(goalUpdate.patch.data.heal_attempts).toBe(1);
    expect(goalUpdate.patch.data.last_heal_strategy).toBe('h01-transient-error');
    expect(goalUpdate.patch.data.previous_failure.reason).toBe('LLM groq 429');

    // Job enqueued
    const jobInsert = admin._state.inserts.find((i) => i.table === 'agent_jobs');
    expect(jobInsert.row.payload.action).toBe('po-analysis');
    expect(jobInsert.row.payload._healedBy).toBe('h01-transient-error');

    // goal_log written
    const logInsert = admin._state.inserts.find((i) => i.table === 'goal_log');
    expect(logInsert.row.event_type).toBe('goal_healed');
  });

  it('increments heal_attempts on second call', async () => {
    const goal = makeGoal({
      data: { failure_reason: 'timeout', failure_stage: 'feasibility-analysis', heal_attempts: 2 },
    });
    const admin = makeAdmin();
    const result = await h01.apply(admin, goal, { log: null });
    expect(result.healAttempts).toBe(3);
  });

  it('normalizes diagnostic failure-stage suffixes before enqueueing', async () => {
    const goal = makeGoal({
      data: { failure_reason: 'LLM timed out', failure_stage: 'po-analysis:quick' },
    });
    const admin = makeAdmin();

    const result = await h01.apply(admin, goal, { log: null });

    expect(result.stage).toBe('po-analysis');
    const jobInsert = admin._state.inserts.find((i) => i.table === 'agent_jobs');
    expect(jobInsert.row.payload.action).toBe('po-analysis');
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.data.previous_failure.stage).toBe('po-analysis:quick');
  });
});

// ── h02: LLM JSON fallback ─────────────────────────────────────

describe('h02-llm-json-fallback', () => {
  it('matches JSON parse error', () => {
    const goal = makeGoal({
      data: {
        failure_reason: 'Failed to parse JSON from LLM response',
        failure_stage: 'pm-planning',
      },
    });
    expect(h02.matches(goal)).toBe(true);
  });

  it('matches "invalid response"', () => {
    const goal = makeGoal({
      data: { failure_reason: 'LLM returned invalid response shape', failure_stage: 'po-analysis' },
    });
    expect(h02.matches(goal)).toBe(true);
  });

  it('does not match transient errors', () => {
    const goal = makeGoal({ data: { failure_reason: 'ECONNRESET' } });
    expect(h02.matches(goal)).toBe(false);
  });

  it('apply enqueues with useFallback=true', async () => {
    const goal = makeGoal({
      data: { failure_reason: 'parse error', failure_stage: 'pm-planning' },
    });
    const admin = makeAdmin();
    const result = await h02.apply(admin, goal, { log: null });

    expect(result.useFallback).toBe(true);
    const jobInsert = admin._state.inserts.find((i) => i.table === 'agent_jobs');
    expect(jobInsert.row.payload.useFallback).toBe(true);

    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.data.use_fallback).toBe(true);
  });

  it('normalizes diagnostic failure-stage suffixes before enqueueing', async () => {
    const goal = makeGoal({
      data: { failure_reason: 'parse error', failure_stage: 'po-analysis:quick' },
    });
    const admin = makeAdmin();

    const result = await h02.apply(admin, goal, { log: null });

    expect(result.stage).toBe('po-analysis');
    const jobInsert = admin._state.inserts.find((i) => i.table === 'agent_jobs');
    expect(jobInsert.row.payload.action).toBe('po-analysis');
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.data.previous_failure.stage).toBe('po-analysis:quick');
  });
});

// ── h03: no-jobs reform team ────────────────────────────────────

describe('h03-no-jobs-reform', () => {
  it('matches no-jobs throw from Phase 2.2', () => {
    const goal = makeGoal({
      data: {
        failure_reason:
          'evaluate-phase: no jobs found for goal (team-formation likely silently failed)',
        failure_stage: 'evaluate-phase',
      },
    });
    expect(h03.matches(goal)).toBe(true);
  });

  it('does not match other errors', () => {
    const goal = makeGoal({ data: { failure_reason: 'rate limit' } });
    expect(h03.matches(goal)).toBe(false);
  });

  it('apply deletes orphan tasks and enqueues team-formation', async () => {
    const goal = makeGoal({
      plan: { phases: [{ name: 'P1', status: 'executing' }] },
      data: { failure_reason: 'no jobs found', failure_stage: 'evaluate-phase' },
    });
    const admin = makeAdmin();
    const result = await h03.apply(admin, goal, { log: null });

    expect(result.action).toBe('resumed');
    expect(admin._state.deletes.some((d) => d.table === 'team_tasks')).toBe(true);

    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.status).toBe('forming_team');
    expect(goalUpdate.patch.plan.phases[0].status).toBe('pending');

    const jobInsert = admin._state.inserts.find((i) => i.table === 'agent_jobs');
    expect(jobInsert.row.payload.action).toBe('team-formation');
  });
});

// ── h04: stuck no queue ────────────────────────────────────────

describe('h04-stuck-no-queue', () => {
  it('matches non-terminal status with no queued job and old age', () => {
    const goal = makeGoal({ status: 'active' });
    expect(h04.matches(goal, { hasQueuedJob: false, ageMinutes: 20 })).toBe(true);
  });

  it('does not match if queued job exists', () => {
    const goal = makeGoal({ status: 'planning' });
    expect(h04.matches(goal, { hasQueuedJob: true, ageMinutes: 20 })).toBe(false);
  });

  it('does not match if fresh', () => {
    const goal = makeGoal({ status: 'planning' });
    expect(h04.matches(goal, { hasQueuedJob: false, ageMinutes: 5 })).toBe(false);
  });

  it('does not match terminal statuses', () => {
    const goal = makeGoal({ status: 'completed' });
    expect(h04.matches(goal, { hasQueuedJob: false, ageMinutes: 100 })).toBe(false);
  });

  it.each([
    ['feasibility', 'feasibility-analysis'],
    ['analyzing', 'po-analysis'],
    ['planning', 'pm-planning'],
    ['forming_team', 'team-formation'],
    ['provisioning_tools', 'tool-provisioning'],
    ['estimating', 'discovery-estimation'],
  ])('apply enqueues correct action for status=%s', async (status, expectedAction) => {
    const goal = makeGoal({ status });
    const admin = makeAdmin();
    const result = await h04.apply(admin, goal, { log: null });
    expect(result.enqueued).toBe(expectedAction);
    const jobInsert = admin._state.inserts.find((i) => i.table === 'agent_jobs');
    expect(jobInsert.row.payload.action).toBe(expectedAction);
  });

  it('apply on active picks evaluate-phase when phase is executing', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: { phases: [{ name: 'P1', status: 'executing' }] },
    });
    const admin = makeAdmin();
    const result = await h04.apply(admin, goal, { log: null });
    expect(result.enqueued).toBe('evaluate-phase');
  });

  it('apply on active picks execute-phase when phase is pending', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: { phases: [{ name: 'P1', status: 'pending' }] },
    });
    const admin = makeAdmin();
    const result = await h04.apply(admin, goal, { log: null });
    expect(result.enqueued).toBe('execute-phase');
  });

  it('apply on active picks complete when all phases done', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: { phases: [{ name: 'P1', status: 'completed' }] },
    });
    const admin = makeAdmin();
    const result = await h04.apply(admin, goal, { log: null });
    expect(result.enqueued).toBe('complete');
  });
});

// ── h99: escalate ──────────────────────────────────────────────

describe('h99-escalate', () => {
  it('matches when heal_attempts >= 6', () => {
    const goal = makeGoal({ status: 'failed', data: { heal_attempts: 6 } });
    expect(h99.matches(goal)).toBe(true);
  });

  it('matches any failed goal as last resort', () => {
    const goal = makeGoal({ status: 'failed', data: { failure_reason: 'weird error' } });
    expect(h99.matches(goal)).toBe(true);
  });

  it('does not match active goals', () => {
    const goal = makeGoal({ status: 'active' });
    expect(h99.matches(goal)).toBe(false);
  });

  it('atomically writes healing_log and flips status to needs_human', async () => {
    const goal = makeGoal({
      status: 'failed',
      data: { failure_reason: 'weird', heal_attempts: 6 },
    });
    const admin = makeAdmin();
    const result = await h99.apply(admin, goal, {
      log: null,
      otherStrategiesTried: ['h01-transient-error', 'h02-llm-json-fallback'],
    });

    expect(result.action).toBe('escalated');

    const goalsUpdates = admin._state.updates.filter((u) => u.table === 'goals');
    expect(goalsUpdates).toHaveLength(1);
    const transition = goalsUpdates[0];
    expect(transition.patch.status).toBe('needs_human');
    expect(transition.patch.data.healing_log).toHaveLength(1);
    expect(transition.patch.data.healing_log[0].strategies_tried).toContain('h01-transient-error');
    expect(transition.patch.data.last_heal_strategy).toBe('h99-escalate');
    expect(transition.patch.data.heal_attempts).toBeGreaterThanOrEqual(6);
    expect(transition.filters).toMatchObject({
      id: 'goal-1',
      user_id: 'user-1',
      status: 'failed',
      updated_at: goal.updated_at,
    });

    const logInsert = admin._state.inserts.find((i) => i.table === 'goal_log');
    expect(logInsert.row.event_type).toBe('goal_needs_human');
  });
});

// ── Healer orchestration ──────────────────────────────────────

describe('self-healer orchestration', () => {
  it('fails closed before reads, writes, or queue work for an ownerless goal', async () => {
    const goal = makeGoal({ user_id: null, status: 'failed' });
    const admin = makeAdmin();

    const result = await healGoal(admin, goal);

    expect(result).toEqual({
      strategy: null,
      action: 'skipped',
      details: { reason: 'ownerless goal' },
    });
    expect(admin._state.updates).toHaveLength(0);
    expect(admin._state.inserts).toHaveLength(0);
  });

  it('priority ordering: h01 wins over h04 when both match', async () => {
    const goal = makeGoal({
      status: 'failed',
      updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      data: { failure_reason: 'ECONNRESET', failure_stage: 'po-analysis' },
    });
    const admin = makeAdmin();
    const result = await healGoal(admin, goal);
    expect(result.strategy).toBe('h01-transient-error');
  });

  it('escalates to h99 when heal_attempts >= 6 regardless of match', async () => {
    const goal = makeGoal({
      status: 'failed',
      data: { failure_reason: 'ECONNRESET', heal_attempts: 6 },
    });
    const admin = makeAdmin();
    const result = await healGoal(admin, goal);
    expect(result.strategy).toBe('h99-escalate');
    expect(result.action).toBe('escalated');
  });

  it('skips completed goals (sacred)', async () => {
    const goal = makeGoal({ status: 'completed' });
    const admin = makeAdmin();
    const result = await healGoal(admin, goal);
    expect(result.action).toBe('skipped');
    expect(admin._state.updates).toHaveLength(0);
    expect(admin._state.inserts).toHaveLength(0);
  });

  it('skips cancelled goals (sacred)', async () => {
    const goal = makeGoal({ status: 'cancelled' });
    const admin = makeAdmin();
    const result = await healGoal(admin, goal);
    expect(result.action).toBe('skipped');
    expect(admin._state.updates).toHaveLength(0);
  });

  it('skips needs_human goals (sacred)', async () => {
    const goal = makeGoal({ status: 'needs_human' });
    const admin = makeAdmin();
    const result = await healGoal(admin, goal);
    expect(result.action).toBe('skipped');
    expect(admin._state.updates).toHaveLength(0);
  });

  it('does not let h04 enqueue replacement work when the queue probe fails', async () => {
    const goal = makeGoal({
      status: 'planning',
      updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });
    const admin = makeAdmin({ queuedJobsError: new Error('queue read unavailable') });

    const result = await healGoal(admin, goal);

    expect(result).toMatchObject({ strategy: null, action: 'skipped' });
    expect(admin._state.inserts.find((entry) => entry.table === 'agent_jobs')).toBeUndefined();
    expect(admin._state.updates).toHaveLength(0);
  });

  it('STRATEGIES is sorted by priority ascending', () => {
    const priorities = STRATEGIES.map((s) => s.priority);
    const sorted = [...priorities].sort((a, b) => a - b);
    expect(priorities).toEqual(sorted);
  });

  it('healAllStuckGoals scans healable goals; cap-only goals get one final h99 pass', async () => {
    const goals = [
      makeGoal({
        id: 'g1',
        status: 'failed',
        data: { failure_reason: 'timeout', failure_stage: 'po-analysis' },
      }),
      makeGoal({
        id: 'g2',
        status: 'failed',
        data: { failure_reason: 'no jobs found', failure_stage: 'evaluate-phase' },
      }),
      // g3 has heal_attempts >= 6 but has never been escalated. The old filter
      // dropped this goal entirely, leaving it stranded in 'failed' forever.
      // Now the orchestration in healGoal picks h99 for it, escalating cleanly.
      makeGoal({ id: 'g3', status: 'failed', data: { heal_attempts: 6, failure_reason: 'weird' } }),
      // g4 already escalated — strategy marker filters it out.
      makeGoal({
        id: 'g4',
        status: 'failed',
        data: { last_heal_strategy: 'h99-escalate', failure_reason: 'weird' },
      }),
      // g5 escalated by h00 — also filtered out.
      makeGoal({
        id: 'g5',
        status: 'failed',
        data: {
          last_heal_strategy: 'h00-terminal-llm-error',
          failure_reason: 'credit balance is too low',
        },
      }),
    ];
    const admin = makeAdmin({ goals });
    const summary = await healAllStuckGoals(admin);
    expect(summary.scanned).toBe(3); // g1 + g2 + g3 (g4 + g5 already escalated)
    expect(summary.applied).toBe(3);
    expect(summary.results.map((r) => r.strategy)).toEqual([
      'h01-transient-error',
      'h03-no-jobs-reform',
      'h99-escalate', // g3 — the cap-only path that used to silently strand goals
    ]);
  });
});

// ── h45: human fallback for credential provisioning ─────────────

describe('h45-human-credential', () => {
  const h45 = STRATEGIES.find((s) => s.name === 'h45-human-credential');

  it('is registered in STRATEGIES with priority 45', () => {
    expect(h45).toBeDefined();
    expect(h45.priority).toBe(45);
  });

  it('matches a missing-key failure directly', () => {
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: 'missing API key for tool-resend',
        required_tool_id: 'tool-resend',
      },
    });
    expect(h45.matches(goal)).toBe(true);
  });

  it('matches the structured unconfigured_tools checkpoint without a failure_reason', () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend', 'tool-openai'] },
    });
    expect(h45.matches(goal)).toBe(true);
  });

  it('does not recreate an existing manual credential checkpoint', () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: {
        unconfigured_tools: ['tool-resend'],
        manual_credential_checkpoint: { status: 'awaiting_user' },
        blocked_by_human_task_id: 'human-task-existing',
      },
    });
    expect(h45.matches(goal)).toBe(false);
  });

  it('matches when failure_reason names an unrecoverable gate (phone verification)', () => {
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: 'signup blocked: phone verification required',
        required_tool_id: 'tool-twilio',
      },
    });
    expect(h45.matches(goal)).toBe(true);
  });

  it('matches when browser-task flagged sandris_needs_human', () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { sandris_needs_human: { tool_id: 'tool-resend', reason: 'kyc' } },
    });
    expect(h45.matches(goal)).toBe(true);
  });

  it('does not match a plain transient failure', () => {
    const goal = makeGoal({
      status: 'failed',
      data: { failure_reason: 'LLM groq 429: rate limit reached' },
    });
    expect(h45.matches(goal)).toBe(false);
  });

  it('creates a non-escalating manual checkpoint for structured missing tools', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend', 'tool-openai'] },
    });
    const admin = makeAdmin({
      tools: [
        { id: 'tool-resend', name: 'Resend', data: { signup_url: 'https://resend.com/signup' } },
      ],
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toMatchObject({
      action: 'manual-credential-checkpoint',
      humanTaskId: 'human-task-new',
      manualOnly: true,
      reasonCode: 'manual',
    });
    expect(admin._state.inserts.find((i) => i.table === 'agent_jobs')).toBeUndefined();

    const humanTask = admin._state.inserts.find((i) => i.table === 'human_tasks');
    expect(humanTask.row).toMatchObject({
      tool_id: 'tool-resend',
      escalation_allowed: false,
      escalate_after_seconds: null,
      status: 'pending',
    });
    expect(humanTask.row.instructions).not.toContain('paid human');

    const goalUpdate = admin._state.updates.find(
      (update) => update.table === 'goals' && update.patch.status === 'awaiting_tools'
    );
    expect(goalUpdate.patch.data).toMatchObject({
      blocked_by_human_task_id: 'human-task-new',
      required_tool_id: 'tool-resend',
      unconfigured_tools: ['tool-resend', 'tool-openai'],
      manual_credential_checkpoint: {
        status: 'awaiting_user',
        reason: 'manual-credential-checkpoint',
        tool_ids: ['tool-resend', 'tool-openai'],
        human_task_id: 'human-task-new',
      },
      last_heal_strategy: 'h45-human-credential',
    });

    const notification = admin._state.inserts.find((i) => i.table === 'notification_log');
    expect(notification.row).toMatchObject({
      subject: 'API key required',
      event_type: 'human_action_required',
    });
    expect(notification.row.body).not.toContain('paid human');
  });

  it('does not revive a concurrently changed goal and cancels only its untouched new task', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend'] },
    });
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      goalUpdateCasLoss: true,
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toEqual({ action: 'skipped', reason: 'goal-transition-cas-lost' });
    const goalUpdate = admin._state.updates.find((entry) => entry.table === 'goals');
    expect(goalUpdate.filters).toMatchObject({
      id: 'goal-1',
      user_id: 'user-1',
      status: 'awaiting_tools',
      updated_at: goal.updated_at,
    });
    expect(admin._state.humanTasks[0].status).toBe('cancelled');
    expect(admin._state.humanTaskInsertSelect).toContain('claimed_at');
    expect(admin._state.humanTaskInsertSelect).toContain('escalated_at');
    expect(admin._state.humanTaskInsertSelect).toContain('updated_at');
    expect(
      admin._state.inserts.find((entry) => entry.table === 'notification_log')
    ).toBeUndefined();
  });

  it('keeps a structured missing-tool checkpoint manual despite a stale unrecoverable reason', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: {
        unconfigured_tools: ['tool-resend'],
        failure_reason: 'phone verification required',
        required_tool_id: 'tool-resend',
      },
    });
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toMatchObject({ action: 'manual-credential-checkpoint', manualOnly: true });
    const task = admin._state.inserts.find((entry) => entry.table === 'human_tasks').row;
    expect(task).toMatchObject({
      escalation_allowed: false,
      escalate_after_seconds: null,
      partial_context: {
        credential_checkpoint: {
          manual_only: true,
          trusted_legacy_browser_failure: false,
        },
      },
    });
  });

  it('retains corroborated browser provenance as audit-only owner context', async () => {
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: 'phone verification required',
        required_tool_id: 'tool-resend',
        blocked_by_job_id: 'bt-job-1',
        sandris_needs_human: {
          job_id: 'bt-job-1',
          tool_id: 'tool-resend',
          reason: 'phone verification required',
        },
      },
    });
    const admin = makeAdmin({
      tools: [
        { id: 'tool-resend', name: 'Resend', data: { signup_url: 'https://resend.com/signup' } },
      ],
      agentJobs: [
        {
          id: 'bt-job-1',
          user_id: 'user-1',
          status: 'failed',
          error: 'phone verification required',
          result: {
            type: 'browser-task',
            needs_human: true,
            error: 'phone verification required',
          },
          payload: {
            handler: 'browser-task',
            blocking_goal_id: 'goal-1',
            targetToolId: 'tool-resend',
            _userId: 'user-1',
            userId: 'user-1',
            user_id: 'user-1',
          },
        },
      ],
      browserTaskRuns: [
        {
          job_id: 'bt-job-1',
          user_id: 'user-1',
          target_tool_id: 'tool-resend',
          status: 'failed',
          temp_email: 'x@mail.tm',
          steps: [{ step: 'create-email', status: 'done' }],
          error: 'phone verification required',
        },
      ],
    });
    const result = await h45.apply(admin, goal, {});
    expect(result.action).toBe('manual-credential-checkpoint');
    expect(result.manualOnly).toBe(true);
    expect(result.humanTaskId).toBe('human-task-new');
    expect(result.kyc).toBe(false);
    expect(result.reasonCode).toBe('phone_required');

    const htInsert = admin._state.inserts.find((i) => i.table === 'human_tasks');
    expect(htInsert).toBeDefined();
    expect(htInsert.row.tool_id).toBe('tool-resend');
    expect(htInsert.row.provider_url).toBe('https://resend.com/signup');
    expect(htInsert.row.recommended_provider).toBe('Resend');
    expect(htInsert.row.escalation_allowed).toBe(false);
    expect(htInsert.row.escalate_after_seconds).toBeNull();
    expect(htInsert.row.reason_code).toBe('phone_required');
    expect(htInsert.row.partial_context.temp_email).toBe('x@mail.tm');
    expect(htInsert.row.partial_context.credential_checkpoint).toEqual({
      manual_only: true,
      trusted_legacy_browser_failure: true,
    });

    const goalUpdate = admin._state.updates.find(
      (u) => u.table === 'goals' && u.patch.status === 'awaiting_tools'
    );
    expect(goalUpdate).toBeDefined();
    expect(goalUpdate.patch.data.blocked_by_human_task_id).toBe('human-task-new');

    const notif = admin._state.inserts.find((i) => i.table === 'notification_log');
    expect(notif).toBeDefined();
    expect(notif.row.event_type).toBe('human_action_required');
    expect(notif.row.metadata.kyc).toBe(false);
  });

  it('keeps a browser failure manual without the server-owned needs-human result proof', async () => {
    const reason = 'phone verification required';
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: reason,
        required_tool_id: 'tool-resend',
        blocked_by_job_id: 'bt-job-1',
        sandris_needs_human: {
          job_id: 'bt-job-1',
          tool_id: 'tool-resend',
          reason,
        },
      },
    });
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      agentJobs: [
        {
          id: 'bt-job-1',
          status: 'failed',
          error: reason,
          result: { type: 'browser-task', needs_human: false, error: reason },
          payload: {
            handler: 'browser-task',
            blocking_goal_id: 'goal-1',
            targetToolId: 'tool-resend',
            _userId: 'user-1',
          },
        },
      ],
      browserTaskRuns: [
        {
          job_id: 'bt-job-1',
          user_id: 'user-1',
          target_tool_id: 'tool-resend',
          status: 'failed',
          error: reason,
        },
      ],
    });

    const result = await h45.apply(admin, goal, {});

    expect(result.manualOnly).toBe(true);
    const task = admin._state.inserts.find((entry) => entry.table === 'human_tasks').row;
    expect(task.escalation_allowed).toBe(false);
    expect(task.partial_context.credential_checkpoint.trusted_legacy_browser_failure).toBe(false);
  });

  it('does not trust a forged browser marker without an exact server run match', async () => {
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: 'phone verification required',
        required_tool_id: 'tool-resend',
        blocked_by_job_id: 'bt-job-1',
        sandris_needs_human: {
          job_id: 'bt-job-1',
          tool_id: 'tool-resend',
          reason: 'phone verification required',
        },
      },
    });
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      agentJobs: [
        {
          id: 'bt-job-1',
          status: 'failed',
          error: 'phone verification required',
          result: {
            type: 'browser-task',
            needs_human: true,
            error: 'phone verification required',
          },
          payload: {
            handler: 'browser-task',
            blocking_goal_id: 'goal-1',
            targetToolId: 'tool-resend',
            _userId: 'user-1',
          },
        },
      ],
      browserTaskRuns: [
        {
          job_id: 'bt-job-1',
          user_id: 'user-1',
          target_tool_id: 'tool-resend',
          status: 'failed',
          error: 'different error',
        },
      ],
    });

    const result = await h45.apply(admin, goal, {});

    expect(result.manualOnly).toBe(true);
    const task = admin._state.inserts.find((entry) => entry.table === 'human_tasks').row;
    expect(task.escalation_allowed).toBe(false);
    expect(task.escalate_after_seconds).toBeNull();
  });

  it('reuses an active checkpoint and downgrades its legacy timer', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend'] },
    });
    const existing = {
      id: 'human-task-existing',
      goal_id: 'goal-1',
      user_id: 'user-1',
      tool_id: 'tool-resend',
      type: 'provide_credential',
      status: 'pending',
      claimed_at: null,
      escalated_at: null,
      escalation_allowed: true,
      escalate_after_seconds: 120,
      updated_at: '2026-08-22T10:00:00.000Z',
    };
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      humanTasks: [existing],
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toMatchObject({
      action: 'manual-credential-checkpoint',
      humanTaskId: 'human-task-existing',
      reused: true,
    });
    expect(admin._state.inserts.find((entry) => entry.table === 'human_tasks')).toBeUndefined();
    expect(existing.escalation_allowed).toBe(false);
    expect(existing.escalate_after_seconds).toBeNull();
    expect(
      admin._state.inserts.find((entry) => entry.table === 'notification_log')
    ).toBeUndefined();
  });

  it('does not reuse a legacy escalated checkpoint that completion will reject', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend'] },
    });
    const legacyEscalated = {
      id: 'human-task-escalated',
      goal_id: 'goal-1',
      user_id: 'user-1',
      tool_id: 'tool-resend',
      type: 'provide_credential',
      status: 'pending',
      claimed_at: null,
      escalated_at: '2026-08-22T09:59:00.000Z',
      escalation_allowed: false,
      escalate_after_seconds: null,
      updated_at: '2026-08-22T10:00:00.000Z',
    };
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      humanTasks: [legacyEscalated],
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toMatchObject({
      action: 'manual-credential-checkpoint',
      humanTaskId: 'human-task-new',
      reused: false,
    });
    expect(admin._state.inserts.find((entry) => entry.table === 'human_tasks')).toBeDefined();
  });

  it('does not reuse an active non-credential human task for the same goal and tool', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend'] },
    });
    const integrationBrief = {
      id: 'human-task-brief',
      goal_id: 'goal-1',
      user_id: 'user-1',
      tool_id: 'tool-resend',
      type: 'integration_brief',
      status: 'pending',
      claimed_at: null,
      escalated_at: null,
      escalation_allowed: false,
      escalate_after_seconds: null,
      updated_at: '2026-08-22T10:00:00.000Z',
    };
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      humanTasks: [integrationBrief],
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toMatchObject({
      action: 'manual-credential-checkpoint',
      humanTaskId: 'human-task-new',
      reused: false,
    });
    expect(admin._state.inserts.find((entry) => entry.table === 'human_tasks')).toBeDefined();
  });

  it('does not overwrite a completion reservation when the legacy-timer CAS loses', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend'] },
    });
    const existing = {
      id: 'human-task-existing',
      goal_id: 'goal-1',
      user_id: 'user-1',
      tool_id: 'tool-resend',
      type: 'provide_credential',
      status: 'pending',
      claimed_at: null,
      escalated_at: null,
      escalation_allowed: true,
      escalate_after_seconds: 120,
      updated_at: '2026-08-22T10:00:00.000Z',
      partial_context: {},
    };
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      humanTasks: [existing],
      humanTaskDowngradeCasLoss: true,
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toMatchObject({
      action: 'manual-credential-checkpoint',
      humanTaskId: 'human-task-existing',
      reused: true,
    });
    expect(existing.partial_context).toEqual({
      credential_completion: { attempt_id: 'completion-race', status: 'storing' },
    });
    expect(existing.escalation_allowed).toBe(false);
    expect(existing.escalate_after_seconds).toBeNull();
  });

  it('converges on the race winner after the active-task unique index rejects an insert', async () => {
    const goal = makeGoal({
      status: 'awaiting_tools',
      data: { unconfigured_tools: ['tool-resend'] },
    });
    const admin = makeAdmin({
      tools: [{ id: 'tool-resend', name: 'Resend', data: {} }],
      humanTaskInsertConflict: true,
    });

    const result = await h45.apply(admin, goal, {});

    expect(result).toMatchObject({
      action: 'manual-credential-checkpoint',
      humanTaskId: 'human-task-race-winner',
      reused: true,
    });
    const goalUpdate = admin._state.updates.find((entry) => entry.table === 'goals');
    expect(goalUpdate.patch.data.blocked_by_human_task_id).toBe('human-task-race-winner');
    expect(
      admin._state.inserts.find((entry) => entry.table === 'notification_log')
    ).toBeUndefined();
  });

  it('apply sets escalation_allowed=false for KYC tasks (never goes to paid worker)', async () => {
    const goal = makeGoal({
      status: 'failed',
      data: {
        failure_reason: 'KYC identity verification required — upload government ID',
        required_tool_id: 'tool-exchange',
      },
    });
    const admin = makeAdmin({
      tools: [
        {
          id: 'tool-exchange',
          name: 'Exchange',
          data: { signup_url: 'https://exchange.com/signup' },
        },
      ],
    });
    const result = await h45.apply(admin, goal, {});
    expect(result.action).toBe('manual-credential-checkpoint');
    expect(result.kyc).toBe(true);
    expect(result.reasonCode).toBe('kyc_required');

    const htInsert = admin._state.inserts.find((i) => i.table === 'human_tasks');
    expect(htInsert.row.escalation_allowed).toBe(false);
    expect(htInsert.row.escalate_after_seconds).toBeNull();
  });
});
