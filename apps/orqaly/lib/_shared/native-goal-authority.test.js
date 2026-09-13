import { describe, expect, it } from 'vitest';

import {
  acceptedNativePlanningActionBinding,
  initialNativeScopeAdmissionActionBinding,
  resolveAcceptedNativeGoalAuthority,
  resolveNativeScopeRevisionBase,
} from './native-goal-authority.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../goal-handlers/approval-audit.js';
import {
  selectWorkShapePlaybook,
  WORK_SHAPE_ROUTE_VERSION,
} from '../goal-handlers/work-shape-playbooks.js';

function validNativeGoal() {
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
    id: 'goal-native',
    user_id: 'user-1',
    org_id: 'org-1',
    title: 'Historical title',
    description: 'Historical description',
    updated_at: '2026-08-24T08:01:00.000Z',
    data: {
      axwise_customer_intelligence: {
        scope_packet: packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
        updated_at: '2026-08-24T08:00:00.000Z',
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

describe('accepted native goal authority marker boundary', () => {
  it('keeps legacy goals on their existing non-native path', () => {
    expect(resolveAcceptedNativeGoalAuthority({ data: {} })).toEqual({
      native: false,
      ready: false,
      reasons: [],
      contextApprovalCurrent: null,
      packet: null,
      admission: null,
      deliverable: null,
      researchContract: null,
      route: null,
    });
  });

  it.each([
    [
      'missing packet with native admission state',
      {
        scope_admission: {
          state_key: 'axwise_customer_intelligence',
          native_scope: true,
          status: 'accepted',
        },
      },
    ],
    [
      'wrong packet version with native validation state',
      {
        axwise_customer_intelligence: {
          scope_packet: {
            version: 'axwise_scope_packet_v2',
            scope_hash: 'a'.repeat(64),
          },
          scope_validation: {
            version: 'axwise_scope_validation_v1',
            scope_hash: 'a'.repeat(64),
            valid: true,
            ready_for_synthesis: true,
          },
        },
      },
    ],
  ])('fails closed for a %s', (_name, data) => {
    const authority = resolveAcceptedNativeGoalAuthority({ data });

    expect(authority).toMatchObject({
      native: true,
      ready: false,
      packet: null,
      admission: null,
    });
    expect(authority.reasons).toEqual(
      expect.arrayContaining([
        'native_scope_contract_invalid',
        'native_scope_admission_contract_missing',
      ])
    );
  });

  it('does not mistake the historical legacy admission stamp for native authority', () => {
    expect(
      resolveAcceptedNativeGoalAuthority({
        data: {
          scope_admission: {
            state_key: 'axwise_customer_intelligence',
            status: 'accepted',
          },
        },
      }).native
    ).toBe(false);
  });

  it('binds canonical planning to the accepted route and exact goal snapshot', () => {
    const goal = validNativeGoal();
    const authority = resolveAcceptedNativeGoalAuthority(goal);

    expect(acceptedNativePlanningActionBinding(goal, authority)).toMatchObject({
      version: 'orqaly_native_scope_action_binding_v1',
      scope_hash: authority.packet.scope_hash,
      scope_updated_at: goal.data.axwise_customer_intelligence.updated_at,
      context_snapshot_hash: goal.data.goal_approvals.context.snapshot_hash,
      goal_updated_at: goal.updated_at,
      planning_authority: {
        context_status: 'approved',
        scope_admission_status: 'accepted',
        scope_hash: authority.packet.scope_hash,
        playbook_id: authority.route.playbook_id,
        route_version: goal.data.work_shape_route.version,
      },
    });
  });

  it.each(['orqaly_scope_revision_v1', null, 'orqaly_scope_revision_v99'])(
    'rejects fully valid old authority while a %s revision is pending rebuild',
    (version) => {
      const goal = validNativeGoal();
      expect(resolveAcceptedNativeGoalAuthority(goal)).toMatchObject({ native: true, ready: true });
      goal.data.scope_revision = {
        ...(version ? { version } : {}),
        status: 'pending_rebuild',
        revision_token: 'revision-current',
      };

      expect(resolveAcceptedNativeGoalAuthority(goal)).toMatchObject({
        native: true,
        ready: false,
        reasons: expect.arrayContaining(['native_scope_revision_pending']),
      });
    }
  );

  it('resolves an accepted native packet as the immutable base of a correction', () => {
    const goal = validNativeGoal();
    const intelligence = goal.data.axwise_customer_intelligence;
    const contextHash = goal.data.goal_approvals.context.snapshot_hash;
    const scopeHash = intelligence.scope_packet.scope_hash;
    intelligence.previous_scope_contract = {
      version: 'orqaly_previous_native_scope_contract_v1',
      scope_hash: scopeHash,
      generation: null,
      context_snapshot_hash: contextHash,
      scope_packet: intelligence.scope_packet,
      scope_validation: intelligence.scope_validation,
      scope_confirmation: intelligence.axwise_scope_confirmation,
      scope_contract_binding: intelligence.scope_contract_binding,
    };
    intelligence.scope_packet = null;
    intelligence.scope_validation = null;
    intelligence.axwise_scope_confirmation = null;
    goal.data.goal_approvals.context.status = 'invalidated';
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      base_kind: 'accepted_native_scope',
      source_scope_hash: scopeHash,
      source_generation: null,
    };

    expect(resolveNativeScopeRevisionBase(goal)).toMatchObject({
      applies: true,
      ready: true,
      packet: { scope_hash: scopeHash },
    });
    goal.data.scope_revision.source_scope_hash = 'f'.repeat(64);
    expect(resolveNativeScopeRevisionBase(goal)).toMatchObject({
      applies: true,
      ready: false,
      reasons: expect.arrayContaining(['native_revision_source_hash_mismatch']),
    });
  });

  it('binds only the pre-packet Smart Request admission generation', () => {
    const goal = {
      id: 'goal-initial-native',
      updated_at: '2026-08-24T08:01:00.000Z',
      data: {
        smart_request_admission: {
          status: 'enqueue_failed',
          started_at: '2026-08-24T08:00:00.000Z',
        },
        scope_admission: {
          status: 'queued',
          state_key: 'axwise_customer_intelligence',
          native_scope: true,
          queued_at: '2026-08-24T08:00:00.000Z',
        },
      },
    };

    expect(initialNativeScopeAdmissionActionBinding(goal)).toEqual({
      version: 'orqaly_initial_native_scope_action_binding_v1',
      goal_updated_at: goal.updated_at,
      smart_admission_status: 'enqueue_failed',
      smart_admission_started_at: '2026-08-24T08:00:00.000Z',
      scope_admission_status: 'queued',
      scope_admission_native: true,
      scope_admission_queued_at: '2026-08-24T08:00:00.000Z',
    });
  });

  it.each([
    ['a packet field', (goal) => (goal.data.axwise_customer_intelligence = { scope_packet: null })],
    ['an accepted admission', (goal) => (goal.data.scope_admission.status = 'accepted')],
    ['an authoritative route record', (goal) => (goal.data.work_shape_route = {})],
    [
      'a native approval snapshot',
      (goal) =>
        (goal.data.goal_approvals = {
          context: { snapshot: { native_scope_contract: { scope_hash: 'old' } } },
        }),
    ],
  ])(
    'does not treat damaged downstream authority with %s as an initial admission',
    (_name, mutate) => {
      const goal = {
        updated_at: '2026-08-24T08:01:00.000Z',
        data: {
          smart_request_admission: {
            status: 'started',
            started_at: '2026-08-24T08:00:00.000Z',
          },
          scope_admission: {
            status: 'queued',
            state_key: 'axwise_customer_intelligence',
            native_scope: true,
          },
        },
      };
      mutate(goal);

      expect(initialNativeScopeAdmissionActionBinding(goal)).toBeNull();
    }
  );
});
