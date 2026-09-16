import { createHash } from 'node:crypto';
import {
  canonicalContractHash,
  createScopeResearchAcceptanceBinding,
  nativeAxwiseScopeContractBinding,
} from './compact-agent-contracts.js';

function semanticId(prefix, payload) {
  return `${prefix}-${canonicalContractHash(payload).slice(0, 16)}`;
}

export function nativeQualityContractFixture() {
  return {
    version: 'axwise_quality_contract_v1',
    minimum_requirement_coverage: 1,
    minimum_p0_test_coverage: 1,
    require_requirement_test_traceability: true,
    require_verified_fact_authority: true,
    require_verbatim_evidence: true,
    require_runtime_truth: true,
    reject_fact_assumption_overlap: true,
    reject_stale_scope_hash: true,
    unresolved_decisions_force_draft: true,
    targeted_repair_before_regeneration: true,
    output_token_limit_policy: 'do_not_artificially_cap',
  };
}

export function nativeResearchContractFixture({
  documentIntent = 'software_product',
  workTypes = ['software_development'],
  geographies = [],
  evidence = {
    mode: 'none',
    grounding_required: false,
    required_outputs: [],
    external_sources_required: false,
  },
  roles = [],
} = {}) {
  const withoutHash = {
    version: 'axwise_scope_research_contract_v1',
    document_intent: documentIntent,
    work_types: [...workTypes].sort(),
    geographies: [...geographies].sort(),
    evidence: {
      mode: evidence.mode,
      grounding_required: evidence.grounding_required,
      required_outputs: [...evidence.required_outputs].sort(),
      external_sources_required: evidence.external_sources_required,
    },
    executor_role_slots: roles
      .map((role, index) => {
        const canonicalRole = role.trim().replace(/\s+/gu, ' ');
        return {
          slot_id: `role-${index.toString(16).padStart(4, '0')}${createHash('sha256')
            .update(canonicalRole, 'utf8')
            .digest('hex')
            .slice(0, 12)}`,
          role: canonicalRole,
          required: true,
        };
      })
      .sort((left, right) => left.slot_id.localeCompare(right.slot_id)),
  };
  return {
    ...withoutHash,
    contract_hash: canonicalContractHash(withoutHash),
  };
}

export function nativeScopePacketFixture({
  audiences = ['Product operators'],
  admission = null,
  researchContract = null,
} = {}) {
  const requirementText = 'Users can review and proceed with the proposed scope.';
  const requirementId = semanticId('req', { text: requirementText.toLowerCase() });
  const acceptancePayload = {
    given: 'a synthetic proposed scope',
    when: 'the user chooses proceed',
    then: ['the approved scope advances to synthesis'],
    supports: [requirementId],
    data_class: 'synthetic',
  };
  const packetWithoutHash = {
    version: 'axwise_scope_packet_v1',
    scope_ref: 'axwise:goal-1:decision-1',
    intent: {
      objective: 'Create an implementation-ready product requirements document.',
      problem: 'Repeated interviews delay a well-understood request.',
      desired_outcome: 'A safe propose, correct, and proceed workflow.',
      audiences,
      non_goals: ['No autonomous external side effects'],
    },
    deliverable: {
      type: 'markdown',
      count: 1,
      title_prefix: '# PRD: ScopeConfirm',
      required_sections: ['Problem', 'Conversational UX', 'Acceptance tests'],
      presentation: 'markdown_artifact',
    },
    research_contract:
      researchContract ||
      nativeResearchContractFixture({
        documentIntent: admission?.work_types?.includes('software_development')
          ? 'software_product'
          : admission
            ? 'custom'
            : 'software_product',
        workTypes: admission?.work_types || ['software_development'],
        geographies: admission?.geographies || [],
        roles: admission?.required_capabilities || [],
      }),
    ...(admission ? { admission } : {}),
    ledger: {
      requirements: [
        {
          requirement_id: requirementId,
          text: requirementText,
          priority: 'P0',
          authority: 'user',
          source_refs: ['user-request'],
        },
      ],
      facts: [],
      assumptions: [],
      decisions: [],
      constraints: [],
      acceptance: [
        {
          acceptance_id: semanticId('acc', acceptancePayload),
          ...acceptancePayload,
        },
      ],
    },
    runtime: {
      runtime_contract_version: 'axwise_gemini_runtime_v1',
      runtime_authority_id: 'axwise.runtime.gemini-research.v1',
      provider: 'google',
      model: 'gemini-3.8-flash',
      model_resource: 'models/gemini-3.8-flash',
      reasoning_mode: 'high',
      context_window: 1048576,
      max_output_tokens: 65536,
      output_policy: 'provider_maximum_no_workflow_cap',
      configuration_sources: [
        'backend.services.llm.gemini_runtime',
        'backend.services.llm.config.genai_config',
        'backend.infrastructure.data.config.MODEL_CAPABILITIES',
      ],
    },
    truth_policy: {
      external_facts: 'verified_evidence_only',
      unsupported_numbers: 'target_hypothesis_or_assumption',
      unsettled_technology: 'label_proposed',
      owner_confirmation: 'assumption_never_fact',
      open_decisions: 'force_draft',
      side_effects: 'explicit_orqaly_approval_required',
    },
    quality_contract: nativeQualityContractFixture(),
    document_status: 'Ready for review',
  };
  return {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };
}

