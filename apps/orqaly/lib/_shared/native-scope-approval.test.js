import { describe, expect, it } from 'vitest';
import {
  hasNativeAxwiseScopeMarkers,
  nativeAxwiseScopeActionBinding,
  nativeAxwiseScopeActionBindingMatches,
  nativeAxwiseMaterialQuestion,
  nativeAxwiseScopeApprovalBlock,
} from './native-scope-approval.js';

const HASH = 'a'.repeat(64);
const CONTRACT_HASH = 'b'.repeat(64);
const EXECUTION_HASH = 'e'.repeat(64);

function nativeGoal({ validation = {}, confirmation = {} } = {}) {
  return {
    org_id: 'org-1',
    user_id: 'user-1',
    data: {
      axwise_customer_intelligence: {
        generation: 7,
        updated_at: '2026-08-24T08:00:00.000Z',
        research_execution_inputs_hash: EXECUTION_HASH,
        scope_packet: {
          version: 'axwise_scope_packet_v1',
          scope_hash: HASH,
          research_contract: { contract_hash: CONTRACT_HASH },
        },
        scope_validation: {
          version: 'axwise_scope_validation_v1',
          scope_hash: HASH,
          valid: true,
          ready_for_synthesis: true,
          ...validation,
        },
        axwise_scope_confirmation: {
          status: 'proceed_or_edit',
          primary_action: 'proceed',
          scope_hash: HASH,
          material_question: null,
          ...confirmation,
        },
      },
      goal_approvals: {
        context: { status: 'pending', snapshot_hash: 'c'.repeat(64) },
      },
    },
  };
}

