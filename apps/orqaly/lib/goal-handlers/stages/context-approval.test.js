import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_helpers.js', () => ({
  enqueueGoalAction: vi.fn(async () => {}),
  loadGoal: vi.fn(),
  logGoalEvent: vi.fn(async () => {}),
  restoreGoalIfScopeRevision: vi.fn(async () => true),
  updateGoalIfNativeScopeBinding: vi.fn(async () => true),
  updateGoalIfStatus: vi.fn(async () => true),
}));
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handle } from './context-approval.js';
import {
  buildContextApprovalSnapshot,
  buildResearchExecutionPreview,
  pendingApproval,
} from '../approval-audit.js';
import {
  enqueueGoalAction,
  loadGoal,
  restoreGoalIfScopeRevision,
  updateGoalIfNativeScopeBinding,
  updateGoalIfStatus,
} from '../_helpers.js';
import { researchContextGateHash } from '../../integrations/axwise/research-contract.js';
import { nativeAxwiseScopeActionBinding } from '../../_shared/native-scope-approval.js';
import {
  nativeDecisionContractsFixture,
  nativeMaterialQuestionContractsFixture,
  nativeResearchContractFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';

function goal() {
  const value = {
    id: 'goal-1',
    user_id: 'user-1',
    org_id: 'org-1',
    status: 'awaiting_context_approval',
    title: 'Reduce no-shows',
    description: 'Reduce missed dental appointments.',
    tech_doc: {
      target_audience: 'Clinic operations manager',
      problem_statement: 'No-shows leave capacity unused.',
      success_criteria: ['Reduce no-shows by 20%'],
    },
    data: {
      axwise_customer_intelligence: {
        decision_id: 'context-1',
        request_hash: 'request-1',
        routing_mode: 'direct',
        persona_resolution: {
          customer_persona: { name: 'Clinic operations manager' },
          ideal_agent_persona: { role: 'Clinic operations specialist' },
        },
      },
    },
  };
  value.data.goal_approvals = {
    context: pendingApproval('context', buildContextApprovalSnapshot(value)),
  };
  return value;
}

function attachNativeHandoff(
  value,
  decision,
  { generation = 1, admissionStatus = 'awaiting_confirmation' } = {}
) {
  Object.assign(value.data.axwise_customer_intelligence, {
    generation,
    updated_at: `2026-08-24T08:00:${String(generation).padStart(2, '0')}.000Z`,
    scope_packet: decision.scope_packet,
    scope_validation: decision.scope_validation,
    axwise_scope_confirmation: decision.scope_confirmation,
    scope_contract_binding: decision.scope_contract_binding,
    research_execution_inputs_hash: decision.research_execution_inputs_hash,
    ...(decision.scope_packet.research_contract.evidence.mode !== 'none'
      ? {
          research_execution_preview: buildResearchExecutionPreview({
            proposalDecisionId: value.data.axwise_customer_intelligence.decision_id,
            scopePacket: decision.scope_packet,
            executionInputsHash: decision.research_execution_inputs_hash,
            maximumCostUsd: 5,
            estimatedCostUsd: 1,
            maximumLatencyMs: 1_200_000,
            estimatedLatencyMs: 300_000,
          }),
        }
      : {}),
  });
  value.data.scope_admission = {
    version: 1,
    native_scope: true,
    status: admissionStatus,
    state_key: 'axwise_customer_intelligence',
    scope_hash: decision.scope_packet.scope_hash,
  };
  value.data.goal_approvals.context = pendingApproval(
    'context',
    buildContextApprovalSnapshot(value)
  );
  return value;
}

beforeEach(() => vi.clearAllMocks());

describe('context approval stage', () => {
  it('records the actor and advances to planning after an exact-match approval', async () => {
    loadGoal.mockResolvedValue(goal());

    const result = await handle(
      {},
      { goalId: 'goal-1', context_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('approved');
    expect(updateGoalIfStatus).toHaveBeenCalledWith(
      {},
      'goal-1',
      'awaiting_context_approval',
      expect.objectContaining({
        status: 'planning',
        data: expect.objectContaining({
          goal_approvals: expect.objectContaining({
            context: expect.objectContaining({ status: 'approved', approved_by: 'user-1' }),
          }),
        }),
      })
    );
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'pm-planning', 'goal-1');
  });

  it('removes the historical native-looking admission marker from a legacy approval', async () => {
    const value = goal();
    value.data.scope_admission = {
      version: 1,
      status: 'accepted',
      state_key: 'axwise_customer_intelligence',
    };
    value.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(value)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      { goalId: value.id, context_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('approved');
    const patch = updateGoalIfStatus.mock.calls[0][3];
    expect(patch.data).not.toHaveProperty('scope_admission');
    expect(patch.data.work_shape_route.authoritative_scope).toBe(false);
  });

  it('accepts the exact native scope and dispatches context work before planning', async () => {
    const value = goal();
    const decision = nativeDecisionContractsFixture(
      nativeScopePacketFixture({
        admission: {
          version: 'axwise_scope_admission_v1',
          work_types: ['external_service_operation', 'outreach_campaign'],
          geographies: ['EE'],
          channels: ['sms'],
          success_criteria: ['Every target has a terminal receipt'],
          required_capabilities: ['Twilio'],
          requested_actions: [
            {
              action: 'Send the approved reminder',
              mode: 'execute',
              side_effect: 'irreversible',
              requires_authorization: true,
            },
          ],
        },
        researchContract: nativeResearchContractFixture({
          documentIntent: 'custom',
          workTypes: ['external_service_operation', 'outreach_campaign'],
          geographies: ['EE'],
          evidence: {
            mode: 'synthetic',
            grounding_required: false,
            required_outputs: ['persona_resolution', 'research_bundle'],
            external_sources_required: false,
          },
          roles: ['Twilio'],
        }),
      })
    );
    attachNativeHandoff(value, decision);
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      {
        goalId: 'goal-1',
        context_action: 'approve',
        approved_by: 'user-1',
        native_scope_binding: nativeAxwiseScopeActionBinding(value),
      },
      {}
    );

    expect(result).toMatchObject({
      status: 'approved',
      playbookId: 'external_action',
      nextAction: 'customer-intelligence',
    });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      'goal-1',
      'awaiting_context_approval',
      nativeAxwiseScopeActionBinding(value),
      expect.objectContaining({
        data: expect.objectContaining({
          work_shape_route: expect.objectContaining({
            playbook_id: 'external_action',
            source: 'axwise_admission',
            requires_authorization: true,
            maximum_side_effect: 'irreversible',
            grants_authorization: false,
          }),
          scope_admission: expect.objectContaining({
            native_scope: true,
            status: 'accepted',
            scope_hash: decision.scope_packet.scope_hash,
            playbook_id: 'external_action',
            route_version: 'orqaly_work_shape_route_v1',
            accepted_at: expect.any(String),
            grants_authorization: false,
          }),
        }),
      })
    );
    expect(updateGoalIfNativeScopeBinding.mock.calls[0][4]).toMatchObject({
      status: 'researching_customer',
      data: {
        axwise_customer_intelligence: { status: 'scope_confirmed' },
      },
    });
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'customer-intelligence', 'goal-1');
    expect(enqueueGoalAction).not.toHaveBeenCalledWith({}, 'pm-planning', 'goal-1');
  });

  it('refuses to mint research acceptance when the proposal disclosure is missing', async () => {
    const value = goal();
    const decision = nativeDecisionContractsFixture(
      nativeScopePacketFixture({
        admission: {
          version: 'axwise_scope_admission_v1',
          work_types: ['strategy_planning'],
          geographies: [],
          channels: [],
          success_criteria: ['The research scope is reviewable'],
          required_capabilities: [],
          requested_actions: [],
        },
        researchContract: nativeResearchContractFixture({
          documentIntent: 'operational_process',
          workTypes: ['strategy_planning'],
          evidence: {
            mode: 'synthetic',
            grounding_required: false,
            required_outputs: ['research_bundle'],
            external_sources_required: false,
          },
        }),
      })
    );
    attachNativeHandoff(value, decision);
    delete value.data.axwise_customer_intelligence.research_execution_preview;
    value.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(value)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      {
        goalId: value.id,
        context_action: 'approve',
        approved_by: value.user_id,
        native_scope_binding: nativeAxwiseScopeActionBinding(value),
      },
      {}
    );

    expect(result).toMatchObject({
      status: 'blocked_native_scope',
      code: 'native_scope_execution_preview_invalid',
    });
    expect(updateGoalIfNativeScopeBinding).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('independently rejects approval while native AxWise needs one material answer', async () => {
    const blocked = goal();
    const materialQuestion = 'Which approved customer segment should receive the pilot?';
    const decision = nativeMaterialQuestionContractsFixture(materialQuestion);
    attachNativeHandoff(blocked, decision);
    loadGoal.mockResolvedValue(blocked);

    const result = await handle(
      {},
      {
        goalId: 'goal-1',
        context_action: 'approve',
        approved_by: 'user-1',
        native_scope_binding: nativeAxwiseScopeActionBinding(blocked),
      },
      {}
    );

    expect(result).toMatchObject({
      status: 'blocked_native_scope',
      code: 'native_scope_material_input_required',
      materialQuestion,
    });
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('fails Gate 1 closed when required grounded research has not passed its quality contract', async () => {
    const blocked = goal();
    blocked.data.research_policy = {
      research_mode: 'grounded_deep',
      grounding_required: true,
      research_fail_closed: true,
    };
    const contextGate = {
      version: 1,
      status: 'blocked',
      issues: [{ code: 'critical_claim_validation_blocked', message: 'VAT is stale.' }],
    };
    blocked.data.axwise_customer_intelligence.research_bundle = {
      bundle_hash: 'b'.repeat(64),
      context_gate: contextGate,
      context_gate_hash: researchContextGateHash(contextGate),
    };
    blocked.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(blocked)
    );
    loadGoal.mockResolvedValue(blocked);

    const result = await handle(
      {},
      { goalId: 'goal-1', context_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result).toMatchObject({
      status: 'blocked_research_quality',
      issues: [{ code: 'scope_contract_binding_invalid' }],
    });
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('invalidates approvals and reruns AxWise routing when more evidence is requested', async () => {
    loadGoal.mockResolvedValue(goal());

    const result = await handle(
      {},
      {
        goalId: 'goal-1',
        context_action: 'request-evidence',
        feedback: 'Verify the no-show baseline from appointment records.',
        approved_by: 'user-1',
      },
      {}
    );

    expect(result.status).toBe('request-evidence');
    expect(updateGoalIfStatus).toHaveBeenCalledWith(
      {},
      'goal-1',
      'awaiting_context_approval',
      expect.objectContaining({
        status: 'researching_customer',
        data: expect.objectContaining({
          axwise_customer_intelligence: expect.objectContaining({
            decision_id: null,
            persona_resolution: null,
            user_research_request: expect.objectContaining({ requested_by: 'user-1' }),
          }),
          work_shape_route: null,
        }),
      })
    );
    expect(updateGoalIfStatus.mock.calls[0][3].data).not.toHaveProperty('scope_admission');
    expect(enqueueGoalAction).toHaveBeenCalledWith(
      {},
      'customer-intelligence',
      'goal-1',
      expect.any(Object)
    );
  });

  it('starts a fresh token-bound AxWise run for native request-evidence', async () => {
    const value = goal();
    const decision = nativeDecisionContractsFixture();
    attachNativeHandoff(value, decision, { generation: 4, admissionStatus: 'accepted' });
    const scopeHash = decision.scope_packet.scope_hash;
    Object.assign(value.data.axwise_customer_intelligence, {
      parent_decision_id: 'parent-old',
      job_id: 'research-job-old',
      request_id: 'request-old',
      requested_at: '2026-08-23T08:00:00.000Z',
      current_stage: 'persona_simulation',
      progress_percentage: 70,
      elapsed_ms: 12000,
      stage_durations_ms: { intake: 1200 },
      stage_trace: [{ stage: 'intake', status: 'completed' }],
      last_poll_error: 'old transient error',
      routing_mode: 'research_assisted',
      scorer_version: 'scorer-old',
      router_version: 'router-old',
      routing_assessment: { uncertainty: 0.7 },
      candidate_agent_ids: ['agent-old'],
      completed_at: '2026-08-23T08:02:00.000Z',
      completed_research_iterations: 1,
      clarification_source_research_run: { job_id: 'research-job-old' },
      research_bundle: { bundle_hash: 'b'.repeat(64) },
      research_bundle_summary: { source_count: 4 },
      research_bundle_full: { sources: [{ id: 'old-source' }] },
      research_failure: { code: 'old-failure' },
      retry_count: 2,
      retry_of_decision_id: 'decision-before-old',
      retry_of_job_id: 'job-before-old',
      retried_at: '2026-08-23T07:00:00.000Z',
    });
    value.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(value)
    );
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      {
        goalId: value.id,
        context_action: 'request-evidence',
        feedback: 'Verify the no-show baseline from appointment records.',
        approved_by: 'user-1',
        native_scope_binding: nativeAxwiseScopeActionBinding(value),
      },
      {}
    );

    expect(result.status).toBe('request-evidence');
    const evidencePatch = updateGoalIfNativeScopeBinding.mock.calls[0][4];
    expect(evidencePatch).toMatchObject({
      status: 'researching_customer',
      data: {
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          kind: 'evidence_refresh',
          revision_token: expect.any(String),
          source_decision_id: 'context-1',
          source_scope_hash: scopeHash,
          source_generation: 4,
          source_job_id: 'research-job-old',
        },
        axwise_customer_intelligence: {
          status: 'evidence_requested',
          decision_id: null,
          parent_decision_id: null,
          job_id: null,
          generation: null,
          request_id: null,
          request_hash: null,
          requested_at: null,
          current_stage: null,
          progress_percentage: 0,
          elapsed_ms: 0,
          stage_durations_ms: {},
          stage_trace: [],
          last_poll_error: null,
          routing_mode: null,
          scorer_version: null,
          router_version: null,
          routing_assessment: null,
          candidate_agent_ids: [],
          completed_at: null,
          completed_research_iterations: 0,
          clarification_source_research_run: null,
          research_bundle: null,
          research_bundle_summary: null,
          research_bundle_full: null,
          research_failure: null,
          retry_count: 0,
          retry_of_decision_id: null,
          retry_of_job_id: null,
          retried_at: null,
          user_research_request: expect.objectContaining({ requested_by: 'user-1' }),
        },
      },
    });
    expect(enqueueGoalAction).toHaveBeenCalledWith(
      {},
      'customer-intelligence',
      value.id,
      expect.objectContaining({
        revision_feedback: 'Verify the no-show baseline from appointment records.',
        scope_revision_token: evidencePatch.data.scope_revision.revision_token,
      })
    );
  });

  it('reruns scope admission rather than legacy PO analysis for a revised Smart Request', async () => {
    const value = goal();
    const decision = nativeDecisionContractsFixture();
    attachNativeHandoff(value, decision, { generation: 4, admissionStatus: 'accepted' });
    const previousScopeHash = decision.scope_packet.scope_hash;
    value.data.scope_admission = {
      version: 1,
      native_scope: true,
      status: 'pending',
      state_key: 'axwise_customer_intelligence',
      scope_hash: previousScopeHash,
      playbook_id: 'software_prd',
      requires_authorization: true,
      maximum_side_effect: 'reversible',
    };
    Object.assign(value.data.axwise_customer_intelligence, {
      parent_decision_id: 'parent-old',
      job_id: 'research-job-old',
      request_id: 'request-old',
      requested_at: '2026-08-23T08:00:00.000Z',
      current_stage: 'persona_simulation',
      progress_percentage: 70,
      elapsed_ms: 12000,
      stage_durations_ms: { intake: 1200 },
      stage_trace: [{ stage: 'intake', status: 'completed' }],
      last_poll_error: 'old transient error',
      axwise_scope_handoff: { scope_hash: previousScopeHash },
    });
    value.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(value)
    );
    value.data.work_shape_route = {
      version: 'orqaly_work_shape_route_v1',
      playbook_id: 'software_prd',
      scope_hash: previousScopeHash,
    };
    loadGoal.mockResolvedValue(value);

    const result = await handle(
      {},
      {
        goalId: 'goal-1',
        context_action: 'revise',
        feedback: 'Focus the scope on appointment reminders only.',
        approved_by: 'user-1',
        native_scope_binding: nativeAxwiseScopeActionBinding(value),
      },
      {}
    );

    expect(result.status).toBe('revise');
    const revisionPatch = updateGoalIfNativeScopeBinding.mock.calls[0][4];
    expect(revisionPatch.data).toMatchObject({
      context_revision_feedback: 'Focus the scope on appointment reminders only.',
      scope_revision: {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
        revision_token: expect.any(String),
        desired_outcome: 'Focus the scope on appointment reminders only.',
        source_decision_id: 'context-1',
        source_scope_hash: previousScopeHash,
      },
      work_shape_route: null,
      scope_admission: {
        native_scope: true,
        status: 'revision_requested',
        scope_hash: null,
        playbook_id: null,
        requires_authorization: false,
        maximum_side_effect: 'none',
        grants_authorization: false,
      },
      axwise_customer_intelligence: {
        parent_decision_id: null,
        job_id: null,
        generation: null,
        request_id: null,
        request_hash: null,
        requested_at: null,
        current_stage: null,
        progress_percentage: 0,
        elapsed_ms: 0,
        stage_durations_ms: {},
        stage_trace: [],
        last_poll_error: null,
        scope_packet: null,
        scope_validation: null,
        quality_contract: null,
        axwise_scope_confirmation: null,
        axwise_scope_handoff: null,
        previous_scope_contract: {
          scope_hash: previousScopeHash,
          confirmation_scope_hash: previousScopeHash,
        },
      },
    });
    expect(enqueueGoalAction).toHaveBeenCalledWith(
      {},
      'scope-admission',
      'goal-1',
      expect.objectContaining({
        revision_feedback: 'Focus the scope on appointment reminders only.',
        scope_revision_token: revisionPatch.data.scope_revision.revision_token,
      })
    );
  });

  it.each(['approve', 'revise'])(
    'rejects a queued native %s after a newer scope generation wins the race',
    async (contextAction) => {
      const value = goal();
      const oldDecision = nativeDecisionContractsFixture(
        nativeScopePacketFixture({ audiences: ['Original audience'] })
      );
      attachNativeHandoff(value, oldDecision, { generation: 1 });
      const staleBinding = nativeAxwiseScopeActionBinding(value);

      const newDecision = nativeDecisionContractsFixture(
        nativeScopePacketFixture({ audiences: ['Replacement audience'] })
      );
      attachNativeHandoff(value, newDecision, { generation: 2 });
      loadGoal.mockResolvedValue(value);

      const result = await handle(
        {},
        {
          goalId: value.id,
          context_action: contextAction,
          ...(contextAction === 'revise' ? { feedback: 'Use the latest campaign scope.' } : {}),
          approved_by: 'user-1',
          native_scope_binding: staleBinding,
        },
        {}
      );

      expect(result.status).toBe('stale_native_scope');
      expect(updateGoalIfNativeScopeBinding).not.toHaveBeenCalled();
      expect(updateGoalIfStatus).not.toHaveBeenCalled();
      expect(enqueueGoalAction).not.toHaveBeenCalled();
    }
  );

  it('restores Gate 1 when the native revision child enqueue fails', async () => {
    const value = goal();
    const decision = nativeDecisionContractsFixture();
    attachNativeHandoff(value, decision, { generation: 3, admissionStatus: 'accepted' });
    Object.assign(value.data.axwise_customer_intelligence, {
      job_id: 'research-job-old',
    });
    value.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(value)
    );
    loadGoal.mockResolvedValue(value);
    enqueueGoalAction.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(
      handle(
        {},
        {
          goalId: value.id,
          context_action: 'revise',
          feedback: 'Use the corrected campaign scope.',
          approved_by: 'user-1',
          native_scope_binding: nativeAxwiseScopeActionBinding(value),
        },
        {}
      )
    ).rejects.toThrow('queue unavailable');

    const revisionPatch = updateGoalIfNativeScopeBinding.mock.calls[0][4];
    expect(restoreGoalIfScopeRevision).toHaveBeenCalledWith(
      {},
      value.id,
      'analyzing',
      revisionPatch.data.scope_revision.revision_token,
      { status: 'awaiting_context_approval', data: value.data },
      'revision_requested'
    );
  });

  it('restores Gate 1 when a native evidence-refresh child enqueue fails', async () => {
    const value = goal();
    const decision = nativeDecisionContractsFixture();
    attachNativeHandoff(value, decision, { generation: 3, admissionStatus: 'accepted' });
    Object.assign(value.data.axwise_customer_intelligence, {
      job_id: 'research-job-old',
    });
    value.data.goal_approvals.context = pendingApproval(
      'context',
      buildContextApprovalSnapshot(value)
    );
    loadGoal.mockResolvedValue(value);
    enqueueGoalAction.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(
      handle(
        {},
        {
          goalId: value.id,
          context_action: 'request-evidence',
          feedback: 'Refresh the supporting records.',
          approved_by: 'user-1',
          native_scope_binding: nativeAxwiseScopeActionBinding(value),
        },
        {}
      )
    ).rejects.toThrow('queue unavailable');

    const evidencePatch = updateGoalIfNativeScopeBinding.mock.calls[0][4];
    expect(restoreGoalIfScopeRevision).toHaveBeenCalledWith(
      {},
      value.id,
      'researching_customer',
      evidencePatch.data.scope_revision.revision_token,
      { status: 'awaiting_context_approval', data: value.data },
      'evidence_requested'
    );
  });

  it.each(['approve', 'revise'])(
    'does not commit a native %s when the database CAS observes a newer scope',
    async (contextAction) => {
      const value = goal();
      const decision = nativeDecisionContractsFixture();
      attachNativeHandoff(value, decision, { generation: 7 });
      loadGoal.mockResolvedValue(value);
      updateGoalIfNativeScopeBinding.mockResolvedValueOnce(false);

      const result = await handle(
        {},
        {
          goalId: value.id,
          context_action: contextAction,
          ...(contextAction === 'revise' ? { feedback: 'Use the newer scope.' } : {}),
          approved_by: 'user-1',
          native_scope_binding: nativeAxwiseScopeActionBinding(value),
        },
        {}
      );

      expect(result.status).toBe('state_changed');
      expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
        {},
        value.id,
        'awaiting_context_approval',
        nativeAxwiseScopeActionBinding(value),
        expect.any(Object)
      );
      expect(updateGoalIfStatus).not.toHaveBeenCalled();
      expect(enqueueGoalAction).not.toHaveBeenCalled();
    }
  );

  it('keeps legacy revisions on PO analysis when no scope-admission marker exists', async () => {
    loadGoal.mockResolvedValue(goal());

    await handle(
      {},
      {
        goalId: 'goal-1',
        context_action: 'revise',
        feedback: 'Clarify the audience.',
      },
      {}
    );

    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'po-analysis', 'goal-1', expect.any(Object));
    expect(updateGoalIfStatus.mock.calls[0][3].data).not.toHaveProperty('scope_revision');
    expect(enqueueGoalAction.mock.calls[0][3]).not.toHaveProperty('scope_revision_token');
  });

  it.each(['approve', 'revise', 'request-evidence'])(
    'does not let a delayed %s action revive a cancelled goal',
    async (contextAction) => {
      loadGoal.mockResolvedValue({ ...goal(), status: 'cancelled' });

      const result = await handle(
        {},
        { goalId: 'goal-1', context_action: contextAction, approved_by: 'user-1' },
        {}
      );

      expect(result.status).toBe('not_awaiting_context_approval');
      expect(updateGoalIfStatus).not.toHaveBeenCalled();
      expect(enqueueGoalAction).not.toHaveBeenCalled();
    }
  );

  it('does not enqueue planning when cancellation wins the approval CAS', async () => {
    loadGoal.mockResolvedValue(goal());
    updateGoalIfStatus.mockResolvedValueOnce(false);

    const result = await handle(
      {},
      { goalId: 'goal-1', context_action: 'approve', approved_by: 'user-1' },
      {}
    );

    expect(result.status).toBe('state_changed');
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });
});
