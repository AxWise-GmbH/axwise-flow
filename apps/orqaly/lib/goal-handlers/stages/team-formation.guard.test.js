import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAcceptedNativePlanningActionBinding,
  mockGoalRequiredExecutionRoles,
  mockResolveAcceptedNativeGoalAuthority,
} = vi.hoisted(() => ({
  mockAcceptedNativePlanningActionBinding: vi.fn(() => ({
    version: 'orqaly_native_scope_action_binding_v1',
    scope_hash: 'scope-hash',
    generation: '1',
    scope_updated_at: '2026-08-24T10:00:00.000Z',
    context_snapshot_hash: 'context-hash',
    goal_updated_at: '2026-08-24T10:01:00.000Z',
    planning_authority: {
      context_status: 'approved',
      scope_admission_status: 'accepted',
      scope_hash: 'scope-hash',
      playbook_id: 'mixed-custom',
      route_version: 'v1',
    },
  })),
  mockGoalRequiredExecutionRoles: vi.fn(() => []),
  mockResolveAcceptedNativeGoalAuthority: vi.fn(() => ({
    native: false,
    ready: false,
    reasons: [],
  })),
}));

vi.mock('../_helpers.js', () => ({
  TOOL_INFO: {},
  enqueueGoalAction: vi.fn(),
  generateId: vi.fn(() => 'generated-id'),
  loadGoal: vi.fn(),
  logGoalEvent: vi.fn(),
  updateGoal: vi.fn(),
  updateGoalIfStatus: vi.fn(),
  updateGoalIfNativeScopeBinding: vi.fn(),
  updateGoalIfSnapshot: vi.fn(),
  reserveGoalTeamFormationAttempt: vi.fn(),
  updateGoalIfTeamFormationAttempt: vi.fn(),
}));

vi.mock('../team-assigner.js', () => ({
  MAX_ROSTER_ROLES: 8,
  ensureGoalTeam: vi.fn(),
  formTeam: vi.fn(),
  goalRequiredExecutionRoles: mockGoalRequiredExecutionRoles,
  pickBestAgent: vi.fn(),
  replaceGoalTeamMembers: vi.fn(),
}));

vi.mock('../../_shared/native-goal-authority.js', () => ({
  acceptedNativePlanningActionBinding: mockAcceptedNativePlanningActionBinding,
  resolveAcceptedNativeGoalAuthority: mockResolveAcceptedNativeGoalAuthority,
}));

vi.mock('../../integrations/axwise/goal-orchestration.js', () => ({
  goalOrchestrationAuthorityView: vi.fn((goal) => goal),
  orchestrateGoalWithAxwise: vi.fn(),
}));

