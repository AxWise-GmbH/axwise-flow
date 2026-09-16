import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWakeAgentJobExact, mockTriggerProcessNext } = vi.hoisted(() => ({
  mockWakeAgentJobExact: vi.fn(),
  mockTriggerProcessNext: vi.fn(),
}));

vi.mock('../agent-handlers/job-processor.js', () => ({ processNextJob: vi.fn() }));
vi.mock('../goal-handlers/_helpers.js', () => ({
  triggerProcessNext: mockTriggerProcessNext,
  updateGoalIfNativeScopeBinding: vi.fn(),
  wakeAgentJobExact: mockWakeAgentJobExact,
}));

import { processNextJob } from '../agent-handlers/job-processor.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../goal-handlers/approval-audit.js';
import { selectWorkShapePlaybook } from '../goal-handlers/work-shape-playbooks.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';
import { handleProvideTools } from './goals.js';

const user = { id: 'user-1' };
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
const ORIGINAL_VERCEL_DEPLOYMENT_ID = process.env.VERCEL_DEPLOYMENT_ID;

function jsonPathValue(row, field) {
  const parts = String(field)
    .split(/->>?/)
    .map((part) => part.replace(/^>+/, ''));
  return parts.reduce((value, part) => value?.[part], row);
}

function valuesMatch(actual, expected) {
  return actual === expected || String(actual) === String(expected);
}

function makeThenable(resolveResult) {
  let resultPromise;
  const run = () => (resultPromise ||= Promise.resolve().then(resolveResult));
  return {
    then(resolve, reject) {
      return run().then(resolve, reject);
    },
  };
}

function toolAttempt(overrides = {}) {
  return {
    version: 'orqaly_tool_provisioning_attempt_v1',
    attempt_id: 'tool-attempt-1',
    scope_hash: null,
    team_formation_attempt_id: 'team-attempt-1',
    status: 'awaiting_user',
    started_at: '2026-08-24T08:59:00.000Z',
    source_goal_updated_at: '2026-08-24T08:58:00.000Z',
    completed_at: '2026-08-24T09:00:00.000Z',
    ...overrides,
  };
}

function teamAttempt(overrides = {}) {
  return {
    version: 'orqaly_team_formation_attempt_v1',
    attempt_id: 'team-attempt-1',
    scope_hash: null,
    status: 'completed',
    started_at: '2026-08-24T08:57:00.000Z',
    completed_at: '2026-08-24T08:58:00.000Z',
    ...overrides,
  };
}

function baseGoal({ attempt = toolAttempt(), data = {}, ...overrides } = {}) {
  return {
    id: 'goal-1',
    user_id: user.id,
    status: 'awaiting_tools',
    title: 'Prepare the accepted deliverable',
    description: 'Use the accepted scope.',
    plan: {},
    updated_at: '2026-08-24T09:00:00.000Z',
    data: {
      required_tools: [],
      team_formation_attempt: teamAttempt(),
      tool_provisioning_attempt: attempt,
      ...data,
    },
    ...overrides,
  };
}

function nativeGoal({ nativeAttempt = null } = {}) {
  const admission = {
    version: 'axwise_scope_admission_v1',
    work_types: ['software_development'],
    geographies: [],
    channels: [],
    success_criteria: ['Deliver the accepted canonical work shape.'],
    required_capabilities: [],
    requested_actions: [],
  };
  const packet = nativeScopePacketFixture({ admission });
  const decision = nativeDecisionContractsFixture(packet);
  const goal = baseGoal();
  goal.data.axwise_customer_intelligence = {
    scope_packet: packet,
    scope_validation: decision.scope_validation,
    axwise_scope_confirmation: decision.scope_confirmation,
    scope_contract_binding: decision.scope_contract_binding,
    research_execution_inputs_hash: decision.research_execution_inputs_hash,
    generation: 'generation-1',
    updated_at: '2026-08-24T08:00:00.000Z',
  };
  const route = selectWorkShapePlaybook({ goal, scopePacket: packet });
  goal.data.work_shape_route = route;
  goal.data.scope_admission = {
    version: 1,
    native_scope: true,
    status: 'accepted',
    state_key: 'axwise_customer_intelligence',
    scope_hash: packet.scope_hash,
    playbook_id: route.playbook_id,
    route_version: route.version,
    accepted_at: '2026-08-24T08:00:00.000Z',
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
  };
  goal.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
  };
  const attempt = toolAttempt({ scope_hash: packet.scope_hash });
  const formationAttempt = teamAttempt({ scope_hash: packet.scope_hash });
  goal.data.team_formation_attempt = formationAttempt;
  goal.data.native_team_formation_attempt = { ...formationAttempt };
  goal.data.tool_provisioning_attempt = attempt;
  goal.data.native_tool_provisioning_attempt = nativeAttempt || { ...attempt };
  return { goal, packet };
}

