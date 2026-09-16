/**
 * Tests for iterate.js no-progress detection.
 *
 * Regression: prior version used spend-delta alone as the "no progress"
 * signal. claude-code (Opus Sub) reports estimatedCostUsd: 0 because the
 * subscription is flat-rate, so `spent_usd` never moves regardless of
 * whether real work happened. The fix adds a second signal - count of
 * team_tasks with status='done' AND non-empty data.output - and requires
 * BOTH to be unchanged before escalating to needs_human.
 *
 * Second regression: that secondary signal originally filtered on a
 * phantom column `task_output` (does not exist on team_tasks). The query
 * threw, the catch swallowed it, the count stayed at 0, and stall-
 * detection fired falsely on every subscription-billed goal. The "tracks
 * the correct JSONB path on the data column" test below pins the column
 * name to prevent that regression returning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  executeLlm: vi.fn(async () => ({ content: '{}', usage: {}, estimatedCostUsd: 0 })),
  parseLlmJson: vi.fn(() => ({ phases: [{ name: 'P1' }] })),
}));

vi.mock('../loop-continuation.js', () => ({
  tryHealContinuation: vi.fn(),
}));

vi.mock('../goal-messaging.js', () => ({
  postMessage: vi.fn(),
}));

const updateGoalMock = vi.fn();
const logGoalEventMock = vi.fn();
const notifyGoalEventMock = vi.fn();
const enqueueGoalActionMock = vi.fn();
const updateGoalIfNativeScopeBindingMock = vi.fn(async () => true);
const checkBudgetMock = vi.fn(() => ({ ok: true }));

vi.mock('../_helpers.js', () => ({
  logGoalEvent: (...args) => logGoalEventMock(...args),
  updateGoal: (...args) => updateGoalMock(...args),
  notifyGoalEvent: (...args) => notifyGoalEventMock(...args),
  enqueueGoalAction: (...args) => enqueueGoalActionMock(...args),
  updateGoalIfNativeScopeBinding: (...args) => updateGoalIfNativeScopeBindingMock(...args),
  loadGoal: vi.fn(async () => null),
  checkBudget: (...args) => checkBudgetMock(...args),
  trackTokenSpend: vi.fn(),
  pickTestModel: vi.fn(() => ({})),
  normalizePlanShape: vi.fn((p) => p),
  recordStageLlmUsage: vi.fn(),
}));

import { handle, invalidateExecutionForReplan } from './iterate.js';
import { loadGoal } from '../_helpers.js';
import { executeLlm, parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { postMessage } from '../goal-messaging.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../approval-audit.js';
import { selectWorkShapePlaybook, WORK_SHAPE_ROUTE_VERSION } from '../work-shape-playbooks.js';

function nativeIterationGoal(overrides = {}) {
  const packet = nativeScopePacketFixture({
    admission: {
      version: 'axwise_scope_admission_v1',
      work_types: ['mixed_custom'],
      geographies: [],
      channels: [],
      success_criteria: ['The accepted output is reviewable'],
      required_capabilities: [],
      requested_actions: [],
    },
  });
  const contracts = nativeDecisionContractsFixture(packet);
  const goal = {
    id: 'goal-native-iterate',
    user_id: 'user-1',
    org_id: 'org-1',
    title: 'STALE RAW TITLE',
    description: 'STALE RAW DESCRIPTION',
    status: 'active',
    updated_at: '2026-08-24T08:00:00.000Z',
    iteration: 1,
    max_iterations: 5,
    spent_usd: 1,
    budget_usd: 100,
    plan: { phases: [{ name: 'P1', status: 'failed' }] },
    data: {
      axwise_customer_intelligence: {
        scope_packet: packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
        updated_at: '2026-08-24T07:59:00.000Z',
      },
    },
    ...overrides,
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
    route_version: WORK_SHAPE_ROUTE_VERSION,
    accepted_at: '2026-08-24T08:00:00.000Z',
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
  };
  goal.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
  };
  return goal;
}

function makeAdmin({
  tasksDoneCount = 0,
  lastFailedTaskError = null,
  landingPages = [],
  taskRows = null,
} = {}) {
  const generatedTaskRows = [
    ...Array.from({ length: tasksDoneCount }, (_, index) => ({
      id: `done-${index}`,
      status: 'done',
      data: { output: `output-${index}` },
      updated_at: `2026-08-12T10:00:${String(index).padStart(2, '0')}Z`,
    })),
    ...(lastFailedTaskError
      ? [
          {
            id: 'failed-current',
            status: 'failed',
            data: { error: lastFailedTaskError },
            updated_at: '2026-08-12T11:00:00Z',
          },
        ]
      : []),
  ];
  const admin = {
    from: vi.fn((table) => {
      if (table === 'landing_pages') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: landingPages, error: null }),
            }),
          }),
        };
      }
      if (table === 'team_tasks') {
        return {
          select: () => {
            const query = {
              eq: vi.fn(() => query),
              then: (resolve) => resolve({ data: taskRows || generatedTaskRows, error: null }),
            };
            return query;
          },
        };
      }
      return {
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
      };
    }),
  };
  return admin;
}

beforeEach(() => {
  loadGoal.mockReset();
  executeLlm.mockClear();
  parseLlmJson.mockClear();
  postMessage.mockClear();
  updateGoalMock.mockReset();
  logGoalEventMock.mockReset();
  notifyGoalEventMock.mockReset();
  enqueueGoalActionMock.mockReset();
  updateGoalIfNativeScopeBindingMock.mockReset();
  updateGoalIfNativeScopeBindingMock.mockResolvedValue(true);
  checkBudgetMock.mockReset();
  checkBudgetMock.mockReturnValue({ ok: true });
});

describe('iterate: execution approval invalidation', () => {
  it('leaves pre-approval and no-tool goal data unchanged', () => {
    expect(invalidateExecutionForReplan({ marker: 'pre-approval' })).toEqual({
      marker: 'pre-approval',
    });
  });

  it('preserves context approval but invalidates the replaced execution package', () => {
    const contextApproval = {
      kind: 'context',
      status: 'approved',
      snapshot_hash: 'context-hash',
    };
    const executionApproval = {
      kind: 'execution',
      status: 'approved',
      snapshot_hash: 'old-execution-hash',
      approved_at: '2026-08-03T23:02:11.478Z',
    };
    const oldManifest = {
      tasks: [{ task_id: 'old-task', required_tool_ids: [] }],
      valid: true,
    };

    const value = invalidateExecutionForReplan({
      customer_marker: 'preserved',
      goal_approvals: { context: contextApproval, execution: executionApproval },
      execution_authorization: {
        status: 'approved',
        snapshot_hash: 'old-execution-hash',
        manifest: oldManifest,
      },
    });

    expect(value.customer_marker).toBe('preserved');
    expect(value.goal_approvals.context).toBe(contextApproval);
    expect(value.goal_approvals.execution).toMatchObject({
      status: 'invalidated',
      snapshot_hash: 'old-execution-hash',
      invalidation_reason: 'plan_replaced_by_iteration',
    });
    expect(value.execution_authorization).toMatchObject({
      status: 'invalidated',
      snapshot_hash: null,
      invalidation_reason: 'plan_replaced_by_iteration',
      manifest: oldManifest,
    });
  });
});

describe('iterate: native AxWise canonical replanning', () => {
  it('reserves canonical PM planning and never calls the raw re-planner', async () => {
    const goal = nativeIterationGoal();
    loadGoal.mockResolvedValueOnce(goal);
    const admin = makeAdmin();

    await expect(
      handle(admin, { goalId: goal.id, feedback: 'The phase failed' }, null)
    ).resolves.toMatchObject({
      status: 'canonical_stage_queued',
      canonicalAction: 'pm-planning',
      iteration: 2,
    });

    expect(updateGoalIfNativeScopeBindingMock).toHaveBeenCalledWith(
      admin,
      goal.id,
      'active',
      expect.objectContaining({
        scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
        goal_updated_at: goal.updated_at,
        planning_authority: expect.objectContaining({ context_status: 'approved' }),
      }),
      expect.objectContaining({ status: 'planning', iteration: 2 })
    );
    expect(enqueueGoalActionMock).toHaveBeenCalledWith(admin, 'pm-planning', goal.id);
    expect(executeLlm).not.toHaveBeenCalled();
    expect(admin.from.mock.calls.some(([table]) => table === 'landing_pages')).toBe(false);
  });

  it('honors the max-iteration guard before reserving native planning', async () => {
    const goal = nativeIterationGoal({ iteration: 5, max_iterations: 5 });
    loadGoal.mockResolvedValueOnce(goal);
    const admin = makeAdmin();

    await expect(handle(admin, { goalId: goal.id }, null)).resolves.toMatchObject({
      status: 'max_iterations',
    });

    expect(updateGoalIfNativeScopeBindingMock).toHaveBeenCalledTimes(1);
    expect(updateGoalIfNativeScopeBindingMock.mock.calls[0][4]).toMatchObject({ status: 'failed' });
    expect(enqueueGoalActionMock).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
  });

  it('honors the budget guard before reserving native planning', async () => {
    const goal = nativeIterationGoal();
    loadGoal.mockResolvedValueOnce(goal);
    checkBudgetMock.mockReturnValueOnce({ ok: false, warning: false, reason: 'budget exhausted' });
    const admin = makeAdmin();

    await expect(handle(admin, { goalId: goal.id }, null)).resolves.toMatchObject({
      status: 'budget_exhausted',
    });

    expect(updateGoalIfNativeScopeBindingMock).toHaveBeenCalledTimes(1);
    expect(updateGoalIfNativeScopeBindingMock.mock.calls[0][4]).toMatchObject({ status: 'failed' });
    expect(enqueueGoalActionMock).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
  });

  it('blocks a damaged native row before any legacy query or write', async () => {
    const goal = nativeIterationGoal();
    delete goal.data.axwise_customer_intelligence.scope_packet;
    loadGoal.mockResolvedValueOnce(goal);
    const admin = makeAdmin();

    await expect(handle(admin, { goalId: goal.id }, null)).resolves.toMatchObject({
      status: 'state_changed',
      reason: 'native_canonical_replan_blocked',
    });

    expect(updateGoalIfNativeScopeBindingMock).not.toHaveBeenCalled();
    expect(enqueueGoalActionMock).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });
});

describe('iterate: no-progress escalation (multi-signal)', () => {
  it('does NOT escalate when spend is $0 across iterations BUT a task got completed in between (Opus Sub case)', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g1',
      iteration: 2,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: {
        iteration_failures: [
          {
            reason: 'phase 2 failed',
            iteration: 0,
            spend_at_iteration: 0,
            tasks_done_at_iteration: 0,
            at: '2025-01-01T00:00:00Z',
          },
          {
            reason: 'phase 2 failed again',
            iteration: 1,
            spend_at_iteration: 0,
            tasks_done_at_iteration: 0,
            at: '2025-01-01T01:00:00Z',
          },
        ],
      },
      plan: {
        phases: [
          { name: 'P1', status: 'completed' },
          { name: 'P2', status: 'pending' },
        ],
      },
    });
    const admin = makeAdmin({
      tasksDoneCount: 1,
      lastFailedTaskError: 'CLAUDE_CODE_STREAM_TIMEOUT',
    });

    await handle(admin, { goalId: 'g1', feedback: 'phase 2 implementation failed' }, null);

    const noProgressWrite = updateGoalMock.mock.calls.find(
      (c) => c[2]?.status === 'needs_human' && c[2]?.data?.no_progress_escalated
    );
    expect(noProgressWrite).toBeUndefined();
  });

  it('DOES escalate when both spend AND task count are unchanged across iterations', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g2',
      iteration: 2,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: {
        iteration_failures: [
          {
            reason: 'phase 2 failed',
            iteration: 0,
            spend_at_iteration: 0,
            tasks_done_at_iteration: 0,
            at: '2025-01-01T00:00:00Z',
          },
          {
            reason: 'phase 2 failed again',
            iteration: 1,
            spend_at_iteration: 0,
            tasks_done_at_iteration: 0,
            at: '2025-01-01T01:00:00Z',
          },
        ],
      },
      plan: { phases: [{ name: 'P1' }] },
    });
    const admin = makeAdmin({
      tasksDoneCount: 0,
      lastFailedTaskError: 'CLAUDE_CODE_STREAM_TIMEOUT',
    });

    await handle(admin, { goalId: 'g2', feedback: 'agent has not started work' }, null);

    const noProgressWrite = updateGoalMock.mock.calls.find(
      (c) => c[2]?.status === 'needs_human' && c[2]?.data?.no_progress_escalated
    );
    expect(noProgressWrite).toBeDefined();
    expect(noProgressWrite[2].data.failure_reason).toMatch(/CLAUDE_CODE_STREAM_TIMEOUT/);
    expect(noProgressWrite[2].data.failure_reason).toMatch(
      /no spend delta.*no new completed tasks/
    );
  });

  it('records tasks_done_at_iteration on every iteration_failures entry it writes', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g3',
      iteration: 1,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: { iteration_failures: [] },
      plan: { phases: [{ name: 'P1' }] },
    });
    const admin = makeAdmin({ tasksDoneCount: 3, lastFailedTaskError: null });

    await handle(admin, { goalId: 'g3', feedback: 'something went wrong' }, null);

    const entryWrite = updateGoalMock.mock.calls.find(
      (c) =>
        Array.isArray(c[2]?.data?.iteration_failures) && c[2].data.iteration_failures.length > 0
    );
    expect(entryWrite).toBeDefined();
    const lastEntry =
      entryWrite[2].data.iteration_failures[entryWrite[2].data.iteration_failures.length - 1];
    expect(lastEntry.tasks_done_at_iteration).toBe(3);
    expect(lastEntry.spend_at_iteration).toBe(0);

    const planWrite = updateGoalMock.mock.calls.find((call) => call[2]?.plan?.phases?.length);
    expect(planWrite[2].data.iteration_failures.at(-1)).toMatchObject({
      tasks_done_at_iteration: 3,
      spend_at_iteration: 0,
    });
  });

  it('counts completions and the latest error only inside the current attempt', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g-regression',
      iteration: 1,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: {
        iteration_failures: [],
        axwise_orchestration: { decision_id: 'decision-new' },
      },
      plan: { phases: [{ name: 'P1' }] },
    });
    const admin = makeAdmin({
      taskRows: [
        {
          id: 'old-done-1',
          status: 'done',
          data: { output: 'old', axwise_decision_id: 'decision-old' },
          updated_at: '2026-08-12T12:00:00Z',
        },
        {
          id: 'old-done-2',
          status: 'done',
          data: { output: 'old', axwise_decision_id: 'decision-old' },
          updated_at: '2026-08-12T12:01:00Z',
        },
        {
          id: 'old-failed',
          status: 'failed',
          data: { error: 'OLD_ERROR', axwise_decision_id: 'decision-old' },
          updated_at: '2026-08-12T12:02:00Z',
        },
        {
          id: 'current-done',
          status: 'done',
          data: { output: 'current', axwise_decision_id: 'decision-new' },
          updated_at: '2026-08-12T11:00:00Z',
        },
        {
          id: 'current-failed',
          status: 'failed',
          data: { error: 'CURRENT_ERROR', axwise_decision_id: 'decision-new' },
          updated_at: '2026-08-12T11:01:00Z',
        },
      ],
    });
    await handle(admin, { goalId: 'g-regression', feedback: 'check column' }, null);

    const entryWrite = updateGoalMock.mock.calls.find((call) =>
      Array.isArray(call[2]?.data?.iteration_failures)
    );
    const entry = entryWrite[2].data.iteration_failures.at(-1);
    expect(entry.tasks_done_at_iteration).toBe(1);
    expect(entry.reason).toContain('CURRENT_ERROR');
    expect(entry.reason).not.toContain('OLD_ERROR');
  });
});

describe('iterate: re-plan retry before hard-fail', () => {
  beforeEach(() => {
    executeLlm.mockClear();
    parseLlmJson.mockReset();
    // Default: a valid plan, so the base mock behaves like the rest of the file.
    parseLlmJson.mockReturnValue({ phases: [{ name: 'P1' }] });
  });

  it('retries once when the first re-plan yields no phases, then proceeds (Opus Sub prose case)', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g-retry',
      iteration: 1,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: { iteration_failures: [] },
      plan: { phases: [{ name: 'P1' }] },
    });
    // First replan parse → prose / no phases; retry → valid plan.
    parseLlmJson
      .mockReturnValueOnce({ strategy: 'prose, no phases' })
      .mockReturnValueOnce({ phases: [{ name: 'Revised', jobs: [] }] });

    const admin = makeAdmin({ tasksDoneCount: 3 });
    await handle(admin, { goalId: 'g-retry', feedback: 'phase failed' }, null);

    // Re-planner was invoked twice (initial + one retry).
    expect(executeLlm).toHaveBeenCalledTimes(2);
    // The retry prompt hammers on JSON-only output.
    const retryPrompt = executeLlm.mock.calls[1][0].prompt;
    expect(retryPrompt).toMatch(/ONLY a single valid JSON object/i);
    // A retry breadcrumb was logged.
    expect(logGoalEventMock).toHaveBeenCalledWith(
      admin,
      'g-retry',
      'replan_retry',
      expect.any(Object)
    );
    // It did NOT hard-fail — no "Re-plan failed" write.
    const failedWrite = updateGoalMock.mock.calls.find((c) => c[2]?.status === 'failed');
    expect(failedWrite).toBeUndefined();
    // It committed the revised plan.
    const planWrite = updateGoalMock.mock.calls.find((c) => c[2]?.plan?.phases?.length);
    expect(planWrite).toBeDefined();
  });

  it('normalizes replacement-plan aliases while preserving genuine Python and SQL blockers', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g-normalize-replan',
      title: 'Create an operational analysis pack',
      description: 'Produce a reviewable report and a separate executable analysis task.',
      iteration: 1,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: { iteration_failures: [] },
      plan: { phases: [{ name: 'Original', jobs: [] }] },
    });
    parseLlmJson.mockReturnValueOnce({
      strategy: 'Revised strategy',
      phases: [
        {
          name: 'Revised',
          jobs: [
            {
              title: 'Write the findings and validation checklist',
              description: 'Create a reviewable document with a simple diagram.',
              required_role: 'Analyst',
              deliverable_type: 'Google Docs',
              tool_requirements: ['Excel', 'Google Docs', 'Validation Checklist'],
            },
            {
              title: 'Run the requested computation',
              description: 'Execute the explicitly requested Python and SQL analysis.',
              required_role: 'Data Analyst',
              deliverable_type: 'Data Analysis Results',
              tool_requirements: ['Python', 'SQL'],
            },
          ],
        },
      ],
    });

    const admin = makeAdmin({ tasksDoneCount: 3 });
    await handle(admin, { goalId: 'g-normalize-replan', feedback: 'revise the plan' }, null);

    const planWrite = updateGoalMock.mock.calls.find((call) => call[2]?.plan?.phases?.length);
    expect(planWrite).toBeDefined();
    const [documentJob, runtimeJob] = planWrite[2].plan.phases[0].jobs;
    expect(documentJob).toMatchObject({
      deliverable_type: 'markdown',
      tool_requirements: ['tool-doc-generator'],
    });
    expect(runtimeJob).toMatchObject({
      deliverable_type: 'markdown',
      tool_requirements: ['tool-python', 'tool-sql'],
    });
  });

  it('bounds absent-record analysis on AxWise replacement plans while preserving framework work', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g-axwise-absent-records',
      title: 'Build a retention operating plan',
      description: 'Use declared cohort themes; no records are attached.',
      iteration: 1,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: {
        attachments: [],
        iteration_failures: [],
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'human_controlled' },
          persona_resolution: {
            customer_persona: {
              trust: { status: 'declared_unverified', evidence_count: 1 },
              evidence: [
                {
                  quote: 'We believe delivery delays increase churn.',
                  provenance: 'operational',
                  document_id: 'orqaly:goal:g:po-answer:1',
                },
              ],
            },
          },
        },
      },
      plan: { phases: [{ name: 'Original', jobs: [] }] },
    });
    parseLlmJson.mockReturnValueOnce({
      strategy: 'Calculate cohort churn and build the operating plan.',
      phases: [
        {
          name: 'Revised',
          jobs: [
            {
              title: 'Analyze cohort records',
              description: 'Query SQL and calculate churn from subscription rows.',
              required_role: 'Analyst',
              deliverable_type: 'data',
              tool_requirements: [
                'Python/Pandas',
                'SQL',
                'Google Sheets',
                'Notion',
                'PDF Generator',
              ],
            },
            {
              title: 'Flexible Subscription Framework',
              description: 'Define future pause and skip rules from declared context.',
              required_role: 'Operations Strategist',
              deliverable_type: 'markdown',
              tool_requirements: ['Notion', 'PDF Generator'],
            },
          ],
        },
      ],
    });

    const admin = makeAdmin({ tasksDoneCount: 3 });
    await handle(admin, { goalId: 'g-axwise-absent-records', feedback: 'revise safely' }, null);

    expect(executeLlm.mock.calls[0][0].prompt).toContain('AXWISE EVIDENCE EXECUTION BOUNDARY');
    const planWrite = updateGoalMock.mock.calls.find((call) => call[2]?.plan?.phases?.length);
    const [methodology, framework] = planWrite[2].plan.phases[0].jobs;
    expect(methodology).toMatchObject({
      category: 'methodology',
      deliverable_type: 'markdown',
      tool_requirements: ['tool-doc-generator'],
    });
    expect(methodology.title).toContain('Specify methodology and required inputs');
    expect(framework).toMatchObject({
      title: 'Flexible Subscription Framework',
      tool_requirements: ['tool-doc-generator'],
    });
  });

  it('atomically invalidates the prior execution approval when it persists a replacement plan', async () => {
    const contextApproval = {
      kind: 'context',
      status: 'approved',
      snapshot_hash: 'context-hash',
    };
    loadGoal.mockResolvedValueOnce({
      id: 'g-reapproval-boundary',
      title: 'Revise the operating plan',
      description: 'Use the existing customer context.',
      iteration: 0,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: {
        goal_approvals: {
          context: contextApproval,
          execution: {
            kind: 'execution',
            status: 'approved',
            snapshot_hash: 'old-execution-hash',
          },
        },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'old-execution-hash',
          manifest: {
            tasks: [{ task_id: 'old-task', required_tool_ids: [] }],
            valid: true,
          },
        },
      },
      plan: { phases: [{ name: 'Old phase', jobs: [] }] },
    });
    parseLlmJson.mockReturnValueOnce({
      strategy: 'Replacement strategy',
      phases: [
        {
          name: 'New phase',
          jobs: [
            {
              title: 'Analyze declared data',
              description: 'Use the declared records.',
              required_role: 'Analyst',
              deliverable_type: 'markdown',
              tool_requirements: ['SQL'],
            },
          ],
        },
      ],
    });

    const admin = makeAdmin({ tasksDoneCount: 1 });
    await handle(admin, { goalId: 'g-reapproval-boundary', feedback: '' }, null);

    const planWrite = updateGoalMock.mock.calls.find((call) => call[2]?.plan?.phases?.length);
    expect(planWrite).toBeDefined();
    expect(planWrite[2].data.goal_approvals.context).toBe(contextApproval);
    expect(planWrite[2].data.goal_approvals.execution).toMatchObject({
      status: 'invalidated',
      invalidation_reason: 'plan_replaced_by_iteration',
    });
    expect(planWrite[2].data.execution_authorization).toMatchObject({
      status: 'invalidated',
      snapshot_hash: null,
      invalidation_reason: 'plan_replaced_by_iteration',
    });
    expect(enqueueGoalActionMock).toHaveBeenCalledWith(
      admin,
      'team-formation',
      'g-reapproval-boundary'
    );
    expect(logGoalEventMock).toHaveBeenCalledWith(
      admin,
      'g-reapproval-boundary',
      'execution_approval_invalidated',
      {
        reason: 'plan_replaced_by_iteration',
        prior_snapshot_hash: 'old-execution-hash',
        iteration: 1,
      }
    );
  });

  it('hard-fails only after the retry also yields no phases', async () => {
    loadGoal.mockResolvedValueOnce({
      id: 'g-retry-fail',
      iteration: 1,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 35,
      data: { iteration_failures: [] },
      plan: { phases: [{ name: 'P1' }] },
    });
    parseLlmJson.mockReturnValueOnce(null).mockReturnValueOnce(null);

    const admin = makeAdmin({ tasksDoneCount: 3 });
    await handle(admin, { goalId: 'g-retry-fail', feedback: 'phase failed' }, null);

    expect(executeLlm).toHaveBeenCalledTimes(2);
    const failedWrite = updateGoalMock.mock.calls.find(
      (c) => c[2]?.status === 'failed' && /Re-plan failed/.test(c[2]?.data?.failure_reason || '')
    );
    expect(failedWrite).toBeDefined();
  });
});

describe('iterate: the re-planning announcement', () => {
  it('elides a long strategy on a word boundary instead of cutting mid-word', async () => {
    // A flat slice(0, 120) ended the team-room message on "half-page r",
    // which reads as a bug rather than an elision.
    const strategy =
      'Rebuild the drafting phase around a single writer who produces one complete, ' +
      'high-quality, half-page rhyming poem with a clear structure, then hand it to ' +
      'an editor for a final polish, a metre check and a read-aloud pass before ' +
      'the finished piece is delivered to the requester for approval.';
    loadGoal.mockResolvedValueOnce({
      id: 'g-truncation',
      title: 'Write a poem',
      description: 'A half-page poem.',
      iteration: 1,
      max_iterations: 5,
      spent_usd: 0,
      budget_usd: 10,
      data: { iteration_failures: [] },
      plan: { phases: [{ name: 'Original', jobs: [] }] },
    });
    parseLlmJson.mockReturnValueOnce({
      strategy,
      phases: [
        {
          name: 'Drafting',
          jobs: [
            {
              title: 'Write the poem draft',
              description: 'Produce one complete half-page rhyming poem.',
              required_role: 'Copywriter',
              deliverable_type: 'markdown',
            },
          ],
        },
      ],
    });

    const admin = makeAdmin({ tasksDoneCount: 1 });
    await handle(admin, { goalId: 'g-truncation', feedback: 'Phase failed' }, null);

    const announcement = postMessage.mock.calls
      .map(([, args]) => args?.message || '')
      .filter((message) => message.startsWith('Re-planning:'))
      .pop();
    expect(announcement).toBeDefined();
    expect(announcement).toMatch(/…$/);
    // The last word before the ellipsis is a whole word from the strategy.
    const lastWord = announcement.replace(/…$/, '').trim().split(/\s+/).pop();
    expect(strategy.split(/\s+/)).toContain(lastWord);
  });
});
