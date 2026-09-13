import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agent-handlers/job-processor.js', () => ({
  processNextJob: vi.fn(async () => ({ processed: 0 })),
}));
vi.mock('../goal-handlers/_helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  const triggerProcessNext = vi.fn(() => true);
  return {
    ...actual,
    triggerProcessNext,
    wakeAgentJobExact: vi.fn(async (_admin, job, { triggerProcessNextImpl, env }) => {
      const triggered = await triggerProcessNextImpl(
        env === process.env ? { jobId: job.id } : { jobId: job.id, env }
      );
      if (triggered !== true) {
        const error = new Error('Unable to wake Preview agent job');
        error.code = 'PREVIEW_EXACT_WAKE_UNAVAILABLE';
        throw error;
      }
      return { jobId: job.id, triggered: true };
    }),
  };
});

import { triggerProcessNext } from '../goal-handlers/_helpers.js';
import { handleApproval, handleContextReview, handleRetry } from './goals.js';
import {
  buildContextApprovalSnapshot,
  buildResearchExecutionPreview,
  pendingApproval,
} from '../goal-handlers/approval-audit.js';
import { nativeAxwiseScopeActionBinding } from '../_shared/native-scope-approval.js';
import {
  acceptedNativeGoalFixture,
  initialNativeScopeAdmissionGoalFixture,
} from '../_shared/native-goal-authority.test-fixture.js';
import {
  nativeDecisionContractsFixture,
  nativeMaterialQuestionContractsFixture,
  nativeResearchContractFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';

const user = { id: 'user-1' };

function makeAdmin(goal, { jobInsertError = null, rollbackSucceeds = true } = {}) {
  let currentGoal = { user_id: user.id, ...structuredClone(goal) };
  const jobs = [];
  const goalUpdates = [];
  const valueAt = (row, field) => {
    if (!field.includes('->')) return row[field];
    const [root, ...path] = field.split('->');
    return path.reduce((value, key) => value?.[key.replace(/^>/, '')], row[root]);
  };
  const matches = (row, filters) =>
    filters.every(([field, expected]) => {
      const current = valueAt(row, field);
      return current === expected || String(current) === String(expected);
    });
  const goalQuery = () => {
    const filters = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((field, value) => {
        filters.push([field, value]);
        return query;
      }),
      single: vi.fn(async () => ({
        data: matches(currentGoal, filters) ? structuredClone(currentGoal) : null,
        error: null,
      })),
      maybeSingle: vi.fn(async () => ({
        data: matches(currentGoal, filters) ? structuredClone(currentGoal) : null,
        error: null,
      })),
    };
    return query;
  };
  const updateQuery = (patch) => {
    const filters = [];
    let applied = false;
    const apply = () => {
      if (applied || !rollbackSucceeds || !matches(currentGoal, filters)) return null;
      applied = true;
      currentGoal = { ...currentGoal, ...structuredClone(patch) };
      return structuredClone(currentGoal);
    };
    const query = {
      eq: vi.fn((field, value) => {
        filters.push([field, value]);
        return query;
      }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: apply(), error: null })),
      then(resolve, reject) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  const tables = {
    goals: {
      select: vi.fn(() => goalQuery()),
      update: vi.fn((patch) => {
        goalUpdates.push(patch);
        return updateQuery(patch);
      }),
    },
    agent_jobs: {
      insert: vi.fn(async (row) => {
        if (!jobInsertError) {
          jobs.push({
            ...structuredClone(row),
            worker_scope: process.env.VERCEL_ENV === 'preview' ? 'preview' : 'production',
          });
        }
        return { error: jobInsertError };
      }),
      select: vi.fn(() => {
        const filters = [];
        const query = {
          eq: vi.fn((field, value) => {
            filters.push([field, value]);
            return query;
          }),
          maybeSingle: vi.fn(async () => ({
            data: structuredClone(jobs.find((job) => matches(job, filters)) || null),
            error: null,
          })),
        };
        return query;
      }),
      update: vi.fn((patch) => {
        const filters = [];
        const query = {
          eq: vi.fn((field, value) => {
            filters.push([field, value]);
            return query;
          }),
          select: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            const row = jobs.find((job) => matches(job, filters));
            if (!row) return { data: null, error: null };
            Object.assign(row, structuredClone(patch));
            return { data: structuredClone(row), error: null };
          }),
        };
        return query;
      }),
    },
    goal_log: { insert: vi.fn(async () => ({ error: null })) },
  };
  return {
    admin: { from: vi.fn((table) => tables[table]) },
    jobs,
    goalUpdates,
    get goal() {
      return structuredClone(currentGoal);
    },
  };
}

