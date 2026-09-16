/**
 * Tests for evaluate-phase — specifically Phase 2.2 where the no-jobs
 * silent return is replaced with a descriptive throw so the self-healer
 * (h03) can match and re-run team-formation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  executeLlm: vi.fn(),
  parseLlmJson: vi.fn(),
}));

vi.mock('../_helpers.js', () => ({
  logGoalEvent: vi.fn(),
  updateGoal: vi.fn(),
  loadGoal: vi.fn(async (_admin, id) => ({
    id,
    plan: { phases: [{ name: 'P1', status: 'executing' }] },
    budget_usd: 10,
    spent_usd: 0,
    data: {},
  })),
  enqueueGoalAction: vi.fn(),
  notifyGoalEvent: vi.fn(),
  trackTokenSpend: vi.fn(),
  recordStageLlmUsage: vi.fn(),
  pickTestModel: vi.fn(() => ({ provider: 'gemini', model: 'gemini-3.8-flash' })),
  updateGoalIfStatus: vi.fn(async () => true),
  deterministicAgentJobId: vi.fn(() => '00000000-0000-5000-8000-000000000001'),
  enqueueAgentJob: vi.fn(async (_admin, job) => ({ ...job, status: 'queued' })),
}));

vi.mock('./consilium-review.js', () => ({
  runConsiliumPhaseReview: vi.fn(),
  checkAgentAccountability: vi.fn(),
  checkBudgetHealth: vi.fn(),
}));

vi.mock('../goal-messaging.js', () => ({
  consiliumFeedback: vi.fn(),
}));

import {
  EVALUATION_DIGEST_MAX_CHARS,
  buildEvaluationDigest,
  buildPhaseKnowledgeContent,
  buildNativePhaseEvaluationSeal,
  evaluationAttemptMatchesGoal,
  handle,
  selectCurrentPhaseTasks,
} from './evaluate-phase.js';
import { executeLlm, parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { checkBudgetHealth, runConsiliumPhaseReview } from './consilium-review.js';
import { loadGoal, enqueueGoalAction, updateGoalIfStatus, enqueueAgentJob } from '../_helpers.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { selectWorkShapePlaybook } from '../work-shape-playbooks.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
  hashApprovalSnapshot,
} from '../approval-audit.js';

function acceptedNativeEvaluationGoal() {
  const packet = nativeScopePacketFixture({
    admission: {
      version: 'axwise_scope_admission_v1',
      work_types: ['research_analysis'],
      geographies: [],
      channels: [],
      success_criteria: ['The canonical artifact satisfies its acceptance checks.'],
      required_capabilities: [],
      requested_actions: [],
    },
  });
  const decision = nativeDecisionContractsFixture(packet);
  const jobSpec = {
    title: 'Canonical research artifact',
    description: 'Evaluate only the accepted research artifact.',
    required_role: 'Research Analyst',
    deliverable_type: 'markdown',
    requirement_ids: [],
    tool_requirements: [],
    acceptance_criteria: ['Satisfy the accepted canonical scope.'],
  };
  const sealedPlan = {
    phases: [
      {
        name: 'Canonical research phase',
        description: 'Evaluate the accepted research artifact.',
        status: 'pending',
        jobs: [jobSpec],
      },
    ],
  };
  const goal = {
    id: 'goal-native-evaluation',
    user_id: 'user-1',
    status: 'active',
    title: 'STALE RAW SOFTWARE LANDING PAGE',
    budget_usd: 10,
    spent_usd: 0,
    iteration: 0,
    updated_at: '2026-08-24T10:05:00.000Z',
    plan: {
      phases: [
        {
          name: 'Canonical research phase',
          description: 'Evaluate the accepted research artifact.',
          status: 'executing',
          started_at: '2026-08-24T10:00:00.000Z',
          jobs: [jobSpec],
        },
      ],
    },
    data: {
      axwise_customer_intelligence: {
        scope_packet: packet,
        scope_validation: decision.scope_validation,
        axwise_scope_confirmation: decision.scope_confirmation,
        scope_contract_binding: decision.scope_contract_binding,
        research_execution_inputs_hash: decision.research_execution_inputs_hash,
        updated_at: '2026-08-24T10:00:00.000Z',
      },
    },
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
    accepted_at: '2026-08-24T10:00:00.000Z',
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
  };
  goal.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
  };
  const planningAttemptId = 'planning-native-evaluation';
  const formationAttemptId = 'formation-native-evaluation';
  const planHash = hashApprovalSnapshot('native-execution-plan', sealedPlan);
  goal.data.native_planning_attempt = {
    version: 'orqaly_native_planning_attempt_v1',
    attempt_id: planningAttemptId,
    status: 'completed',
    scope_hash: packet.scope_hash,
    plan_hash: planHash,
    plan_snapshot: sealedPlan,
    completed_at: '2026-08-24T09:55:00.000Z',
  };
  const formation = {
    version: 'orqaly_team_formation_attempt_v1',
    attempt_id: formationAttemptId,
    status: 'completed',
    scope_hash: packet.scope_hash,
    planning_attempt_id: planningAttemptId,
    plan_hash: planHash,
    completed_at: '2026-08-24T09:57:00.000Z',
  };
  goal.data.team_formation_attempt = formation;
  goal.data.native_team_formation_attempt = structuredClone(formation);
  goal.data.team_work_materialization = {
    version: 'orqaly_team_work_materialization_v1',
    formation_attempt: formationAttemptId,
    native_scope_hash: packet.scope_hash,
  };
  const executionHash = 'gate-2-native-evaluation';
  goal.data.goal_approvals.execution = {
    status: 'approved',
    snapshot_hash: executionHash,
  };
  goal.data.execution_authorization = {
    status: 'approved',
    snapshot_hash: executionHash,
    manifest: {
      valid: true,
      native_scope_authority: {
        status: 'accepted',
        scope_hash: packet.scope_hash,
      },
      native_stage_chain: {
        status: 'completed',
        scope_hash: packet.scope_hash,
        team_formation_attempt_id: formationAttemptId,
      },
      tasks: [{ task_id: 'task-native', agent_id: 'agent-native' }],
    },
  };
  const task = {
    id: 'task-native',
    goal_id: goal.id,
    user_id: goal.user_id,
    job_pool_id: 'job-native',
    agent_id: 'agent-native',
    assigned_to: 'Research Analyst',
    materialization_attempt: formationAttemptId,
    title: 'MUTATED TASK TITLE POISON',
    status: 'done',
    updated_at: '2026-08-24T10:04:00.000Z',
    data: {
      goal_id: goal.id,
      phase_index: 0,
      axwise_step_id: 'phase-1-job-1',
      materialization_attempt: formationAttemptId,
      deliverable_type: 'markdown',
      output: '# Complete canonical artifact',
      axwise_execution_context: {
        authorization_status: 'approved',
        authorization_snapshot_hash: executionHash,
        authorization_task_id: 'task-native',
        authorization_agent_id: 'agent-native',
        authoritative: true,
        executable: true,
      },
    },
  };
  const job = {
    id: 'job-native',
    goal_id: goal.id,
    user_id: goal.user_id,
    description: jobSpec.description,
    status: 'done',
    cost_usd: 0.25,
    assigned_agent_name: 'Research Analyst',
    materialization_attempt: formationAttemptId,
  };
  const payload = {
    goalId: goal.id,
    phaseIndex: 0,
    evaluationAttempt: {
      version: 1,
      retry_count: 0,
      iteration: 0,
      decision_id: null,
      phase_index: 0,
      phase_started_at: goal.plan.phases[0].started_at,
      task_ids: [task.id],
    },
  };
  return { goal, packet, task, job, payload };
}

function makeNativeEvaluationAdmin({ goal, tasks, jobs, taskReads }) {
  const rpcCalls = [];
  const inserts = [];
  const updates = [];
  const queuedTaskReads = Array.isArray(taskReads) ? [...taskReads] : null;
  const queryRows = (table) => {
    if (table === 'team_tasks') {
      return queuedTaskReads?.length ? queuedTaskReads.shift() : tasks;
    }
    if (table === 'jobs') return jobs;
    return [];
  };
  const from = vi.fn((table) => {
    const state = { filters: [], update: null };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column, value) => {
        state.filters.push([column, value]);
        return builder;
      }),
      in: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      update: vi.fn((value) => {
        state.update = value;
        updates.push({ table, value, filters: state.filters });
        return builder;
      }),
      insert: vi.fn(async (value) => {
        inserts.push({ table, value });
        return { error: null };
      }),
      single: vi.fn(async () => ({ data: null, error: null })),
      maybeSingle: vi.fn(async () => {
        if (table === 'team_tasks' && state.update) {
          const taskId = state.filters.find(([column]) => column === 'id')?.[1];
          const task = tasks.find((row) => row.id === taskId);
          return {
            data: task ? { ...task, ...state.update } : null,
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      then(resolve) {
        return Promise.resolve({ data: queryRows(table), error: null }).then(resolve);
      },
    };
    return builder;
  });
  const rpc = vi.fn(async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'reserve_native_phase_evaluation') {
      const reservedAt = '2026-08-24T10:06:00.000Z';
      const attempt = { ...args.p_attempt, reserved_at: reservedAt };
      goal.data.native_phase_evaluation_attempt = attempt;
      goal.updated_at = reservedAt;
      return {
        data: { state: 'acquired', goal_updated_at: reservedAt, attempt },
        error: null,
      };
    }
    if (name === 'finalize_native_phase_evaluation') {
      goal.status = args.p_next_status;
      goal.plan = args.p_next_plan;
      goal.current_value = args.p_next_current_value;
      goal.spent_usd = args.p_next_spent_usd;
      goal.data = args.p_next_data;
      goal.updated_at = '2026-08-24T10:07:00.000Z';
      return {
        data: {
          state: 'completed',
          goal_updated_at: goal.updated_at,
          attempt: args.p_completed_attempt,
        },
        error: null,
      };
    }
    return { data: null, error: new Error(`Unexpected RPC ${name}`) };
  });
  return { from, rpc, __rpcCalls: rpcCalls, __inserts: inserts, __updates: updates };
}

describe('evaluate-phase: current attempt isolation', () => {
  it('does not score cancelled tasks from a superseded Request Changes attempt', () => {
    const currentGoal = {
      data: { axwise_orchestration: { decision_id: 'decision-new' } },
    };
    const tasks = [
      {
        id: 'old-task',
        title: 'Cancelled old scope',
        status: 'cancelled',
        data: { phase_index: 0, axwise_decision_id: 'decision-old' },
      },
      {
        id: 'new-task',
        title: 'Current approved scope',
        status: 'done',
        data: { phase_index: 0, axwise_decision_id: 'decision-new', output: 'complete' },
      },
      {
        id: 'next-phase',
        status: 'done',
        data: { phase_index: 1, axwise_decision_id: 'decision-new' },
      },
    ];

    expect(selectCurrentPhaseTasks(currentGoal, tasks, 0).map((task) => task.id)).toEqual([
      'new-task',
    ]);
  });

  it('rejects a durable evaluator from an older retry or phase execution', () => {
    const goal = {
      iteration: 3,
      plan: { phases: [{ status: 'executing', started_at: '2026-08-22T12:00:00.000Z' }] },
      data: {
        retry_count: 2,
        axwise_orchestration: { decision_id: 'decision-current' },
      },
    };
    const current = {
      evaluationAttempt: {
        version: 1,
        retry_count: 2,
        iteration: 3,
        decision_id: 'decision-current',
        phase_index: 0,
        phase_started_at: '2026-08-22T12:00:00.000Z',
      },
    };

    expect(evaluationAttemptMatchesGoal(goal, current)).toBe(true);
    expect(
      evaluationAttemptMatchesGoal(goal, {
        evaluationAttempt: { ...current.evaluationAttempt, retry_count: 1 },
      })
    ).toBe(false);
    expect(
      evaluationAttemptMatchesGoal(goal, {
        evaluationAttempt: {
          ...current.evaluationAttempt,
          phase_started_at: '2026-08-22T11:00:00.000Z',
        },
      })
    ).toBe(false);
  });

  it('requires the exact feedback version while the phase generation is active', () => {
    const goal = {
      iteration: 0,
      plan: {
        phases: [
          {
            status: 'executing',
            started_at: '2026-08-22T12:00:00.000Z',
            feedback: {
              kind: 'feedback_application',
              application_version: 'feedback-v2',
              retry_count: 0,
              iteration: 0,
            },
          },
        ],
      },
      data: { last_feedback_application_version: 'feedback-v2' },
    };
    const exact = {
      phaseIndex: 0,
      feedbackApplicationVersion: 'feedback-v2',
      evaluationAttempt: {
        version: 1,
        retry_count: 0,
        iteration: 0,
        decision_id: null,
        phase_index: 0,
        phase_started_at: '2026-08-22T12:00:00.000Z',
        feedback_application_version: 'feedback-v2',
      },
    };

    expect(evaluationAttemptMatchesGoal(goal, exact)).toBe(true);
    expect(
      evaluationAttemptMatchesGoal(goal, {
        ...exact,
        feedbackApplicationVersion: undefined,
        evaluationAttempt: {
          ...exact.evaluationAttempt,
          feedback_application_version: null,
        },
      })
    ).toBe(false);
    expect(
      evaluationAttemptMatchesGoal(goal, {
        ...exact,
        feedbackApplicationVersion: 'feedback-v1',
      })
    ).toBe(false);
  });
});

describe('evaluate-phase: native scope authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateGoalIfStatus.mockResolvedValue(true);
  });

  it('durably stops an invalid native goal before it can iterate or complete', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'goal-native-invalid',
      user_id: 'user-1',
      status: 'active',
      title: 'STALE RAW GOAL',
      plan: { phases: [{ name: 'P1', status: 'executing' }] },
      data: {
        scope_admission: { native_scope: true, status: 'accepted' },
        axwise_customer_intelligence: {},
      },
    });

    const result = await handle({}, { goalId: 'goal-native-invalid', phaseIndex: 0 }, null);

    expect(result).toMatchObject({
      status: 'needs_human_native_scope_authority',
      reasons: expect.arrayContaining(['native_scope_contract_invalid']),
    });
    expect(updateGoalIfStatus).toHaveBeenCalledWith(
      {},
      'goal-native-invalid',
      'active',
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_stage: 'evaluate-phase:native-scope-authority',
        }),
      })
    );
    expect(enqueueGoalAction).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
  });

  it('grades a valid native phase against the canonical objective, never stale raw title', async () => {
    const { goal, packet, task, job, payload } = acceptedNativeEvaluationGoal();
    loadGoal.mockResolvedValueOnce(goal).mockResolvedValueOnce(goal);
    runConsiliumPhaseReview.mockResolvedValueOnce(null);
    checkBudgetHealth.mockReturnValueOnce({ ok: true, action: 'continue' });
    executeLlm.mockResolvedValueOnce({ content: '{"passed":true}', estimatedCostUsd: 0 });
    parseLlmJson.mockReturnValueOnce({
      passed: true,
      quality_score: 90,
      progress_percent: 100,
      feedback: 'Accepted.',
    });
    const admin = makeNativeEvaluationAdmin({ goal, tasks: [task], jobs: [job] });

    const result = await handle(admin, payload, null);

    expect(result).toMatchObject({ passed: true, quality_score: 90 });
    const prompt = executeLlm.mock.calls[0][0].prompt;
    expect(prompt).toContain(`Goal: ${packet.intent.objective}`);
    expect(prompt).not.toContain(goal.title);
    expect(prompt).toContain('Canonical research artifact');
    expect(prompt).not.toContain('MUTATED TASK TITLE POISON');
    expect(admin.__rpcCalls.map((call) => call.name)).toEqual([
      'reserve_native_phase_evaluation',
      'finalize_native_phase_evaluation',
    ]);
    expect(enqueueGoalAction).not.toHaveBeenCalled();
    expect(enqueueAgentJob).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        id: '00000000-0000-5000-8000-000000000001',
        user_id: 'user-1',
        payload: expect.objectContaining({
          action: 'complete',
          goalId: goal.id,
          _userId: 'user-1',
          userId: 'user-1',
          user_id: 'user-1',
        }),
      }),
      { idempotent: true }
    );
  });

  it('changes the sealed attempt when an exact task output changes', () => {
    const { goal, task, job, payload } = acceptedNativeEvaluationGoal();
    const first = buildNativePhaseEvaluationSeal({
      goal,
      tasks: [task],
      phaseJobs: [job],
      phaseIndex: 0,
      payload,
    });
    const changedTask = structuredClone(task);
    changedTask.data.output = '# A different artifact generation';
    const second = buildNativePhaseEvaluationSeal({
      goal,
      tasks: [changedTask],
      phaseJobs: [job],
      phaseIndex: 0,
      payload,
    });

    expect(first.ready).toBe(true);
    expect(second.ready).toBe(true);
    expect(second.identity.task_set_hash).not.toBe(first.identity.task_set_hash);
    expect(second.attemptId).not.toBe(first.attemptId);
  });

  it('fails closed when live plan semantics differ from the sealed planning snapshot', () => {
    const { goal, task, job, payload } = acceptedNativeEvaluationGoal();
    goal.plan.phases[0].jobs[0].description = 'POISONED PLAN REPLACEMENT';

    const seal = buildNativePhaseEvaluationSeal({
      goal,
      tasks: [task],
      phaseJobs: [job],
      phaseIndex: 0,
      payload,
    });

    expect(seal.ready).toBe(false);
    expect(seal.reasons).toContain('native_evaluation_planning_seal_invalid');
  });

  it('does not call a provider when the same durable evaluation lease is already running', async () => {
    const { goal, task, job, payload } = acceptedNativeEvaluationGoal();
    loadGoal.mockResolvedValueOnce(goal);
    const admin = makeNativeEvaluationAdmin({ goal, tasks: [task], jobs: [job] });
    admin.rpc.mockResolvedValueOnce({
      data: { state: 'in_progress', attempt: { attempt_id: 'already-running' } },
      error: null,
    });

    const result = await handle(admin, payload, null);

    expect(result.status).toBe('evaluation_in_progress');
    expect(runConsiliumPhaseReview).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
    expect(enqueueAgentJob).not.toHaveBeenCalled();
  });

  it('fences native stuck-task recovery by owner, goal, status, timestamp, and materialization', async () => {
    const { goal, task, job, payload } = acceptedNativeEvaluationGoal();
    task.status = 'inProgress';
    task.updated_at = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    task.data.output = 'DEPLOYMENT_URL: https://sealed-recovery.pages.dev/';
    loadGoal.mockResolvedValueOnce(goal);
    const admin = makeNativeEvaluationAdmin({ goal, tasks: [task], jobs: [job] });
    admin.rpc.mockResolvedValueOnce({
      data: { state: 'in_progress', attempt: { attempt_id: 'already-running' } },
      error: null,
    });

    const result = await handle(admin, payload, null);

    expect(result.status).toBe('evaluation_in_progress');
    const recovery = admin.__updates.find((update) => update.table === 'team_tasks');
    expect(recovery.value.status).toBe('done');
    expect(recovery.filters).toEqual(
      expect.arrayContaining([
        ['id', task.id],
        ['goal_id', goal.id],
        ['user_id', goal.user_id],
        ['status', 'inProgress'],
        ['updated_at', task.updated_at],
        ['materialization_attempt', goal.data.team_formation_attempt.attempt_id],
        ['data->>materialization_attempt', goal.data.team_work_materialization.formation_attempt],
      ])
    );
  });

  it('rejects an output race after provider review and never publishes its stale result', async () => {
    const { goal, task, job, payload } = acceptedNativeEvaluationGoal();
    const changedTask = structuredClone(task);
    changedTask.data.output = '# Late replacement after evaluator reservation';
    changedTask.updated_at = '2026-08-24T10:06:30.000Z';
    loadGoal.mockResolvedValueOnce(goal).mockResolvedValueOnce(goal);
    runConsiliumPhaseReview.mockResolvedValue(null);
    checkBudgetHealth.mockReturnValue({ ok: true, action: 'continue' });
    executeLlm.mockResolvedValue({ content: '{"passed":true}', estimatedCostUsd: 0 });
    parseLlmJson.mockReturnValue({
      passed: true,
      quality_score: 90,
      progress_percent: 100,
      feedback: 'Stale provider result.',
    });
    const admin = makeNativeEvaluationAdmin({
      goal,
      tasks: [task],
      jobs: [job],
      taskReads: [[task], [changedTask]],
    });

    const result = await handle(admin, payload, null);

    expect(result.status).toBe('needs_human_native_scope_authority');
    expect(result.reasons).toContain(
      'native_evaluation_task_or_cost_snapshot_changed_during_provider_call'
    );
    expect(admin.__rpcCalls.map((call) => call.name)).toEqual(['reserve_native_phase_evaluation']);
    expect(enqueueAgentJob).not.toHaveBeenCalled();
  });

  it('applies phase cost once and repairs one deterministic continuation on a completed retry', async () => {
    const { goal, task, job, payload } = acceptedNativeEvaluationGoal();
    loadGoal.mockResolvedValueOnce(goal).mockResolvedValueOnce(goal).mockResolvedValueOnce(goal);
    runConsiliumPhaseReview.mockResolvedValue(null);
    checkBudgetHealth.mockReturnValue({ ok: true, action: 'continue' });
    executeLlm.mockResolvedValue({ content: '{"passed":true}', estimatedCostUsd: 0 });
    parseLlmJson.mockReturnValue({
      passed: true,
      quality_score: 90,
      progress_percent: 100,
      feedback: 'Accepted.',
    });
    const admin = makeNativeEvaluationAdmin({ goal, tasks: [task], jobs: [job] });

    const first = await handle(admin, payload, null);
    const second = await handle(admin, payload, null);

    expect(first.passed).toBe(true);
    expect(second.status).toBe('already_completed');
    expect(executeLlm).toHaveBeenCalledTimes(1);
    expect(admin.__rpcCalls.map((call) => call.name)).toEqual([
      'reserve_native_phase_evaluation',
      'finalize_native_phase_evaluation',
    ]);
    expect(goal.spent_usd).toBe(job.cost_usd);
    const continuationCalls = enqueueAgentJob.mock.calls;
    expect(continuationCalls).toHaveLength(2);
    expect(continuationCalls[0][1].id).toBe(continuationCalls[1][1].id);
    expect(continuationCalls[0][1].payload.action).toBe('complete');
    expect(admin.from.mock.calls.some(([table]) => table === 'concilium_agents')).toBe(false);
  });
});

describe('evaluate-phase: balanced evaluator digest', () => {
  it('represents the head and tail of every large task without ambiguous boundaries', () => {
    const firstOutput = `TASK_ONE_HEAD.\n${'A'.repeat(16900)}\nTASK_ONE_TAIL.`;
    const secondOutput = `TASK_TWO_HEAD.\n${'B'.repeat(15900)}\nTASK_TWO_TAIL.`;

    const digest = buildEvaluationDigest([
      {
        id: 'task-1',
        title: 'First large deliverable',
        status: 'done',
        data: { output: firstOutput },
      },
      {
        id: 'task-2',
        title: 'Second large deliverable',
        status: 'done',
        data: { output: secondOutput },
      },
    ]);

    expect(digest.length).toBeLessThanOrEqual(EVALUATION_DIGEST_MAX_CHARS);
    expect(digest).toContain('=== TASK 1/2: First large deliverable ===');
    expect(digest).toContain(`Persisted character count: ${firstOutput.length}`);
    expect(digest).toContain('TASK_ONE_HEAD.');
    expect(digest).toContain('TASK_ONE_TAIL.');
    expect(digest).toContain('=== TASK 2/2: Second large deliverable ===');
    expect(digest).toContain(`Persisted character count: ${secondOutput.length}`);
    expect(digest).toContain('TASK_TWO_HEAD.');
    expect(digest).toContain('TASK_TWO_TAIL.');
    expect(digest.match(/END HEAD EXCERPT; OUTPUT CONTINUES IN STORAGE/g)).toHaveLength(2);
    expect(digest.match(/END TAIL EXCERPT; FULL OUTPUT REMAINS PERSISTED/g)).toHaveLength(2);
    expect(digest.trim()).toMatch(/<<< END TAIL EXCERPT; FULL OUTPUT REMAINS PERSISTED >>>$/);
    expect(digest).toContain('They are NOT evidence that the persisted deliverable is truncated.');
  });
});

describe('evaluate-phase: canonical KB artifact', () => {
  it('persists every completed task in full instead of silently slicing at 10k', () => {
    const first = `FIRST_HEAD\n${'a'.repeat(12000)}\nFIRST_TAIL`;
    const second = `SECOND_HEAD\n${'b'.repeat(9000)}\nSECOND_TAIL`;
    const content = buildPhaseKnowledgeContent([
      { title: 'First', data: { output: first } },
      { title: 'Second', data: { output: second } },
    ]);

    expect(content.length).toBeGreaterThan(20000);
    expect(content).toContain('FIRST_HEAD');
    expect(content).toContain('FIRST_TAIL');
    expect(content).toContain('SECOND_HEAD');
    expect(content).toContain('SECOND_TAIL');
  });
});

// Minimal admin that returns empty jobs + empty tasks — triggers no-jobs path
function makeAdmin() {
  return {
    from: vi.fn((table) => {
      if (table === 'jobs') {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === 'team_tasks') {
        return {
          select: () => ({
            contains: async () => ({ data: [], error: null }),
            in: async () => ({ data: [], error: null }),
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      return {};
    }),
  };
}

describe('evaluate-phase: no-jobs must throw (Phase 2.2)', () => {
  it('throws a descriptive error when no jobs and no tasks are found', async () => {
    const admin = makeAdmin();
    await expect(handle(admin, { goalId: 'goal-1', phaseIndex: 0 }, null)).rejects.toThrow(
      /no jobs found/i
    );
  });

  it('error message hints that team-formation may have silently failed', async () => {
    const admin = makeAdmin();
    await expect(handle(admin, { goalId: 'goal-1' }, null)).rejects.toThrow(/team-formation/i);
  });

  it('uses task ids when an approved manifest supplies the fallback job lookup', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'goal-approved',
      user_id: 'user-1',
      plan: { phases: [{ name: 'P1', status: 'executing' }] },
      budget_usd: 10,
      spent_usd: 0,
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'approved-hash',
          manifest: { valid: true, tasks: [{ task_id: 'task-current' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'approved-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-current' },
      },
    });
    const currentTask = {
      id: 'task-current',
      job_pool_id: 'job-current',
      title: 'Current task',
      status: 'inProgress',
      updated_at: new Date().toISOString(),
      data: { phase_index: 0, axwise_decision_id: 'decision-current' },
    };
    const selectedColumns = [];
    const admin = {
      from: vi.fn((table) => {
        if (table === 'jobs') {
          return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        }
        if (table === 'team_tasks') {
          return {
            select: (columns) => {
              selectedColumns.push(columns);
              const fullTaskRead = columns.includes('title');
              const fallbackTask = columns.includes('id')
                ? currentTask
                : { ...currentTask, id: undefined };
              return {
                eq: async () => ({ data: [fallbackTask], error: null }),
                in: async () => ({ data: fullTaskRead ? [currentTask] : [], error: null }),
              };
            },
          };
        }
        if (table === 'agent_jobs') {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        return {};
      }),
    };

    const result = await handle(admin, { goalId: 'goal-approved', phaseIndex: 0 }, null);

    expect(result.status).toBe('deferred');
    expect(selectedColumns[0]).toContain('id');
  });
});

// Mock for the stuck-task recovery branch: returns one job + a configurable
// set of tasks, and captures every team_tasks.update().eq() call so the test
// can assert on the recovery payload.
function makeRecoveryAdmin({ tasks }) {
  const updates = [];
  return {
    __updates: updates,
    from: vi.fn((table) => {
      if (table === 'jobs') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ id: 'job-1', title: 'Job 1', status: 'done', cost_usd: 0 }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'team_tasks') {
        return {
          select: (cols) => {
            // The .in('job_pool_id', jobIds) call returns the task list
            if (typeof cols === 'string' && cols.includes('data')) {
              return { in: async () => ({ data: tasks, error: null }) };
            }
            // The fallback .eq('data->>goal_id', goal.id) call
            return { eq: async () => ({ data: [], error: null }) };
          },
          update: (payload) => ({
            eq: async (col, val) => {
              updates.push({ payload, where: { [col]: val } });
              return { error: null };
            },
          }),
        };
      }
      return {};
    }),
  };
}

describe('evaluate-phase: stuck-task recovery preserves shipped deployment URLs', () => {
  it('flips a stuck inProgress task to done (not failed) when its output contains a workers.dev URL', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const tasks = [
      {
        id: 'task-shipped',
        title: 'Build landing page',
        status: 'inProgress',
        updated_at: tenMinutesAgo,
        data: {
          phase_index: 0,
          output:
            'DEPLOYMENT_URL: https://luckyvegasempire.misters-builder.workers.dev/\n\n(auto-deployed)',
        },
      },
      {
        // A fresh inProgress task keeps pendingTasks > 0 so the function
        // returns 'deferred' early — keeping this test focused on the
        // recovery branch without needing PM-review mocks downstream.
        id: 'task-fresh',
        title: 'Fresh task',
        status: 'inProgress',
        updated_at: oneMinuteAgo,
        data: { phase_index: 0, output: '' },
      },
    ];
    const admin = makeRecoveryAdmin({ tasks });
    const result = await handle(admin, { goalId: 'goal-x', phaseIndex: 0 }, null);

    const shippedUpdate = admin.__updates.find((u) => u.where['id'] === 'task-shipped');
    expect(shippedUpdate).toBeDefined();
    expect(shippedUpdate.payload.status).toBe('done');
    expect(shippedUpdate.payload.data.recovered_from_timeout).toBe(true);
    expect(shippedUpdate.payload.data.recovered_deployment_url).toMatch(/workers\.dev/);
    // The fresh task should NOT have been touched (still within stuck threshold)
    expect(admin.__updates.find((u) => u.where['id'] === 'task-fresh')).toBeUndefined();
    // And the function should defer (one task is still legitimately in progress)
    expect(result.status).toBe('deferred');
  });

  it('still flips a stuck task to failed when no deployment URL is present', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const tasks = [
      {
        id: 'task-no-url',
        title: 'Some task with no deploy',
        status: 'inProgress',
        updated_at: tenMinutesAgo,
        data: { phase_index: 0, output: 'I tried but nothing was deployed.' },
      },
      {
        id: 'task-keeps-pending',
        title: 'Fresh task',
        status: 'inProgress',
        updated_at: new Date().toISOString(),
        data: { phase_index: 0 },
      },
    ];
    const admin = makeRecoveryAdmin({ tasks });
    await handle(admin, { goalId: 'goal-y', phaseIndex: 0 }, null);

    const update = admin.__updates.find((u) => u.where['id'] === 'task-no-url');
    expect(update).toBeDefined();
    expect(update.payload.status).toBe('failed');
    expect(update.payload.data.error).toMatch(/Task timed out/);
    expect(update.payload.data.recovered_from_timeout).toBeUndefined();
  });
});

const plannedGoal = (status) => ({
  id: 'goal-planned',
  status,
  plan: { phases: [{ name: 'P1', status: 'executing' }] },
  budget_usd: 10,
  spent_usd: 0,
  data: {},
});

const plannedTask = (minutesAgo, id = 'task-rolled-back') => ({
  id,
  title: 'Write the poem draft',
  status: 'planned',
  updated_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
  data: { phase_index: 0, output: '' },
});

describe('evaluate-phase: a task that never started', () => {
  beforeEach(() => enqueueGoalAction.mockClear());

  it('waits instead of grading the phase 0/100 on empty output', async () => {
    // execute-task rolls a task back to `planned` when an authorization
    // re-check refuses it mid-phase, and parks the goal on the approval gate.
    // That task has produced nothing because it never ran - grading it sends
    // "0/1 completed" to the PM, scores 0/100 and burns an iteration on a stall
    // that re-approval would have cleared.
    loadGoal.mockResolvedValueOnce(plannedGoal('awaiting_approval'));
    const admin = makeRecoveryAdmin({ tasks: [plannedTask(30)] });
    const result = await handle(admin, { goalId: 'goal-planned', phaseIndex: 0 }, null);

    expect(result.status).toBe('waiting_on_gate');
    // Age must not fail it while a person is the thing being waited on.
    expect(admin.__updates.find((u) => u.where['id'] === 'task-rolled-back')).toBeUndefined();
  });

  it('does not spin against the gate it is waiting on', async () => {
    // The deferred branch re-queues this stage, so a task that pends forever
    // would burn a worker job every cycle with nothing to show for it.
    // Approving re-releases the phase; execute-task queues this stage again.
    loadGoal.mockResolvedValueOnce(plannedGoal('awaiting_approval'));
    const admin = makeRecoveryAdmin({ tasks: [plannedTask(30)] });
    await handle(admin, { goalId: 'goal-planned', phaseIndex: 0 }, null);

    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('keeps polling while the goal is genuinely running', async () => {
    loadGoal.mockResolvedValueOnce(plannedGoal('active'));
    const admin = makeRecoveryAdmin({ tasks: [plannedTask(1)] });
    const result = await handle(admin, { goalId: 'goal-planned', phaseIndex: 0 }, null);

    expect(result.status).toBe('deferred');
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'evaluate-phase', 'goal-planned', {
      phaseIndex: 0,
    });
  });

  it('keeps the exact feedback generation on a deferred evaluator continuation', async () => {
    const feedbackGoal = plannedGoal('active');
    feedbackGoal.iteration = 0;
    feedbackGoal.plan.phases[0].feedback = {
      kind: 'feedback_application',
      application_version: 'feedback-v2',
      retry_count: 0,
      iteration: 0,
    };
    feedbackGoal.data.last_feedback_application_version = 'feedback-v2';
    loadGoal.mockResolvedValueOnce(feedbackGoal);
    const pending = plannedTask(1);
    pending.data.feedback_application_version = 'feedback-v2';
    const admin = makeRecoveryAdmin({ tasks: [pending] });

    const result = await handle(
      admin,
      {
        goalId: 'goal-planned',
        phaseIndex: 0,
        feedbackApplicationVersion: 'feedback-v2',
      },
      null
    );

    expect(result.status).toBe('deferred');
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'evaluate-phase', 'goal-planned', {
      phaseIndex: 0,
      feedbackApplicationVersion: 'feedback-v2',
    });
  });

  it('times a planned task out once nothing is holding execution', async () => {
    // Otherwise the phase pends forever: no gate to clear, no work in flight.
    loadGoal.mockResolvedValueOnce(plannedGoal('active'));
    // A fresh sibling keeps the phase pending so the run stops at the sweep.
    const admin = makeRecoveryAdmin({ tasks: [plannedTask(30), plannedTask(0, 'task-fresh')] });
    await handle(admin, { goalId: 'goal-planned', phaseIndex: 0 }, null);

    const swept = admin.__updates.find((u) => u.where['id'] === 'task-rolled-back');
    expect(swept).toBeDefined();
    expect(swept.payload.status).toBe('failed');
    expect(swept.payload.data.error).toMatch(/planned/);
  });
});