function makeAdmin({ goal = baseGoal(), jobInsertError = null, missGoalCas = false } = {}) {
  const state = {
    goal: structuredClone(goal),
    jobs: [],
    logs: [],
    goalUpdates: [],
  };

  function filteredQuery({ row, update = null, table, forceMiss = false }) {
    const filters = [];
    const query = {
      eq: vi.fn((field, value) => {
        filters.push([field, value]);
        return query;
      }),
      is: vi.fn((field, value) => {
        filters.push([field, value]);
        return query;
      }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => {
        const matches =
          !forceMiss &&
          filters.every(([field, value]) => valuesMatch(jsonPathValue(row(), field), value));
        if (!matches) return { data: null, error: null };
        if (update) {
          const patch = update();
          if (table === 'goals') state.goal = { ...state.goal, ...structuredClone(patch) };
          if (table === 'agent_jobs') {
            const index = state.jobs.findIndex((job) => job.id === row().id);
            state.jobs[index] = { ...state.jobs[index], ...structuredClone(patch) };
          }
        }
        return { data: structuredClone(row()), error: null };
      }),
      single: vi.fn(async () => ({ data: structuredClone(row()), error: null })),
    };
    return query;
  }

  const tables = {
    goals: {
      select: vi.fn(() => filteredQuery({ row: () => state.goal, table: 'goals' })),
      update: vi.fn((patch) => {
        const record = { patch: structuredClone(patch), filters: null };
        state.goalUpdates.push(record);
        const query = filteredQuery({
          row: () => state.goal,
          update: () => patch,
          table: 'goals',
          forceMiss: missGoalCas && state.goalUpdates.length === 1,
        });
        record.filters = query.eq.mock.calls;
        return query;
      }),
    },
    agent_jobs: {
      insert: vi.fn((job) =>
        makeThenable(() => {
          if (!jobInsertError) {
            state.jobs.push({
              ...structuredClone(job),
              worker_scope: process.env.VERCEL_ENV === 'preview' ? 'preview' : 'production',
            });
          }
          return { data: null, error: jobInsertError };
        })
      ),
      select: vi.fn(() => {
        let selected = null;
        const query = {
          eq: vi.fn((field, value) => {
            if (field === 'id') selected = state.jobs.find((job) => job.id === value) || null;
            return query;
          }),
          maybeSingle: vi.fn(async () => ({ data: structuredClone(selected), error: null })),
        };
        return query;
      }),
      update: vi.fn((patch) => {
        let selected = null;
        const query = {
          eq: vi.fn((field, value) => {
            if (field === 'id') selected = state.jobs.find((job) => job.id === value) || null;
            return query;
          }),
          select: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (!selected) return { data: null, error: null };
            selected = Object.assign(selected, structuredClone(patch));
            return { data: structuredClone(selected), error: null };
          }),
        };
        return query;
      }),
    },
    goal_log: {
      insert: vi.fn((row) =>
        makeThenable(() => {
          state.logs.push(structuredClone(row));
          return { data: null, error: null };
        })
      ),
    },
  };

  return {
    state,
    tables,
    from: vi.fn((table) => tables[table]),
  };
}

