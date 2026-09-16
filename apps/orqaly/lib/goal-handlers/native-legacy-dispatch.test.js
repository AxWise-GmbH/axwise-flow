import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateGoalIfNativeScopeBinding = vi.fn(async () => true);

vi.mock('./_helpers.js', () => ({
  updateGoalIfNativeScopeBinding: (...args) => updateGoalIfNativeScopeBinding(...args),
}));

import {
  invalidateNativeExecutionForCanonicalReplan,
  resolveNativeLegacyDispatch,
  resolveNativeRecoveryDispatch,
  transitionNativeIterationToCanonicalPlanning,
  transitionNativeRecoveryToCanonicalStage,
} from './native-legacy-dispatch.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from './approval-audit.js';
import { selectWorkShapePlaybook, WORK_SHAPE_ROUTE_VERSION } from './work-shape-playbooks.js';

function nativeGoal(status = 'active') {
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
    id: 'goal-native-dispatch',
    user_id: 'user-1',
    status,
    updated_at: '2026-08-24T08:00:00.000Z',
    iteration: 2,
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

beforeEach(() => {
  updateGoalIfNativeScopeBinding.mockReset();
  updateGoalIfNativeScopeBinding.mockResolvedValue(true);
});

describe('native/legacy plan dispatch boundary', () => {
  it('keeps genuine legacy and the historical lone admission stamp on the legacy path', () => {
    expect(resolveNativeLegacyDispatch({ status: 'planning', data: {} }, 'plan')).toMatchObject({
      native: false,
      safe: true,
      action: 'plan',
    });
    expect(
      resolveNativeLegacyDispatch(
        {
          status: 'planning',
          data: { scope_admission: { state_key: 'axwise_customer_intelligence' } },
        },
        'plan'
      )
    ).toMatchObject({ native: false, safe: true, action: 'plan' });
  });

  it('fails closed for damaged native authority instead of selecting a raw action', () => {
    const goal = nativeGoal('active');
    delete goal.data.axwise_customer_intelligence.scope_packet;

    expect(resolveNativeLegacyDispatch(goal, 'iterate')).toMatchObject({
      native: true,
      safe: false,
      action: null,
      reasons: expect.arrayContaining(['native_legacy_dispatch_authority_invalid']),
    });
  });

  it('never downgrades a malformed native packet into the legacy planner', () => {
    const goal = {
      id: 'goal-corrupt-native-packet',
      status: 'planning',
      data: {
        axwise_customer_intelligence: {
          scope_packet: { version: 'corrupt' },
        },
      },
    };

    expect(resolveNativeLegacyDispatch(goal, 'plan')).toMatchObject({
      native: true,
      safe: false,
      action: null,
      reasons: expect.arrayContaining(['native_legacy_dispatch_authority_invalid']),
    });
  });

  it('never downgrades a surviving downstream native attempt into the legacy planner', () => {
    const goal = {
      id: 'goal-native-attempt-only',
      status: 'planning',
      data: {
        native_planning_attempt: { attempt_id: 'planning-attempt-1' },
      },
    };

    expect(resolveNativeLegacyDispatch(goal, 'plan')).toMatchObject({
      native: true,
      safe: false,
      action: null,
      reasons: expect.arrayContaining(['native_legacy_dispatch_authority_invalid']),
    });
  });

  it('requires the exact lifecycle snapshot before canonical native planning', () => {
    const goal = nativeGoal('planning');
    expect(resolveNativeLegacyDispatch(goal, 'plan')).toMatchObject({
      native: true,
      safe: true,
      action: 'pm-planning',
      binding: expect.objectContaining({
        goal_updated_at: goal.updated_at,
        planning_authority: expect.objectContaining({ context_status: 'approved' }),
      }),
    });
    goal.status = 'active';
    delete goal.updated_at;
    expect(resolveNativeLegacyDispatch(goal, 'iterate')).toMatchObject({
      native: true,
      safe: false,
      reasons: expect.arrayContaining(['native_legacy_dispatch_goal_snapshot_missing']),
    });
  });

  it('atomically reserves native iteration and invalidates the replaced Gate 2 grant', async () => {
    const goal = nativeGoal('active');
    goal.data.goal_approvals.execution = {
      status: 'approved',
      snapshot_hash: 'old-gate-2',
    };
    goal.data.execution_authorization = {
      status: 'approved',
      snapshot_hash: 'old-gate-2',
    };

    await expect(transitionNativeIterationToCanonicalPlanning({}, goal)).resolves.toMatchObject({
      native: true,
      safe: true,
      ok: true,
      action: 'pm-planning',
    });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      goal.id,
      'active',
      expect.objectContaining({ goal_updated_at: goal.updated_at }),
      expect.objectContaining({
        status: 'planning',
        iteration: 3,
        data: expect.objectContaining({
          goal_approvals: {
            context: goal.data.goal_approvals.context,
            execution: expect.objectContaining({
              status: 'invalidated',
              invalidation_reason: 'plan_replaced_by_iteration',
            }),
          },
          execution_authorization: expect.objectContaining({
            status: 'invalidated',
            snapshot_hash: null,
          }),
        }),
      })
    );
  });

  it('reports a lost CAS without queuing authority', async () => {
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(false);
    await expect(
      transitionNativeIterationToCanonicalPlanning({}, nativeGoal('active'))
    ).resolves.toMatchObject({ native: true, safe: true, ok: false });
  });
});

