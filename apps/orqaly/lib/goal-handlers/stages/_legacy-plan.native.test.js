import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  goal: null,
  enqueueGoalAction: vi.fn(),
  generateGoalPlan: vi.fn(),
  updateGoalIfNativeScopeBinding: vi.fn(),
}));

vi.mock('../_helpers.js', () => ({
  loadGoal: vi.fn(async () => state.goal),
  enqueueGoalAction: (...args) => state.enqueueGoalAction(...args),
  updateGoalIfNativeScopeBinding: (...args) => state.updateGoalIfNativeScopeBinding(...args),
  logGoalEvent: vi.fn(),
  updateGoal: vi.fn(),
  notifyGoalEvent: vi.fn(),
  checkBudget: vi.fn(() => ({ ok: true })),
  generateId: vi.fn(() => 'generated-id'),
  CATEGORY_TOOLS: {},
  TOOL_INFO: {},
  pickTestModel: vi.fn(() => ({})),
}));

vi.mock('../goal-planner.js', () => ({
  generateGoalPlan: (...args) => state.generateGoalPlan(...args),
}));
vi.mock('../team-assigner.js', () => ({ formTeam: vi.fn() }));
vi.mock('../../usage-handlers/tracked-llm.js', () => ({ executeLlmTracked: vi.fn() }));
vi.mock('../../agent-handlers/llm-executor.js', () => ({ parseLlmJson: vi.fn() }));
vi.mock('../../security/tool-credential-status.js', () => ({ listConfiguredToolIds: vi.fn() }));
vi.mock('./_tool-placeholder.js', () => ({ ensureOwnedToolPlaceholder: vi.fn() }));
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleLegacyPlan } from './_legacy-plan.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../approval-audit.js';
import { selectWorkShapePlaybook, WORK_SHAPE_ROUTE_VERSION } from '../work-shape-playbooks.js';

function planningNativeGoal() {
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
    id: 'goal-native-old-plan',
    user_id: 'user-1',
    org_id: 'org-1',
    status: 'planning',
    updated_at: '2026-08-24T08:00:00.000Z',
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
  state.goal = planningNativeGoal();
  state.enqueueGoalAction.mockReset();
  state.generateGoalPlan.mockReset();
  state.updateGoalIfNativeScopeBinding.mockReset();
});

describe('legacy plan native boundary', () => {
  it('routes accepted native authority to canonical PM planning without raw planning', async () => {
    await expect(handleLegacyPlan({}, { goalId: state.goal.id }, null)).resolves.toMatchObject({
      action: 'plan',
      status: 'canonical_stage_queued',
      canonicalAction: 'pm-planning',
    });
    expect(state.enqueueGoalAction).toHaveBeenCalledWith({}, 'pm-planning', state.goal.id);
    expect(state.generateGoalPlan).not.toHaveBeenCalled();
  });

  it('fails closed when a durable native contract is incomplete', async () => {
    delete state.goal.data.axwise_customer_intelligence.scope_packet;

    await expect(handleLegacyPlan({}, { goalId: state.goal.id }, null)).resolves.toMatchObject({
      action: 'plan',
      status: 'state_changed',
      reason: 'native_legacy_plan_blocked',
    });
    expect(state.enqueueGoalAction).not.toHaveBeenCalled();
    expect(state.generateGoalPlan).not.toHaveBeenCalled();
  });
});