function expectExactPreviewWake(admin, jobs) {
  expect(jobs).toHaveLength(1);
  expect(jobs[0].id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(triggerProcessNext).toHaveBeenCalledWith({ jobId: jobs[0].id });
  expect(triggerProcessNext).not.toHaveBeenCalledWith();
  expect(admin.from).toHaveBeenCalledWith('agent_jobs');
}

function nativeContextGoal(id = 'goal-native-context', { evidenceMode = 'none' } = {}) {
  const grounded = evidenceMode === 'grounded';
  const active = evidenceMode !== 'none';
  const workTypes = [...(grounded ? ['research_analysis'] : []), 'strategy_planning'].sort();
  const geographies = grounded ? ['EE'] : [];
  const packet = nativeScopePacketFixture({
    admission: {
      version: 'axwise_scope_admission_v1',
      work_types: workTypes,
      geographies,
      channels: [],
      success_criteria: ['The approved scope is reviewable'],
      required_capabilities: [],
      requested_actions: [],
    },
    researchContract: nativeResearchContractFixture({
      documentIntent: 'operational_process',
      workTypes,
      geographies,
      evidence: {
        mode: evidenceMode,
        grounding_required: grounded,
        required_outputs: active
          ? [...(grounded ? ['market_sources'] : []), 'research_bundle']
          : [],
        external_sources_required: grounded,
      },
    }),
  });
  const contracts = nativeDecisionContractsFixture(packet);
  const goal = {
    id,
    status: 'awaiting_context_approval',
    user_id: user.id,
    org_id: 'org-1',
    updated_at: '2026-08-24T08:00:00.000Z',
    data: {
      axwise_customer_intelligence: {
        decision_id: 'decision-native-1',
        proposal_decision_id: 'decision-native-1',
        generation: 5,
        updated_at: '2026-08-24T07:59:00.000Z',
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
        ...(active
          ? {
              research_execution_preview: buildResearchExecutionPreview({
                proposalDecisionId: 'decision-native-1',
                scopePacket: contracts.scope_packet,
                executionInputsHash: contracts.research_execution_inputs_hash,
                maximumCostUsd: 5,
                estimatedCostUsd: 1,
                maximumLatencyMs: 1_200_000,
                estimatedLatencyMs: 300_000,
              }),
            }
          : {}),
        scope_packet: contracts.scope_packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
      },
    },
  };
  goal.data.goal_approvals = {
    context: pendingApproval('context', buildContextApprovalSnapshot(goal)),
  };
  return goal;
}

describe('goals API insert-and-wake boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('full retry wakes only its new feasibility job', async () => {
    const { admin, jobs } = makeAdmin({
      id: 'goal-retry',
      status: 'failed',
      data: {},
      plan: { phases: [] },
    });

    const result = await handleRetry(admin, user, { id: 'goal-retry' });

    expect(result.status).toBe(200);
    expect(jobs[0].payload).toMatchObject({
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: 'goal-retry',
    });
    expectExactPreviewWake(admin, jobs);
  });

  it('retries an accepted native goal from canonical PM planning', async () => {
    const nativeGoal = acceptedNativeGoalFixture({
      id: 'goal-native-retry',
      status: 'failed',
      plan: { phases: [{ name: 'Old plan', status: 'failed' }] },
      agent_team_id: 'old-team',
      team_id: 'old-team',
    });
    nativeGoal.data.goal_approvals.execution = {
      status: 'approved',
      snapshot_hash: 'old-gate-2',
    };
    const harness = makeAdmin(nativeGoal);

    const result = await handleRetry(harness.admin, user, { id: nativeGoal.id });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'planning', retry_action: 'pm-planning' },
    });
    expect(harness.jobs[0].payload).toMatchObject({
      action: 'pm-planning',
      goalId: nativeGoal.id,
    });
    expect(harness.goal.plan).toEqual(nativeGoal.plan);
    expect(harness.goal.data.goal_approvals).toMatchObject({
      context: expect.objectContaining({ status: 'approved' }),
      execution: expect.objectContaining({ status: 'invalidated' }),
    });
    expectExactPreviewWake(harness.admin, harness.jobs);
  });

  it('retries a failed pending native correction from its exact scope token', async () => {
    const nativeGoal = acceptedNativeGoalFixture({
      id: 'goal-native-revision-retry',
      status: 'failed',
    });
    nativeGoal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-retry-current',
    };
    const harness = makeAdmin(nativeGoal);

    const result = await handleRetry(harness.admin, user, { id: nativeGoal.id });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'analyzing', retry_action: 'scope-admission' },
    });
    expect(harness.jobs[0].payload).toMatchObject({
      action: 'scope-admission',
      scope_revision_token: 'revision-retry-current',
    });
  });

  it('retries an initial pre-packet native admission without entering feasibility', async () => {
    const nativeGoal = initialNativeScopeAdmissionGoalFixture({ id: 'goal-initial-native-retry' });
    const harness = makeAdmin(nativeGoal);

    const result = await handleRetry(harness.admin, user, { id: nativeGoal.id });

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'analyzing', retry_action: 'scope-admission' },
    });
    expect(harness.jobs[0].payload).toMatchObject({
      action: 'scope-admission',
      goalId: nativeGoal.id,
    });
    expect(harness.jobs[0].payload).not.toHaveProperty('scope_revision_token');
    expect(harness.goal.data.smart_request_admission.status).toBe('started');
    expect(harness.goal.plan).toEqual(nativeGoal.plan);
  });

  it('does not send a damaged native goal through feasibility on full retry', async () => {
    const nativeGoal = acceptedNativeGoalFixture({
      id: 'goal-native-damaged-retry',
      status: 'failed',
    });
    nativeGoal.data.axwise_customer_intelligence.scope_packet = null;
    const harness = makeAdmin(nativeGoal);

    const result = await handleRetry(harness.admin, user, { id: nativeGoal.id });

    expect(result.status).toBe(409);
    expect(harness.jobs).toEqual([]);
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });

  it('does not report a full retry as successful when the exact Preview wake is rejected', async () => {
    triggerProcessNext.mockResolvedValueOnce(false);
    const harness = makeAdmin({
      id: 'goal-retry-unwoken',
      status: 'failed',
      data: {},
      plan: { phases: [] },
    });
    const { admin } = harness;

    const result = await handleRetry(admin, user, { id: 'goal-retry-unwoken' });

    expect(result).toMatchObject({
      status: 503,
      error:
        'Goal processing could not be handed to the Preview worker. The exact goal state was restored; refresh and retry.',
      data: {
        goal_id: 'goal-retry-unwoken',
        job_id: expect.any(String),
        reconciliation_state: 'terminalized-safe:rolled-back',
        retry_safe: true,
      },
    });
    expect(harness.goal.status).toBe('failed');
    expect(harness.jobs).toEqual([
      expect.objectContaining({
        id: result.data.job_id,
        status: 'failed',
        error: 'Preview exact goal handoff was unavailable: retry',
      }),
    ]);
  });

  it('does not wake when full retry enqueue fails and restores the prior state', async () => {
    const original = {
      id: 'goal-retry-failed',
      status: 'failed',
      iteration: 2,
      data: { failure_reason: 'original failure' },
      plan: { phases: [{ status: 'failed' }] },
    };
    const { admin, jobs, goalUpdates } = makeAdmin(original, {
      jobInsertError: { message: 'queue unavailable' },
    });

    const result = await handleRetry(admin, user, { id: original.id });

    expect(result.status).toBe(503);
    expect(goalUpdates.at(-1)).toMatchObject({
      status: original.status,
      iteration: original.iteration,
      data: original.data,
      plan: original.plan,
    });
    expect(jobs).toHaveLength(0);
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });

  it('proposal approval wakes only its client-approval job', async () => {
    const { admin, jobs } = makeAdmin({
      id: 'goal-approval',
      status: 'awaiting_approval',
      user_id: user.id,
    });

    const result = await handleApproval(admin, user, { id: 'goal-approval' }, 'approve', {});

    expect(result.status).toBe(200);
    expect(jobs[0].payload).toMatchObject({
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: 'goal-approval',
    });
    expectExactPreviewWake(admin, jobs);
  });

  it('does not acknowledge an approval when the exact Preview wake throws', async () => {
    triggerProcessNext.mockRejectedValueOnce(new Error('dispatch unavailable'));
    const harness = makeAdmin({
      id: 'goal-approval-unwoken',
      status: 'awaiting_approval',
      user_id: user.id,
      data: { proposal: 'ready' },
      updated_at: '2026-08-22T20:00:00.000Z',
    });
    const { admin } = harness;

    const result = await handleApproval(
      admin,
      user,
      { id: 'goal-approval-unwoken' },
      'approve',
      {}
    );

    expect(result).toMatchObject({
      status: 503,
      error: expect.stringContaining('handed to the Preview worker'),
      data: {
        goal_id: 'goal-approval-unwoken',
        job_id: harness.jobs[0].id,
        reconciliation_state: 'terminalized-safe:rolled-back',
        retry_safe: true,
      },
    });
    expect(harness.goal.status).toBe('awaiting_approval');
    expect(harness.jobs[0].status).toBe('failed');
  });

  it('does not wake or report success when approval enqueue fails', async () => {
    const { admin } = makeAdmin(
      { id: 'goal-approval-error', status: 'awaiting_approval', user_id: user.id },
      { jobInsertError: { message: 'queue unavailable' } }
    );

    const result = await handleApproval(admin, user, { id: 'goal-approval-error' }, 'approve', {});

    expect(result.status).toBe(503);
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });

  it('context review wakes only its context-approval job', async () => {
    const { admin, jobs } = makeAdmin({
      id: 'goal-context',
      status: 'awaiting_context_approval',
      user_id: user.id,
      data: {},
    });

    const result = await handleContextReview(
      admin,
      user,
      { id: 'goal-context' },
      { action: 'revise', feedback: 'Tighten the ICP.' }
    );

    expect(result.status).toBe(200);
    expect(jobs[0].payload).toMatchObject({
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId: 'goal-context',
    });
    expectExactPreviewWake(admin, jobs);
  });

  it.each(['auto', 'instant'])(
    'allows a direct fail-closed Smart %s scope through the API research gate',
    async (researchMode) => {
      const current = nativeContextGoal(`goal-context-direct-${researchMode}`);
      current.data.research_policy = {
        research_mode: researchMode,
        grounding_required: false,
        research_fail_closed: true,
      };
      current.data.goal_approvals.context = pendingApproval(
        'context',
        buildContextApprovalSnapshot(current)
      );
      const binding = nativeAxwiseScopeActionBinding(current);
      const { admin, jobs } = makeAdmin(current);

      const result = await handleContextReview(
        admin,
        user,
        { id: current.id },
        { action: 'approve', native_scope_binding: binding }
      );

      expect(result.status).toBe(200);
      expect(jobs[0].payload).toMatchObject({
        action: 'context-approval',
        context_action: 'approve',
      });
      expectExactPreviewWake(admin, jobs);
    }
  );

  it.each([
    [
      'grounded',
      {
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
      },
    ],
    [
      'explicitly required',
      {
        research_mode: 'instant',
        required: true,
        grounding_required: false,
        research_fail_closed: false,
      },
    ],
  ])('authorizes a typed %s research proposal before its bundle exists', async (_label, policy) => {
    const current = nativeContextGoal(`goal-context-required-${_label.replaceAll(' ', '-')}`, {
      evidenceMode: _label === 'grounded' ? 'grounded' : 'synthetic',
    });
    current.data.research_policy = policy;
    current.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(current)
    );
    const binding = nativeAxwiseScopeActionBinding(current);
    const { admin, jobs } = makeAdmin(current);

    const result = await handleContextReview(
      admin,
      user,
      { id: current.id },
      { action: 'approve', native_scope_binding: binding }
    );

    expect(result.status).toBe(200);
    expect(jobs[0].payload).toMatchObject({
      action: 'context-approval',
      context_action: 'approve',
    });
    expectExactPreviewWake(admin, jobs);
  });

  it('rejects an active native proposal whose server-side research disclosure is missing', async () => {
    const current = nativeContextGoal('goal-context-missing-disclosure', {
      evidenceMode: 'synthetic',
    });
    delete current.data.axwise_customer_intelligence.research_execution_preview;
    current.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(current)
    );
    const binding = nativeAxwiseScopeActionBinding(current);
    const { admin, jobs } = makeAdmin(current);

    const result = await handleContextReview(
      admin,
      user,
      { id: current.id },
      { action: 'approve', native_scope_binding: binding }
    );

    expect(result).toEqual({
      status: 409,
      error:
        'The proposal-bound research disclosure changed or is incomplete. Refresh and review the current scope.',
      data: { code: 'native_scope_execution_preview_invalid' },
    });
    expect(jobs).toEqual([]);
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });

  it('rejects native material-question approval before enqueue or wake', async () => {
    const materialQuestion = 'Which approved customer segment should receive the pilot?';
    const current = nativeContextGoal('goal-context-material-question');
    const materialContracts = nativeMaterialQuestionContractsFixture(materialQuestion);
    const completeMaterialContracts = {
      ...nativeDecisionContractsFixture(materialContracts.scope_packet),
      ...materialContracts,
    };
    Object.assign(current.data.axwise_customer_intelligence, {
      scope_packet: completeMaterialContracts.scope_packet,
      scope_validation: completeMaterialContracts.scope_validation,
      axwise_scope_confirmation: completeMaterialContracts.scope_confirmation,
      scope_contract_binding: completeMaterialContracts.scope_contract_binding,
      research_execution_inputs_hash: completeMaterialContracts.research_execution_inputs_hash,
    });
    current.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(current)
    );
    const { admin, jobs } = makeAdmin(current);

    const result = await handleContextReview(
      admin,
      user,
      { id: 'goal-context-material-question' },
      { action: 'approve' }
    );

    expect(result).toEqual({
      status: 409,
      error: materialQuestion,
      data: {
        native_scope_gate: {
          code: 'native_scope_material_input_required',
          message: 'AxWise needs one material answer before this scope can be approved.',
          materialQuestion,
        },
      },
    });
    expect(jobs).toEqual([]);
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });

  it.each(['approve', 'revise'])(
    'rejects a stale native Gate-1 %s request before enqueue or wake',
    async (action) => {
      const current = nativeContextGoal('goal-context-stale-native');
      const staleBinding = {
        ...nativeAxwiseScopeActionBinding(current),
        generation: '4',
      };
      const { admin, jobs } = makeAdmin(current);

      const result = await handleContextReview(
        admin,
        user,
        { id: current.id },
        {
          action,
          ...(action === 'revise' ? { feedback: 'Use the newer campaign scope.' } : {}),
          native_scope_binding: staleBinding,
        }
      );

      expect(result).toEqual({
        status: 409,
        error: 'The AxWise scope changed. Refresh and review the current scope.',
        data: { code: 'stale_native_scope' },
      });
      expect(jobs).toEqual([]);
      expect(triggerProcessNext).not.toHaveBeenCalled();
    }
  );

  it('stamps the exact native Gate-1 binding onto the queued worker action', async () => {
    const current = nativeContextGoal('goal-context-current-native');
    const binding = nativeAxwiseScopeActionBinding(current);
    const { admin, jobs } = makeAdmin(current);

    const result = await handleContextReview(
      admin,
      user,
      { id: current.id },
      { action: 'approve', native_scope_binding: binding }
    );

    expect(result.status).toBe(200);
    expect(jobs[0].payload).toMatchObject({
      action: 'context-approval',
      context_action: 'approve',
      native_scope_binding: binding,
    });
    expectExactPreviewWake(admin, jobs);
  });

  it('does not acknowledge a context review when the Preview wake is rejected', async () => {
    triggerProcessNext.mockResolvedValueOnce(false);
    const harness = makeAdmin({
      id: 'goal-context-unwoken',
      status: 'awaiting_context_approval',
      user_id: user.id,
      data: {},
      updated_at: '2026-08-22T20:00:00.000Z',
    });
    const { admin } = harness;

    const result = await handleContextReview(
      admin,
      user,
      { id: 'goal-context-unwoken' },
      { action: 'revise', feedback: 'Tighten the ICP.' }
    );

    expect(result).toMatchObject({
      status: 503,
      data: {
        goal_id: 'goal-context-unwoken',
        job_id: harness.jobs[0].id,
        reconciliation_state: 'terminalized-safe:rolled-back',
        retry_safe: true,
      },
    });
    expect(harness.goal.status).toBe('awaiting_context_approval');
    expect(harness.jobs[0].status).toBe('failed');
  });

  it('does not wake or report success when context-review enqueue fails', async () => {
    const { admin } = makeAdmin(
      {
        id: 'goal-context-error',
        status: 'awaiting_context_approval',
        user_id: user.id,
        data: {},
      },
      { jobInsertError: { message: 'queue unavailable' } }
    );

    const result = await handleContextReview(
      admin,
      user,
      { id: 'goal-context-error' },
      { action: 'revise', feedback: 'Tighten the ICP.' }
    );

    expect(result.status).toBe(503);
    expect(triggerProcessNext).not.toHaveBeenCalled();
  });
});