describe('handleProvideTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processNextJob.mockResolvedValue({ processed: 1 });
    mockTriggerProcessNext.mockResolvedValue(true);
    mockWakeAgentJobExact.mockResolvedValue({ triggered: true });
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  afterEach(() => {
    if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
    if (ORIGINAL_VERCEL_DEPLOYMENT_ID === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
    else process.env.VERCEL_DEPLOYMENT_ID = ORIGINAL_VERCEL_DEPLOYMENT_ID;
  });

  it('advances only the exact awaiting-user attempt and leaves planned tasks untouched', async () => {
    const admin = makeAdmin();

    const result = await handleProvideTools(admin, user, { id: 'goal-1' });

    expect(result).toEqual({
      status: 200,
      data: {
        id: 'goal-1',
        status: 'estimating',
        stillUnconfigured: [],
        skip_tools: false,
      },
    });
    expect(admin.state.goal).toMatchObject({
      status: 'estimating',
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'team-attempt-1',
          status: 'completed',
        },
        tool_provisioning_attempt: {
          version: 'orqaly_tool_provisioning_attempt_v1',
          attempt_id: 'tool-attempt-1',
          status: 'completed',
        },
      },
    });
    expect(admin.state.goalUpdates[0].filters).toEqual(
      expect.arrayContaining([
        ['user_id', user.id],
        ['status', 'awaiting_tools'],
        ['updated_at', '2026-08-24T09:00:00.000Z'],
        ['data->team_formation_attempt->>attempt_id', 'team-attempt-1'],
        ['data->team_formation_attempt->>status', 'completed'],
        ['data->tool_provisioning_attempt->>attempt_id', 'tool-attempt-1'],
        ['data->tool_provisioning_attempt->>status', 'awaiting_user'],
      ])
    );
    expect(admin.from).not.toHaveBeenCalledWith('team_tasks');
    const insertedJob = admin.tables.agent_jobs.insert.mock.calls[0][0];
    expect(insertedJob.payload).toMatchObject({
      action: 'discovery-estimation',
      goalId: 'goal-1',
    });
    expect(processNextJob).toHaveBeenCalledWith(admin, null, insertedJob.id);
  });

  it('does not revive a cancelled checkpoint', async () => {
    const admin = makeAdmin({ goal: baseGoal({ status: 'cancelled' }) });

    const result = await handleProvideTools(admin, user, { id: 'goal-1' });

    expect(result).toMatchObject({ status: 400 });
    expect(admin.tables.goals.update).not.toHaveBeenCalled();
    expect(admin.tables.agent_jobs.insert).not.toHaveBeenCalled();
  });

  it('fails closed when the common attempt is missing or no longer awaiting the user', async () => {
    const admin = makeAdmin({
      goal: baseGoal({ attempt: toolAttempt({ status: 'completed', attempt_id: '' }) }),
    });

    const result = await handleProvideTools(admin, user, { id: 'goal-1' });

    expect(result).toMatchObject({ status: 409, error: expect.stringContaining('checkpoint') });
    expect(admin.tables.goals.update).not.toHaveBeenCalled();
    expect(admin.tables.agent_jobs.insert).not.toHaveBeenCalled();
  });

  it('fails closed when the tool attempt is linked to a different team formation', async () => {
    const admin = makeAdmin({
      goal: baseGoal({
        attempt: toolAttempt({ team_formation_attempt_id: 'superseded-team-attempt' }),
      }),
    });

    const result = await handleProvideTools(admin, user, { id: 'goal-1' });

    expect(result).toMatchObject({ status: 409, error: expect.stringContaining('checkpoint') });
    expect(admin.tables.goals.update).not.toHaveBeenCalled();
    expect(admin.tables.agent_jobs.insert).not.toHaveBeenCalled();
  });

  it('returns stale-state conflict when the exact updated-at/attempt CAS loses', async () => {
    const admin = makeAdmin({ missGoalCas: true });

    const result = await handleProvideTools(admin, user, { id: 'goal-1' });

    expect(result).toMatchObject({ status: 409, error: expect.stringContaining('checkpoint') });
    expect(admin.tables.agent_jobs.insert).not.toHaveBeenCalled();
    expect(admin.state.goal.status).toBe('awaiting_tools');
  });

  it('rejects a native alias that differs from the canonical common attempt or scope', async () => {
    const { goal, packet } = nativeGoal();
    goal.data.native_tool_provisioning_attempt = {
      ...goal.data.native_tool_provisioning_attempt,
      attempt_id: 'stale-native-attempt',
      scope_hash: packet.scope_hash,
    };
    const admin = makeAdmin({ goal });

    const result = await handleProvideTools(admin, user, { id: goal.id });

    expect(result).toMatchObject({ status: 409, error: expect.stringContaining('AxWise') });
    expect(admin.tables.goals.update).not.toHaveBeenCalled();
    expect(admin.tables.agent_jobs.insert).not.toHaveBeenCalled();
  });

  it('rejects a native team mirror that differs from the completed common formation', async () => {
    const { goal } = nativeGoal();
    goal.data.native_team_formation_attempt = {
      ...goal.data.native_team_formation_attempt,
      attempt_id: 'stale-native-team-attempt',
    };
    const admin = makeAdmin({ goal });

    const result = await handleProvideTools(admin, user, { id: goal.id });

    expect(result).toMatchObject({ status: 409, error: expect.stringContaining('AxWise') });
    expect(admin.tables.goals.update).not.toHaveBeenCalled();
    expect(admin.tables.agent_jobs.insert).not.toHaveBeenCalled();
  });

  it('completes identical common/native attempts under the canonical scope', async () => {
    const { goal, packet } = nativeGoal();
    const admin = makeAdmin({ goal });

    const result = await handleProvideTools(admin, user, { id: goal.id });

    expect(result.status).toBe(200);
    expect(admin.state.goal.data.tool_provisioning_attempt).toEqual(
      admin.state.goal.data.native_tool_provisioning_attempt
    );
    expect(admin.state.goal.data.native_tool_provisioning_attempt).toMatchObject({
      attempt_id: 'tool-attempt-1',
      scope_hash: packet.scope_hash,
      status: 'completed',
    });
    expect(admin.state.goalUpdates[0].filters).toEqual(
      expect.arrayContaining([
        ['data->native_team_formation_attempt->>attempt_id', 'team-attempt-1'],
        ['data->native_team_formation_attempt->>scope_hash', packet.scope_hash],
        ['data->native_tool_provisioning_attempt->>attempt_id', 'tool-attempt-1'],
        ['data->native_tool_provisioning_attempt->>scope_hash', packet.scope_hash],
      ])
    );
  });

  it('restores the exact attempt-bound gate when enqueue fails', async () => {
    const originalGoal = baseGoal();
    const admin = makeAdmin({
      goal: originalGoal,
      jobInsertError: { message: 'queue unavailable' },
    });

    const result = await handleProvideTools(admin, user, { id: originalGoal.id });

    expect(result).toMatchObject({
      status: 503,
      error: expect.stringContaining('exact tool gate was restored'),
      data: { retry_safe: true },
    });
    expect(admin.state.goal.status).toBe('awaiting_tools');
    expect(admin.state.goal.data).toEqual(originalGoal.data);
    expect(admin.state.goalUpdates[1].filters).toEqual(
      expect.arrayContaining([
        ['status', 'estimating'],
        ['updated_at', admin.state.goalUpdates[0].patch.updated_at],
        ['data->team_formation_attempt->>attempt_id', 'team-attempt-1'],
        ['data->tool_provisioning_attempt->>attempt_id', 'tool-attempt-1'],
        ['data->tool_provisioning_attempt->>status', 'completed'],
      ])
    );
    expect(processNextJob).not.toHaveBeenCalled();
  });

  it('uses the same exact rollback when a Preview handoff is safely rejected', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'deployment-test';
    mockWakeAgentJobExact.mockResolvedValue({ triggered: false });
    const originalGoal = baseGoal();
    const admin = makeAdmin({ goal: originalGoal });

    const result = await handleProvideTools(admin, user, { id: originalGoal.id });

    expect(result).toMatchObject({ status: 503, data: { retry_safe: true } });
    expect(admin.state.jobs[0]).toMatchObject({ status: 'failed' });
    expect(admin.state.goal.status).toBe('awaiting_tools');
    expect(admin.state.goal.data).toEqual(originalGoal.data);
    expect(admin.state.goalUpdates.at(-1).filters).toEqual(
      expect.arrayContaining([
        ['status', 'estimating'],
        ['data->tool_provisioning_attempt->>attempt_id', 'tool-attempt-1'],
        ['data->tool_provisioning_attempt->>status', 'completed'],
      ])
    );
  });

  it('records an explicit no-tools choice on the exact checkpoint', async () => {
    const admin = makeAdmin({
      goal: baseGoal({
        data: { required_tools: ['tool-web-search'], skip_tools: false },
      }),
    });

    const result = await handleProvideTools(admin, user, { id: 'goal-1', skip: 'true' });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'estimating', skip_tools: true },
    });
    expect(admin.state.goal.data).toMatchObject({
      skip_tools: true,
      skip_tools_reason: 'User chose to continue without external tools',
      tool_mode: 'no_tools',
      required_tools: [],
      unconfigured_tools: [],
      waived_tools: ['tool-web-search'],
      tool_provisioning_attempt: { status: 'completed' },
    });
  });
});
