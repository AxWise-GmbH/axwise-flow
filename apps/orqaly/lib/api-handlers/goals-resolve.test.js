/**
 * Tests for handleResolve — focused on the `disable_tools` resolution type
 * (one-shot "retry without tools") added for the team-lead chat.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../agent-handlers/job-processor.js', () => ({
  processNextJob: vi.fn().mockResolvedValue({ processed: 0 }),
}));
vi.mock('../goal-handlers/_helpers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  triggerProcessNext: vi.fn(),
}));

import { handleResolve } from './goals.js';
import { processNextJob } from '../agent-handlers/job-processor.js';
import {
  acceptedNativeGoalFixture,
  initialNativeScopeAdmissionGoalFixture,
} from '../_shared/native-goal-authority.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../goal-handlers/approval-audit.js';

const user = { id: 'user-1' };

function makeAdmin({ goal, casUpdated = true, jobInsertError = null }) {
  const captured = {
    goalUpdate: null,
    goalUpdates: [],
    goalUpdateFilters: [],
    job: null,
    log: null,
  };
  const updateChain = {
    eq: vi.fn((...args) => {
      captured.goalUpdateFilters.push(args);
      return updateChain;
    }),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: casUpdated ? { id: goal.id, status: captured.goalUpdate?.status } : null,
      error: null,
    })),
    then(resolve, reject) {
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  const goals = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: goal, error: null }),
    update: vi.fn((u) => {
      captured.goalUpdate = u;
      captured.goalUpdates.push(u);
      return updateChain;
    }),
  };
  const agent_jobs = {
    insert: vi.fn((p) => {
      captured.job = p;
      return Promise.resolve({ error: jobInsertError });
    }),
    select: vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
  };
  const goal_log = {
    insert: vi.fn((p) => {
      captured.log = p;
      return Promise.resolve({ error: null });
    }),
  };
  const tables = { goals, agent_jobs, goal_log };
  return { admin: { from: vi.fn((t) => tables[t]) }, captured };
}

describe('handleResolve — disable_tools', () => {
  it('sets skip_tools and re-enqueues execute-phase with the phase index', async () => {
    const goal = {
      id: 'g1',
      status: 'failed',
      data: { existing: 1 },
      plan: { phases: [{}] },
      user_id: 'user-1',
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: 'g1',
      resolution: { type: 'disable_tools', data: { phaseIndex: 2, reason: 'missing API key' } },
    });

    expect(result.status).toBe(200);
    expect(captured.goalUpdate.data.skip_tools).toBe(true);
    expect(captured.goalUpdate.data.skip_tools_reason).toBe('missing API key');
    expect(captured.goalUpdate.data.existing).toBe(1); // preserves prior data
    expect(captured.job.payload.type).toBe('orchestrate-goal');
    expect(captured.job.payload.action).toBe('execute-phase');
    expect(captured.job.payload.phaseIndex).toBe(2);
    expect(captured.job.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(processNextJob).toHaveBeenCalledWith(admin, null, captured.job.id);
    expect(processNextJob).not.toHaveBeenCalledWith(admin, null);
  });

  it('omits phaseIndex when not an integer', async () => {
    const goal = {
      id: 'g1',
      status: 'needs_human',
      data: {},
      plan: { phases: [{}] },
      user_id: 'user-1',
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: 'g1',
      resolution: { type: 'disable_tools', data: {} },
    });

    expect(result.status).toBe(200);
    expect(captured.goalUpdate.data.skip_tools).toBe(true);
    expect('phaseIndex' in captured.job.payload).toBe(false);
  });

  it('rejects a goal whose status is not resolvable', async () => {
    const goal = { id: 'g1', status: 'active', data: {}, plan: { phases: [] }, user_id: 'user-1' };
    const { admin } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: 'g1',
      resolution: { type: 'disable_tools', data: {} },
    });

    expect(result.status).toBe(400);
    expect(result.error).toMatch(/not resolvable/i);
  });
});

describe('handleResolve — retry_from_stage failure cleanup', () => {
  const RETRY_STAGE_CASES = [
    ['scope-admission', 'analyzing'],
    ['feasibility-analysis', 'feasibility'],
    ['po-analysis', 'analyzing'],
    ['pm-planning', 'planning'],
    ['team-formation', 'forming_team'],
    ['tool-provisioning', 'provisioning_tools'],
    ['execute-phase', 'active'],
    ['evaluate-phase', 'active'],
    ['iterate', 'active'],
  ];

  it.each(RETRY_STAGE_CASES)(
    'restores %s to its eligible %s lifecycle state before queueing',
    async (stage, expectedStatus) => {
      const goal = {
        id: `g-key-retry-${stage}`,
        status: 'needs_human',
        user_id: 'user-1',
        data: {
          existing: 1,
          failure_code: 'llm_api_key_required',
          failure_reason: 'Connect a Gemini API key.',
          failure_stage: stage,
          recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
          failure_at: '2026-08-22T10:00:00.000Z',
          failure_stack: 'internal stack that must not survive recovery',
          failed_at: '2026-08-22T10:00:00.000Z',
        },
        plan: { phases: [{ status: 'executing' }] },
      };
      const { admin, captured } = makeAdmin({ goal });

      const result = await handleResolve(admin, user, {
        goalId: goal.id,
        resolution: {
          type: 'retry_from_stage',
          data: { stage },
        },
      });

      expect(result).toMatchObject({
        status: 200,
        data: { status: expectedStatus, next_stage: stage },
      });
      expect(captured.goalUpdate.status).toBe(expectedStatus);
      expect(captured.job.payload).toMatchObject({
        type: 'orchestrate-goal',
        action: stage,
        goalId: goal.id,
      });
    }
  );

  it('clears every actionable failure field before re-queueing the selected stage', async () => {
    const goal = {
      id: 'g-key-retry',
      status: 'needs_human',
      user_id: 'user-1',
      data: {
        existing: 1,
        failure_code: 'llm_api_key_required',
        failure_reason: 'Connect a Gemini API key.',
        failure_stage: 'feasibility-analysis',
        failure_phase_index: 2,
        recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
        failure_at: '2026-08-22T10:00:00.000Z',
        failure_stack: 'internal stack that must not survive recovery',
        failed_at: '2026-08-22T10:00:00.000Z',
      },
      plan: { phases: [] },
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: {
        type: 'retry_from_stage',
        data: { stage: 'feasibility-analysis' },
      },
    });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'feasibility', next_stage: 'feasibility-analysis' },
    });
    expect(captured.goalUpdate.data).toMatchObject({
      existing: 1,
      failure_code: null,
      failure_reason: null,
      failure_stage: null,
      failure_phase_index: null,
      recovery_action: null,
      failure_at: null,
      failure_stack: null,
      failed_at: null,
    });
    expect(captured.job.payload).toMatchObject({
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: goal.id,
    });
  });

  it('re-queues the exact nonzero execute phase recorded by key recovery', async () => {
    const goal = {
      id: 'g-key-retry-phase-2',
      status: 'needs_human',
      user_id: 'user-1',
      data: {
        failure_code: 'llm_api_key_required',
        failure_stage: 'execute-phase',
        failure_phase_index: 2,
      },
      plan: { phases: [{ status: 'completed' }, { status: 'completed' }, { status: 'executing' }] },
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: {
        type: 'retry_from_stage',
        data: { stage: 'execute-phase', phaseIndex: 2 },
      },
    });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'active', next_stage: 'execute-phase' },
    });
    expect(captured.job.payload).toMatchObject({
      type: 'orchestrate-goal',
      action: 'execute-phase',
      goalId: goal.id,
      phaseIndex: 2,
    });
    expect(captured.goalUpdate.data.failure_phase_index).toBeNull();
  });

  it('rejects stages outside the server lifecycle map without mutating or queueing', async () => {
    const goal = {
      id: 'g-key-retry-invalid',
      status: 'needs_human',
      user_id: 'user-1',
      data: {},
      plan: { phases: [] },
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: {
        type: 'retry_from_stage',
        data: { stage: 'customer-intelligence' },
      },
    });

    expect(result.status).toBe(400);
    expect(result.error).toMatch(/stage must be one of/i);
    expect(captured.goalUpdate).toBeNull();
    expect(captured.job).toBeNull();
  });
});

describe('handleResolve — native canonical re-entry', () => {
  it('treats a native patch_plan as advisory PM input instead of applying raw phases', async () => {
    const goal = acceptedNativeGoalFixture({
      id: 'g-native-patch-plan',
      status: 'failed',
      plan: { phases: [{ name: 'Accepted old plan', status: 'failed' }] },
    });
    goal.data.goal_approvals.execution = {
      status: 'approved',
      snapshot_hash: 'old-gate-2',
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: {
        type: 'patch_plan',
        data: { phases: [{ name: 'Owner suggestion', status: 'pending' }] },
      },
    });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'planning', next_stage: 'pm-planning' },
    });
    expect(captured.goalUpdate).not.toHaveProperty('plan');
    expect(captured.goalUpdate).toMatchObject({
      status: 'planning',
      agent_team_id: null,
      team_id: null,
      data: {
        goal_approvals: {
          context: expect.objectContaining({ status: 'approved' }),
          execution: expect.objectContaining({ status: 'invalidated' }),
        },
        native_execution_plan_revision: {
          status: 'requested',
          resolution_type: 'patch_plan',
          feedback: expect.stringContaining('Owner suggestion'),
        },
      },
    });
    expect(captured.job.payload).toMatchObject({
      action: 'pm-planning',
      goalId: goal.id,
    });
    expect(['po-analysis', 'feasibility-analysis', 'iterate']).not.toContain(
      captured.job.payload.action
    );
  });

  it.each([
    ['retry_from_stage', { stage: 'feasibility-analysis' }],
    ['custom_instruction', { note: 'Use a separate logistics workstream.' }],
  ])('routes native %s through canonical PM planning', async (type, data) => {
    const goal = acceptedNativeGoalFixture({ id: `g-native-${type}`, status: 'needs_human' });
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type, data },
    });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'planning', next_stage: 'pm-planning' },
    });
    expect(captured.job.payload.action).toBe('pm-planning');
  });

  it('uses scope-admission only for a durable pending native correction', async () => {
    const goal = acceptedNativeGoalFixture({
      id: 'g-native-pending-correction',
      status: 'needs_human',
    });
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-resolve-current',
      kind: 'scope_correction',
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type: 'custom_instruction', data: { note: 'Continue the correction.' } },
    });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'analyzing', next_stage: 'scope-admission' },
    });
    expect(captured.job.payload).toMatchObject({
      action: 'scope-admission',
      scope_revision_token: 'revision-resolve-current',
    });
  });

  it('does not reinterpret damaged native authority as a legacy retry', async () => {
    const goal = acceptedNativeGoalFixture({ id: 'g-native-damaged', status: 'failed' });
    goal.data.axwise_customer_intelligence.scope_packet = null;
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type: 'custom_instruction', data: { note: 'Retry it.' } },
    });

    expect(result.status).toBe(409);
    expect(captured.goalUpdate).toBeNull();
    expect(captured.job).toBeNull();
  });

  it('routes a pre-packet native resolution back to its exact initial admission', async () => {
    const goal = initialNativeScopeAdmissionGoalFixture({
      id: 'g-initial-native-resolve',
      status: 'failed',
    });
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: {
        type: 'patch_plan',
        data: { phases: [{ name: 'Must not persist raw', status: 'pending' }] },
      },
    });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'analyzing', next_stage: 'scope-admission' },
    });
    expect(captured.goalUpdate).not.toHaveProperty('plan');
    expect(captured.job.payload).toMatchObject({
      action: 'scope-admission',
      goalId: goal.id,
    });
    expect(captured.job.payload).not.toHaveProperty('scope_revision_token');
    expect(captured.goalUpdateFilters).toEqual(
      expect.arrayContaining([
        ['updated_at', goal.updated_at],
        ['data->smart_request_admission->>status', 'enqueue_failed'],
        ['data->scope_admission->>status', 'queued'],
      ])
    );
  });
});

describe('handleResolve — retry_customer_research', () => {
  const blockedGoal = (overrides = {}) => ({
    id: 'g-research',
    status: 'needs_human',
    updated_at: '2026-08-24T08:00:00.000Z',
    user_id: 'user-1',
    data: {
      existing: 1,
      research_policy: { research_mode: 'grounded_deep' },
      axwise_customer_intelligence: {
        status: 'required_research_blocked',
        decision_id: 'decision-failed',
        job_id: 'job-failed',
        retry_count: 0,
        research_failure: { code: 'grounding_failed', retryable: true },
      },
    },
    plan: { phases: [] },
    ...overrides,
  });

  it('atomically queues a fresh customer-intelligence attempt and clears stale output', async () => {
    const { admin, captured } = makeAdmin({ goal: blockedGoal() });

    const result = await handleResolve(admin, user, {
      goalId: 'g-research',
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result).toMatchObject({
      status: 200,
      data: {
        status: 'researching_customer',
        next_stage: 'customer-intelligence',
        resolution_type: 'retry_customer_research',
      },
    });
    expect(captured.goalUpdate.status).toBe('researching_customer');
    expect(captured.goalUpdate.data.axwise_customer_intelligence).toMatchObject({
      status: 'retry_queued',
      retry_count: 1,
      retry_of_decision_id: 'decision-failed',
      retry_of_job_id: 'job-failed',
      decision_id: null,
      job_id: null,
      request_hash: null,
      persona_resolution: null,
      progress_percentage: 0,
    });
    expect(captured.job).toMatchObject({
      status: 'queued',
      worker_scope: expect.any(String),
      payload: { type: 'orchestrate-goal', action: 'customer-intelligence', goalId: 'g-research' },
    });
  });

  it('retries accepted-native research through a fresh admission-only evidence proposal', async () => {
    const goal = acceptedNativeGoalFixture({
      id: 'g-native-research-retry',
      status: 'needs_human',
    });
    const packet = goal.data.axwise_customer_intelligence.scope_packet;
    const validation = goal.data.axwise_customer_intelligence.scope_validation;
    const confirmation = goal.data.axwise_customer_intelligence.axwise_scope_confirmation;
    Object.assign(goal.data.axwise_customer_intelligence, {
      status: 'required_research_blocked',
      decision_id: 'decision-native-failed',
      job_id: 'job-native-failed',
      retry_count: 0,
      research_failure: {
        code: 'grounding_failed',
        message: 'The required evidence run failed.',
        retryable: true,
      },
    });
    goal.data.research_policy = { research_mode: 'grounded_deep', required: true };
    goal.data.goal_approvals.context = approvedApproval(
      'context',
      buildContextApprovalSnapshot(goal),
      goal.user_id
    );
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result).toMatchObject({
      status: 200,
      data: {
        status: 'researching_customer',
        next_stage: 'customer-intelligence',
      },
    });
    expect(captured.goalUpdate.data.axwise_customer_intelligence).toMatchObject({
      status: 'evidence_requested',
      research_failure: null,
      retry_count: 1,
      previous_scope_contract: {
        scope_hash: packet.scope_hash,
        scope_packet: packet,
        scope_validation: validation,
        scope_confirmation: confirmation,
      },
    });
    expect(captured.goalUpdate.data.axwise_customer_intelligence).not.toHaveProperty(
      'scope_packet'
    );
    expect(captured.goalUpdate.data.axwise_customer_intelligence).not.toHaveProperty(
      'research_execution_inputs_hash'
    );
    expect(captured.goalUpdate.data.axwise_customer_intelligence).not.toHaveProperty(
      'proposal_decision_id'
    );
    expect(captured.goalUpdate.data.scope_revision).toMatchObject({
      status: 'pending_rebuild',
      kind: 'evidence_refresh',
      source_scope_hash: packet.scope_hash,
      revision_token: expect.any(String),
    });
    expect(captured.goalUpdate.data.scope_admission).toMatchObject({
      native_scope: true,
      status: 'evidence_requested',
      scope_hash: null,
      playbook_id: null,
      accepted_at: null,
    });
    expect(captured.goalUpdate.data.scope_admission).not.toHaveProperty('research_acceptance');
    expect(captured.goalUpdate.data.work_shape_route).toBeNull();
    expect(captured.job.payload).toMatchObject({
      action: 'customer-intelligence',
      goalId: goal.id,
      scope_revision_token: captured.goalUpdate.data.scope_revision.revision_token,
    });
  });

  it('preserves only the revision token while rebuilding an in-flight evidence refresh', async () => {
    const goal = acceptedNativeGoalFixture({
      id: 'g-native-evidence-refresh-retry',
      status: 'needs_human',
    });
    const intelligence = goal.data.axwise_customer_intelligence;
    const packet = intelligence.scope_packet;
    Object.assign(intelligence, {
      status: 'required_research_blocked',
      decision_id: 'decision-evidence-failed',
      job_id: 'job-evidence-failed',
      retry_count: 1,
      research_failure: { code: 'grounding_failed', retryable: true },
    });
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'evidence-refresh-current',
      kind: 'evidence_refresh',
      source_scope_hash: packet.scope_hash,
    };
    goal.data.scope_admission = {
      ...goal.data.scope_admission,
      status: 'evidence_requested',
      playbook_id: null,
      accepted_at: null,
    };
    goal.data.work_shape_route = null;
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result.status).toBe(200);
    expect(captured.goalUpdate.data.axwise_customer_intelligence).toMatchObject({
      status: 'evidence_requested',
      retry_count: 2,
      previous_scope_contract: { scope_hash: packet.scope_hash, scope_packet: packet },
    });
    expect(captured.goalUpdate.data.axwise_customer_intelligence).not.toHaveProperty(
      'scope_packet'
    );
    expect(captured.goalUpdate.data.scope_revision).toMatchObject({
      status: 'pending_rebuild',
      kind: 'evidence_refresh',
      revision_token: 'evidence-refresh-current',
    });
    expect(captured.job.payload).toMatchObject({
      action: 'customer-intelligence',
      scope_revision_token: 'evidence-refresh-current',
    });
    expect(captured.goalUpdateFilters).toEqual(
      expect.arrayContaining([
        ['data->scope_revision->>status', 'pending_rebuild'],
        ['data->scope_revision->>revision_token', 'evidence-refresh-current'],
      ])
    );
  });

  it('rolls an accepted-native evidence refresh back only while its new token still owns the row', async () => {
    const goal = acceptedNativeGoalFixture({
      id: 'g-native-research-enqueue-failure',
      status: 'needs_human',
    });
    Object.assign(goal.data.axwise_customer_intelligence, {
      status: 'required_research_blocked',
      decision_id: 'decision-native-failed',
      job_id: 'job-native-failed',
      retry_count: 0,
      research_failure: { code: 'grounding_failed', retryable: true },
    });
    goal.data.goal_approvals.context = approvedApproval(
      'context',
      buildContextApprovalSnapshot(goal),
      goal.user_id
    );
    const originalData = structuredClone(goal.data);
    const { admin, captured } = makeAdmin({
      goal,
      jobInsertError: { message: 'queue unavailable' },
    });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result).toEqual({
      status: 500,
      error: 'Customer research could not be queued. Refresh and try again.',
    });
    expect(captured.goalUpdates).toHaveLength(2);
    expect(captured.goalUpdates[1]).toMatchObject({ status: 'needs_human', data: originalData });
    const token = captured.goalUpdates[0].data.scope_revision.revision_token;
    expect(captured.goalUpdateFilters).toEqual(
      expect.arrayContaining([
        ['data->scope_revision->>revision_token', token],
        ['data->axwise_customer_intelligence->>status', 'evidence_requested'],
      ])
    );
  });

  it('binds an explicit research retry to the active pending scope revision', async () => {
    const goal = blockedGoal();
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-retry-current',
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result.status).toBe(200);
    expect(captured.job.payload).toMatchObject({
      action: 'customer-intelligence',
      goalId: goal.id,
      scope_revision_token: 'revision-retry-current',
    });
  });

  it('rejects an explicit research retry when a pending revision token is malformed', async () => {
    const goal = blockedGoal();
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: ' ',
    };
    const { admin, captured } = makeAdmin({ goal });

    const result = await handleResolve(admin, user, {
      goalId: goal.id,
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result.status).toBe(409);
    expect(result.error).toMatch(/scope rebuild token/i);
    expect(captured.goalUpdate).toBeNull();
    expect(captured.job).toBeNull();
  });

  it('does not enqueue when a concurrent retry already changed the goal', async () => {
    const { admin, captured } = makeAdmin({ goal: blockedGoal(), casUpdated: false });

    const result = await handleResolve(admin, user, {
      goalId: 'g-research',
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result.status).toBe(409);
    expect(result.error).toMatch(/already retried|state changed/i);
    expect(captured.job).toBeNull();
  });

  it('generation-safely restores the blocked state when retry enqueue fails', async () => {
    const { admin, captured } = makeAdmin({
      goal: blockedGoal(),
      jobInsertError: { message: 'database connection detail that must not escape' },
    });

    const result = await handleResolve(admin, user, {
      goalId: 'g-research',
      resolution: { type: 'retry_customer_research', data: {} },
    });

    expect(result).toEqual({
      status: 500,
      error: 'Customer research could not be queued. Refresh and try again.',
    });
    expect(captured.goalUpdates).toHaveLength(2);
    expect(captured.goalUpdates[1]).toMatchObject({
      status: 'needs_human',
      data: {
        failure_reason: 'Customer research could not be queued. It is safe to retry.',
        axwise_customer_intelligence: {
          status: 'required_research_blocked',
          retry_count: 0,
          research_failure: {
            code: 'research_enqueue_failed',
            retryable: true,
          },
        },
      },
    });
    expect(captured.goalUpdateFilters).toEqual(
      expect.arrayContaining([
        ['status', 'researching_customer'],
        ['data->axwise_customer_intelligence->>status', 'retry_queued'],
        ['data->axwise_customer_intelligence->>retry_count', '1'],
      ])
    );
    expect(captured.log).toBeNull();
    expect(JSON.stringify(result)).not.toContain('database connection');
  });

  it('blocks non-retryable and capped research without spending again', async () => {
    for (const intelligence of [
      {
        status: 'required_research_blocked',
        retry_count: 0,
        research_failure: { retryable: false },
      },
      {
        status: 'required_research_blocked',
        retry_count: 3,
        research_failure: { retryable: true },
      },
    ]) {
      const { admin, captured } = makeAdmin({
        goal: blockedGoal({
          data: { axwise_customer_intelligence: intelligence },
        }),
      });
      const result = await handleResolve(admin, user, {
        goalId: 'g-research',
        resolution: { type: 'retry_customer_research', data: {} },
      });
      expect(result.status).toBe(409);
      expect(captured.job).toBeNull();
    }
  });
});
