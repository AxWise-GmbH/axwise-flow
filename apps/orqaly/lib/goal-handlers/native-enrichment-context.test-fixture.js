import { canonicalContractHash } from '../agent-handlers/compact-agent-contracts.js';
import {
  nativeDecisionContractsFixture,
  nativeResearchContractFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from './approval-audit.js';
import { selectWorkShapePlaybook } from './work-shape-playbooks.js';

export function acceptedNativeLandingEnrichmentGoal() {
  const admission = {
    version: 'axwise_scope_admission_v1',
    work_types: ['content_asset_creation'],
    geographies: ['EE'],
    channels: ['approved landing page'],
    success_criteria: ['The canonical pet-care landing page is complete'],
    required_capabilities: ['Brand Strategist', 'Image Curator'],
    requested_actions: [
      {
        action:
          'clone https://canonical.example/reference into a landing page with a new pet-care brand',
        mode: 'prepare',
        side_effect: 'none',
        requires_authorization: false,
      },
    ],
  };
  const base = nativeScopePacketFixture({
    audiences: ['Independent Estonian pet-shop buyers'],
    admission,
    researchContract: nativeResearchContractFixture({
      documentIntent: 'custom',
      workTypes: admission.work_types,
      geographies: ['EE'],
      roles: admission.required_capabilities,
    }),
  });
  const packetWithoutHash = {
    ...base,
    intent: {
      ...base.intent,
      objective: 'Create a premium cat-food retail-pilot landing page for Estonia.',
      problem: 'Independent pet shops need a clear, credible wholesale proposition.',
      desired_outcome: 'A decision-ready cat-food landing page for Tallinn and Tartu buyers.',
      non_goals: ['Do not market crypto products or use the historical request'],
    },
    deliverable: {
      ...base.deliverable,
      type: 'landing_page',
      title_prefix: 'Estonia Premium Cat Food',
      required_sections: ['Retail proposition', 'Pilot economics', 'Buyer call to action'],
    },
  };
  delete packetWithoutHash.scope_hash;
  const packet = {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };
  const contracts = nativeDecisionContractsFixture(packet);
  const goal = {
    id: 'goal-native-enrichment',
    user_id: 'user-1',
    status: 'active',
    title: 'STALE RAW: launch a crypto casino website',
    description: 'STALE RAW DESCRIPTION: use https://unapproved.example and neon gambling art.',
    data: {
      axwise_customer_intelligence: {
        scope_packet: contracts.scope_packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
        generation: '1',
        updated_at: '2026-08-24T10:00:00.000Z',
      },
    },
  };
  const route = selectWorkShapePlaybook({ goal, scopePacket: packet });
  goal.data.work_shape_route = route;
  goal.data.scope_admission = {
    version: 1,
    status: 'accepted',
    state_key: 'axwise_customer_intelligence',
    scope_hash: packet.scope_hash,
    playbook_id: route.playbook_id,
    route_version: route.version,
    accepted_at: '2026-08-24T10:01:00.000Z',
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
  };
  goal.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
  };
  return goal;
}
