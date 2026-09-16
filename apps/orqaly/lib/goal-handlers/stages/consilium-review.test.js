import { describe, expect, it } from 'vitest';

import { resolveConsiliumReviewAuthority } from './consilium-review.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { selectWorkShapePlaybook } from '../work-shape-playbooks.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../approval-audit.js';

function acceptedNativeGoal() {
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
  const goal = {
    id: 'goal-native-consilium',
    user_id: 'user-1',
    status: 'active',
    title: 'STALE RAW SOFTWARE LANDING PAGE',
    plan: { phases: [{ name: 'Research', status: 'executing' }] },
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
  return { goal, packet };
}

describe('Consilium native evaluation authority', () => {
  it('uses the accepted canonical objective instead of stale raw goal title', () => {
    const { goal, packet } = acceptedNativeGoal();

    expect(resolveConsiliumReviewAuthority(goal)).toMatchObject({
      blocked: false,
      objective: packet.intent.objective,
    });
  });

  it('blocks when the native authority becomes invalid before the judge runs', () => {
    const { goal } = acceptedNativeGoal();
    const changed = {
      ...goal,
      data: {
        ...goal.data,
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-consilium-1',
          kind: 'scope_correction',
        },
      },
    };

    expect(resolveConsiliumReviewAuthority(goal, changed)).toMatchObject({
      blocked: true,
      reasons: expect.arrayContaining(['native_scope_revision_pending']),
      objective: null,
    });
  });
});
