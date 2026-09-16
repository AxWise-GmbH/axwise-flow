/**
 * Tests for the shared job processing core.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock all external dependencies
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => null),
}));

vi.mock('./llm-executor.js', () => ({
  executeLlm: vi.fn(async () => ({
    content: 'Hello from LLM',
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    model: 'test-model',
    provider: 'groq',
    durationMs: 500,
    estimatedCostUsd: 0.001,
  })),
  parseLlmJson: vi.fn((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }),
}));

vi.mock('./execute-task.js', () => ({
  handleExecuteTask: vi.fn(async () => ({ type: 'execute-task', content: 'done' })),
}));

vi.mock('./tool-runner.js', () => ({
  runAgentWithTools: vi.fn(async () => ({
    content: 'Tool result',
    toolLog: [],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    model: 'test-model',
    provider: 'groq',
    durationMs: 500,
    estimatedCostUsd: 0.001,
  })),
}));

vi.mock('../workflow-engine/runner.js', () => ({
  executeWorkflow: vi.fn(async () => ({ type: 'execute-workflow', content: 'done' })),
}));

vi.mock('../concilium-handlers/rate-limit-check.js', () => ({
  checkConciliumRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('../concilium-handlers/security-scanner.js', () => ({
  scanInput: vi.fn(async () => ({ safe: true, threats: [] })),
}));

vi.mock('../concilium-handlers/fraud-detector.js', () => ({
  analyzeRequest: vi.fn(async () => ({})),
}));

vi.mock('../concilium-handlers/cost-tracker.js', () => ({
  recordUsage: vi.fn(async () => ({})),
}));

vi.mock('../concilium-handlers/evaluate-v2.js', () => ({
  hasV2Members: vi.fn(async () => false),
  handleConciliumEvaluateV2: vi.fn(async () => ({})),
}));

vi.mock('../workflow-engine/memory-manager.js', () => ({
  searchAgentMemory: vi.fn(async () => [{ content: 'past work' }]),
  formatMemoryForPrompt: vi.fn(() => '\n\n[MEMORY]'),
  UNTRUSTED_REFERENCE_SYSTEM_RULE: 'TRUSTED MEMORY BOUNDARY RULE',
}));

vi.mock('./load-active-skills.js', () => ({
  loadActiveSkills: vi.fn(async () => ''),
}));

vi.mock('../_shared/graphify-agent.js', () => ({
  queryAgentGraph: vi.fn(async () => ''),
}));

vi.mock('../_shared/embeddings.js', () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2]),
  estimateTokens: vi.fn(() => 8),
}));

vi.mock('../utils/commLog.js', () => ({
  commLog: vi.fn(),
}));

vi.mock('../integrations/axwise/outcome-delivery.js', () => ({
  handleAxwiseOutcomeJob: vi.fn(async () => ({ status: 'reported' })),
  markAxwiseOutcomeFinalFailure: vi.fn(async () => ({})),
}));

vi.mock('../integrations/axwise/grounding-job.js', () => ({
  handleAxwiseGroundJob: vi.fn(async () => ({ status: 'grounded' })),
}));

import {
  processNextJob,
  claimNextJob,
  claimSpecificJob,
  canonicalizeJobOwner,
  executeJob as executeJobImpl,
  finalizeJob as finalizeJobImpl,
  getJobTimeoutMs,
  JOB_ABORT_SETTLEMENT_GRACE_MS,
  handleRetry as handleRetryImpl,
  classifyActionableJobError,
  sweepStaleJobs,
  buildAgentSystemPrompt,
} from './job-processor.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { handleExecuteTask } from './execute-task.js';
import { executeLlm } from './llm-executor.js';
import { runAgentWithTools } from './tool-runner.js';
import { searchAgentMemory } from '../workflow-engine/memory-manager.js';
import { queryAgentGraph } from '../_shared/graphify-agent.js';
import { commLog } from '../utils/commLog.js';
import { triggerProcessNext } from '../goal-handlers/_helpers.js';
import {
  handleAxwiseOutcomeJob,
  markAxwiseOutcomeFinalFailure,
} from '../integrations/axwise/outcome-delivery.js';
import { handleAxwiseGroundJob } from '../integrations/axwise/grounding-job.js';

// ── Helpers ───────────────────────────────────────────────────────

const TEST_AUTHORIZATION_HASH = 'test-gate-2-snapshot';
let testLeaseSequence = 0;

function attachTestLease(job, { expired = false } = {}) {
  if (!job || typeof job !== 'object') return job;
  if (!Object.hasOwn(job, 'status')) job.status = 'running';
  if (job.status !== 'running') return job;
  const sequence = String(++testLeaseSequence).padStart(12, '0').slice(-12);
  const nowMs = Date.now();
  if (!Object.hasOwn(job, 'worker_scope')) job.worker_scope = 'production';
  if (!Object.hasOwn(job, 'retry_count')) job.retry_count = 0;
  if (!Object.hasOwn(job, 'updated_at')) job.updated_at = new Date(nowMs).toISOString();
  if (!Object.hasOwn(job, 'lease_token')) {
    job.lease_token = `00000000-0000-4000-8000-${sequence}`;
  }
  if (!Object.hasOwn(job, 'heartbeat_at')) {
    job.heartbeat_at = new Date(nowMs - (expired ? 90_000 : 0)).toISOString();
  }
  if (!Object.hasOwn(job, 'lease_expires_at')) {
    job.lease_expires_at = new Date(nowMs + (expired ? -15_000 : 75_000)).toISOString();
  }
  return job;
}

function executeJob(admin, job, req) {
  attachTestLease(job);
  return executeJobImpl(admin, job, req);
}

function finalizeJob(admin, job, result, error, authorityOverride = null) {
  attachTestLease(job);
  return finalizeJobImpl(admin, job, result, error, authorityOverride);
}

function handleRetry(admin, job, errorMsg) {
  attachTestLease(job);
  return handleRetryImpl(admin, job, errorMsg);
}

function mockAdmin({
  jobs = [],
  claimOk = true,
  finalizeOk = claimOk,
  updateError = null,
  tables = {},
} = {}) {
  jobs = jobs.map((job) => ({ user_id: 'test-user', ...job }));
  const insertCalls = [];
  const updateCalls = [];
  const tableRows = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [
      table,
      new Map((rows || []).map((row) => [row.id, { ...row }])),
    ])
  );

  const selectRows = (table) => {
    const rows = tableRows[table] || new Map();
    const conditions = [];
    const matches = (row) =>
      conditions.every(([column, value, values]) =>
        values
          ? values.map(String).includes(String(row[column]))
          : String(row[column]) === String(value)
      );
    const query = {
      eq: vi.fn((column, value) => {
        conditions.push([column, value, null]);
        return query;
      }),
      is: vi.fn((column, value) => {
        conditions.push([column, value, null]);
        return query;
      }),
      in: vi.fn((column, values) => {
        conditions.push([column, null, values]);
        return query;
      }),
      limit: vi.fn(() => query),
      order: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: [...rows.values()].find(matches) || null,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: [...rows.values()].find(matches) || null,
        error: null,
      })),
      then: (resolve) => resolve({ data: [...rows.values()].filter(matches), error: null }),
    };
    return query;
  };

  return {
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
    from: vi.fn((table) => {
      if (table === 'agent_jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            lt: vi.fn(function () {
              return this;
            }),
            gt: vi.fn(function () {
              return this;
            }),
            order: vi.fn(function () {
              return this;
            }),
            limit: vi.fn(function () {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({
              data: jobs.length > 0 ? jobs[0] : null,
              error: null,
            })),
            then: vi.fn(function (resolve) {
              resolve({ data: jobs, error: null });
            }),
          })),
          update: vi.fn((patch) => {
            const conditions = [];
            const query = {
              eq: vi.fn((column, value) => {
                conditions.push([column, value]);
                return query;
              }),
              is: vi.fn((column, value) => {
                conditions.push([column, value]);
                return query;
              }),
              in: vi.fn(() => query),
              select: vi.fn(() => query),
              maybeSingle: vi.fn(async () => {
                updateCalls.push({ patch, conditions });
                const requestedId =
                  conditions.find(([column]) => column === 'id')?.[1] || jobs[0]?.id || 'j1';
                const payloadFilter = conditions.find(([column]) => column === 'payload')?.[1];
                const filteredPayload = payloadFilter ? JSON.parse(payloadFilter) : undefined;
                const userFilter = conditions.find(([column]) => column === 'user_id')?.[1];
                const conditionValue = (column) =>
                  conditions.find(([conditionColumn]) => conditionColumn === column)?.[1];
                const jsonConditionValue = (column) => {
                  const value = conditionValue(column);
                  if (value === null || value === undefined) return value;
                  try {
                    return JSON.parse(value);
                  } catch {
                    return value;
                  }
                };
                const transitionAllowed = patch.status === 'running' ? claimOk : finalizeOk;
                if (!transitionAllowed || updateError) return { data: null, error: updateError };
                const current = jobs.find((candidate) => candidate.id === requestedId) ||
                  jobs[0] || {
                    id: requestedId,
                    ...(userFilter === undefined ? {} : { user_id: userFilter }),
                    status: 'running',
                    worker_scope: conditionValue('worker_scope'),
                    ...(filteredPayload === undefined ? {} : { payload: filteredPayload }),
                    retry_count: Number(conditionValue('retry_count') || 0),
                    max_retries: conditionValue('max_retries'),
                    updated_at: conditionValue('updated_at'),
                    error: conditionValue('error'),
                    result: jsonConditionValue('result'),
                    lease_token: conditionValue('lease_token'),
                  };
                const committed = { ...current, ...patch };
                if (jobs.includes(current)) Object.assign(current, committed);
                return { data: committed, error: null };
              }),
            };
            return query;
          }),
          insert: vi.fn(async (data) => {
            insertCalls.push(data);
            return { error: null };
          }),
        };
      }
      // Default for llm_usage, concilium_evaluations, etc.
      return {
        select: vi.fn(() => selectRows(table)),
        insert: vi.fn(async (data) => {
          insertCalls.push({ table, data });
          return { error: null };
        }),
      };
    }),
  };
}

function staleJobAdmin(initialRow) {
  const row = attachTestLease({ error: null, result: null, ...initialRow }, { expired: true });
  const transitions = [];
  let staleReads = 0;

  const equivalent = (actual, expected) => {
    if (actual == null || expected == null) return actual == null && expected == null;
    if (typeof actual === 'object' && typeof expected === 'string') {
      try {
        return JSON.stringify(actual) === JSON.stringify(JSON.parse(expected));
      } catch {
        return false;
      }
    }
    return String(actual) === String(expected);
  };

  const matches = (conditions) =>
    conditions.every(([column, value]) => equivalent(row[column], value));

  return {
    row,
    transitions,
    get staleReads() {
      return staleReads;
    },
    from: vi.fn((table) => {
      if (table !== 'agent_jobs') throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => {
          const conditions = [];
          const query = {
            eq: vi.fn((column, value) => {
              conditions.push([column, value]);
              return query;
            }),
            lt: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({
              data: matches(conditions) ? { ...row } : null,
              error: null,
            })),
            limit: vi.fn(async () => {
              staleReads += 1;
              return {
                data:
                  row.status === 'running'
                    ? [
                        {
                          id: row.id,
                          user_id: row.user_id,
                          status: row.status,
                          retry_count: row.retry_count,
                          max_retries: row.max_retries,
                          worker_scope: row.worker_scope,
                          payload: row.payload,
                          updated_at: row.updated_at,
                          error: row.error ?? null,
                          result: row.result ?? null,
                          lease_token: row.lease_token,
                          heartbeat_at: row.heartbeat_at,
                          lease_expires_at: row.lease_expires_at,
                        },
                      ]
                    : [],
                error: null,
              };
            }),
          };
          return query;
        }),
        update: vi.fn((patch) => {
          const conditions = [];
          const query = {
            eq: vi.fn((column, value) => {
              conditions.push([column, value]);
              return query;
            }),
            is: vi.fn((column, value) => {
              conditions.push([column, value]);
              return query;
            }),
            select: vi.fn(() => query),
            maybeSingle: vi.fn(async () => {
              if (!matches(conditions)) return { data: null, error: null };
              Object.assign(row, patch);
              transitions.push({ ...patch });
              return { data: { ...row }, error: null };
            }),
          };
          return query;
        }),
      };
    }),
  };
}

function buildExactAuthorityFixtures(initialRows, initialGoals) {
  const normalizedRows = initialRows.map((row) => {
    const userId =
      row.user_id ||
      row.payload?._userId ||
      row.payload?.userId ||
      row.payload?.user_id ||
      'test-user';
    const normalized = {
      error: null,
      result: null,
      user_id: userId,
      updated_at: '2026-08-22T00:00:00.000Z',
      ...row,
      payload: { ...(row.payload || {}) },
    };
    return attachTestLease(normalized);
  });
  const tables = {
    goals: new Map(),
    team_tasks: new Map(),
    jobs: new Map(),
    agents: new Map(),
  };

  for (const goal of initialGoals) {
    tables.goals.set(goal.id, {
      data: {},
      updated_at: '2026-08-22T00:00:00.000Z',
      ...goal,
    });
  }

  const taskEntriesByGoal = new Map();
  for (const row of normalizedRows) {
    const payload = row.payload;
    const userId = row.user_id;
    const queuedGoalId = payload.goalId || payload.goal_id || null;

    if (queuedGoalId && !tables.goals.has(queuedGoalId)) {
      tables.goals.set(queuedGoalId, {
        id: queuedGoalId,
        user_id: userId,
        status: 'executing',
        data: {},
        updated_at: '2026-08-22T00:00:00.000Z',
      });
    }

    if (payload.type !== 'execute-task' || !payload.taskId) continue;
    const taskId = payload.taskId;
    const goalId = queuedGoalId || `goal:${taskId}`;
    const workJobId = payload.jobId || `work:${taskId}`;
    const agentId =
      payload.agentId ||
      payload.agentContext?._agentId ||
      payload.agentContext?.id ||
      `agent:${taskId}`;

    payload.jobId = workJobId;
    payload.authorizationSnapshotHash =
      payload.authorizationSnapshotHash || TEST_AUTHORIZATION_HASH;
    payload.toolIds = Array.isArray(payload.toolIds) ? [...payload.toolIds] : [];

    const existingGoal = tables.goals.get(goalId) || {};
    tables.goals.set(goalId, {
      id: goalId,
      status: 'executing',
      data: {},
      updated_at: '2026-08-22T00:00:00.000Z',
      ...existingGoal,
      user_id: existingGoal.user_id || userId,
    });
    tables.team_tasks.set(taskId, {
      id: taskId,
      user_id: userId,
      job_pool_id: workJobId,
      goal_id: goalId,
      agent_id: agentId,
      status: 'todo',
      data: {
        goal_id: goalId,
        axwise_execution_context: {
          authorization_snapshot_hash: payload.authorizationSnapshotHash,
        },
      },
      updated_at: '2026-08-22T00:00:00.000Z',
    });
    tables.jobs.set(workJobId, {
      id: workJobId,
      user_id: userId,
      goal_id: goalId,
      assigned_agent_id: agentId,
      status: 'active',
      updated_at: '2026-08-22T00:00:00.000Z',
    });
    tables.agents.set(agentId, {
      id: agentId,
      user_id: userId,
      name: `Agent ${agentId}`,
      category: 'executor',
      status: 'active',
      capabilities: [],
      metadata: { system_prompt: `Owned prompt for ${agentId}` },
      updated_at: '2026-08-22T00:00:00.000Z',
    });
    const taskEntries = taskEntriesByGoal.get(goalId) || [];
    taskEntries.push({
      task_id: taskId,
      agent_id: agentId,
      required_role: 'executor',
      granted_tool_ids: payload.toolIds,
      tool_grants: [],
    });
    taskEntriesByGoal.set(goalId, taskEntries);
  }

  for (const [goalId, tasks] of taskEntriesByGoal) {
    const goal = tables.goals.get(goalId);
    const manifest = { valid: true, tasks };
    goal.data = {
      ...(goal.data || {}),
      goal_approvals: {
        ...(goal.data?.goal_approvals || {}),
        execution: {
          status: 'approved',
          snapshot_hash: TEST_AUTHORIZATION_HASH,
          snapshot: { authorization_manifest: manifest },
        },
      },
      execution_authorization: {
        status: 'approved',
        snapshot_hash: TEST_AUTHORIZATION_HASH,
        manifest,
      },
    };
  }

  return { normalizedRows, tables };
}

function exactQueueAdmin(
  initialRows,
  { rejectUpdate = null, responseLoss = null, initialGoals = [] } = {}
) {
  const authorityFixtures = buildExactAuthorityFixtures(initialRows, initialGoals);
  const rows = new Map(authorityFixtures.normalizedRows.map((row) => [row.id, row]));
  const goals = authorityFixtures.tables.goals;
  const claimedIds = [];
  const updateCalls = [];

  const columnValue = (row, column) => {
    if (column.startsWith('payload->>')) return row.payload?.[column.slice('payload->>'.length)];
    if (column.startsWith('data->>')) return row.data?.[column.slice('data->>'.length)];
    return row[column];
  };

  const equivalent = (actual, expected) => {
    if (actual === null || actual === undefined) return expected === null || expected === undefined;
    if (typeof actual === 'object' && typeof expected === 'string') {
      try {
        return JSON.stringify(actual) === JSON.stringify(JSON.parse(expected));
      } catch {
        return false;
      }
    }
    return String(actual) === String(expected);
  };

  const filteredRows = (tableRows, conditions) =>
    [...tableRows.values()].filter((row) =>
      conditions.every(({ column, value, values, operator }) => {
        const actual = columnValue(row, column);
        if (operator === 'lt') return String(actual) < String(value);
        return values ? values.map(String).includes(String(actual)) : equivalent(actual, value);
      })
    );

  const selectBuilder = (tableRows) => {
    const conditions = [];
    const query = {
      eq: vi.fn((column, value) => {
        conditions.push({ column, value });
        return query;
      }),
      is: vi.fn((column, value) => {
        conditions.push({ column, value });
        return query;
      }),
      in: vi.fn((column, values) => {
        conditions.push({ column, values });
        return query;
      }),
      lt: vi.fn((column, value) => {
        conditions.push({ column, value, operator: 'lt' });
        return query;
      }),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: filteredRows(tableRows, conditions)[0] || null,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: filteredRows(tableRows, conditions)[0] || null,
        error: null,
      })),
      then: (resolve) => resolve({ data: filteredRows(tableRows, conditions), error: null }),
    };
    return query;
  };

  const updateBuilder = (table, tableRows, patch) => {
    const conditions = [];
    let applied = false;
    let selected = null;
    let lostResponse = null;
    const apply = () => {
      if (applied) return selected;
      applied = true;
      const row = filteredRows(tableRows, conditions)[0] || null;
      updateCalls.push({ table, patch, conditions: [...conditions], row: row ? { ...row } : null });
      if (!row) return null;
      if (rejectUpdate?.({ table, row: { ...row }, patch, conditions: [...conditions] })) {
        return null;
      }
      const previousStatus = row.status;
      Object.assign(row, patch);
      if (table === 'agent_jobs' && patch.status === 'running' && previousStatus === 'queued') {
        claimedIds.push(row.id);
      }
      selected = { ...row };
      const loss = responseLoss?.({
        table,
        row: { ...row },
        patch,
        conditions: [...conditions],
        callIndex: updateCalls.length - 1,
      });
      if (loss) {
        lostResponse = loss instanceof Error ? loss : new Error('response lost after commit');
      }
      return selected;
    };
    const query = {
      eq: vi.fn((column, value) => {
        conditions.push({ column, value });
        return query;
      }),
      is: vi.fn((column, value) => {
        conditions.push({ column, value });
        return query;
      }),
      in: vi.fn((column, values) => {
        conditions.push({ column, values });
        return query;
      }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => {
        const data = apply();
        return lostResponse ? { data: null, error: lostResponse } : { data, error: null };
      }),
      then: (resolve) => {
        const data = apply();
        resolve(lostResponse ? { data: null, error: lostResponse } : { data, error: null });
      },
    };
    return query;
  };

  return {
    rows,
    goals,
    claimedIds,
    updateCalls,
    from: vi.fn((table) => {
      const tableRows =
        table === 'agent_jobs' ? rows : table === 'goals' ? goals : authorityFixtures.tables[table];
      if (!tableRows) {
        return {
          select: vi.fn(() => selectBuilder(new Map())),
          insert: vi.fn(async () => ({ error: null })),
        };
      }
      return {
        select: vi.fn(() => selectBuilder(tableRows)),
        update: vi.fn((patch) => updateBuilder(table, tableRows, patch)),
      };
    }),
  };
}

async function withExactWakeSpy(callback) {
  const previousWorkerSecret = process.env.WORKER_SECRET;
  const previousVercelUrl = process.env.VERCEL_URL;
  const previousVercel = process.env.VERCEL;
  const previousFetch = globalThis.fetch;
  const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, redirected: false }));
  process.env.WORKER_SECRET = 'worker-secret';
  process.env.VERCEL_URL = 'preview.example.test';
  delete process.env.VERCEL;
  globalThis.fetch = fetchSpy;

  try {
    return await callback(fetchSpy);
  } finally {
    if (previousWorkerSecret === undefined) delete process.env.WORKER_SECRET;
    else process.env.WORKER_SECRET = previousWorkerSecret;
    if (previousVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previousVercelUrl;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    globalThis.fetch = previousFetch;
  }
}

const TEST_PREVIEW_DEPLOYMENT_ID = 'dpl_job_processor';
const TEST_PREVIEW_DEPLOYMENT = `vercel-deployment:${TEST_PREVIEW_DEPLOYMENT_ID}`;

function enterPreviewDeployment(deploymentId = TEST_PREVIEW_DEPLOYMENT_ID) {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_DEPLOYMENT_ID = deploymentId;
  return () => {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousDeploymentId === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
    else process.env.VERCEL_DEPLOYMENT_ID = previousDeploymentId;
  };
}

function previewPayload(payload, deployment = TEST_PREVIEW_DEPLOYMENT) {
  return { ...payload, _workerDeployment: deployment };
}

async function flushFakeTimerMicrotasksUntil(predicate, description) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await vi.advanceTimersByTimeAsync(0);
  }
  throw new Error(`Timed out while waiting for ${description}`);
}

// ── Tests ─────────────────────────────────────────────────────────

describe('claimNextJob', () => {
  it('returns null when no queued jobs', async () => {
    const admin = mockAdmin({ jobs: [] });
    const result = await claimNextJob(admin);
    expect(result).toBeNull();
  });

  it('claims a queued job', async () => {
    const job = { id: 'job-1', payload: { type: 'run-llm', prompt: 'Hi' }, retry_count: 0 };
    const admin = mockAdmin({ jobs: [job] });
    const result = await claimNextJob(admin);
    expect(result).toMatchObject({ ...job, status: 'running' });
  });

  it('returns null if another worker claimed first', async () => {
    const job = { id: 'job-1', payload: { type: 'run-llm', prompt: 'Hi' }, retry_count: 0 };
    const admin = mockAdmin({ jobs: [job], claimOk: false });
    const result = await claimNextJob(admin);
    expect(result).toBeNull();
  });

  it('leaves browser-task rows for the dedicated browser worker', async () => {
    const admin = exactQueueAdmin([
      {
        id: 'browser-only',
        status: 'queued',
        worker_scope: 'production',
        payload: { type: 'browser-task', providerUrl: 'https://provider.example/signup' },
      },
      {
        id: 'central-job',
        status: 'queued',
        worker_scope: 'production',
        payload: { type: 'run-llm', prompt: 'Continue centrally' },
      },
    ]);

    const result = await claimNextJob(admin);

    expect(result).toMatchObject({ id: 'central-job', status: 'running' });
    expect(admin.rows.get('browser-only')).toMatchObject({ status: 'queued' });
    expect(admin.claimedIds).toEqual(['central-job']);
  });

  it('claims only the current deployment row from the shared Preview partition', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'other-deployment',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({ type: 'run-llm' }, 'vercel-deployment:dpl_other'),
      },
      {
        id: 'unbound-preview',
        status: 'queued',
        worker_scope: 'preview',
        payload: { type: 'run-llm' },
      },
      {
        id: 'current-deployment',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({ type: 'run-llm' }),
      },
    ]);

    try {
      const claimed = await claimNextJob(admin);
      expect(claimed).toMatchObject({ id: 'current-deployment' });
      expect(claimed.updated_at).toEqual(expect.any(String));
      expect(admin.rows.get('current-deployment').updated_at).toBe(claimed.updated_at);
      expect(admin.claimedIds).toEqual(['current-deployment']);
      expect(admin.rows.get('other-deployment')).toMatchObject({ status: 'queued' });
      expect(admin.rows.get('unbound-preview')).toMatchObject({ status: 'queued' });
    } finally {
      restorePreview();
    }
  });

  it('fails closed before reading the Preview queue when deployment identity is absent', async () => {
    const previous = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
      VERCEL_URL: process.env.VERCEL_URL,
    };
    process.env.VERCEL_ENV = 'preview';
    delete process.env.VERCEL_DEPLOYMENT_ID;
    delete process.env.VERCEL_URL;
    const admin = exactQueueAdmin([]);

    try {
      expect(await claimNextJob(admin)).toBeNull();
      expect(admin.from).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe('claimSpecificJob', () => {
  it('claims a specific job by ID', async () => {
    const job = {
      id: 'job-99',
      status: 'queued',
      payload: { type: 'run-llm', prompt: 'Hi' },
      retry_count: 0,
      worker_scope: 'production',
      updated_at: '2026-08-22T20:00:00.000Z',
      error: null,
      result: null,
    };
    const admin = mockAdmin({ jobs: [job] });
    const result = await claimSpecificJob(admin, 'job-99');
    expect(result).toMatchObject({
      ...job,
      status: 'running',
      updated_at: expect.any(String),
      error: null,
      lease_token: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      heartbeat_at: expect.any(String),
      lease_expires_at: expect.any(String),
    });
  });

  it('returns null if job already claimed by another worker', async () => {
    const job = { id: 'job-99', payload: { type: 'run-llm', prompt: 'Hi' }, retry_count: 0 };
    const admin = mockAdmin({ jobs: [job], claimOk: false });
    const result = await claimSpecificJob(admin, 'job-99');
    expect(result).toBeNull();
  });

  it('returns null when jobId is falsy', async () => {
    const admin = mockAdmin();
    expect(await claimSpecificJob(admin, null)).toBeNull();
    expect(await claimSpecificJob(admin, '')).toBeNull();
  });

  it('adopts its unique running lease when the claim response is lost after commit', async () => {
    const restorePreview = enterPreviewDeployment();
    let loseClaimResponse = true;
    const admin = exactQueueAdmin(
      [
        {
          id: 'response-loss-claim',
          status: 'queued',
          worker_scope: 'preview',
          payload: previewPayload({ type: 'execute-task', goalId: 'goal-claim' }),
          retry_count: 0,
        },
      ],
      {
        responseLoss: ({ table, patch }) => {
          if (table !== 'agent_jobs' || patch.status !== 'running' || !loseClaimResponse) {
            return false;
          }
          loseClaimResponse = false;
          return new Error('claim response lost');
        },
      }
    );

    try {
      const claimed = await claimSpecificJob(admin, 'response-loss-claim');

      expect(claimed).toMatchObject({
        id: 'response-loss-claim',
        status: 'running',
        error: null,
        lease_token: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      });
      expect(admin.rows.get('response-loss-claim')).toMatchObject({
        status: 'running',
        error: claimed.error,
        updated_at: claimed.updated_at,
      });
      expect(
        admin.updateCalls.filter(
          ({ table, patch }) => table === 'agent_jobs' && patch.status === 'running'
        )
      ).toHaveLength(1);
    } finally {
      restorePreview();
    }
  });

  it('never exact-claims a cross-deployment or unbound Preview row', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'other-deployment',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({ type: 'run-llm' }, 'vercel-deployment:dpl_other'),
      },
      {
        id: 'unbound-preview',
        status: 'queued',
        worker_scope: 'preview',
        payload: { type: 'run-llm' },
      },
      {
        id: 'current-deployment',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({ type: 'run-llm' }),
      },
    ]);

    try {
      expect(await claimSpecificJob(admin, 'other-deployment')).toBeNull();
      expect(await claimSpecificJob(admin, 'unbound-preview')).toBeNull();
      const claimed = await claimSpecificJob(admin, 'current-deployment');
      expect(claimed).toMatchObject({
        id: 'current-deployment',
      });
      expect(claimed.updated_at).toEqual(expect.any(String));
      expect(admin.rows.get('current-deployment').updated_at).toBe(claimed.updated_at);
      expect(admin.claimedIds).toEqual(['current-deployment']);
      expect(admin.rows.get('other-deployment')).toMatchObject({ status: 'queued' });
      expect(admin.rows.get('unbound-preview')).toMatchObject({ status: 'queued' });
    } finally {
      restorePreview();
    }
  });
});

describe('stale job recovery concurrency', () => {
  const staleAt = '2026-08-22T10:00:00.000Z';

  it('terminalizes an expired browser generation for reconciliation without replaying it', async () => {
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    const admin = exactQueueAdmin([
      {
        id: 'crashed-browser-job',
        user_id: 'test-user',
        status: 'running',
        worker_scope: 'production',
        retry_count: 0,
        max_retries: 3,
        updated_at: '2026-08-22T10:00:00.000Z',
        payload: {
          type: 'browser-task',
          providerUrl: 'https://provider.example/signup',
          _userId: 'test-user',
        },
        lease_token: '00000000-0000-4000-8000-000000000011',
        heartbeat_at: '2026-08-22T10:00:00.000Z',
        lease_expires_at: expiredAt,
      },
    ]);

    await sweepStaleJobs(admin);

    expect(admin.rows.get('crashed-browser-job')).toMatchObject({
      status: 'failed',
      retry_count: 0,
      error: 'Browser task lease expired; external work requires reconciliation',
      result: {
        type: 'browser-task',
        reconciliation_required: true,
        expired_lease_observed_at: expiredAt,
      },
      lease_token: null,
      heartbeat_at: null,
      lease_expires_at: null,
    });
    expect(admin.claimedIds).toEqual([]);
  });

  it('compare-and-swaps a stale running job only once across concurrent sweeps', async () => {
    const admin = staleJobAdmin({
      id: 'stale-job',
      user_id: 'test-user',
      status: 'running',
      worker_scope: 'production',
      retry_count: 0,
      max_retries: 3,
      updated_at: staleAt,
      payload: { type: 'run-llm' },
    });

    await Promise.all([sweepStaleJobs(admin), sweepStaleJobs(admin)]);

    expect(admin.staleReads).toBe(2);
    expect(admin.transitions).toHaveLength(1);
    expect(admin.row).toMatchObject({ status: 'queued', retry_count: 1 });
  });

  it('marks an exhausted stale job failed only once across concurrent sweeps', async () => {
    const admin = staleJobAdmin({
      id: 'exhausted-job',
      user_id: 'test-user',
      status: 'running',
      worker_scope: 'production',
      retry_count: 3,
      max_retries: 3,
      updated_at: staleAt,
      payload: { type: 'run-llm' },
    });

    await Promise.all([sweepStaleJobs(admin), sweepStaleJobs(admin)]);

    expect(admin.staleReads).toBe(2);
    expect(admin.transitions).toHaveLength(1);
    expect(admin.row).toMatchObject({
      status: 'failed',
      retry_count: 3,
      error: 'Job timed out (stale — exceeded max retries)',
    });
  });

  it('fails the final running attempt instead of re-queuing beyond its budget', async () => {
    const admin = staleJobAdmin({
      id: 'final-attempt-job',
      user_id: 'test-user',
      status: 'running',
      worker_scope: 'production',
      retry_count: 2,
      max_retries: 3,
      updated_at: staleAt,
      payload: { type: 'run-llm' },
    });

    await sweepStaleJobs(admin);

    expect(admin.transitions).toHaveLength(1);
    expect(admin.row).toMatchObject({
      status: 'failed',
      retry_count: 2,
      error: 'Job timed out (stale — exceeded max retries)',
    });
  });

  it('terminalizes an ownerless stale legacy row immediately without consuming a retry', async () => {
    const admin = staleJobAdmin({
      id: 'ownerless-stale-job',
      status: 'running',
      worker_scope: 'production',
      retry_count: 0,
      max_retries: 3,
      updated_at: staleAt,
      payload: { type: 'run-llm' },
    });

    await sweepStaleJobs(admin);

    expect(admin.transitions).toHaveLength(1);
    expect(admin.row).toMatchObject({
      status: 'failed',
      retry_count: 0,
      error: expect.stringContaining('JOB_OWNER_VALIDATION_ERROR'),
    });
  });

  it('sweeps only stale rows bound to the current Preview deployment', async () => {
    const restorePreview = enterPreviewDeployment();
    const previewStaleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const admin = exactQueueAdmin([
      {
        id: 'current-stale',
        status: 'running',
        worker_scope: 'preview',
        retry_count: 0,
        max_retries: 3,
        updated_at: previewStaleAt,
        lease_expires_at: previewStaleAt,
        payload: previewPayload({ type: 'run-llm' }),
      },
      {
        id: 'foreign-stale',
        status: 'running',
        worker_scope: 'preview',
        retry_count: 0,
        max_retries: 3,
        updated_at: previewStaleAt,
        lease_expires_at: previewStaleAt,
        payload: previewPayload({ type: 'run-llm' }, 'vercel-deployment:dpl_other'),
      },
      {
        id: 'unbound-stale',
        status: 'running',
        worker_scope: 'preview',
        retry_count: 0,
        max_retries: 3,
        updated_at: previewStaleAt,
        lease_expires_at: previewStaleAt,
        payload: { type: 'run-llm' },
      },
    ]);

    try {
      await sweepStaleJobs(admin);

      expect(admin.rows.get('current-stale')).toMatchObject({ status: 'queued', retry_count: 1 });
      expect(admin.rows.get('foreign-stale')).toMatchObject({ status: 'running', retry_count: 0 });
      expect(admin.rows.get('unbound-stale')).toMatchObject({ status: 'running', retry_count: 0 });
    } finally {
      restorePreview();
    }
  });

  it('does not sweep or mutate a stale running row during an exact pickup', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = staleJobAdmin({
      id: 'exact-running-job',
      status: 'running',
      worker_scope: 'preview',
      retry_count: 3,
      max_retries: 3,
      updated_at: staleAt,
      payload: previewPayload({ type: 'run-llm' }),
    });

    try {
      const result = await processNextJob(admin, null, 'exact-running-job');

      expect(result).toEqual({ processed: 0 });
      expect(admin.staleReads).toBe(0);
      expect(admin.transitions).toHaveLength(0);
      expect(admin.row).toMatchObject({ status: 'running', retry_count: 3 });
    } finally {
      restorePreview();
    }
  });
});

describe('executeJob', () => {
  it('dispatches run-llm jobs', async () => {
    const job = {
      id: 'j1',
      user_id: 'user-1',
      payload: { type: 'run-llm', prompt: 'Test' },
      retry_count: 0,
    };
    const admin = mockAdmin();
    const { result, error } = await executeJob(admin, job, null);
    expect(error).toBeNull();
    expect(result.type).toBe('run-llm');
    expect(result.content).toBe('Hello from LLM');
  });

  it('dispatches agent jobs', async () => {
    const job = {
      id: 'j2',
      user_id: 'user-1',
      payload: { type: 'agent', task: 'Do thing', agentId: 'agent-1' },
      retry_count: 0,
    };
    const admin = mockAdmin({
      tables: {
        agents: [
          {
            id: 'agent-1',
            user_id: 'user-1',
            name: 'Owned agent',
            status: 'active',
            capabilities: [],
            metadata: { system_prompt: 'Owned prompt' },
          },
        ],
      },
    });
    const { result, error } = await executeJob(admin, job, null);
    expect(error).toBeNull();
    expect(result.type).toBe('agent');
  });

  it('fails a council meeting closed when its team is deactivated after authority admission', async () => {
    executeLlm.mockClear();
    const admin = mockAdmin({
      tables: {
        agent_teams: [
          {
            id: 'team-1',
            user_id: 'user-1',
            leader_id: 'agent-1',
            goal_id: null,
            is_active: true,
          },
        ],
        agent_team_members: [
          {
            id: 'membership-1',
            team_id: 'team-1',
            member_id: 'agent-1',
            user_id: 'user-1',
            role: 'lead',
          },
        ],
        agents: [
          {
            id: 'agent-1',
            user_id: 'user-1',
            name: 'Lead',
            status: 'active',
            metadata: { role: 'Team Lead' },
          },
        ],
      },
    });
    const originalFrom = admin.from;
    let teamReads = 0;
    admin.from = vi.fn((table) => {
      if (table !== 'agent_teams') return originalFrom(table);
      teamReads += 1;
      if (teamReads === 1) return originalFrom(table);
      return {
        select: vi.fn(() => {
          const query = {
            eq: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({
              data: {
                id: 'team-1',
                user_id: 'user-1',
                leader_id: 'agent-1',
                name: 'Deactivated team',
                is_active: false,
              },
              error: null,
            })),
          };
          return query;
        }),
      };
    });

    await expect(
      executeJob(
        admin,
        {
          id: 'council-job',
          user_id: 'user-1',
          payload: { type: 'council-meeting', team_id: 'team-1' },
        },
        null
      )
    ).rejects.toThrow('council-meeting team is missing, foreign, or inactive');

    expect(executeLlm).not.toHaveBeenCalled();
    expect(admin._insertCalls).toHaveLength(0);
  });

  it.each(['invalid-type', 'optimize-prompts', 'evaluate-prompt-variants'])(
    'rejects unsupported runtime type %s as an owner-validation security error',
    async (type) => {
      const job = {
        id: `unsupported-${type}`,
        user_id: 'user-1',
        payload: { type },
        retry_count: 0,
      };
      const admin = mockAdmin();
      await expect(executeJob(admin, job, null)).rejects.toThrow(
        `JOB_OWNER_VALIDATION_ERROR: unsupported queued job type: ${type}`
      );
    }
  );

  it('dispatches internal AxWise outcome jobs with worker context', async () => {
    const job = {
      id: 'outcome-job',
      user_id: 'user-1',
      payload: { type: 'axwise-outcome', goalId: 'goal-1', decisionId: 'decision-1' },
      retry_count: 1,
    };
    const admin = mockAdmin({
      tables: {
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            status: 'completed',
            org_id: 'user-1',
            data: { axwise_orchestration: { decision_id: 'decision-1' } },
          },
        ],
      },
    });

    const { result, error } = await executeJob(admin, job, null);

    expect(error).toBeNull();
    expect(result).toEqual({ status: 'reported' });
    expect(handleAxwiseOutcomeJob).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ _userId: 'user-1', userId: 'user-1', user_id: 'user-1' }),
      expect.objectContaining({ user_id: 'user-1' }),
      null
    );
  });

  it('dispatches durable AxWise grounding jobs with the queue admin client', async () => {
    const job = {
      id: 'ground-job',
      user_id: 'user-1',
      payload: {
        type: 'axwise-ground',
        requestId: 'request-1',
        tenant: { orgId: 'org-1' },
      },
      retry_count: 0,
    };
    const admin = mockAdmin({
      tables: {
        organizations: [{ id: 'org-1', user_id: 'user-1', parent_id: null, is_active: true }],
      },
    });

    const { result, error } = await executeJob(admin, job, null);

    expect(error).toBeNull();
    expect(result).toEqual({ status: 'grounded' });
    expect(handleAxwiseGroundJob).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        requestId: 'request-1',
        _userId: 'user-1',
        userId: 'user-1',
        user_id: 'user-1',
      }),
      expect.objectContaining({ id: 'ground-job', user_id: 'user-1' })
    );
  });

  it('injects the durable queue owner into every supported payload identity', async () => {
    executeLlm.mockClear();
    const job = {
      id: 'canonical-owner',
      user_id: 'user-1',
      payload: { type: 'run-llm', prompt: 'Owned request' },
      retry_count: 0,
    };

    await executeJob(mockAdmin(), job, null);

    expect(job.payload).toEqual({ type: 'run-llm', prompt: 'Owned request' });
    expect(executeLlm).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  it('rebuilds a valid nested agent context with the durable queue owner', () => {
    const canonical = canonicalizeJobOwner({
      id: 'nested-canonical',
      user_id: 'user-1',
      payload: {
        type: 'agent',
        task: 'Owned task',
        agentContext: { _agentId: 'agent-1' },
      },
    });

    expect(canonical.payload.agentContext).toMatchObject({
      _agentId: 'agent-1',
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
    });
  });

  it('rebuilds a valid nested tenant with the durable queue owner', () => {
    const canonical = canonicalizeJobOwner({
      id: 'tenant-canonical',
      user_id: 'user-1',
      payload: {
        type: 'axwise-ground',
        tenant: { orgId: 'org-1' },
      },
    });

    expect(canonical.payload.tenant).toMatchObject({
      orgId: 'org-1',
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
    });
  });

  it.each(['_userId', 'userId', 'user_id'])(
    'rejects a mismatched payload %s before memory, graph, or LLM work',
    async (identityField) => {
      executeLlm.mockClear();
      searchAgentMemory.mockClear();
      queryAgentGraph.mockClear();
      const job = {
        id: `mismatch-${identityField}`,
        user_id: 'durable-owner',
        payload: {
          type: 'run-llm',
          prompt: 'Read victim memory',
          memory: { owner_type: 'agent', owner_id: 'victim-agent' },
          [identityField]: 'victim-user',
        },
      };

      await expect(executeJob(mockAdmin(), job, null)).rejects.toThrow(
        `${identityField} does not match agent_jobs.user_id`
      );
      expect(searchAgentMemory).not.toHaveBeenCalled();
      expect(queryAgentGraph).not.toHaveBeenCalled();
      expect(executeLlm).not.toHaveBeenCalled();
    }
  );

  it.each(['_userId', 'userId', 'user_id'])(
    'rejects nested tenant.%s before AxWise or any handler work',
    async (identityField) => {
      handleAxwiseGroundJob.mockClear();
      const job = {
        id: `tenant-owner-mismatch-${identityField}`,
        user_id: 'durable-owner',
        payload: {
          type: 'axwise-ground',
          requestId: 'request-1',
          tenant: { orgId: 'victim-org', [identityField]: 'victim-user' },
        },
      };

      await expect(executeJob(mockAdmin(), job, null)).rejects.toThrow(
        `tenant.${identityField} does not match agent_jobs.user_id`
      );
      expect(handleAxwiseGroundJob).not.toHaveBeenCalled();
    }
  );

  it('rejects an agent/tools job owner mismatch before the handler or Vault path runs', async () => {
    runAgentWithTools.mockClear();
    const executeTaskCalls = handleExecuteTask.mock.calls.length;
    const job = {
      id: 'tool-owner-mismatch',
      user_id: 'durable-owner',
      payload: {
        type: 'agent',
        task: 'Use private credential',
        toolIds: ['victim-tool'],
        userId: 'victim-user',
      },
    };

    await expect(executeJob(mockAdmin(), job, null)).rejects.toThrow(
      'userId does not match agent_jobs.user_id'
    );
    expect(runAgentWithTools).not.toHaveBeenCalled();
    expect(handleExecuteTask.mock.calls.length).toBe(executeTaskCalls);
  });

  it.each(['_userId', 'userId', 'user_id'])(
    'rejects nested agentContext.%s before DB, tool, or LLM work',
    async (identityField) => {
      buildSupabaseAdminClient.mockClear();
      runAgentWithTools.mockClear();
      executeLlm.mockClear();
      const job = {
        id: `nested-owner-mismatch-${identityField}`,
        user_id: 'durable-owner',
        payload: {
          type: 'agent',
          task: 'Load victim skills',
          agentContext: { _agentId: 'victim-agent', [identityField]: 'victim-user' },
        },
      };

      await expect(executeJob(mockAdmin(), job, null)).rejects.toThrow(
        `agentContext.${identityField} does not match agent_jobs.user_id`
      );
      expect(buildSupabaseAdminClient).not.toHaveBeenCalled();
      expect(runAgentWithTools).not.toHaveBeenCalled();
      expect(executeLlm).not.toHaveBeenCalled();
    }
  );

  it('fails closed when a legacy job has no durable owner', async () => {
    executeLlm.mockClear();
    await expect(
      executeJob(
        mockAdmin(),
        { id: 'ownerless', payload: { type: 'run-llm', prompt: 'Do not run' } },
        null
      )
    ).rejects.toThrow('agent_jobs.user_id is required');
    expect(executeLlm).not.toHaveBeenCalled();
  });
});

describe('finalizeJob', () => {
  it('marks job as done with result', async () => {
    const admin = mockAdmin();
    const job = { id: 'j1', user_id: 'test-user', payload: { type: 'run-llm' } };
    const status = await finalizeJob(admin, job, { content: 'ok' }, null);
    expect(status).toBe('done');
  });

  it('marks job as failed with error', async () => {
    const admin = mockAdmin();
    const job = { id: 'j1', user_id: 'test-user', payload: { type: 'run-llm' } };
    const status = await finalizeJob(admin, job, null, 'Something broke');
    expect(status).toBe('failed');
  });

  it('compare-and-swaps only the running lease', async () => {
    const admin = mockAdmin();

    await finalizeJob(
      admin,
      { id: 'j1', user_id: 'test-user', payload: { type: 'run-llm' } },
      null,
      null
    );

    expect(admin._updateCalls[0]).toMatchObject({
      patch: { status: 'done' },
      conditions: expect.arrayContaining([
        ['id', 'j1'],
        ['user_id', 'test-user'],
        ['status', 'running'],
        ['payload', JSON.stringify({ type: 'run-llm' })],
        ['lease_token', expect.stringMatching(/^[0-9a-f-]{36}$/i)],
      ]),
    });
  });

  it('loses the lease without fanout when the durable row owner changes mid-run', async () => {
    commLog.mockClear();
    const job = {
      id: 'owner-changed-mid-run',
      user_id: 'original-owner',
      status: 'running',
      worker_scope: 'production',
      payload: { type: 'run-llm', prompt: 'Owned work' },
      retry_count: 0,
      updated_at: '2026-08-22T20:00:00.000Z',
      error: '__orqaly_worker_lease__:original-attempt',
      result: null,
    };
    const admin = exactQueueAdmin([{ ...job, user_id: 'different-owner' }]);

    await expect(finalizeJob(admin, job, { content: 'must not fan out' }, null)).rejects.toThrow(
      'Lost running lease while finalizing job owner-changed-mid-run'
    );

    expect(admin.rows.get(job.id)).toMatchObject({
      user_id: 'different-owner',
      status: 'running',
    });
    expect(commLog).not.toHaveBeenCalled();
  });

  it('surfaces a Supabase transition error before finalization side effects', async () => {
    const admin = mockAdmin({ updateError: { message: 'write failed' } });

    await expect(
      finalizeJob(
        admin,
        { id: 'j1', user_id: 'test-user', payload: { type: 'run-llm' } },
        null,
        null
      )
    ).rejects.toThrow('Failed to finalize job j1: write failed');
    expect(admin.from).toHaveBeenCalledTimes(2);
  });

  it('surfaces a lost lease when no running row transitions', async () => {
    const admin = mockAdmin({ claimOk: false });

    await expect(
      finalizeJob(
        admin,
        { id: 'j1', user_id: 'test-user', payload: { type: 'run-llm' } },
        null,
        null
      )
    ).rejects.toThrow('Lost running lease while finalizing job j1');
    expect(admin.from).toHaveBeenCalledTimes(2);
  });

  it('rejects a stale finalizer when a newer retry lease is running under the same id', async () => {
    const admin = exactQueueAdmin([
      {
        id: 'leased-job',
        status: 'running',
        retry_count: 2,
        updated_at: '2026-08-22T18:00:02.000Z',
        payload: { type: 'run-llm' },
      },
    ]);
    const staleClaim = {
      id: 'leased-job',
      user_id: 'test-user',
      payload: { type: 'run-llm' },
      retry_count: 1,
      updated_at: '2026-08-22T18:00:01.000Z',
    };

    await expect(finalizeJob(admin, staleClaim, { content: 'late result' }, null)).rejects.toThrow(
      'Lost running lease while finalizing job leased-job'
    );
    expect(admin.rows.get('leased-job')).toMatchObject({
      status: 'running',
      retry_count: 2,
      updated_at: '2026-08-22T18:00:02.000Z',
    });
  });

  it('accepts an exactly committed finalization when the write response is lost', async () => {
    let loseFinalizeResponse = true;
    const payload = { type: 'run-llm', prompt: 'response loss' };
    const admin = exactQueueAdmin(
      [
        {
          id: 'response-loss-finalize',
          status: 'running',
          worker_scope: 'production',
          payload,
          retry_count: 0,
          updated_at: '2026-08-22T20:10:00.000Z',
          error: '__orqaly_worker_lease__:finalize-attempt',
          result: null,
        },
      ],
      {
        responseLoss: ({ table, patch }) => {
          if (table !== 'agent_jobs' || patch.status !== 'done' || !loseFinalizeResponse) {
            return false;
          }
          loseFinalizeResponse = false;
          return new Error('finalize response lost');
        },
      }
    );
    const job = { ...admin.rows.get('response-loss-finalize') };
    const result = { content: 'durably complete', parsed: { ok: true } };

    await expect(finalizeJob(admin, job, result, null)).resolves.toBe('done');
    expect(admin.rows.get(job.id)).toMatchObject({
      status: 'done',
      retry_count: 0,
      result,
      error: null,
    });
    expect(
      admin.updateCalls.filter(
        ({ table, patch }) => table === 'agent_jobs' && patch.status === 'done'
      )
    ).toHaveLength(1);
  });

  it('records final AxWise delivery failure without changing goal status', async () => {
    const admin = mockAdmin({
      tables: {
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            status: 'completed',
            org_id: 'user-1',
            data: { axwise_orchestration: { decision_id: 'decision-1' } },
          },
        ],
      },
    });
    const job = {
      id: 'outcome-job',
      user_id: 'user-1',
      payload: { type: 'axwise-outcome', goalId: 'goal-1', decisionId: 'decision-1' },
    };

    const status = await finalizeJob(admin, job, null, 'retry budget exhausted');

    expect(status).toBe('failed');
    expect(markAxwiseOutcomeFinalFailure).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ goalId: 'goal-1', userId: 'user-1' }),
      'retry budget exhausted',
      job,
      'user-1'
    );
    expect(admin.from).toHaveBeenCalledWith('goals');
    expect(admin._updateCalls).toHaveLength(1);
  });

  it('writes predefined-agent memory under the stable catalogue owner key', async () => {
    const admin = mockAdmin({
      tables: {
        agents: [
          {
            id: 'agent-row-1',
            user_id: 'user-1',
            name: 'Researcher',
            category: 'research',
            status: 'active',
            capabilities: [],
            metadata: { agent_id: 'predefined:researcher' },
            updated_at: '2026-08-22T00:00:00.000Z',
          },
        ],
      },
    });
    const job = {
      id: 'predefined-memory-job',
      user_id: 'user-1',
      payload: {
        type: 'agent',
        agentId: 'agent-row-1',
        task: 'Research the market',
      },
    };

    await expect(
      finalizeJob(admin, job, { content: 'Durable research result' }, null)
    ).resolves.toBe('done');

    const memoryWrite = admin._insertCalls.find((entry) => entry?.table === 'knowledge_documents');
    expect(memoryWrite?.data).toMatchObject({
      user_id: 'user-1',
      owner_type: 'agent',
      owner_id: 'predefined:researcher',
      category: 'job-memory',
    });
  });

  it('uses the exact authority remembered during execution when no override is supplied', async () => {
    commLog.mockClear();
    const job = {
      id: 'remembered-authority',
      user_id: 'user-1',
      payload: { type: 'run-llm', prompt: 'Original owned prompt' },
      retry_count: 0,
    };
    const admin = mockAdmin();
    await executeJob(admin, job, null);
    job.user_id = '';
    job.payload = { type: 'optimize-prompts', prompt: 'Forged later payload' };

    await expect(finalizeJob(admin, job, { content: 'ok' }, null)).resolves.toBe('done');

    expect(commLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        thread_id: 'remembered-authority',
        metadata: expect.objectContaining({ job_type: 'run-llm' }),
      })
    );
  });

  it('accepts only the supplied authority object returned and remembered by execution', async () => {
    const job = {
      id: 'supplied-authority',
      user_id: 'user-1',
      payload: { type: 'run-llm', prompt: 'Owned prompt' },
      retry_count: 0,
    };
    const admin = mockAdmin();
    const { authority } = await executeJob(admin, job, null);

    await expect(finalizeJob(admin, job, { content: 'ok' }, null, authority)).resolves.toBe('done');
  });

  it('rejects a forged authority override and performs no attacker-selected fanout', async () => {
    commLog.mockClear();
    markAxwiseOutcomeFinalFailure.mockClear();
    const job = {
      id: 'forged-finalizer-authority',
      user_id: 'attacker-user',
      payload: { type: 'run-llm', prompt: 'benign queue payload' },
      retry_count: 0,
    };
    const forgedAuthority = Object.freeze({
      userId: 'victim-user',
      queueJobId: job.id,
      type: 'axwise-outcome',
      goalId: 'victim-goal',
      agentId: 'victim-agent',
      payload: { type: 'axwise-outcome', goalId: 'victim-goal' },
    });
    const admin = mockAdmin();

    await expect(
      finalizeJob(
        admin,
        job,
        { content: 'forged result', usage: { total_tokens: 999 } },
        null,
        forgedAuthority
      )
    ).resolves.toBe('failed');

    expect(admin._updateCalls[0].patch).toMatchObject({
      status: 'failed',
      result: null,
      error: expect.stringContaining('authority override is not the remembered'),
    });
    expect(admin.from.mock.calls.map(([table]) => table)).toEqual(['agent_jobs']);
    expect(admin._insertCalls).toEqual([]);
    expect(markAxwiseOutcomeFinalFailure).not.toHaveBeenCalled();
    expect(commLog).not.toHaveBeenCalled();
  });

  it('fails an ownerless finalizer closed without any usage, memory, notification, log, or goal fanout', async () => {
    commLog.mockClear();
    markAxwiseOutcomeFinalFailure.mockClear();
    const admin = mockAdmin();
    const job = {
      id: 'ownerless-finalizer',
      payload: { type: 'axwise-outcome', goalId: 'victim-goal', agentId: 'victim-agent' },
      retry_count: 0,
    };

    await expect(
      finalizeJob(
        admin,
        job,
        {
          content: 'attacker result',
          usage: { total_tokens: 999 },
          estimatedCostUsd: 50,
        },
        null
      )
    ).resolves.toBe('failed');

    expect(admin._updateCalls[0].patch).toMatchObject({
      status: 'failed',
      result: null,
      error: expect.stringContaining('JOB_OWNER_VALIDATION_ERROR'),
    });
    expect(admin.from.mock.calls.map(([table]) => table)).toEqual(['agent_jobs']);
    expect(admin._insertCalls).toEqual([]);
    expect(markAxwiseOutcomeFinalFailure).not.toHaveBeenCalled();
    expect(commLog).not.toHaveBeenCalled();
  });
});

describe('handleRetry', () => {
  it('re-queues job on first failure', async () => {
    const admin = mockAdmin();
    const job = { id: 'j1', retry_count: 0 };
    const retried = await handleRetry(admin, job, 'Timeout');
    expect(retried).toBe(true);
  });

  it('does not retry after max retries', async () => {
    const admin = mockAdmin();
    const job = { id: 'j1', retry_count: 2 };
    const retried = await handleRetry(admin, job, 'Timeout');
    expect(retried).toBe(false);
  });

  it('honors the immutable per-row retry budget', async () => {
    const admin = mockAdmin();
    const retried = await handleRetry(
      admin,
      { id: 'single-attempt', retry_count: 0, max_retries: 1 },
      'Timeout'
    );
    expect(retried).toBe(false);
    expect(admin._updateCalls).toEqual([]);
  });

  it('does not retry a missing BYOK key that requires user action', async () => {
    const admin = mockAdmin();
    const job = { id: 'j1', retry_count: 0 };
    const retried = await handleRetry(
      admin,
      job,
      'BYOK_REQUIRED: Add a key for gemini in Settings → API Keys.'
    );

    expect(retried).toBe(false);
    expect(classifyActionableJobError('BYOK_REQUIRED: Add a key for gemini')).toMatchObject({
      code: 'llm_api_key_required',
      goalStatus: 'needs_human',
      action: { target_url: '/settings/keys' },
    });
  });

  it('never requeues a JOB_OWNER_VALIDATION_ERROR', async () => {
    const admin = mockAdmin();

    await expect(
      handleRetry(
        admin,
        { id: 'security-failure', retry_count: 0 },
        'JOB_OWNER_VALIDATION_ERROR: owner mismatch'
      )
    ).resolves.toBe(false);

    expect(admin._updateCalls).toEqual([]);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('reports no retry when the queued transition is not persisted', async () => {
    const admin = mockAdmin({ updateError: { message: 'write failed' } });
    const retried = await handleRetry(admin, { id: 'j1', retry_count: 0 }, 'Timeout');

    expect(retried).toBe(false);
  });

  it('does not requeue a newer running retry lease from a stale invocation', async () => {
    const admin = exactQueueAdmin([
      {
        id: 'leased-job',
        status: 'running',
        retry_count: 1,
        updated_at: '2026-08-22T18:00:02.000Z',
        payload: { type: 'run-llm' },
      },
    ]);

    const retried = await handleRetry(
      admin,
      {
        id: 'leased-job',
        retry_count: 0,
        updated_at: '2026-08-22T18:00:01.000Z',
      },
      'late timeout'
    );

    expect(retried).toBe(false);
    expect(admin.rows.get('leased-job')).toMatchObject({
      status: 'running',
      retry_count: 1,
      updated_at: '2026-08-22T18:00:02.000Z',
    });
  });

  it('accepts an exactly queued retry when the write response is lost', async () => {
    let loseRetryResponse = true;
    const admin = exactQueueAdmin(
      [
        {
          id: 'response-loss-retry',
          status: 'running',
          worker_scope: 'production',
          payload: { type: 'run-llm', prompt: 'retry me' },
          retry_count: 0,
          updated_at: '2026-08-22T20:20:00.000Z',
          error: '__orqaly_worker_lease__:retry-attempt',
          result: null,
        },
      ],
      {
        responseLoss: ({ table, patch }) => {
          if (table !== 'agent_jobs' || patch.status !== 'queued' || !loseRetryResponse) {
            return false;
          }
          loseRetryResponse = false;
          return new Error('retry response lost');
        },
      }
    );
    const job = { ...admin.rows.get('response-loss-retry') };

    await expect(handleRetry(admin, job, 'temporary timeout')).resolves.toBe(true);
    expect(admin.rows.get(job.id)).toMatchObject({
      status: 'queued',
      retry_count: 1,
      result: null,
      error: 'Attempt 1: temporary timeout',
    });
    expect(
      admin.updateCalls.filter(
        ({ table, patch }) => table === 'agent_jobs' && patch.status === 'queued'
      )
    ).toHaveLength(1);
  });
});

describe('worker timeout policy', () => {
  it('keeps the longer execute-task budget for the local worker', () => {
    expect(getJobTimeoutMs('execute-task', { env: {} })).toBe(900_000);
  });

  it('caps execute-task below the 180s Vercel function ceiling', () => {
    expect(
      getJobTimeoutMs('execute-task', {
        env: { VERCEL: '1', EXECUTE_TASK_TIMEOUT_MS: '900000' },
      })
    ).toBe(170_000);
  });

  it('subtracts invocation setup time from the Vercel work budget', () => {
    expect(
      getJobTimeoutMs('execute-task', {
        env: { VERCEL: '1', EXECUTE_TASK_TIMEOUT_MS: '900000' },
        elapsedMs: 25_000,
      })
    ).toBe(145_000);
  });

  it('respects a shorter configured timeout in Vercel', () => {
    expect(
      getJobTimeoutMs('execute-task', {
        env: { VERCEL: '1', EXECUTE_TASK_TIMEOUT_MS: '120000' },
      })
    ).toBe(120_000);
  });
});

// ── Phase 2.1: real failure_reason capture ────────────────────

function mockAdminWithGoalCapture({
  currentGoalData = {},
  mutateGoalAfterJobTransition = null,
} = {}) {
  const currentGoal = {
    id: 'goal-abc',
    user_id: 'user-1',
    status: 'active',
    data: currentGoalData,
    updated_at: '2026-08-22T00:00:00.000Z',
  };
  const state = { updates: [], inserts: [], currentGoal };
  const admin = {
    _state: state,
    from: vi.fn((table) => {
      if (table === 'agent_jobs') {
        return {
          update: (patch) => {
            const original = {};
            const query = {
              eq: (column, value) => {
                if (column === 'payload' || column === 'result') {
                  original[column] = JSON.parse(value);
                } else {
                  original[column] = value;
                }
                return query;
              },
              is: (column, value) => {
                original[column] = value;
                return query;
              },
              select: () => query,
              maybeSingle: async () => {
                if (mutateGoalAfterJobTransition) {
                  mutateGoalAfterJobTransition(currentGoal);
                  mutateGoalAfterJobTransition = null;
                }
                return {
                  data: { ...original, ...patch },
                  error: null,
                };
              },
            };
            return query;
          },
        };
      }
      if (table === 'goals') {
        return {
          select: () => {
            const conditions = [];
            const query = {
              eq: (column, value) => {
                conditions.push([column, value]);
                return query;
              },
              maybeSingle: async () => ({
                data: conditions.every(
                  ([column, value]) => String(currentGoal[column]) === String(value)
                )
                  ? { ...currentGoal }
                  : null,
                error: null,
              }),
              single: async () => ({ data: { ...currentGoal }, error: null }),
            };
            return query;
          },
          update: (patch) => {
            const conditions = [];
            const equivalent = (actual, expected) => {
              if (actual == null || expected == null) return actual == null && expected == null;
              if (typeof actual === 'object' && typeof expected === 'string') {
                try {
                  return JSON.stringify(actual) === JSON.stringify(JSON.parse(expected));
                } catch {
                  return false;
                }
              }
              return String(actual) === String(expected);
            };
            const query = {
              eq: (column, value) => {
                conditions.push([column, value]);
                return query;
              },
              is: (column, value) => {
                conditions.push([column, value]);
                return query;
              },
              select: () => query,
              maybeSingle: async () => {
                if (
                  !conditions.every(([column, value]) => equivalent(currentGoal[column], value))
                ) {
                  return { data: null, error: null };
                }
                state.updates.push({ table: 'goals', patch });
                Object.assign(currentGoal, patch);
                return { data: { id: currentGoal.id }, error: null };
              },
            };
            return query;
          },
        };
      }
      if (table === 'goal_log') {
        return {
          insert: async (row) => {
            state.inserts.push({ table: 'goal_log', row });
            return { error: null };
          },
        };
      }
      return {
        select: vi.fn(function () {
          return this;
        }),
        eq: vi.fn(function () {
          return this;
        }),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        insert: vi.fn(async () => ({ error: null })),
      };
    }),
  };
  return admin;
}

describe('finalizeJob: orchestrate-goal failure captures real reason (Phase 2.1)', () => {
  const orchJob = (overrides = {}) => ({
    id: 'job-x',
    user_id: 'user-1',
    payload: { type: 'orchestrate-goal', action: 'po-analysis', goalId: 'goal-abc' },
    ...overrides,
  });

  it('writes Error.message into goals.data.failure_reason', async () => {
    const admin = mockAdminWithGoalCapture();
    await finalizeJob(admin, orchJob(), null, new Error('LLM groq 429: rate limit reached'));
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate).toBeDefined();
    expect(goalUpdate.patch.status).toBe('failed');
    expect(goalUpdate.patch.data.failure_reason).toBe('LLM groq 429: rate limit reached');
    expect(goalUpdate.patch.data.failure_stage).toBe('po-analysis');
    expect(goalUpdate.patch.data.failure_at).toBeDefined();
  });

  it('surfaces missing Gemini BYOK as an immediate actionable human checkpoint', async () => {
    const admin = mockAdminWithGoalCapture();
    await finalizeJob(
      admin,
      orchJob(),
      null,
      new Error(
        'BYOK_REQUIRED: this user has no LLM API key configured. Add a key for gemini in Settings → API Keys.'
      )
    );

    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch).toMatchObject({
      status: 'needs_human',
      data: {
        failure_code: 'llm_api_key_required',
        failure_reason: 'Connect a Gemini API key in Settings → API Keys, then retry this goal.',
        recovery_action: {
          type: 'navigate',
          label: 'Open API Keys',
          target_url: '/settings/keys',
        },
      },
    });
    const logInsert = admin._state.inserts.find((i) => i.table === 'goal_log');
    expect(logInsert.row).toMatchObject({
      event_type: 'goal_needs_human',
      details: {
        classification: 'llm_api_key_required',
        recovery_action: { target_url: '/settings/keys' },
      },
    });
  });

  it('preserves a nonzero execute-phase index for targeted key recovery', async () => {
    const admin = mockAdminWithGoalCapture();
    await finalizeJob(
      admin,
      orchJob({
        payload: {
          type: 'orchestrate-goal',
          action: 'execute-phase',
          goalId: 'goal-abc',
          phaseIndex: 2,
        },
      }),
      null,
      new Error('BYOK_REQUIRED: Add a key for gemini in Settings → API Keys.')
    );

    const goalUpdate = admin._state.updates.find((update) => update.table === 'goals');
    expect(goalUpdate.patch.data).toMatchObject({
      failure_stage: 'execute-phase',
      failure_phase_index: 2,
    });
    const logInsert = admin._state.inserts.find((insert) => insert.table === 'goal_log');
    expect(logInsert.row.details).toMatchObject({
      action: 'execute-phase',
      phase_index: 2,
      classification: 'llm_api_key_required',
    });
  });

  it('truncates Error.stack to 2000 chars', async () => {
    const admin = mockAdminWithGoalCapture();
    const err = new Error('boom');
    err.stack = 'Error: boom\n' + 'x'.repeat(5000);
    await finalizeJob(admin, orchJob(), null, err);
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.data.failure_stack).toBeDefined();
    expect(goalUpdate.patch.data.failure_stack.length).toBeLessThanOrEqual(2000);
  });

  it('preserves existing data keys (merge, not overwrite)', async () => {
    const admin = mockAdminWithGoalCapture({
      currentGoalData: {
        phase_costs: { 0: 0.5 },
        deployment_url: 'https://example.vercel.app',
        heal_attempts: 2,
      },
    });
    await finalizeJob(admin, orchJob(), null, new Error('boom'));
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.data.phase_costs).toEqual({ 0: 0.5 });
    expect(goalUpdate.patch.data.deployment_url).toBe('https://example.vercel.app');
    expect(goalUpdate.patch.data.heal_attempts).toBe(2);
    expect(goalUpdate.patch.data.failure_reason).toBe('boom');
  });

  it('does not rebase a stale job failure onto a newer scope revision', async () => {
    const admin = mockAdminWithGoalCapture({
      currentGoalData: {
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          revision_token: 'revision-old',
        },
      },
      mutateGoalAfterJobTransition: (goal) => {
        goal.status = 'needs_human';
        goal.updated_at = '2026-08-22T00:01:00.000Z';
        goal.data = {
          scope_revision: {
            version: 'orqaly_scope_revision_v1',
            revision_token: 'revision-current',
          },
        };
      },
    });

    await finalizeJob(admin, orchJob(), null, new Error('stale execution failed'));

    expect(admin._state.updates).not.toContainEqual(expect.objectContaining({ table: 'goals' }));
    expect(admin._state.inserts).not.toContainEqual(expect.objectContaining({ table: 'goal_log' }));
    expect(admin._state.currentGoal).toMatchObject({
      status: 'needs_human',
      data: { scope_revision: { revision_token: 'revision-current' } },
    });
  });

  it('handles string error input', async () => {
    const admin = mockAdminWithGoalCapture();
    await finalizeJob(admin, orchJob(), null, 'plain string error');
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.data.failure_reason).toBe('plain string error');
    expect(goalUpdate.patch.data.failure_stack).toBeNull();
  });

  it('handles weird object errors with "Unknown error"', async () => {
    const admin = mockAdminWithGoalCapture();
    await finalizeJob(admin, orchJob(), null, { weird: 'object' });
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate.patch.data.failure_reason).toBe('Unknown error');
  });

  it('goal_log row carries real reason, NOT "Job processing failed"', async () => {
    const admin = mockAdminWithGoalCapture();
    await finalizeJob(admin, orchJob(), null, new Error('LLM timeout after 60s'));
    const logInsert = admin._state.inserts.find((i) => i.table === 'goal_log');
    expect(logInsert).toBeDefined();
    expect(logInsert.row.event_type).toBe('goal_failed');
    expect(logInsert.row.details.reason).toBe('LLM timeout after 60s');
    expect(logInsert.row.details.reason).not.toBe('Job processing failed');
    expect(logInsert.row.details.action).toBe('po-analysis');
  });

  it('does NOT touch goals table for non-orchestrate-goal jobs', async () => {
    const admin = mockAdminWithGoalCapture();
    const job = { id: 'j', payload: { type: 'run-llm' } };
    await finalizeJob(admin, job, null, new Error('boom'));
    const goalUpdate = admin._state.updates.find((u) => u.table === 'goals');
    expect(goalUpdate).toBeUndefined();
  });
});

describe('processNextJob', () => {
  it('returns processed: 0 when no jobs', async () => {
    const admin = mockAdmin({ jobs: [] });
    const result = await processNextJob(admin);
    expect(result).toEqual({ processed: 0 });
  });

  it('processes a run-llm job and returns done', async () => {
    const job = { id: 'job-1', payload: { type: 'run-llm', prompt: 'Hello' }, retry_count: 0 };
    const admin = mockAdmin({ jobs: [job] });
    const result = await processNextJob(admin);
    expect(result.processed).toBe(1);
    expect(result.job_id).toBe('job-1');
    expect(result.status).toBe('done');
  });

  it.each(['invalid-type', 'optimize-prompts', 'evaluate-prompt-variants'])(
    'terminalizes unsupported queued type %s without retrying or invoking a handler',
    async (type) => {
      executeLlm.mockClear();
      const executeTaskCalls = handleExecuteTask.mock.calls.length;
      const admin = exactQueueAdmin([
        {
          id: `terminal-${type}`,
          user_id: 'test-user',
          status: 'queued',
          worker_scope: 'production',
          payload: { type },
          retry_count: 0,
        },
      ]);

      const result = await processNextJob(admin, null, `terminal-${type}`);

      expect(result).toMatchObject({ status: 'failed' });
      expect(admin.rows.get(`terminal-${type}`)).toMatchObject({
        status: 'failed',
        retry_count: 0,
        result: null,
        error: expect.stringContaining('JOB_OWNER_VALIDATION_ERROR'),
      });
      expect(executeLlm).not.toHaveBeenCalled();
      expect(handleExecuteTask.mock.calls.length).toBe(executeTaskCalls);
    }
  );

  it('reports failed and does not chain when the final lease transition is lost', async () => {
    const admin = exactQueueAdmin(
      [
        {
          id: 'lost-finalize-job',
          status: 'queued',
          worker_scope: 'production',
          payload: { type: 'execute-task', taskId: 'task-1', goalId: 'goal-1' },
          retry_count: 0,
        },
      ],
      {
        rejectUpdate: ({ row, patch }) => row.id === 'lost-finalize-job' && patch.status === 'done',
      }
    );
    const executeCallsBefore = handleExecuteTask.mock.calls.length;

    const result = await processNextJob(admin);

    expect(result).toMatchObject({
      processed: 1,
      job_id: 'lost-finalize-job',
      status: 'failed',
    });
    expect(handleExecuteTask.mock.calls.length - executeCallsBefore).toBe(1);
  });

  it('processes a specific job by ID when jobId is provided', async () => {
    const job = {
      id: 'specific-job',
      status: 'queued',
      payload: { type: 'run-llm', prompt: 'Test' },
      retry_count: 0,
      worker_scope: 'production',
      updated_at: '2026-08-22T20:00:00.000Z',
      error: null,
      result: null,
    };
    const admin = mockAdmin({ jobs: [job] });
    const result = await processNextJob(admin, null, 'specific-job');
    expect(result.processed).toBe(1);
    expect(result.job_id).toBe('specific-job');
    expect(result.status).toBe('done');
  });

  it('processes an already-confirmed dispatch lease without claiming it twice', async () => {
    const job = attachTestLease({
      id: 'preclaimed-job',
      user_id: 'test-user',
      status: 'running',
      payload: { type: 'run-llm', prompt: 'Test' },
      retry_count: 0,
      worker_scope: 'production',
      updated_at: '2026-08-22T20:00:00.000Z',
      error: null,
    });
    const admin = mockAdmin({ jobs: [job] });

    const result = await processNextJob(admin, null, job.id, { preclaimedJob: job });

    expect(result).toMatchObject({ processed: 1, job_id: job.id, status: 'done' });
    expect(admin._updateCalls.filter(({ patch }) => patch.status === 'running')).toHaveLength(0);
    expect(admin._updateCalls.at(-1).conditions).toContainEqual(['lease_token', job.lease_token]);
  });

  it('does not retry a preclaimed exact dispatch whose projected row budget is one attempt', async () => {
    executeLlm.mockRejectedValueOnce(new Error('transient provider failure'));
    const job = attachTestLease({
      id: 'preclaimed-single-attempt',
      user_id: 'test-user',
      status: 'running',
      payload: { type: 'run-llm', prompt: 'Test' },
      retry_count: 0,
      max_retries: 1,
      worker_scope: 'production',
      updated_at: '2026-08-22T20:00:00.000Z',
      error: null,
      result: null,
    });
    const admin = mockAdmin({ jobs: [job] });

    const result = await processNextJob(admin, null, job.id, { preclaimedJob: job });

    expect(result).toMatchObject({ processed: 1, job_id: job.id, status: 'failed' });
    expect(admin._updateCalls.some(({ patch }) => patch.status === 'queued')).toBe(false);
  });

  it('keeps a targeted Preview job with no goalId exact-one', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'exact-goal-job',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({ type: 'execute-task', taskId: 'target-task' }),
        retry_count: 0,
      },
      {
        id: 'unrelated-queued-job',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({ type: 'execute-task', taskId: 'unrelated-task' }),
        retry_count: 0,
      },
    ]);
    const executeCallsBefore = handleExecuteTask.mock.calls.length;

    try {
      const result = await processNextJob(admin, null, 'exact-goal-job');

      expect(result).toMatchObject({
        processed: 1,
        job_id: 'exact-goal-job',
        status: 'done',
      });
      expect(admin.claimedIds).toEqual(['exact-goal-job']);
      expect(admin.rows.get('exact-goal-job')).toMatchObject({ status: 'done' });
      expect(admin.rows.get('unrelated-queued-job')).toMatchObject({ status: 'queued' });
      expect(handleExecuteTask.mock.calls.length - executeCallsBefore).toBe(1);
    } finally {
      restorePreview();
    }
  });

  it('drains only causally captured jobs for the targeted Preview goal', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'targeted-goal-job',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'target-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      {
        id: 'unrelated-older-job',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'other-task',
          goalId: 'goal-other',
        }),
        retry_count: 0,
      },
      {
        id: 'same-goal-follow-up',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'next-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      {
        id: 'same-goal-grandchild',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'grandchild-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      {
        id: 'uncaptured-same-goal-job',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'uncaptured-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
    ]);
    const executeCallsBefore = handleExecuteTask.mock.calls.length;
    const nestedFetch = vi.fn();
    handleExecuteTask.mockImplementationOnce(async () => {
      triggerProcessNext({
        jobId: 'same-goal-follow-up',
        env: {
          WORKER_SECRET: 'worker-secret',
          VERCEL_URL: 'preview.example.test',
        },
        fetchImpl: nestedFetch,
      });
      return { type: 'execute-task', content: 'first done' };
    });
    handleExecuteTask.mockImplementationOnce(async () => {
      triggerProcessNext({
        jobId: 'same-goal-grandchild',
        env: {
          WORKER_SECRET: 'worker-secret',
          VERCEL_URL: 'preview.example.test',
        },
        fetchImpl: nestedFetch,
      });
      return { type: 'execute-task', content: 'child done' };
    });

    try {
      const result = await processNextJob(admin, null, 'targeted-goal-job');

      expect(result).toMatchObject({
        processed: 1,
        job_id: 'targeted-goal-job',
        status: 'done',
      });
      expect(admin.claimedIds).toEqual([
        'targeted-goal-job',
        'same-goal-follow-up',
        'same-goal-grandchild',
      ]);
      expect(admin.rows.get('targeted-goal-job')).toMatchObject({ status: 'done' });
      expect(admin.rows.get('same-goal-follow-up')).toMatchObject({ status: 'done' });
      expect(admin.rows.get('same-goal-grandchild')).toMatchObject({ status: 'done' });
      expect(admin.rows.get('unrelated-older-job')).toMatchObject({ status: 'queued' });
      expect(admin.rows.get('uncaptured-same-goal-job')).toMatchObject({ status: 'queued' });
      expect(handleExecuteTask.mock.calls.length - executeCallsBefore).toBe(3);
      expect(nestedFetch).not.toHaveBeenCalled();
    } finally {
      restorePreview();
    }
  });

  it('never claims captured cross-goal or wrong-type IDs and restores their exact wakes', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'targeted-parent',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'parent-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      {
        id: 'cross-goal-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'cross-task',
          goalId: 'goal-other',
        }),
        retry_count: 0,
      },
      {
        id: 'wrong-type-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'run-llm',
          prompt: 'Keep durable',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      {
        id: 'cross-deployment-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload(
          { type: 'execute-task', taskId: 'foreign-task', goalId: 'goal-target' },
          'vercel-deployment:dpl_other'
        ),
        retry_count: 0,
      },
      {
        id: 'unbound-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: { type: 'execute-task', taskId: 'unbound-task', goalId: 'goal-target' },
        retry_count: 0,
      },
    ]);
    handleExecuteTask.mockImplementationOnce(async () => {
      triggerProcessNext({ jobId: 'cross-goal-child' });
      triggerProcessNext({ jobId: 'wrong-type-child' });
      triggerProcessNext({ jobId: 'cross-deployment-child' });
      triggerProcessNext({ jobId: 'unbound-child' });
      return { type: 'execute-task', content: 'parent done' };
    });

    try {
      await withExactWakeSpy(async (fetchSpy) => {
        await processNextJob(admin, null, 'targeted-parent');

        expect(admin.claimedIds).toEqual(['targeted-parent']);
        expect(admin.rows.get('cross-goal-child')).toMatchObject({ status: 'queued' });
        expect(admin.rows.get('wrong-type-child')).toMatchObject({ status: 'queued' });
        expect(admin.rows.get('cross-deployment-child')).toMatchObject({ status: 'queued' });
        expect(admin.rows.get('unbound-child')).toMatchObject({ status: 'queued' });
        expect(fetchSpy.mock.calls.map(([url]) => new URL(url).searchParams.get('job_id'))).toEqual(
          ['cross-goal-child', 'wrong-type-child', 'cross-deployment-child', 'unbound-child']
        );
      });
    } finally {
      restorePreview();
    }
  });

  it('terminalizes an authority-invalid captured descendant without retry or handler work', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'authority-parent',
        user_id: 'test-user',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'authority-parent-task',
          goalId: 'authority-goal',
        }),
        retry_count: 0,
      },
      {
        id: 'authority-invalid-child',
        user_id: 'test-user',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'authority-child-task',
          goalId: 'authority-goal',
          userId: 'foreign-user',
        }),
        retry_count: 0,
      },
    ]);
    const executeCallsBefore = handleExecuteTask.mock.calls.length;
    handleExecuteTask.mockImplementationOnce(async () => {
      triggerProcessNext({ jobId: 'authority-invalid-child' });
      return { type: 'execute-task', content: 'parent done' };
    });

    try {
      const result = await processNextJob(admin, null, 'authority-parent');

      expect(result).toMatchObject({ status: 'done' });
      expect(admin.rows.get('authority-invalid-child')).toMatchObject({
        status: 'failed',
        retry_count: 0,
        result: null,
        error: expect.stringContaining('JOB_OWNER_VALIDATION_ERROR'),
      });
      expect(handleExecuteTask.mock.calls.length - executeCallsBefore).toBe(1);
    } finally {
      restorePreview();
    }
  });

  it('terminalizes an unwoken captured child and parks its owning Preview goal', async () => {
    const restorePreview = enterPreviewDeployment();
    const previousWorkerSecret = process.env.WORKER_SECRET;
    const previousVercelUrl = process.env.VERCEL_URL;
    delete process.env.WORKER_SECRET;
    delete process.env.VERCEL_URL;
    const admin = exactQueueAdmin(
      [
        {
          id: 'wake-failure-parent',
          status: 'queued',
          worker_scope: 'preview',
          payload: previewPayload({
            type: 'execute-task',
            taskId: 'wake-failure-parent-task',
            goalId: 'wake-failure-goal',
            _userId: 'wake-failure-user',
          }),
          retry_count: 0,
        },
        {
          id: 'unwoken-captured-child',
          status: 'queued',
          worker_scope: 'preview',
          payload: previewPayload({
            type: 'run-llm',
            prompt: 'must not remain queued',
            goalId: 'wake-failure-goal',
            _userId: 'wake-failure-user',
          }),
          retry_count: 0,
        },
      ],
      {
        initialGoals: [
          {
            id: 'wake-failure-goal',
            user_id: 'wake-failure-user',
            status: 'executing',
            data: { current_phase: 1 },
          },
        ],
      }
    );
    handleExecuteTask.mockImplementationOnce(async () => {
      triggerProcessNext({ jobId: 'unwoken-captured-child' });
      return { type: 'execute-task', content: 'parent done' };
    });

    try {
      const result = await processNextJob(admin, null, 'wake-failure-parent');

      expect(result).toMatchObject({ status: 'done' });
      expect(admin.rows.get('unwoken-captured-child')).toMatchObject({
        status: 'failed',
        result: null,
        error: expect.stringContaining('Preview captured job could not be awakened'),
      });
      expect(admin.goals.get('wake-failure-goal')).toMatchObject({
        status: 'needs_human',
        data: {
          current_phase: 1,
          agent_job_reconciliation: {
            status: 'wake_failed',
            code: 'preview_captured_job_wake_failed',
            job_id: 'unwoken-captured-child',
            reconciliation_required: true,
          },
        },
      });
      expect(admin.rows.get('unwoken-captured-child').status).not.toBe('queued');
    } finally {
      if (previousWorkerSecret === undefined) delete process.env.WORKER_SECRET;
      else process.env.WORKER_SECRET = previousWorkerSecret;
      if (previousVercelUrl === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = previousVercelUrl;
      restorePreview();
    }
  });

  it('requeues a throwing descendant and restores its exact retry wake', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'targeted-parent',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'parent-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      {
        id: 'throwing-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'throwing-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
    ]);
    handleExecuteTask
      .mockImplementationOnce(async () => {
        triggerProcessNext({ jobId: 'throwing-child' });
        return { type: 'execute-task', content: 'parent done' };
      })
      .mockRejectedValueOnce(new Error('descendant failed'));

    try {
      await withExactWakeSpy(async (fetchSpy) => {
        await processNextJob(admin, null, 'targeted-parent');

        expect(admin.rows.get('throwing-child')).toMatchObject({
          status: 'queued',
          retry_count: 1,
        });
        expect([...admin.rows.values()].some((row) => row.status === 'running')).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get('job_id')).toBe(
          'throwing-child'
        );
      });
    } finally {
      restorePreview();
    }
  });

  it('finalizes a permanently failing descendant instead of leaving it running', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'targeted-parent',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'parent-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      {
        id: 'terminal-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'terminal-task',
          goalId: 'goal-target',
        }),
        retry_count: 2,
      },
    ]);
    handleExecuteTask
      .mockImplementationOnce(async () => {
        triggerProcessNext({ jobId: 'terminal-child' });
        return { type: 'execute-task', content: 'parent done' };
      })
      .mockRejectedValueOnce(new Error('permanent descendant failure'));

    try {
      await withExactWakeSpy(async (fetchSpy) => {
        await processNextJob(admin, null, 'targeted-parent');

        expect(admin.rows.get('terminal-child')).toMatchObject({
          status: 'failed',
          retry_count: 2,
          error: 'permanent descendant failure',
        });
        expect([...admin.rows.values()].some((row) => row.status === 'running')).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    } finally {
      restorePreview();
    }
  });

  it('stops the captured chain when both descendant finalization transitions lose the lease', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin(
      [
        {
          id: 'targeted-parent',
          status: 'queued',
          worker_scope: 'preview',
          payload: previewPayload({
            type: 'execute-task',
            taskId: 'parent-task',
            goalId: 'goal-target',
          }),
          retry_count: 0,
        },
        {
          id: 'lost-finalize-child',
          status: 'queued',
          worker_scope: 'preview',
          payload: previewPayload({
            type: 'execute-task',
            taskId: 'first-child-task',
            goalId: 'goal-target',
          }),
          retry_count: 0,
        },
        {
          id: 'unconsumed-child',
          status: 'queued',
          worker_scope: 'preview',
          payload: previewPayload({
            type: 'execute-task',
            taskId: 'second-child-task',
            goalId: 'goal-target',
          }),
          retry_count: 0,
        },
      ],
      {
        rejectUpdate: ({ row, patch }) =>
          row.id === 'lost-finalize-child' && patch.status === 'done',
      }
    );
    const executeCallsBefore = handleExecuteTask.mock.calls.length;
    handleExecuteTask.mockImplementationOnce(async () => {
      triggerProcessNext({ jobId: 'lost-finalize-child' });
      triggerProcessNext({ jobId: 'unconsumed-child' });
      return { type: 'execute-task', content: 'parent done' };
    });
    handleExecuteTask.mockResolvedValueOnce({
      type: 'execute-task',
      content: 'first child done',
    });

    try {
      await withExactWakeSpy(async (fetchSpy) => {
        const result = await processNextJob(admin, null, 'targeted-parent');

        expect(result).toMatchObject({ status: 'done' });
        expect(admin.claimedIds).toEqual(['targeted-parent', 'lost-finalize-child']);
        expect(admin.rows.get('lost-finalize-child')).toMatchObject({ status: 'running' });
        expect(admin.rows.get('unconsumed-child')).toMatchObject({ status: 'queued' });
        expect(handleExecuteTask.mock.calls.length - executeCallsBefore).toBe(2);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get('job_id')).toBe(
          'unconsumed-child'
        );
      });
    } finally {
      restorePreview();
    }
  });

  it('restores the targeted job wake when its own retry is queued', async () => {
    const restorePreview = enterPreviewDeployment();
    const admin = exactQueueAdmin([
      {
        id: 'retrying-parent',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'parent-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
    ]);
    handleExecuteTask.mockRejectedValueOnce(new Error('parent failed'));

    try {
      await withExactWakeSpy(async (fetchSpy) => {
        const result = await processNextJob(admin, null, 'retrying-parent');

        expect(result).toMatchObject({ status: 'retrying', retry_count: 1 });
        expect(admin.rows.get('retrying-parent')).toMatchObject({
          status: 'queued',
          retry_count: 1,
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get('job_id')).toBe(
          'retrying-parent'
        );
      });
    } finally {
      restorePreview();
    }
  });

  it('restores captured child wakes left beyond the eight-job chain boundary', async () => {
    const restorePreview = enterPreviewDeployment();
    const children = Array.from({ length: 9 }, (_, index) => ({
      id: `bounded-child-${index + 1}`,
      status: 'queued',
      worker_scope: 'preview',
      payload: previewPayload({
        type: 'execute-task',
        taskId: `bounded-task-${index + 1}`,
        goalId: 'goal-target',
      }),
      retry_count: 0,
    }));
    const admin = exactQueueAdmin([
      {
        id: 'bounded-parent',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'parent-task',
          goalId: 'goal-target',
        }),
        retry_count: 0,
      },
      ...children,
      {
        id: 'unrelated-preview-job',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'other-task',
          goalId: 'goal-other',
        }),
        retry_count: 0,
      },
    ]);
    handleExecuteTask.mockImplementationOnce(async () => {
      for (const child of children) triggerProcessNext({ jobId: child.id });
      return { type: 'execute-task', content: 'parent done' };
    });

    try {
      await withExactWakeSpy(async (fetchSpy) => {
        await processNextJob(admin, null, 'bounded-parent');

        expect(admin.claimedIds).toEqual([
          'bounded-parent',
          ...children.slice(0, 8).map((child) => child.id),
        ]);
        for (const child of children.slice(0, 8)) {
          expect(admin.rows.get(child.id)).toMatchObject({ status: 'done' });
        }
        expect(admin.rows.get('bounded-child-9')).toMatchObject({ status: 'queued' });
        expect(admin.rows.get('unrelated-preview-job')).toMatchObject({ status: 'queued' });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get('job_id')).toBe(
          'bounded-child-9'
        );
      });
    } finally {
      restorePreview();
    }
  });

  it('terminalizes a timed-out attempt when its handler settles inside the abort grace window', async () => {
    const previousTimeout = process.env.JOB_TIMEOUT_MS;
    const executeCallsBefore = executeLlm.mock.calls.length;
    process.env.JOB_TIMEOUT_MS = '100';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));

    executeLlm.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                content: 'late but cancelled',
                usage: {},
                model: 'test-model',
                provider: 'test-provider',
              }),
            150
          );
        })
    );
    const admin = exactQueueAdmin([
      {
        id: 'settles-inside-grace',
        status: 'queued',
        worker_scope: 'production',
        payload: { type: 'run-llm', prompt: 'Settle after cancellation' },
        retry_count: 0,
      },
    ]);

    try {
      const processing = processNextJob(admin, null, 'settles-inside-grace');
      await flushFakeTimerMicrotasksUntil(
        () => executeLlm.mock.calls.length === executeCallsBefore + 1,
        'the timed handler to start'
      );
      await vi.advanceTimersByTimeAsync(150);

      const response = await processing;

      expect(response).toMatchObject({
        processed: 1,
        job_id: 'settles-inside-grace',
        status: 'failed',
      });
      expect(response.error).toBeUndefined();
      expect(admin.rows.get('settles-inside-grace')).toMatchObject({
        status: 'failed',
        error: 'Job settles-inside-grace timed out after 100ms',
        lease_token: null,
        heartbeat_at: null,
        lease_expires_at: null,
      });
      expect(
        admin.updateCalls.filter(
          ({ row, patch }) => row?.id === 'settles-inside-grace' && patch.status === 'queued'
        )
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      if (previousTimeout === undefined) delete process.env.JOB_TIMEOUT_MS;
      else process.env.JOB_TIMEOUT_MS = previousTimeout;
    }
  });

  it('leaves an abort-ignoring attempt running for lease-expiry recovery', async () => {
    const previousTimeout = process.env.JOB_TIMEOUT_MS;
    const executeCallsBefore = executeLlm.mock.calls.length;
    process.env.JOB_TIMEOUT_MS = '100';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));

    executeLlm.mockImplementationOnce(() => new Promise(() => {}));
    const admin = exactQueueAdmin([
      {
        id: 'unsettled-main-attempt',
        status: 'queued',
        worker_scope: 'production',
        payload: { type: 'run-llm', prompt: 'Ignore cancellation' },
        retry_count: 0,
      },
    ]);

    try {
      const processing = processNextJob(admin, null, 'unsettled-main-attempt');
      await flushFakeTimerMicrotasksUntil(
        () => executeLlm.mock.calls.length === executeCallsBefore + 1,
        'the abort-ignoring handler to start'
      );
      const claimedLeaseToken = admin.rows.get('unsettled-main-attempt').lease_token;
      await vi.advanceTimersByTimeAsync(100 + JOB_ABORT_SETTLEMENT_GRACE_MS);

      const response = await processing;

      expect(response).toMatchObject({
        processed: 1,
        job_id: 'unsettled-main-attempt',
        status: 'reconciliation_required',
        error: expect.stringContaining('did not settle after cancellation'),
      });
      expect(admin.rows.get('unsettled-main-attempt')).toMatchObject({
        status: 'running',
        retry_count: 0,
        result: null,
        error: null,
        lease_token: claimedLeaseToken,
      });
      expect(claimedLeaseToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(
        admin.updateCalls.filter(
          ({ row, patch }) =>
            row?.id === 'unsettled-main-attempt' &&
            ['queued', 'done', 'failed'].includes(patch.status)
        )
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      if (previousTimeout === undefined) delete process.env.JOB_TIMEOUT_MS;
      else process.env.JOB_TIMEOUT_MS = previousTimeout;
    }
  });

  it('does not retry or finalize an unsettled captured-chain descendant', async () => {
    const restorePreview = enterPreviewDeployment();
    const previousTimeout = process.env.EXECUTE_TASK_TIMEOUT_MS;
    const executeCallsBefore = handleExecuteTask.mock.calls.length;
    process.env.EXECUTE_TASK_TIMEOUT_MS = '100';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));

    const admin = exactQueueAdmin([
      {
        id: 'settlement-parent',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'settlement-parent-task',
          goalId: 'settlement-goal',
        }),
        retry_count: 0,
      },
      {
        id: 'unsettled-chain-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'unsettled-chain-task',
          goalId: 'settlement-goal',
        }),
        retry_count: 0,
      },
    ]);
    handleExecuteTask
      .mockImplementationOnce(async () => {
        triggerProcessNext({ jobId: 'unsettled-chain-child' });
        return { type: 'execute-task', content: 'parent done' };
      })
      .mockImplementationOnce(() => new Promise(() => {}));

    try {
      const processing = processNextJob(admin, null, 'settlement-parent');
      await flushFakeTimerMicrotasksUntil(
        () => handleExecuteTask.mock.calls.length === executeCallsBefore + 2,
        'the captured child handler to start'
      );
      const claimedLeaseToken = admin.rows.get('unsettled-chain-child').lease_token;
      await vi.advanceTimersByTimeAsync(100 + JOB_ABORT_SETTLEMENT_GRACE_MS);

      const response = await processing;

      expect(response).toMatchObject({
        processed: 1,
        job_id: 'settlement-parent',
        status: 'done',
      });
      expect(admin.rows.get('unsettled-chain-child')).toMatchObject({
        status: 'running',
        retry_count: 0,
        result: null,
        error: null,
        lease_token: claimedLeaseToken,
      });
      expect(
        admin.updateCalls.filter(
          ({ row, patch }) =>
            row?.id === 'unsettled-chain-child' &&
            ['queued', 'done', 'failed'].includes(patch.status)
        )
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      if (previousTimeout === undefined) delete process.env.EXECUTE_TASK_TIMEOUT_MS;
      else process.env.EXECUTE_TASK_TIMEOUT_MS = previousTimeout;
      restorePreview();
    }
  });

  it('does not finalize a captured-chain descendant after its exact lease token is lost', async () => {
    const restorePreview = enterPreviewDeployment();
    const replacementLeaseToken = '99999999-9999-4999-8999-999999999999';
    const admin = exactQueueAdmin([
      {
        id: 'lease-loss-parent',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'lease-loss-parent-task',
          goalId: 'lease-loss-goal',
        }),
        retry_count: 0,
      },
      {
        id: 'lease-loss-chain-child',
        status: 'queued',
        worker_scope: 'preview',
        payload: previewPayload({
          type: 'execute-task',
          taskId: 'lease-loss-chain-task',
          goalId: 'lease-loss-goal',
        }),
        retry_count: 0,
      },
    ]);
    handleExecuteTask
      .mockImplementationOnce(async () => {
        triggerProcessNext({ jobId: 'lease-loss-chain-child' });
        return { type: 'execute-task', content: 'parent done' };
      })
      .mockImplementationOnce(async (guardedAdmin) => {
        guardedAdmin.rows.get('lease-loss-chain-child').lease_token = replacementLeaseToken;
        return { type: 'execute-task', content: 'stale child result' };
      });

    try {
      const response = await processNextJob(admin, null, 'lease-loss-parent');

      expect(response).toMatchObject({
        processed: 1,
        job_id: 'lease-loss-parent',
        status: 'done',
      });
      expect(admin.rows.get('lease-loss-chain-child')).toMatchObject({
        status: 'running',
        retry_count: 0,
        result: null,
        error: null,
        lease_token: replacementLeaseToken,
      });
      expect(
        admin.updateCalls.filter(
          ({ row, patch }) =>
            row?.id === 'lease-loss-chain-child' &&
            ['queued', 'done', 'failed'].includes(patch.status)
        )
      ).toHaveLength(0);
    } finally {
      restorePreview();
    }
  });

  it('returns processed: 0 when specific job is already claimed', async () => {
    const job = { id: 'taken-job', payload: { type: 'run-llm', prompt: 'Test' }, retry_count: 0 };
    const admin = mockAdmin({ jobs: [job], claimOk: false });
    const result = await processNextJob(admin, null, 'taken-job');
    expect(result.processed).toBe(0);
  });
});

describe('run-llm agent memory gating', () => {
  // A supabase client whose agents lookup returns the given metadata.
  function agentMetaClient(metadata) {
    const filters = [];
    return {
      filters,
      from: vi.fn(() => ({
        select: vi.fn(function () {
          return this;
        }),
        eq: vi.fn(function (field, value) {
          filters.push([field, value]);
          return this;
        }),
        maybeSingle: vi.fn(async () => ({ data: { metadata }, error: null })),
      })),
    };
  }

  function runLlmJob(id) {
    return {
      id,
      user_id: 'u1',
      payload: {
        type: 'run-llm',
        prompt: 'Hi',
        _userId: 'u1',
        memory: { owner_type: 'agent', owner_id: 'a1' },
      },
      retry_count: 0,
    };
  }

  function memoryAuthorityAdmin(ownerType = 'agent') {
    return mockAdmin({
      tables:
        ownerType === 'team'
          ? {
              agent_teams: [{ id: 'a1', user_id: 'u1', is_active: true, updated_at: '2026-08-22' }],
            }
          : {
              agents: [
                {
                  id: 'a1',
                  user_id: 'u1',
                  name: 'Memory agent',
                  status: 'active',
                  capabilities: [],
                  metadata: {},
                },
              ],
            },
    });
  }

  it('injects memory when the agent is active (flag unset)', async () => {
    const admin = agentMetaClient({});
    buildSupabaseAdminClient.mockReturnValueOnce(admin);
    searchAgentMemory.mockClear();
    queryAgentGraph.mockClear();
    executeLlm.mockClear();
    await executeJob(memoryAuthorityAdmin(), runLlmJob('mem-on'), null);
    expect(searchAgentMemory).toHaveBeenCalledTimes(1);
    expect(admin.filters).toContainEqual(['user_id', 'u1']);
    expect(queryAgentGraph).toHaveBeenCalledWith('a1', 'Hi', admin, { userId: 'u1' });
    const llmRequest = executeLlm.mock.calls[0][0];
    expect(llmRequest.systemPrompt).toContain('TRUSTED MEMORY BOUNDARY RULE');
    expect(llmRequest.systemPrompt).not.toContain('[MEMORY]');
    expect(llmRequest.prompt).toContain('Hi');
    expect(llmRequest.prompt).toContain('[MEMORY]');
  });

  it('skips memory when the agent is explicitly deactivated', async () => {
    buildSupabaseAdminClient.mockReturnValueOnce(
      agentMetaClient({ long_term_memory_enabled: false })
    );
    searchAgentMemory.mockClear();
    await executeJob(memoryAuthorityAdmin(), runLlmJob('mem-off'), null);
    expect(searchAgentMemory).not.toHaveBeenCalled();
  });

  it('does not inject an agent graph for a non-agent memory owner', async () => {
    const admin = { from: vi.fn() };
    const job = runLlmJob('team-memory');
    job.payload.memory.owner_type = 'team';
    queryAgentGraph.mockClear();

    await executeJob(memoryAuthorityAdmin('team'), job, null);

    expect(searchAgentMemory).toHaveBeenCalledWith('Hi', 'u1', 'team', 'a1', {
      limit: 3,
      threshold: 0.3,
    });
    expect(queryAgentGraph).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });
});

describe('agent prompt tenant isolation', () => {
  it('scopes same-name service-role fallbacks to the payload owner', async () => {
    const filters = { agents: [], concilium_agents: [] };
    const admin = {
      from: vi.fn((table) => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn((field, value) => {
            filters[table].push([field, value]);
            return chain;
          }),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => {
            const ownerScoped = filters[table].some(
              ([field, value]) => field === 'user_id' && value === 'user-1'
            );
            return ownerScoped
              ? { data: null, error: null }
              : {
                  data: {
                    metadata: {
                      system_prompt: 'VICTIM TENANT PRIVATE PROMPT',
                      rules: { private_rule: 'VICTIM TENANT PRIVATE RULE' },
                    },
                  },
                  error: null,
                };
          }),
        };
        return chain;
      }),
    };
    buildSupabaseAdminClient.mockReturnValue(admin);

    const prompt = await buildAgentSystemPrompt('Shared Name', null, {
      _userId: 'user-1',
    });

    expect(filters.agents).toContainEqual(['user_id', 'user-1']);
    expect(filters.concilium_agents).toContainEqual(['user_id', 'user-1']);
    expect(prompt).not.toContain('VICTIM TENANT PRIVATE');
  });

  it('treats an intentionally empty owned prompt as authoritative', async () => {
    const admin = { from: vi.fn() };
    buildSupabaseAdminClient.mockReturnValue(admin);

    const prompt = await buildAgentSystemPrompt('Shared Name', null, {
      _userId: 'user-1',
      _agentId: 'blueprint-1',
      system_prompt: '',
    });

    expect(prompt).toContain('You are Shared Name');
    expect(admin.from).not.toHaveBeenCalled();
  });
});
