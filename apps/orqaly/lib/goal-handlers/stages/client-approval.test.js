import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_helpers.js', () => ({
  enqueueGoalAction: vi.fn(async () => {}),
  finishGoalExecutionApprovalAttempt: vi.fn(async () => true),
  loadGoal: vi.fn(),
  logGoalEvent: vi.fn(async () => {}),
  notifyGoalEvent: vi.fn(async () => {}),
  reserveGoalExecutionApproval: vi.fn(async () => true),
  updateGoalIfStatus: vi.fn(async () => true),
  updateGoalIfNativeScopeBinding: vi.fn(async () => true),
}));
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../execution-authorization.js', () => ({
  loadExecutionAuthorizationManifest: vi.fn(),
  stampTaskExecutionAuthorization: vi.fn(async () => {}),
}));

import { handle } from './client-approval.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
  buildExecutionApprovalSnapshot,
  pendingApproval,
} from '../approval-audit.js';
import {
  enqueueGoalAction,
  finishGoalExecutionApprovalAttempt,
  loadGoal,
  reserveGoalExecutionApproval,
  updateGoalIfNativeScopeBinding,
  updateGoalIfStatus,
} from '../_helpers.js';
import {
  loadExecutionAuthorizationManifest,
  stampTaskExecutionAuthorization,
} from '../execution-authorization.js';
import { acceptedNativeGoalFixture } from '../../_shared/native-goal-authority.test-fixture.js';

const authorizationManifest = {
  version: 'orqaly_execution_authorization_v1',
  goal_id: 'goal-1',
  team_id: 'team-1',
  team_members: [{ agent_id: 'agent-1', team_role: 'member' }],
  agent_grants: [{ agent_id: 'agent-1', tool_ids: [] }],
  tasks: [
    {
      task_id: 'task-1',
      step_id: 'step-1',
      agent_id: 'agent-1',
      required_tool_ids: [],
      granted_tool_ids: [],
      tool_grants: [],
    },
  ],
  valid: true,
  issues: [],
};

function goal() {
  const value = {
    id: 'goal-1',
    user_id: 'user-1',
    status: 'estimating',
    updated_at: '2026-08-24T08:00:00.000Z',
    title: 'Reduce no-shows',
    description: 'Reduce missed dental appointments.',
    budget_usd: 20,
    iteration: 0,
    agent_team_id: 'team-1',
    tech_doc: {
      target_audience: 'Clinic operations manager',
      problem_statement: 'No-shows leave capacity unused.',
      success_criteria: ['Reduce no-shows by 20%'],
    },
    plan: { phases: [{ name: 'Diagnose', jobs: [] }] },
    proposal: { total_cost: { total: 2 }, estimates: { total_estimated_time_minutes: 10 } },
    data: {
      axwise_customer_intelligence: {
        decision_id: 'context-1',
        request_hash: 'request-1',
        routing_mode: 'direct',
        persona_resolution: {
          customer_persona: { name: 'Clinic operations manager' },
          ideal_agent_persona: { role: 'Clinic operations specialist' },
        },
      },
      axwise_orchestration: { decision_id: 'team-1', assignments: { step: 'agent-1' } },
    },
  };
  value.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(value), 'user-1'),
  };
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadExecutionAuthorizationManifest.mockResolvedValue(structuredClone(authorizationManifest));
});

