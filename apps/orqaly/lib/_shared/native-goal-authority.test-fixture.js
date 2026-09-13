import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../goal-handlers/approval-audit.js';
import {
  selectWorkShapePlaybook,
  WORK_SHAPE_ROUTE_VERSION,
} from '../goal-handlers/work-shape-playbooks.js';

/** A complete, accepted native goal for cross-layer re-entry tests. */
export function acceptedNativeGoalFixture(overrides = {}) {
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
    status: 'awaiting_approval',
    updated_at: '2026-08-24T08:00:00.000Z',
    title: 'Historical title',
    description: 'Historical description',
    iteration: 0,
    max_iterations: 3,
    budget_usd: 20,
    plan: { phases: [] },
    data: {
      axwise_customer_intelligence: {
        generation: 3,
        updated_at: '2026-08-24T07:59:00.000Z',
        scope_packet: packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
      },
    },
    ...overrides,
  };
  goal.data = {
    axwise_customer_intelligence: {
      generation: 3,
      updated_at: '2026-08-24T07:59:00.000Z',
      scope_packet: packet,
      scope_validation: contracts.scope_validation,
      axwise_scope_confirmation: contracts.scope_confirmation,
      scope_contract_binding: contracts.scope_contract_binding,
      research_execution_inputs_hash: contracts.research_execution_inputs_hash,
    },
    ...(overrides.data || {}),
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
    ...(goal.data.goal_approvals || {}),
    context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
  };
  return goal;
}

/** A started Smart Request whose first native admission has no provider packet yet. */
export function initialNativeScopeAdmissionGoalFixture(overrides = {}) {
  const startedAt = '2026-08-24T07:59:00.000Z';
  const goal = {
    id: 'goal-initial-native',
    user_id: 'user-1',
    status: 'failed',
    updated_at: '2026-08-24T08:00:00.000Z',
    iteration: 0,
    plan: { phases: [] },
    data: {
      smart_request_admission: {
        version: 1,
        status: 'enqueue_failed',
        started_at: startedAt,
      },
      scope_admission: {
        version: 1,
        native_scope: true,
        status: 'queued',
        state_key: 'axwise_customer_intelligence',
        queued_at: startedAt,
      },
    },
    ...overrides,
  };
  goal.data = {
    smart_request_admission: {
      version: 1,
      status: 'enqueue_failed',
      started_at: startedAt,
    },
    scope_admission: {
      version: 1,
      native_scope: true,
      status: 'queued',
      state_key: 'axwise_customer_intelligence',
      queued_at: startedAt,
    },
    ...(overrides.data || {}),
  };
  return goal;
}