describe('native AxWise scope approval boundary', () => {
  it('leaves legacy and fallback context unaffected', () => {
    expect(nativeAxwiseScopeApprovalBlock({ data: {} })).toBeNull();
    expect(
      nativeAxwiseScopeApprovalBlock({
        data: { axwise_customer_intelligence: { degraded: true, status: 'degraded' } },
      })
    ).toBeNull();
    expect(hasNativeAxwiseScopeMarkers({ data: {} })).toBe(false);
    expect(
      hasNativeAxwiseScopeMarkers({
        data: { scope_admission: { state_key: 'axwise_customer_intelligence' } },
      })
    ).toBe(false);
  });

  it('keeps a malformed packet in the native fail-closed namespace', () => {
    expect(
      hasNativeAxwiseScopeMarkers({
        data: {
          axwise_customer_intelligence: {
            scope_packet: { version: 'corrupt' },
          },
        },
      })
    ).toBe(true);
  });

  it.each([
    'native_planning_attempt',
    'native_team_formation_attempt',
    'native_tool_provisioning_attempt',
    'native_discovery_estimation_attempt',
  ])('keeps a surviving %s record in the native fail-closed namespace', (field) => {
    expect(
      hasNativeAxwiseScopeMarkers({
        data: { [field]: { attempt_id: 'surviving-native-attempt' } },
      })
    ).toBe(true);
  });

  it('recognizes an unversioned packet in the native namespace and a clarification proposal', () => {
    expect(
      hasNativeAxwiseScopeMarkers({
        data: { axwise_customer_intelligence: { scope_packet: { intent: {} } } },
      })
    ).toBe(true);
    expect(
      hasNativeAxwiseScopeMarkers({
        data: { axwise_customer_intelligence: { clarification_scope: { scope_hash: HASH } } },
      })
    ).toBe(true);
  });

  it.each([
    ['started', { status: 'started', started_at: '2026-08-24T08:00:00.000Z' }],
    ['enqueue-failed', { status: 'enqueue_failed', started_at: '2026-08-24T08:00:00.000Z' }],
    ['historical-started-without-time', { status: 'started' }],
    ['future-non-draft-state', { status: 'processing' }],
  ])('keeps a %s Smart Request on the native lifecycle', (_name, smartRequestAdmission) => {
    expect(
      hasNativeAxwiseScopeMarkers({
        data: {
          smart_request_admission: smartRequestAdmission,
          scope_admission: {
            version: 1,
            status: 'queued',
            state_key: 'axwise_customer_intelligence',
          },
        },
      })
    ).toBe(true);
  });

  it('does not treat an unstarted Smart Request draft as native scope state', () => {
    expect(
      hasNativeAxwiseScopeMarkers({
        data: { smart_request_admission: { status: 'draft' } },
      })
    ).toBe(false);
  });

  it.each([
    [
      'explicit native scope admission',
      {
        scope_admission: {
          state_key: 'axwise_customer_intelligence',
          native_scope: true,
        },
      },
    ],
    [
      'scope revision',
      { scope_revision: { version: 'orqaly_scope_revision_v1', status: 'incorporated' } },
    ],
    ['native validation', { axwise_customer_intelligence: { scope_validation: { valid: false } } }],
    [
      'native confirmation',
      {
        axwise_customer_intelligence: { axwise_scope_confirmation: { status: 'proceed_or_edit' } },
      },
    ],
    ['authoritative route', { work_shape_route: { authoritative_scope: true } }],
    [
      'approved native snapshot',
      {
        goal_approvals: {
          context: {
            snapshot: {
              native_scope_contract: {
                packet_version: 'axwise_scope_packet_v1',
                scope_hash: null,
              },
            },
          },
        },
      },
    ],
    [
      'previous native contract',
      {
        axwise_customer_intelligence: {
          previous_scope_contract: {
            packet_version: 'axwise_scope_packet_v1',
            scope_hash: HASH,
          },
        },
      },
    ],
  ])('recognizes the strong %s marker without a packet', (_name, data) => {
    const goal = { data };

    expect(hasNativeAxwiseScopeMarkers(goal)).toBe(true);
    expect(nativeAxwiseScopeApprovalBlock(goal)).toEqual({
      code: 'native_scope_not_ready',
      message: 'The native AxWise scope is invalid or not ready for synthesis.',
      materialQuestion: null,
    });
  });

  it.each([
    ['missing', (goal) => delete goal.data.axwise_customer_intelligence.scope_packet],
    [
      'wrong-version',
      (goal) => {
        goal.data.axwise_customer_intelligence.scope_packet.version = 'axwise_scope_packet_v2';
      },
    ],
  ])('fails Gate 1 closed for a %s packet with native validation markers', (_name, mutate) => {
    const goal = nativeGoal();
    mutate(goal);

    expect(nativeAxwiseScopeActionBinding(goal)).toBeNull();
    expect(nativeAxwiseScopeActionBindingMatches(goal, null)).toBe(false);
    expect(nativeAxwiseScopeApprovalBlock(goal)).toEqual({
      code: 'native_scope_not_ready',
      message: 'The native AxWise scope is invalid or not ready for synthesis.',
      materialQuestion: null,
    });
  });

  it('allows a hash-bound native scope that is ready for synthesis', () => {
    expect(nativeAxwiseScopeApprovalBlock(nativeGoal())).toBeNull();
  });

  it.each(['orqaly_scope_revision_v1', null, 'orqaly_scope_revision_v99'])(
    'blocks an otherwise healthy old packet while its %s revision is pending rebuild',
    (version) => {
      const goal = nativeGoal();
      goal.data.scope_revision = {
        ...(version ? { version } : {}),
        status: 'pending_rebuild',
        revision_token: 'revision-current',
      };

      expect(nativeAxwiseScopeApprovalBlock(goal)).toEqual({
        code: 'native_scope_revision_pending',
        message: 'The requested AxWise scope revision must be rebuilt before approval.',
        materialQuestion: null,
      });
    }
  );

  it('binds a Gate-1 action to the exact native generation and context snapshot', () => {
    const goal = nativeGoal();
    const binding = nativeAxwiseScopeActionBinding(goal);

    expect(binding).toEqual({
      version: 'orqaly_native_scope_action_binding_v1',
      org_id: 'org-1',
      user_id: 'user-1',
      scope_hash: HASH,
      research_contract_hash: CONTRACT_HASH,
      research_execution_inputs_hash: EXECUTION_HASH,
      generation: '7',
      scope_updated_at: '2026-08-24T08:00:00.000Z',
      context_snapshot_hash: 'c'.repeat(64),
    });
    expect(nativeAxwiseScopeActionBindingMatches(goal, binding)).toBe(true);
    expect(
      nativeAxwiseScopeActionBindingMatches(goal, {
        ...binding,
        generation: '8',
      })
    ).toBe(false);
    expect(
      nativeAxwiseScopeActionBindingMatches(goal, {
        ...binding,
        context_snapshot_hash: 'd'.repeat(64),
      })
    ).toBe(false);
    expect(nativeAxwiseScopeActionBindingMatches(goal, { ...binding, org_id: 'another-org' })).toBe(
      false
    );
    expect(
      nativeAxwiseScopeActionBindingMatches(goal, {
        ...binding,
        research_execution_inputs_hash: 'f'.repeat(64),
      })
    ).toBe(false);
  });

  it('does not impose native bindings on legacy or fallback scopes', () => {
    const legacy = { data: { axwise_customer_intelligence: { status: 'degraded' } } };
    expect(nativeAxwiseScopeActionBinding(legacy)).toBeNull();
    expect(nativeAxwiseScopeActionBindingMatches(legacy, null)).toBe(true);
  });

  it('allows a nullable provider generation but requires a durable scope update identity', () => {
    const goal = nativeGoal();
    goal.data.axwise_customer_intelligence.generation = null;

    expect(nativeAxwiseScopeActionBindingMatches(goal, nativeAxwiseScopeActionBinding(goal))).toBe(
      true
    );

    goal.data.axwise_customer_intelligence.updated_at = null;

    expect(nativeAxwiseScopeActionBindingMatches(goal, nativeAxwiseScopeActionBinding(goal))).toBe(
      false
    );
  });

  it('returns the one exact material question', () => {
    const question = 'Which approved customer segment should receive the pilot?';
    const goal = nativeGoal({
      validation: { ready_for_synthesis: false },
      confirmation: {
        status: 'needs_material_input',
        primary_action: 'answer',
        material_question: question,
      },
    });

    expect(nativeAxwiseScopeApprovalBlock(goal)).toEqual({
      code: 'native_scope_material_input_required',
      message: 'AxWise needs one material answer before this scope can be approved.',
      materialQuestion: question,
    });
    expect(nativeAxwiseMaterialQuestion(goal)).toBe(question);
  });

  it.each([
    [{ valid: false }, {}],
    [{ ready_for_synthesis: false }, {}],
    [{ scope_hash: 'b'.repeat(64) }, {}],
    [{}, { status: 'needs_material_input', primary_action: 'answer', material_question: '' }],
    [
      { ready_for_synthesis: true },
      {
        status: 'needs_material_input',
        primary_action: 'answer',
        material_question: 'Which segment?',
      },
    ],
  ])('fails closed for invalid or unready native contracts', (validation, confirmation) => {
    expect(nativeAxwiseScopeApprovalBlock(nativeGoal({ validation, confirmation }))).toEqual({
      code: 'native_scope_not_ready',
      message: 'The native AxWise scope is invalid or not ready for synthesis.',
      materialQuestion: null,
    });
  });
});