describe('client approval stage', () => {
  it('pauses every mode with a hashed final proposal', async () => {
    const value = { ...goal(), mode: 'simple' };
    loadGoal.mockResolvedValue(value);

    const result = await handle({}, { goalId: 'goal-1' }, {});

    expect(result.status).toBe('awaiting_approval');
    expect(updateGoalIfStatus).toHaveBeenCalledWith(
      {},
      'goal-1',
      'estimating',
      expect.objectContaining({
        status: 'awaiting_approval',
        data: expect.objectContaining({
          goal_approvals: expect.objectContaining({
            execution: expect.objectContaining({ status: 'pending' }),
          }),
        }),
      })
    );
  });

  it('starts execution only when the reviewed proposal snapshot still matches', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, authorizationManifest)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('approved');
    expect(finishGoalExecutionApprovalAttempt).toHaveBeenCalledWith(
      {},
      'goal-1',
      expect.objectContaining({
        attemptToken: expect.any(String),
        snapshotHash: value.data.goal_approvals.execution.snapshot_hash,
        updates: expect.objectContaining({
          status: 'active',
          data: expect.objectContaining({
            goal_approvals: expect.objectContaining({
              execution: expect.objectContaining({ status: 'approved', approved_by: 'user-1' }),
            }),
          }),
        }),
      })
    );
    expect(reserveGoalExecutionApproval).toHaveBeenCalledWith(
      {},
      value,
      expect.objectContaining({
        snapshotHash: value.data.goal_approvals.execution.snapshot_hash,
        attemptToken: expect.any(String),
        startedAt: expect.any(String),
        nativeBinding: null,
      })
    );
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'execute-phase', 'goal-1', {
      phaseIndex: 0,
    });
    expect(stampTaskExecutionAuthorization).toHaveBeenCalledWith(
      {},
      value,
      authorizationManifest,
      expect.any(String)
    );
  });

  it('does not reserve a same-status proposal refresh with an older Gate-2 snapshot', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, authorizationManifest)
    );
    loadGoal.mockResolvedValue(value);
    reserveGoalExecutionApproval.mockResolvedValueOnce(false);

    const result = await handle(
      {},
      { goalId: value.id, approval_action: 'approve', approved_by: value.user_id },
      {}
    );

    expect(result.status).toBe('state_changed');
    expect(reserveGoalExecutionApproval).toHaveBeenCalledWith(
      {},
      value,
      expect.objectContaining({
        snapshotHash: value.data.goal_approvals.execution.snapshot_hash,
      })
    );
    expect(stampTaskExecutionAuthorization).not.toHaveBeenCalled();
    expect(finishGoalExecutionApprovalAttempt).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('reserves a native Gate-2 approval against the accepted scope tuple', async () => {
    const value = acceptedNativeGoalFixture({
      status: 'awaiting_approval',
      agent_team_id: 'team-1',
      proposal: { total_cost: { total: 2 }, estimates: { total_estimated_time_minutes: 10 } },
      plan: { phases: [{ name: 'Execute', jobs: [] }] },
    });
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, authorizationManifest)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      { goalId: value.id, approval_action: 'approve', approved_by: value.user_id },
      {}
    );

    expect(result.status).toBe('approved');
    expect(reserveGoalExecutionApproval).toHaveBeenCalledWith(
      {},
      value,
      expect.objectContaining({
        snapshotHash: value.data.goal_approvals.execution.snapshot_hash,
        nativeBinding: expect.objectContaining({
          scope_hash: value.data.axwise_customer_intelligence.scope_packet.scope_hash,
          goal_updated_at: value.updated_at,
          planning_authority: expect.objectContaining({
            context_status: 'approved',
            scope_admission_status: 'accepted',
          }),
        }),
      })
    );
  });

  it('resumes execution at the first unfinished phase after re-approval', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    value.plan = {
      phases: [
        { name: 'Research', status: 'completed', jobs: [] },
        { name: 'Packaging', status: 'planned', jobs: [] },
        { name: 'Launch', status: 'planned', jobs: [] },
      ],
    };
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, authorizationManifest)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('approved');
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'execute-phase', 'goal-1', {
      phaseIndex: 1,
    });
  });

  it('runs signed landing-page enrichment only after execution approval', async () => {
    const value = goal();
    value.title = 'Build an ecommerce landing page';
    value.status = 'awaiting_approval';
    value.data.goal_approvals.context = approvedApproval(
      'context',
      buildContextApprovalSnapshot(value),
      'user-1'
    );
    const landingManifest = {
      ...authorizationManifest,
      system_enrichments: [
        { id: 'brand-seed', external_services: ['Google Gemini'], effects: [] },
        { id: 'image-pool', external_services: ['Google Gemini', 'Pexels API'], effects: [] },
      ],
    };
    loadExecutionAuthorizationManifest.mockResolvedValue(landingManifest);
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, landingManifest)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('approved');
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'brand-seed', 'goal-1');
    expect(enqueueGoalAction).not.toHaveBeenCalledWith({}, 'execute-phase', 'goal-1', {
      phaseIndex: 0,
    });
  });

  it('starts execution directly when a no-tools landing page approved no enrichments', async () => {
    const value = goal();
    value.title = 'Build an ecommerce landing page without external tools';
    value.status = 'awaiting_approval';
    value.data.tool_mode = 'no_tools';
    value.data.goal_approvals.context = approvedApproval(
      'context',
      buildContextApprovalSnapshot(value),
      'user-1'
    );
    const noToolsManifest = { ...authorizationManifest, system_enrichments: [] };
    loadExecutionAuthorizationManifest.mockResolvedValue(noToolsManifest);
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, noToolsManifest)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('approved');
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'execute-phase', 'goal-1', {
      phaseIndex: 0,
    });
    expect(enqueueGoalAction).not.toHaveBeenCalledWith({}, 'brand-seed', 'goal-1');
  });

  it('refuses approval when the budget changed after review', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value)
    );
    value.budget_usd = 30;
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('stale_proposal');
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('refuses approval when a task assignment changed after review', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, authorizationManifest)
    );
    loadGoal.mockResolvedValue(value);
    loadExecutionAuthorizationManifest.mockResolvedValue({
      ...authorizationManifest,
      tasks: [{ ...authorizationManifest.tasks[0], agent_id: 'agent-2' }],
    });

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('stale_proposal');
    expect(stampTaskExecutionAuthorization).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('pauses safely when an exact task tool grant is missing', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    loadGoal.mockResolvedValue(value);
    loadExecutionAuthorizationManifest.mockResolvedValue({
      ...authorizationManifest,
      valid: false,
      issues: [
        {
          code: 'task_tool_not_granted',
          task_id: 'task-1',
          agent_id: 'agent-1',
          tool_id: 'tool-email',
        },
      ],
    });

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result).toMatchObject({
      status: 'authorization_incomplete',
      goalStatus: 'awaiting_tools',
    });
    expect(stampTaskExecutionAuthorization).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('invalidates the current team so material request changes reform the roster', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    value.agent_team_id = 'agent-team-old';
    value.team_id = 'legacy-team-old';
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      {
        goalId: 'goal-1',
        approval_action: 'request-changes',
        approved_by: 'user-1',
        feedback: 'Use distinct finance, GDPR, sales, risk, and marketing specialists.',
      },
      {}
    );

    expect(result).toMatchObject({ status: 'revision_requested', revisionCount: 1 });
    expect(updateGoalIfStatus).toHaveBeenCalledWith(
      {},
      'goal-1',
      'awaiting_approval',
      expect.objectContaining({
        status: 'analyzing',
        agent_team_id: null,
        team_id: null,
        data: expect.objectContaining({ team_reformation_required: true }),
      })
    );
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'po-analysis', 'goal-1', {
      revision_feedback: 'Use distinct finance, GDPR, sales, risk, and marketing specialists.',
    });
  });

  it('routes native Gate-2 request changes through exact canonical PM planning', async () => {
    const value = acceptedNativeGoalFixture({
      status: 'awaiting_approval',
      agent_team_id: 'agent-team-old',
      team_id: 'legacy-team-old',
      plan: { phases: [{ name: 'Old execution plan', jobs: [] }] },
    });
    value.data.goal_approvals.execution = {
      status: 'approved',
      snapshot_hash: 'old-execution-hash',
      approved_at: '2026-08-24T07:58:00.000Z',
    };
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      {
        goalId: value.id,
        approval_action: 'request-changes',
        approved_by: value.user_id,
        feedback: 'Use separate logistics and regulatory workstreams.',
      },
      {}
    );

    expect(result).toMatchObject({
      status: 'revision_requested',
      revisionKind: 'execution_plan',
      revisionCount: 1,
    });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      value.id,
      'awaiting_approval',
      expect.objectContaining({
        scope_hash: value.data.axwise_customer_intelligence.scope_packet.scope_hash,
        goal_updated_at: value.updated_at,
        planning_authority: expect.objectContaining({
          context_status: 'approved',
          scope_admission_status: 'accepted',
        }),
      }),
      expect.objectContaining({
        status: 'planning',
        agent_team_id: null,
        team_id: null,
        data: expect.objectContaining({
          goal_approvals: expect.objectContaining({
            context: expect.objectContaining({ status: 'approved' }),
            execution: expect.objectContaining({ status: 'invalidated' }),
          }),
          native_execution_plan_revision: expect.objectContaining({
            status: 'requested',
            feedback: 'Use separate logistics and regulatory workstreams.',
          }),
        }),
      })
    );
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'pm-planning', value.id, {
      revision_feedback: 'Use separate logistics and regulatory workstreams.',
    });
    expect(enqueueGoalAction).not.toHaveBeenCalledWith(
      {},
      'po-analysis',
      value.id,
      expect.anything()
    );
  });

  it('fails closed when a native Gate-2 request no longer has accepted authority', async () => {
    const value = acceptedNativeGoalFixture({ status: 'awaiting_approval' });
    value.data.axwise_customer_intelligence.scope_packet = null;
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      {
        goalId: value.id,
        approval_action: 'request-changes',
        approved_by: value.user_id,
        feedback: 'Change the plan.',
      },
      {}
    );

    expect(result).toMatchObject({ status: 'native_scope_not_ready' });
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(updateGoalIfNativeScopeBinding).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it.each(['approve', 'request-changes', 'cancel'])(
    'does not let a delayed %s action revive a cancelled goal',
    async (approvalAction) => {
      const value = goal();
      value.status = 'cancelled';
      loadGoal.mockResolvedValue(value);

      const result = await handle(
        {},
        { goalId: 'goal-1', approval_action: approvalAction, approved_by: 'user-1' },
        {}
      );

      expect(result.status).toBe('not_awaiting_approval');
      expect(updateGoalIfStatus).not.toHaveBeenCalled();
      expect(stampTaskExecutionAuthorization).not.toHaveBeenCalled();
      expect(enqueueGoalAction).not.toHaveBeenCalled();
    }
  );

  it('does not activate or enqueue when cancellation wins the final approval CAS', async () => {
    const value = goal();
    value.status = 'awaiting_approval';
    value.data.goal_approvals.execution = pendingApproval(
      'execution',
      buildExecutionApprovalSnapshot(value, authorizationManifest)
    );
    loadGoal.mockResolvedValue(value);
    finishGoalExecutionApprovalAttempt.mockResolvedValueOnce(false);

    const result = await handle(
      {},
      { goalId: 'goal-1', approval_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('state_changed');
    expect(stampTaskExecutionAuthorization).toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('does not let a stale no-action stage reopen a cancelled goal', async () => {
    const value = goal();
    value.status = 'cancelled';
    loadGoal.mockResolvedValue(value);

    const result = await handle({}, { goalId: 'goal-1' }, {});

    expect(result.status).toBe('not_ready_for_approval');
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });
});
