import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_helpers.js', () => ({
  enqueueGoalAction: vi.fn(async () => {}),
  loadGoal: vi.fn(),
  logGoalEvent: vi.fn(async () => {}),
  notifyGoalEvent: vi.fn(async () => {}),
  updateGoalIfStatus: vi.fn(async () => true),
}));
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../execution-authorization.js', () => ({
  loadExecutionAuthorizationManifest: vi.fn(),
  stampTaskExecutionAuthorization: vi.fn(async () => {}),
}));

import { handle } from './client-approval.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../approval-audit.js';
import { enqueueGoalAction, loadGoal, notifyGoalEvent, updateGoalIfStatus } from '../_helpers.js';
import { loadExecutionAuthorizationManifest } from '../execution-authorization.js';
import { MAX_AUTO_APPROVALS } from '../hitl-policy.js';

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

function goal(overrides = {}) {
  const value = {
    id: 'goal-1',
    user_id: 'user-1',
    status: 'estimating',
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
    ...overrides,
  };
  value.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(value), 'user-1'),
  };
  return value;
}

function approveJobs() {
  return enqueueGoalAction.mock.calls.filter(
    ([, action, , extra]) => action === 'client-approval' && extra?.approval_action === 'approve'
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  loadExecutionAuthorizationManifest.mockResolvedValue(structuredClone(authorizationManifest));
});

describe('client approval stage, unattended goals', () => {
  it('still parks at awaiting_approval before enqueuing its own approval', async () => {
    loadGoal.mockResolvedValue(goal({ hitl_mode: 'unattended' }));

    const result = await handle({}, { goalId: 'goal-1' }, {});

    // The durable gate write must happen regardless. If the follow-up job is
    // lost the goal is resumable from the UI rather than silently stalled.
    expect(result.status).toBe('awaiting_approval');
    expect(result.autoApproving).toBe(true);
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

    const jobs = approveJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0][3]).toMatchObject({
      approval_action: 'approve',
      approved_by: 'user-1',
      auto_approval: { policy: 'hitl_unattended' },
    });
    expect(jobs[0][3].auto_approval.snapshot_hash).toEqual(result.approvalHash);
  });

  it('bumps the execution counter in the same update that opens the gate', async () => {
    loadGoal.mockResolvedValue(goal({ hitl_mode: 'unattended' }));

    await handle({}, { goalId: 'goal-1' }, {});

    const [, , , patch] = updateGoalIfStatus.mock.calls[0];
    expect(patch.data.hitl_auto_approvals).toEqual({ execution: 1 });
  });

  it('does not notify the owner to review a proposal it is approving itself', async () => {
    loadGoal.mockResolvedValue(goal({ hitl_mode: 'unattended' }));

    await handle({}, { goalId: 'goal-1' }, {});

    expect(notifyGoalEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'proposal_ready',
      expect.anything()
    );
  });

  it('stops auto-approving once the attempt cap is reached', async () => {
    const value = goal({ hitl_mode: 'unattended' });
    value.data.hitl_auto_approvals = { execution: MAX_AUTO_APPROVALS };
    loadGoal.mockResolvedValue(value);

    const result = await handle({}, { goalId: 'goal-1' }, {});

    expect(result.status).toBe('awaiting_approval');
    expect(result.autoApproving).toBeUndefined();
    expect(approveJobs()).toHaveLength(0);
    // Falls back to asking the human, which is the safe direction.
    expect(notifyGoalEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'proposal_ready',
      expect.anything()
    );
  });

  it('fails closed on an invalid authorization manifest instead of approving', async () => {
    loadExecutionAuthorizationManifest.mockResolvedValue({
      ...structuredClone(authorizationManifest),
      valid: false,
      issues: ['missing_tool_grant'],
    });
    loadGoal.mockResolvedValue(goal({ hitl_mode: 'unattended' }));

    const result = await handle({}, { goalId: 'goal-1' }, {});

    expect(result.status).toBe('authorization_incomplete');
    expect(approveJobs()).toHaveLength(0);
  });
});

describe('client approval stage, checkpoints goals', () => {
  it.each([['checkpoints'], [undefined]])(
    'never auto-approves when hitl_mode is %s',
    async (hitlMode) => {
      loadGoal.mockResolvedValue(goal(hitlMode ? { hitl_mode: hitlMode } : {}));

      const result = await handle({}, { goalId: 'goal-1' }, {});

      expect(result.status).toBe('awaiting_approval');
      expect(approveJobs()).toHaveLength(0);
      const [, , , patch] = updateGoalIfStatus.mock.calls[0];
      expect(patch.data.hitl_auto_approvals).toBeUndefined();
      expect(notifyGoalEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'proposal_ready',
        expect.anything()
      );
    }
  );
});