describe('native replan invalidation', () => {
  it('does not invent an execution approval when Gate 2 has not occurred', () => {
    expect(invalidateNativeExecutionForCanonicalReplan({ marker: true })).toEqual({
      marker: true,
    });
  });
});

describe('native recovery canonicalization', () => {
  it.each([
    ['analyzing', 'scope-admission'],
    ['researching_customer', 'customer-intelligence'],
  ])(
    'routes ready native %s recovery directly to PM instead of rebuilding accepted scope',
    (status, action) => {
      const goal = nativeGoal(status);

      expect(resolveNativeRecoveryDispatch(goal, action)).toMatchObject({
        native: true,
        handled: true,
        safe: true,
        action: 'pm-planning',
        status: 'planning',
        binding: expect.objectContaining({ goal_updated_at: goal.updated_at }),
      });
    }
  );

  it('converts a historical native feasibility downgrade into exact PM planning', async () => {
    const goal = nativeGoal('feasibility');
    const recovery = resolveNativeRecoveryDispatch(goal, 'feasibility-analysis');

    expect(recovery).toMatchObject({
      native: true,
      handled: true,
      safe: true,
      action: 'pm-planning',
      status: 'planning',
    });
    await expect(transitionNativeRecoveryToCanonicalStage({}, goal, recovery)).resolves.toBe(true);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenLastCalledWith(
      {},
      goal.id,
      'feasibility',
      expect.objectContaining({ goal_updated_at: goal.updated_at }),
      expect.objectContaining({ status: 'planning' })
    );
  });

  it('does not use the surviving Smart-start marker to rebuild previously accepted authority', () => {
    const goal = nativeGoal('feasibility');
    goal.data.smart_request_admission = {
      status: 'started',
      started_at: '2026-08-24T07:55:00.000Z',
    };
    delete goal.data.axwise_customer_intelligence.scope_packet;

    expect(resolveNativeRecoveryDispatch(goal, 'feasibility-analysis')).toMatchObject({
      native: true,
      handled: true,
      safe: false,
      action: null,
      reasons: expect.arrayContaining(['native_recovery_scope_rebuild_not_owned']),
    });
  });

  it('recovers a started pre-packet Smart row through an exact scope-admission transition', async () => {
    const goal = {
      id: 'goal-native-started',
      user_id: 'user-1',
      status: 'feasibility',
      updated_at: '2026-08-24T08:00:00.000Z',
      data: {
        smart_request_admission: {
          status: 'started',
          started_at: '2026-08-24T07:59:00.000Z',
        },
        scope_admission: { native_scope: true, status: 'queued' },
      },
    };
    const recovery = resolveNativeRecoveryDispatch(goal, 'feasibility-analysis');
    const filters = [];
    const transition = {
      eq(field, value) {
        filters.push([field, value]);
        return transition;
      },
      select() {
        return transition;
      },
      async maybeSingle() {
        return { data: { id: goal.id }, error: null };
      },
    };
    const admin = {
      from: () => ({
        update: (patch) => {
          expect(patch).toMatchObject({ status: 'analyzing' });
          return transition;
        },
      }),
    };

    expect(recovery).toMatchObject({
      native: true,
      handled: true,
      safe: true,
      action: 'scope-admission',
      status: 'analyzing',
    });
    await expect(transitionNativeRecoveryToCanonicalStage(admin, goal, recovery)).resolves.toBe(
      true
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        ['id', goal.id],
        ['status', 'feasibility'],
        ['updated_at', goal.updated_at],
        ['user_id', goal.user_id],
      ])
    );
  });
});