vi.mock('../../integrations/axwise/customer-intelligence.js', () => ({
  createTaskExecutionContext: vi.fn(),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  loadGoal,
  logGoalEvent,
  updateGoal,
  updateGoalIfNativeScopeBinding,
  updateGoalIfSnapshot,
  updateGoalIfStatus,
  reserveGoalTeamFormationAttempt,
} from '../_helpers.js';
import {
  handle,
  materializeGoalResearchWork,
  materializeGoalTeamWork,
  researchMaterializationAttempt,
} from './team-formation.js';
import { hashApprovalSnapshot } from '../approval-audit.js';

function completedNativePlanningAttempt(plan, overrides = {}) {
  return {
    version: 'orqaly_native_planning_attempt_v1',
    attempt_id: 'planning-attempt-1',
    scope_hash: 'scope-hash',
    status: 'completed',
    plan_hash: hashApprovalSnapshot('native-execution-plan', plan),
    plan_snapshot: plan,
    completed_at: '2026-08-24T10:00:30.000Z',
    ...overrides,
  };
}

function readyNativeAuthority(overrides = {}) {
  return {
    native: true,
    ready: true,
    reasons: [],
    packet: {
      scope_hash: 'scope-hash',
      intent: { objective: 'Canonical objective' },
    },
    route: { playbook_id: 'mixed-custom' },
    ...overrides,
  };
}

describe('team-formation lifecycle guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateGoalIfStatus.mockResolvedValue(true);
    updateGoalIfNativeScopeBinding.mockResolvedValue(true);
    updateGoalIfSnapshot.mockResolvedValue(true);
    reserveGoalTeamFormationAttempt.mockResolvedValue(true);
  });

  it.each([
    'paused',
    'cancelled',
    'failed',
    'completed',
    'completed_with_warnings',
    'needs_human',
    'provisioning_tools',
    'executing',
  ])('does not revive a %s goal delivered by a stale queue job', async (status) => {
    loadGoal.mockResolvedValue({ id: 'goal-1', status });
    const admin = { from: vi.fn() };

    const result = await handle(admin, { goalId: 'goal-1' }, {});

    expect(result).toMatchObject({ status: 'stage_not_eligible', goalStatus: status });
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(updateGoal).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('does no downstream work when cancellation wins the initial reservation race', async () => {
    loadGoal.mockResolvedValue({ id: 'goal-1', status: 'planning' });
    reserveGoalTeamFormationAttempt.mockResolvedValue(false);
    const admin = { from: vi.fn() };

    const result = await handle(admin, { goalId: 'goal-1' }, {});

    expect(result.status).toBe('state_changed');
    expect(reserveGoalTeamFormationAttempt).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ id: 'goal-1', status: 'planning' }),
      expect.objectContaining({ attempt_id: 'generated-id' }),
      expect.objectContaining({ status: 'forming_team' })
    );
    expect(updateGoal).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('does not revive a goal when cancellation wins the native-authority failure transition', async () => {
    loadGoal.mockResolvedValue({ id: 'goal-1', status: 'planning', data: {} });
    mockResolveAcceptedNativeGoalAuthority.mockReturnValueOnce({
      native: true,
      ready: false,
      reasons: ['native_scope_contract_invalid'],
    });
    updateGoalIfSnapshot.mockResolvedValue(false);

    const result = await handle({}, { goalId: 'goal-1' }, {});

    expect(result.status).toBe('state_changed');
    expect(updateGoalIfSnapshot).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 'goal-1', status: 'planning' }),
      expect.objectContaining({ status: 'needs_human' })
    );
    expect(updateGoal).not.toHaveBeenCalled();
    expect(logGoalEvent).not.toHaveBeenCalled();
  });

  it('does not revive a goal when cancellation wins the native-role-capacity transition', async () => {
    const plan = { phases: [] };
    loadGoal.mockResolvedValue({
      id: 'goal-1',
      status: 'planning',
      plan,
      data: { native_planning_attempt: completedNativePlanningAttempt(plan) },
    });
    mockResolveAcceptedNativeGoalAuthority.mockReturnValueOnce(readyNativeAuthority());
    mockGoalRequiredExecutionRoles.mockReturnValueOnce(
      Array.from({ length: 9 }, (_, index) => `Specialist ${index + 1}`)
    );
    updateGoalIfNativeScopeBinding.mockResolvedValue(false);

    const result = await handle({}, { goalId: 'goal-1' }, {});

    expect(result.status).toBe('state_changed');
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      'goal-1',
      'planning',
      expect.objectContaining({ scope_hash: 'scope-hash' }),
      expect.objectContaining({ status: 'needs_human' })
    );
    expect(updateGoal).not.toHaveBeenCalled();
    expect(logGoalEvent).not.toHaveBeenCalled();
  });

  it('fails closed instead of dereferencing a malformed ready native authority', async () => {
    loadGoal.mockResolvedValue({ id: 'goal-native-malformed', status: 'planning', data: {} });
    mockResolveAcceptedNativeGoalAuthority.mockReturnValueOnce({
      native: true,
      ready: true,
      reasons: [],
    });

    const result = await handle({}, { goalId: 'goal-native-malformed' }, {});

    expect(result).toMatchObject({
      status: 'needs_human_native_scope_authority',
      reasons: expect.arrayContaining(['native_scope_packet_missing']),
    });
    expect(updateGoalIfSnapshot).toHaveBeenCalledOnce();
    expect(reserveGoalTeamFormationAttempt).not.toHaveBeenCalled();
  });

  it('leaves a current native planner running when a stale team worker overlaps it', async () => {
    const goal = {
      id: 'goal-native-planning',
      status: 'planning',
      plan: null,
      data: {
        native_planning_attempt: completedNativePlanningAttempt(null, {
          status: 'running',
          plan_hash: null,
          plan_snapshot: null,
          completed_at: null,
        }),
      },
    };
    loadGoal.mockResolvedValue(goal);
    mockResolveAcceptedNativeGoalAuthority.mockReturnValueOnce(readyNativeAuthority());

    const result = await handle({}, { goalId: goal.id }, {});

    expect(result).toMatchObject({
      status: 'state_changed',
      reason: 'native_planning_in_progress',
    });
    expect(updateGoalIfSnapshot).not.toHaveBeenCalled();
    expect(updateGoalIfNativeScopeBinding).not.toHaveBeenCalled();
    expect(reserveGoalTeamFormationAttempt).not.toHaveBeenCalled();
  });

  it('blocks an incompatible legacy team before reserving a formation attempt', async () => {
    const goal = {
      id: 'goal-legacy-team',
      status: 'planning',
      team_id: 'legacy-consilium-team',
      agent_team_id: null,
      data: {},
    };
    loadGoal.mockResolvedValue(goal);

    const result = await handle({}, { goalId: goal.id }, {});

    expect(result).toMatchObject({ status: 'needs_human_legacy_team_incompatible' });
    expect(updateGoalIfSnapshot).toHaveBeenCalledWith(
      {},
      goal,
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_stage: 'team-formation:legacy-team-incompatible',
        }),
      })
    );
    expect(reserveGoalTeamFormationAttempt).not.toHaveBeenCalled();
    expect(updateGoalIfNativeScopeBinding).not.toHaveBeenCalled();
  });

  it('lets only one native forming-team worker acquire the exact attempt', async () => {
    const plan = { phases: [] };
    const goal = {
      id: 'goal-native-duplicate',
      user_id: 'user-1',
      status: 'forming_team',
      updated_at: '2026-08-24T10:01:00.000Z',
      plan,
      data: { native_planning_attempt: completedNativePlanningAttempt(plan) },
    };
    loadGoal.mockResolvedValue(goal);
    mockResolveAcceptedNativeGoalAuthority.mockReturnValueOnce(readyNativeAuthority());
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(false);
    const admin = { from: vi.fn() };

    const result = await handle(admin, { goalId: goal.id }, {});

    expect(result).toMatchObject({ status: 'state_changed' });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledTimes(1);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      admin,
      goal.id,
      'forming_team',
      expect.objectContaining({ goal_updated_at: goal.updated_at }),
      expect.objectContaining({
        status: 'forming_team',
        data: expect.objectContaining({
          native_team_formation_attempt: expect.objectContaining({
            version: 'orqaly_team_formation_attempt_v1',
            attempt_id: 'generated-id',
            status: 'running',
          }),
        }),
      })
    );
    expect(updateGoal).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('derives a stable materialization attempt from the exact plan, run, team and routing', () => {
    const goal = {
      id: 'goal-1',
      iteration: 2,
      data: { retry_count: 0 },
      plan: { phases: [{ jobs: [{ title: 'Validate Bremen market' }] }] },
    };
    const orchestration = {
      decision: { decision_id: 'decision-1' },
      assignments: { 'phase-1-job-1': 'agent-1' },
    };

    const first = researchMaterializationAttempt(goal, 'run-1', orchestration, [
      { id: 'agent-2' },
      { id: 'agent-1' },
    ]);
    const sameAttempt = researchMaterializationAttempt(goal, 'run-1', orchestration, [
      { id: 'agent-1' },
      { id: 'agent-2' },
    ]);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(sameAttempt).toBe(first);
    expect(
      researchMaterializationAttempt(goal, 'run-2', orchestration, [{ id: 'agent-1' }])
    ).not.toBe(first);
  });

  it('creates a distinct research materialization attempt for a full goal retry', () => {
    const goal = {
      id: 'goal-1',
      iteration: 0,
      data: { retry_count: 0 },
      plan: { phases: [{ jobs: [{ title: 'Validate Bremen market' }] }] },
    };
    const orchestration = {
      decision: { decision_id: 'decision-1' },
      assignments: { 'phase-1-job-1': 'agent-1' },
    };
    const members = [{ id: 'agent-1' }, { id: 'agent-2' }];

    const firstAttempt = researchMaterializationAttempt(goal, 'run-1', orchestration, members);
    const retryAttempt = researchMaterializationAttempt(
      { ...goal, data: { ...goal.data, retry_count: 1 } },
      'run-1',
      orchestration,
      members
    );

    expect(retryAttempt).toMatch(/^[0-9a-f]{64}$/);
    expect(retryAttempt).not.toBe(firstAttempt);
  });

  it('stamps the attempt on every final Orqaly binding before the atomic RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { attempt_key: 'a'.repeat(64), reused: false },
      error: null,
    });
    const assignment = {
      research_run_id: 'run-1',
      assignment_source: 'axwise',
      payload: { task_ids: ['task-1'] },
    };

    await materializeGoalResearchWork(
      { rpc },
      {
        goal: { id: 'goal-1', user_id: 'user-1' },
        researchRunId: 'run-1',
        attemptKey: 'a'.repeat(64),
        jobs: [{ id: 'job-1' }],
        tasks: [{ id: 'task-1' }],
        assignments: [assignment],
      }
    );

    expect(rpc).toHaveBeenCalledWith(
      'materialize_goal_research_work',
      expect.objectContaining({
        p_assignments: [
          expect.objectContaining({
            assignment_source: 'orqaly_team_formation',
            payload: {
              task_ids: ['task-1'],
              materialization_attempt: 'a'.repeat(64),
            },
          }),
        ],
      })
    );
    expect(assignment).toEqual({
      research_run_id: 'run-1',
      assignment_source: 'axwise',
      payload: { task_ids: ['task-1'] },
    });
  });

  it('passes the exact team, roster, formation, and research bindings to the atomic RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { formation_attempt: 'attempt-1', team_id: 'team-1', reused: false },
      error: null,
    });
    const team = {
      user_id: 'user-1',
      goal_id: 'goal-1',
      name: 'Canonical team',
      leader_id: 'agent-1',
    };
    const assignment = {
      research_run_id: 'run-1',
      assignment_source: 'axwise',
      payload: { task_ids: ['task-1'] },
    };

    await materializeGoalTeamWork(
      { rpc },
      {
        goal: { id: 'goal-1', user_id: 'user-1' },
        formationAttemptId: 'attempt-1',
        nativeScopeHash: 'f'.repeat(64),
        researchRunId: 'run-1',
        researchAttemptKey: 'a'.repeat(64),
        jobs: [{ id: 'job-1' }],
        tasks: [{ id: 'task-1' }],
        assignments: [assignment],
        team,
        memberIds: ['agent-1'],
      }
    );

    expect(rpc).toHaveBeenCalledWith('materialize_goal_team_work', {
      p_goal_id: 'goal-1',
      p_user_id: 'user-1',
      p_formation_attempt: 'attempt-1',
      p_native_scope_hash: 'f'.repeat(64),
      p_research_run_id: 'run-1',
      p_research_attempt_key: 'a'.repeat(64),
      p_jobs: [{ id: 'job-1' }],
      p_tasks: [{ id: 'task-1' }],
      p_assignments: [
        {
          ...assignment,
          assignment_source: 'orqaly_team_formation',
          payload: { task_ids: ['task-1'], materialization_attempt: 'a'.repeat(64) },
        },
      ],
      p_team: team,
      p_member_ids: ['agent-1'],
    });
    expect(assignment.assignment_source).toBe('axwise');
  });
});
