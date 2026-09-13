import { describe, expect, it } from 'vitest';
import { buildRepairPatch, planRepair } from './repair-authorization-roles.mjs';

function goalWith(issues, extra = {}) {
  return {
    id: 'goal-1',
    status: 'needs_human',
    data: { execution_authorization: { manifest: { valid: false, issues } }, ...extra },
  };
}

describe('planRepair', () => {
  it('repairs a goal blocked by role mismatches', () => {
    const plan = planRepair(
      goalWith([
        { code: 'task_agent_role_mismatch', task_id: 't1', required_role: 'Brand & UX Designer' },
        { code: 'task_agent_role_mismatch', task_id: 't2', required_role: 'QA Analyst' },
      ])
    );
    expect(plan.repairable).toBe(true);
    expect(plan.issueCount).toBe(2);
    expect(plan.reason).toContain('Brand & UX Designer');
  });

  it('leaves a tool-grant problem alone', () => {
    // Rebuilding the team would not add a missing credential.
    const plan = planRepair(goalWith([{ code: 'task_tool_not_granted', tool_id: 'github' }]));
    expect(plan.repairable).toBe(false);
    expect(plan.reason).toContain('tools');
  });

  it('leaves a stale research contract alone', () => {
    const plan = planRepair(goalWith([{ code: 'approved_research_contract_stale' }]));
    expect(plan.repairable).toBe(false);
  });

  it('ignores a goal whose manifest is valid or absent', () => {
    expect(planRepair({ data: {} }).repairable).toBe(false);
    expect(
      planRepair({ data: { execution_authorization: { manifest: { valid: true, issues: [] } } } })
        .repairable
    ).toBe(false);
  });
});

describe('buildRepairPatch', () => {
  const goal = goalWith([{ code: 'task_agent_role_mismatch', required_role: 'Designer' }], {
    goal_approvals: { execution: { status: 'pending', snapshot_hash: 'abc' } },
    hitl_auto_approvals: { context: 1, execution: 2 },
    heal_attempts: 6,
    last_heal_strategy: 'h99-escalate',
  });

  it('sends the goal back to team formation with no team', () => {
    const patch = buildRepairPatch(goal);
    expect(patch.status).toBe('forming_team');
    expect(patch.agent_team_id).toBeNull();
    expect(patch.team_id).toBeNull();
    expect(patch.data.execution_authorization).toBeNull();
  });

  it('invalidates the execution approval rather than dropping it silently', () => {
    const patch = buildRepairPatch(goal);
    expect(patch.data.goal_approvals.execution.status).toBe('invalidated');
    expect(patch.data.goal_approvals.execution.invalidation_reason).toBe('team_rebuild_requested');
  });

  it('lets an unattended goal approve the rebuilt manifest', () => {
    // Left at 2 of 3, the goal would get one retry and stall again.
    const patch = buildRepairPatch(goal);
    expect(patch.data.hitl_auto_approvals.execution).toBe(0);
    expect(patch.data.hitl_auto_approvals.context).toBe(1);
  });

  it('stops the healer re-escalating a goal that was just repaired', () => {
    const patch = buildRepairPatch(goal);
    expect(patch.data.heal_attempts).toBe(0);
    expect(patch.data.last_heal_strategy).toBeNull();
    expect(patch.data.failure_reason).toBeNull();
  });

  it('does not invent an approval where none existed', () => {
    const patch = buildRepairPatch(goalWith([{ code: 'missing_team' }]));
    expect(patch.data.goal_approvals.execution).toBeNull();
  });
});