export function nativeDecisionContractsFixture(packet = nativeScopePacketFixture()) {
  return {
    research_execution_inputs_hash: canonicalContractHash({
      scope_hash: packet.scope_hash,
      contract_hash: packet.research_contract.contract_hash,
      runtime: packet.runtime,
    }),
    scope_packet: packet,
    scope_contract_binding: nativeAxwiseScopeContractBinding(packet),
    scope_runtime_binding: structuredClone(packet.runtime),
    scope_validation: {
      version: 'axwise_scope_validation_v1',
      scope_hash: packet.scope_hash,
      valid: true,
      ready_for_synthesis: true,
      checks: [
        {
          check_id: 'packet-integrity',
          passed: true,
          blocking: true,
          message: 'The scope packet is valid.',
        },
      ],
      requirement_count: packet.ledger.requirements.length,
      acceptance_count: packet.ledger.acceptance.length,
      unresolved_decision_count: packet.ledger.decisions.filter((item) =>
        ['open', 'proposed'].includes(item.status)
      ).length,
    },
    scope_confirmation: {
      status: 'proceed_or_edit',
      message: 'Proceed with this scope or edit it.',
      primary_action: 'proceed',
      secondary_action: 'edit scope',
      material_question: null,
      scope_hash: packet.scope_hash,
      authorizes_external_actions: false,
    },
  };
}

export function nativeScopeResearchAcceptanceFixture(
  handoff,
  {
    goalId = 'goal-1',
    userId = 'user-1',
    orgId = 'org-1',
    acceptanceId = '00000000-0000-4000-8000-000000000001',
    acceptedAt = '2026-08-24T08:30:00.000Z',
  } = {}
) {
  return createScopeResearchAcceptanceBinding({
    version: 'orqaly_scope_research_acceptance_v1',
    org_id: orgId,
    user_id: userId,
    goal_id: goalId,
    proposal_decision_id: 'proposal-decision-1',
    scope_hash: handoff.scope_packet.scope_hash,
    contract_hash: handoff.scope_packet.research_contract.contract_hash,
    execution_inputs_hash: handoff.research_execution_inputs_hash,
    acceptance_id: acceptanceId,
    accepted_at: acceptedAt,
    accepted_by_user_id: userId,
  });
}

export function nativeMaterialQuestionContractsFixture(
  question = 'Which approved customer segment should receive the pilot?'
) {
  const basePacket = nativeScopePacketFixture();
  const openDecision = {
    decision_id: semanticId('dec', {
      question: question.replace(/\s+/g, ' ').trim().toLowerCase(),
      materiality: 'material',
    }),
    question,
    status: 'open',
    materiality: 'material',
    proposal: null,
    resolved_choice: null,
    source_refs: ['user-request'],
  };
  const packetWithoutHash = {
    ...basePacket,
    ledger: {
      ...basePacket.ledger,
      decisions: [openDecision],
    },
    document_status: 'Draft',
  };
  delete packetWithoutHash.scope_hash;
  const packet = {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };

  return {
    scope_packet: packet,
    scope_contract_binding: nativeAxwiseScopeContractBinding(packet),
    scope_validation: {
      version: 'axwise_scope_validation_v1',
      scope_hash: packet.scope_hash,
      valid: true,
      ready_for_synthesis: false,
      checks: [
        {
          check_id: 'packet-integrity',
          passed: true,
          blocking: true,
          message: 'The scope packet is valid.',
        },
        {
          check_id: 'decision_resolution',
          passed: false,
          blocking: true,
          message: 'One material decision needs an owner answer.',
        },
      ],
      requirement_count: packet.ledger.requirements.length,
      acceptance_count: packet.ledger.acceptance.length,
      unresolved_decision_count: 1,
    },
    scope_confirmation: {
      status: 'needs_material_input',
      message: 'Answer the one material question or edit the scope.',
      primary_action: 'answer',
      secondary_action: 'edit scope',
      material_question: question,
      scope_hash: packet.scope_hash,
      authorizes_external_actions: false,
    },
  };
}
