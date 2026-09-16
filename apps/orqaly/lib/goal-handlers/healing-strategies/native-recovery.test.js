import { beforeEach, describe, expect, it, vi } from 'vitest';

const transitionHealingGoal = vi.fn(async (_admin, goal, patch, { strategy }) => ({
  ok: true,
  at: patch.updated_at,
  markerAt: patch.data?.last_heal_at,
  status: patch.status || goal.status,
  strategy,
}));
const enqueueHealingContinuation = vi.fn(async (_admin, _goal, _transition, options) => ({
  ok: true,
  jobId: `job-${options.action}`,
}));

vi.mock('./_exact-recovery.js', () => ({
  transitionHealingGoal: (...args) => transitionHealingGoal(...args),
  enqueueHealingContinuation: (...args) => enqueueHealingContinuation(...args),
}));

import * as h01 from './h01-transient-error.js';
import * as h02 from './h02-llm-json-fallback.js';
import * as h04 from './h04-stuck-no-queue.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../approval-audit.js';
import { selectWorkShapePlaybook, WORK_SHAPE_ROUTE_VERSION } from '../work-shape-playbooks.js';

function acceptedNativeGoal(status = 'failed', failureStage = 'plan') {
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
    id: 'goal-native-heal',
    user_id: 'user-1',
    status,
    updated_at: '2026-08-24T08:00:00.000Z',
    iteration: 2,
    max_iterations: 5,
    plan: { phases: [{ name: 'P1', status: 'failed' }] },
    data: {
      failure_stage: failureStage,
      failure_reason: 'timeout while parsing JSON',
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
    execution: { status: 'approved', snapshot_hash: 'old-gate-2' },
  };
  goal.data.execution_authorization = { status: 'approved', snapshot_hash: 'old-gate-2' };
  return goal;
}

function admin() {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ data: { id: 'log-1' }, error: null })),
    })),
  };
}

beforeEach(() => {
  transitionHealingGoal.mockClear();
  enqueueHealingContinuation.mockClear();
});

describe.each([
  ['transient healer', h01],
  ['JSON healer', h02],
])('%s native dispatch', (_name, strategy) => {
  it.each(['plan', 'feasibility-analysis', 'po-analysis', 'po-analysis-continue'])(
    'never revives accepted native authority through raw %s',
    async (stage) => {
      const goal = acceptedNativeGoal('failed', stage);
      const db = admin();

      await expect(strategy.apply(db, goal, {})).resolves.toMatchObject({
        action: 'resumed',
        stage: 'pm-planning',
      });
      expect(transitionHealingGoal.mock.calls.at(-1)[2]).toMatchObject({
        status: 'planning',
        data: expect.objectContaining({
          execution_authorization: expect.objectContaining({ status: 'invalidated' }),
        }),
      });
      expect(enqueueHealingContinuation.mock.calls.at(-1)[3]).toMatchObject({
        action: 'pm-planning',
        extra: {},
      });
    }
  );

  it('increments the exact attempt when an old native iterate failure is recovered', async () => {
    const goal = acceptedNativeGoal('failed', 'iterate');

    await strategy.apply(admin(), goal, {});

    expect(transitionHealingGoal.mock.calls.at(-1)[2]).toMatchObject({
      status: 'planning',
      iteration: 3,
    });
    expect(enqueueHealingContinuation.mock.calls.at(-1)[3]).toMatchObject({
      action: 'pm-planning',
    });
  });

  it('quarantines damaged accepted native authority instead of choosing a raw stage', async () => {
    const goal = acceptedNativeGoal('failed', 'po-analysis');
    delete goal.data.axwise_customer_intelligence.scope_packet;

    await expect(strategy.apply(admin(), goal, {})).resolves.toMatchObject({ action: 'skipped' });
    expect(transitionHealingGoal).not.toHaveBeenCalled();
    expect(enqueueHealingContinuation).not.toHaveBeenCalled();
  });

  it('recovers an in-flight pre-packet Smart Request only through scope admission', async () => {
    const goal = {
      id: 'goal-native-started',
      user_id: 'user-1',
      status: 'failed',
      updated_at: '2026-08-24T08:00:00.000Z',
      data: {
        failure_stage: 'feasibility-analysis',
        failure_reason: 'timeout',
        smart_request_admission: {
          status: 'started',
          started_at: '2026-08-24T07:59:00.000Z',
        },
        scope_admission: {
          native_scope: true,
          status: 'queued',
          state_key: 'axwise_customer_intelligence',
        },
      },
    };

    await strategy.apply(admin(), goal, {});

    expect(transitionHealingGoal.mock.calls.at(-1)[2]).toMatchObject({ status: 'analyzing' });
    expect(enqueueHealingContinuation.mock.calls.at(-1)[3]).toMatchObject({
      action: 'scope-admission',
    });
  });
});

describe('stuck-goal healer native dispatch', () => {
  it('reserves canonical PM planning for a failed native phase', async () => {
    const goal = acceptedNativeGoal('active', 'iterate');

    await h04.apply(admin(), goal, {});

    expect(transitionHealingGoal.mock.calls.at(-1)[2]).toMatchObject({
      status: 'planning',
      iteration: 3,
      data: expect.objectContaining({
        execution_authorization: expect.objectContaining({ status: 'invalidated' }),
      }),
    });
    expect(enqueueHealingContinuation.mock.calls.at(-1)[3]).toMatchObject({
      action: 'pm-planning',
      extra: {},
    });
  });
});
