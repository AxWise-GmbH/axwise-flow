import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  adaptNativeAxwiseScopePacket,
  AXWISE_QUALITY_CONTRACT_VERSION,
  AXWISE_SCOPE_PACKET_VERSION,
  buildCoverageMatrix,
  buildScopePacketFromAcceptedAxwise,
  buildSpecialistPacketJsonSchema,
  buildSpecialistPrompt,
  buildSpecialistRequest,
  buildSynthesisPrompt,
  buildSynthesisRequest,
  canonicalContractHash,
  isCompactArtifactWorkflow,
  NativeAxwiseAdmissionSchema,
  NativeAxwiseScopeResearchContractSchema,
  nativeAxwiseScopeContractBinding,
  resolveQualityContract,
  resolveScopePacket,
  SPECIALIST_ITEM_KINDS,
  validateNativeAxwiseDecisionContracts,
  validateSpecialistPacket,
} from './compact-agent-contracts.js';
import { nativeResearchContractFixture } from './native-axwise-contract.test-fixture.js';

const HASH = 'a'.repeat(64);

function semanticId(prefix, payload) {
  return `${prefix}-${canonicalContractHash(payload).slice(0, 16)}`;
}

function nativeQualityContract() {
  return {
    version: AXWISE_QUALITY_CONTRACT_VERSION,
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

function nativeScopePacket({ audiences = ['Product operators'], admission = null } = {}) {
  const requirementText = 'Users can review and proceed with the proposed scope.';
  const requirementId = semanticId('req', { text: requirementText.toLowerCase() });
  const factClaim = 'The approved Gemini output ceiling is 65536 tokens.';
  const factRefs = ['runtime-config'];
  const authorityIds = ['axwise.runtime.gemini-research.v1'];
  const factId = semanticId('fact', {
    claim: factClaim.toLowerCase(),
    source_refs: factRefs,
    source_authority_ids: authorityIds,
  });
  const acceptancePayload = {
    given: 'a synthetic proposed scope',
    when: 'the user chooses proceed',
    then: ['the approved scope advances to synthesis'],
    supports: [requirementId],
    data_class: 'synthetic',
  };
  const packetWithoutHash = {
    version: AXWISE_SCOPE_PACKET_VERSION,
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
    research_contract: nativeResearchContractFixture({
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
      facts: [
        {
          fact_id: factId,
          claim: factClaim,
          verification: 'verified',
          source_refs: factRefs,
          source_authority_ids: authorityIds,
          verbatim_excerpt: 'max_output_tokens: 65536',
          content_hash: 'b'.repeat(64),
        },
      ],
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
    quality_contract: nativeQualityContract(),
    document_status: 'Ready for review',
  };
  return {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };
}

function nativeDecisionContracts(packet = nativeScopePacket()) {
  return {
    scope_packet: packet,
    scope_contract_binding: nativeAxwiseScopeContractBinding(packet),
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
      unresolved_decision_count: 0,
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

function scopePacket(overrides = {}) {
  return {
    version: 'orqaly_scope_packet_v2',
    scope_ref: 'scope:goal-1:decision-1',
    scope_hash: HASH,
    intent: {
      objective: 'Create the ScopeConfirm PRD',
      problem: 'Mandatory interviews delay useful work',
      desired_outcome: 'A safe propose-correct-proceed flow',
      audiences: [{ id: 'AUD1', description: 'Small-business operators' }],
      non_goals: [{ id: 'NG1', text: 'No autonomous high-risk execution' }],
    },
    deliverable: {
      type: 'markdown',
      count: 1,
      title_prefix: '# PRD: ScopeConfirm',
      required_sections: [{ id: 'SEC1', topic: 'Problem' }],
      presentation: 'artifact_only',
    },
    ledger: {
      requirements: [
        {
          id: 'R1',
          text: 'First visible response P95 under two seconds',
          authority: 'user_explicit',
          source_refs: ['USER1'],
        },
        {
          id: 'R2',
          text: 'No more than two confirmations for standard work',
          authority: 'user_explicit',
          source_refs: ['USER1'],
        },
      ],
      facts: [],
      assumptions: [
        {
          id: 'A1',
          text: 'Operators prefer one-click confirmation',
          materiality: 'non_material',
          owner_accepted: true,
          truth_status: 'unverified',
          source_refs: ['AXWISE1'],
        },
      ],
      decisions: [],
      constraints: [
        {
          id: 'C1',
          kind: 'test_data',
          text: 'Synthetic data only',
          authority: 'user_explicit',
        },
      ],
    },
    runtime: {
      model: 'gemini-3.8-flash',
      reasoning: 'high',
      as_of: '2026-09-03',
      authority: 'trusted_runtime_config',
    },
    acceptance: [
      {
        id: 'AC1',
        given: 'a synthetic low-risk request',
        when: 'the user says proceed',
        then: ['the scope advances without another interview'],
        supports: ['R2'],
        data_class: 'synthetic',
      },
    ],
    truth_policy: { external_facts: 'verified_evidence_only' },
    ...overrides,
  };
}

function qualityContract() {
  return {
    version: 'orqaly_quality_contract_v2',
    criteria: [
      {
        id: 'Q1',
        text: 'Specify observable UX states and recovery copy',
        applies_to: ['conversational_ux'],
      },
      { id: 'Q2', text: 'Keep tenant boundaries explicit', applies_to: ['security'] },
    ],
    truth_policy: { unsupported_claims: 'label_or_remove' },
    compactness: { canonical_home_per_concept: true },
  };
}

function uxTask(overrides = {}) {
  return {
    id: 'task-ux',
    title: 'Design conversational UX states',
    description: 'Define the propose-correct-proceed experience.',
    assigned_to: 'Conversational UX Specialist',
    data: {
      required_role: 'Conversational UX Specialist',
      requirement_ids: ['R1', 'R2'],
      constraint_ids: ['C1'],
      acceptance_criteria: ['Specify states', 'Specify recovery copy'],
    },
    ...overrides,
  };
}

function packet(overrides = {}) {
  return {
    version: 'orqaly_specialist_packet_v1',
    scope_hash: HASH,
    task_id: 'task-ux',
    lens: 'conversational_ux',
    status: 'complete',
    coverage: [
      { requirement_id: 'R1', item_ids: ['UX1'], test_ids: ['UXT1'] },
      { requirement_id: 'R2', item_ids: ['UX1'], test_ids: ['UXT1'] },
    ],
    items: [
      {
        id: 'UX1',
        kind: 'state',
        title: 'Proposal review',
        specification: 'Render editable inferred values before approval.',
        attributes: [{ key: 'exit', value: 'proceed, correct, or material question' }],
        supports: ['R1', 'R2'],
        source_refs: ['R1', 'R2'],
        certainty: 'required',
        depends_on: [],
      },
    ],
    tests: [
      {
        id: 'UXT1',
        given: 'a synthetic low-risk scope',
        when: 'the user says proceed',
        then: ['advance without another interview'],
        supports: ['R2'],
        data_class: 'synthetic',
      },
    ],
    risks: [],
    conflicts: [],
    open_decisions: [],
    handoff: { must_include_item_ids: ['UX1'], may_omit_item_ids: [] },
    ...overrides,
  };
}

describe('canonical compact contracts', () => {
  it('prefers a strictly valid canonical Orqaly ScopePacket and QualityContract', () => {
    const goal = {
      data: {
        scope_packet: scopePacket(),
        quality_contract: qualityContract(),
      },
    };

    expect(resolveScopePacket(goal, uxTask())).toMatchObject({ scope_hash: HASH });
    expect(resolveQualityContract(goal, uxTask())).toMatchObject({
      version: 'orqaly_quality_contract_v2',
    });
  });

  it('rejects an oversized native packet instead of silently truncating it', () => {
    const goal = {
      data: {
        scope_packet: scopePacket({
          ledger: {
            ...scopePacket().ledger,
            requirements: Array.from({ length: 25 }, (_, index) => ({
              id: `R${index}`,
              text: `Requirement ${index}`,
              authority: 'user_explicit',
              source_refs: ['USER1'],
            })),
          },
        }),
      },
    };

    expect(() => resolveScopePacket(goal, uxTask())).toThrow(/Invalid canonical Orqaly/);
  });

  it('adapts an accepted hash-bound AxWise scope without promoting it to fact', () => {
    const goal = {
      id: 'goal-1',
      title: 'Create ScopeConfirm PRD',
      description:
        'Create one PRD. Include: problem, UX states, data model.\nConstraints: synthetic tests.',
      parsed_requirements: 'Exactly one Markdown artifact.',
      tech_doc: {
        problem_statement: 'Interview-first workflows are slow.',
        success_criteria: ['Users can proceed or correct assumptions.'],
        constraints: ['Synthetic data only in tests.'],
        acceptance_tests: [{ test: 'Proceed advances the approved scope.' }],
      },
      data: {
        test_model: { model: 'gemini-3.8-flash', reasoning_effort: 'high' },
        axwise_customer_intelligence: {
          decision_id: 'decision-1',
          scope_confirmation: {
            status: 'accepted',
            source_decision_id: 'decision-1',
            source_scope_hash: HASH,
            summary: 'A proposed scope for small-business operators.',
            target_customer: 'Small-business operators',
            problem: 'Interview-first workflows are slow.',
            desired_outcome: 'A safe propose-correct-proceed flow.',
            scope: { constraints: ['No browsing.'] },
          },
        },
      },
    };

    const adapted = buildScopePacketFromAcceptedAxwise(goal);
    expect(adapted).toMatchObject({
      version: 'orqaly_scope_packet_v2',
      source: 'orqaly_accepted_axwise_scope_adapter_v1',
      scope_hash: HASH,
      ledger: {
        facts: [],
        assumptions: [
          expect.objectContaining({ owner_accepted: true, truth_status: 'unverified' }),
        ],
      },
    });
    expect(adapted.deliverable.required_sections.map((item) => item.topic)).toEqual([
      'problem',
      'UX states',
      'data model',
    ]);
  });
});

describe('native AxWise v1 handshake', () => {
  it('matches Python v1 role-slot IDs for case-preserved Unicode UTF-8 bytes', () => {
    const vectors = JSON.parse(
      readFileSync('lib/agent-handlers/fixtures/scope_research_contract_v1_vectors.json', 'utf8')
    );
    expect(vectors.version).toBe('axwise_scope_research_contract_v1_vectors');
    const roles = vectors.role_slot_vectors.map((item) => item.role);
    const contract = nativeResearchContractFixture({
      documentIntent: 'operational_process',
      workTypes: ['strategy_planning'],
      evidence: {
        mode: 'synthetic',
        grounding_required: false,
        required_outputs: ['persona_resolution', 'research_bundle'],
        external_sources_required: false,
      },
      roles,
    });

    expect(contract.executor_role_slots).toEqual(
      vectors.role_slot_vectors.map((item) => ({
        slot_id: item.slot_id,
        role: item.role,
        required: true,
      }))
    );
    expect(NativeAxwiseScopeResearchContractSchema.safeParse(contract).success).toBe(true);

    const caseFolded = structuredClone(contract);
    caseFolded.executor_role_slots[0].slot_id = vectors.role_slot_vectors[0].casefolded_slot_id;
    expect(NativeAxwiseScopeResearchContractSchema.safeParse(caseFolded).success).toBe(false);
  });

  it('mirrors Python v1 research-contract semantic invariants fail closed', () => {
    const valid = nativeResearchContractFixture({
      documentIntent: 'commercial_market_launch',
      workTypes: ['procurement_logistics', 'research_analysis', 'strategy_planning'],
      geographies: ['EE'],
      evidence: {
        mode: 'grounded',
        grounding_required: true,
        required_outputs: [
          'market_claims',
          'market_sources',
          'persona_resolution',
          'research_bundle',
          'research_prd',
        ],
        external_sources_required: true,
      },
      roles: ['Estonia Market Lead'],
    });
    expect(NativeAxwiseScopeResearchContractSchema.safeParse(valid).success).toBe(true);

    const invalidVectors = [
      (value) => value.geographies.splice(0, 1, 'ZZ'),
      (value) => value.geographies.splice(0),
      (value) => value.work_types.splice(value.work_types.indexOf('strategy_planning'), 1),
      (value) => value.work_types.splice(value.work_types.indexOf('research_analysis'), 1),
      (value) =>
        value.evidence.required_outputs.splice(
          value.evidence.required_outputs.indexOf('research_bundle'),
          1
        ),
      (value) =>
        value.evidence.required_outputs.splice(
          value.evidence.required_outputs.indexOf('persona_resolution'),
          1
        ),
      (value) => {
        value.evidence.mode = 'synthetic';
        value.evidence.grounding_required = false;
        value.evidence.external_sources_required = false;
      },
      (value) => {
        value.executor_role_slots[0].role = ' Estonia  Market Lead ';
      },
      (value) => {
        value.executor_role_slots[0].slot_id = 'role-0000000000000000';
      },
    ];
    for (const mutate of invalidVectors) {
      const invalid = structuredClone(valid);
      mutate(invalid);
      expect(NativeAxwiseScopeResearchContractSchema.safeParse(invalid).success).toBe(false);
    }

    const customPrd = nativeResearchContractFixture({
      documentIntent: 'custom',
      workTypes: ['mixed_custom'],
      evidence: {
        mode: 'synthetic',
        grounding_required: false,
        required_outputs: ['research_bundle', 'research_prd'],
        external_sources_required: false,
      },
    });
    expect(NativeAxwiseScopeResearchContractSchema.safeParse(customPrd).success).toBe(false);

    const noneWithOutputs = nativeResearchContractFixture({
      evidence: {
        mode: 'none',
        grounding_required: false,
        required_outputs: ['research_bundle'],
        external_sources_required: false,
      },
    });
    expect(NativeAxwiseScopeResearchContractSchema.safeParse(noneWithOutputs).success).toBe(false);
  });

  it('accepts the immutable legacy 3.7 Unicode handoff emitted by AxWise Python', () => {
    const golden = JSON.parse(
      readFileSync('lib/agent-handlers/fixtures/axwise-scope-packet-v1.python-golden.json', 'utf8')
    );
    const withoutHash = { ...golden.scope_packet };
    delete withoutHash.scope_hash;

    expect(canonicalContractHash(withoutHash)).toBe(
      '483bb7b45852985a64a2bdb218e3cac63e329f9b096f62334bcca4c24973b785'
    );
    expect(validateNativeAxwiseDecisionContracts(golden)).toMatchObject({
      scope_packet: {
        document_status: 'Draft',
        ledger: {
          requirements: [{ requirement_id: 'req-fa1a218596176425' }],
          facts: [
            {
              fact_id: 'fact-4795c50e4cb81207',
              source_refs: ['quelle:Straße'],
              source_authority_ids: ['authority:owner:ß'],
            },
          ],
          decisions: [{ resolved_choice: null, status: 'proposed' }],
        },
      },
      scope_validation: { ready_for_synthesis: false, unresolved_decision_count: 1 },
      scope_confirmation: { status: 'proceed_or_edit', material_question: null },
    });
  });

  it('strictly validates and adapts native IDs, verified provenance, and quality invariants', () => {
    const native = nativeScopePacket();
    const handoff = validateNativeAxwiseDecisionContracts(nativeDecisionContracts(native));
    const goal = {
      data: {
        axwise_customer_intelligence: {
          scope_packet: handoff.scope_packet,
          scope_validation: handoff.scope_validation,
          axwise_scope_confirmation: handoff.scope_confirmation,
          scope_contract_binding: handoff.scope_contract_binding,
          quality_contract: handoff.quality_contract,
        },
      },
    };

    const adapted = resolveScopePacket(goal, uxTask());
    const quality = resolveQualityContract(goal, uxTask(), adapted);
    expect(adapted).toMatchObject({
      version: 'orqaly_scope_packet_v2',
      source: AXWISE_SCOPE_PACKET_VERSION,
      scope_hash: native.scope_hash,
      ledger: {
        requirements: [{ id: native.ledger.requirements[0].requirement_id }],
        facts: [
          {
            id: native.ledger.facts[0].fact_id,
            verification: 'verified',
            evidence_refs: ['runtime-config'],
            source_authority_ids: ['axwise.runtime.gemini-research.v1'],
            verbatim_excerpt: 'max_output_tokens: 65536',
          },
        ],
      },
    });
    expect(adapted.deliverable.required_sections.map((item) => item.topic)).toEqual([
      'Problem',
      'Conversational UX',
      'Acceptance tests',
    ]);
    expect(quality.native_invariants).toEqual(nativeQualityContract());
    expect(quality.compactness).toMatchObject({
      output_token_limit_policy: 'do_not_artificially_cap',
    });
  });

  it('strictly validates and preserves domain-neutral admission hints', () => {
    const admission = {
      version: 'axwise_scope_admission_v1',
      work_types: ['content_asset_creation', 'external_service_operation'],
      geographies: ['EE'],
      channels: ['sms'],
      success_criteria: ['Every accepted recipient has a provider receipt'],
      required_capabilities: ['consent validation', 'Twilio'],
      requested_actions: [
        {
          action: 'Send an SMS campaign to the approved recipients',
          mode: 'execute',
          side_effect: 'irreversible',
          requires_authorization: true,
        },
      ],
    };
    const native = nativeScopePacket({ admission });
    const handoff = validateNativeAxwiseDecisionContracts(nativeDecisionContracts(native));
    const goal = {
      data: {
        axwise_customer_intelligence: {
          scope_packet: handoff.scope_packet,
          scope_validation: handoff.scope_validation,
          axwise_scope_confirmation: handoff.scope_confirmation,
          scope_contract_binding: handoff.scope_contract_binding,
        },
      },
    };

    expect(resolveScopePacket(goal, uxTask()).admission).toEqual(admission);

    const invalid = nativeScopePacket({ admission: structuredClone(admission) });
    invalid.admission.requested_actions[0].mode = 'authorize';
    const withoutHash = { ...invalid };
    delete withoutHash.scope_hash;
    invalid.scope_hash = canonicalContractHash(withoutHash);
    expect(() => validateNativeAxwiseDecisionContracts(nativeDecisionContracts(invalid))).toThrow(
      /Invalid native AxWise ScopePacket/
    );

    const unauthorized = nativeScopePacket({ admission: structuredClone(admission) });
    unauthorized.admission.requested_actions[0].requires_authorization = false;
    const unauthorizedWithoutHash = { ...unauthorized };
    delete unauthorizedWithoutHash.scope_hash;
    unauthorized.scope_hash = canonicalContractHash(unauthorizedWithoutHash);
    expect(() =>
      validateNativeAxwiseDecisionContracts(nativeDecisionContracts(unauthorized))
    ).toThrow(/execute or side-effecting actions require authorization/);

    const unauthorizedSideEffect = nativeScopePacket({ admission: structuredClone(admission) });
    unauthorizedSideEffect.admission.requested_actions[0] = {
      action: 'Prepare a provider-side reservation',
      mode: 'prepare',
      side_effect: 'reversible',
      requires_authorization: false,
    };
    const unauthorizedSideEffectWithoutHash = { ...unauthorizedSideEffect };
    delete unauthorizedSideEffectWithoutHash.scope_hash;
    unauthorizedSideEffect.scope_hash = canonicalContractHash(unauthorizedSideEffectWithoutHash);
    expect(() =>
      validateNativeAxwiseDecisionContracts(nativeDecisionContracts(unauthorizedSideEffect))
    ).toThrow(/execute or side-effecting actions require authorization/);

    const unknownWorkType = nativeScopePacket({ admission: structuredClone(admission) });
    unknownWorkType.admission.work_types = ['software_product'];
    const unknownWorkTypeWithoutHash = { ...unknownWorkType };
    delete unknownWorkTypeWithoutHash.scope_hash;
    unknownWorkType.scope_hash = canonicalContractHash(unknownWorkTypeWithoutHash);
    expect(() =>
      validateNativeAxwiseDecisionContracts(nativeDecisionContracts(unknownWorkType))
    ).toThrow(/Invalid native AxWise ScopePacket/);
  });

  it('accepts an explicit null admission on a legacy packet without changing its hash', () => {
    const native = nativeScopePacket();
    native.admission = null;

    const handoff = validateNativeAxwiseDecisionContracts(nativeDecisionContracts(native));

    expect(handoff.scope_packet.admission).toBeNull();
    expect(handoff.scope_packet.scope_hash).toBe(native.scope_hash);
  });

  it('omits a nullable native title prefix when adapting the canonical packet', () => {
    const native = nativeScopePacket();
    native.deliverable.title_prefix = null;
    const withoutHash = { ...native };
    delete withoutHash.scope_hash;
    native.scope_hash = canonicalContractHash(withoutHash);

    const adapted = adaptNativeAxwiseScopePacket(native);

    expect(adapted.deliverable).not.toHaveProperty('title_prefix');
    expect(adapted.scope_hash).toBe(native.scope_hash);
  });

  it('rejects a populated admission missing AxWise-required work shape or success criteria', () => {
    const admission = {
      version: 'axwise_scope_admission_v1',
      work_types: [],
      geographies: [],
      channels: [],
      success_criteria: [],
      required_capabilities: [],
      requested_actions: [],
    };
    const native = nativeScopePacket({ admission });

    expect(() => validateNativeAxwiseDecisionContracts(nativeDecisionContracts(native))).toThrow(
      /Invalid native AxWise ScopePacket/
    );
    expect(NativeAxwiseAdmissionSchema.safeParse(admission).success).toBe(false);
    expect(
      NativeAxwiseAdmissionSchema.safeParse({
        ...admission,
        work_types: ['mixed_custom'],
        success_criteria: ['The requested outcome is reviewable'],
      }).success
    ).toBe(true);
  });

  it('does not discard a malformed native packet by falling back to owner-confirmed prose', () => {
    const native = nativeScopePacket();
    const handoff = nativeDecisionContracts(native);
    const goal = {
      id: 'goal-1',
      description: 'fallback prose',
      data: {
        axwise_customer_intelligence: {
          scope_packet: { ...native, scope_hash: 'c'.repeat(64) },
          scope_validation: handoff.scope_validation,
          axwise_scope_confirmation: handoff.scope_confirmation,
          scope_contract_binding: handoff.scope_contract_binding,
          scope_confirmation: {
            status: 'accepted',
            source_decision_id: 'decision-1',
            source_scope_hash: HASH,
            target_customer: 'Operators',
            problem: 'A fallback problem',
            desired_outcome: 'A fallback outcome',
          },
        },
      },
    };
    expect(() => resolveScopePacket(goal, uxTask())).toThrow(/scope_hash does not match/);
  });

  it.each([
    ['missing', null],
    ['missing-version', { intent: { objective: 'corrupt native packet' } }],
    ['unsupported-version', { version: 'axwise_scope_packet_v99' }],
  ])('does not downgrade a %s native packet to owner-confirmed prose', (_label, packet) => {
    const goal = {
      id: 'goal-1',
      description: 'legacy fallback prose must not execute',
      data: {
        scope_admission: {
          state_key: 'axwise_customer_intelligence',
          native_scope: true,
        },
        axwise_customer_intelligence: {
          ...(packet ? { scope_packet: packet } : {}),
          scope_confirmation: {
            status: 'accepted',
            source_decision_id: 'decision-1',
            source_scope_hash: HASH,
            target_customer: 'Operators',
            problem: 'A fallback problem',
            desired_outcome: 'A fallback outcome',
          },
        },
      },
    };

    expect(() => resolveScopePacket(goal, uxTask())).toThrow(
      /Native AxWise scope is missing, unsupported, or incomplete/
    );
  });

  it('routes native structural overflow to full context rather than truncating it', () => {
    const packet = nativeScopePacket({
      audiences: ['Operator A', 'Operator B', 'Operator C', 'Operator D'],
    });
    const handoff = nativeDecisionContracts(packet);
    expect(() =>
      resolveScopePacket(
        {
          data: {
            axwise_customer_intelligence: {
              scope_packet: packet,
              scope_validation: handoff.scope_validation,
              axwise_scope_confirmation: handoff.scope_confirmation,
              scope_contract_binding: handoff.scope_contract_binding,
            },
          },
        },
        uxTask()
      )
    ).toThrow(/exceeds compact structural budgets/);
  });

  it('does not resolve an otherwise valid old packet while its revision is pending rebuild', () => {
    const packet = nativeScopePacket();
    const handoff = nativeDecisionContracts(packet);
    const goal = {
      data: {
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-current',
        },
        axwise_customer_intelligence: {
          scope_packet: packet,
          scope_validation: handoff.scope_validation,
          axwise_scope_confirmation: handoff.scope_confirmation,
        },
      },
    };

    expect(() => resolveScopePacket(goal, uxTask())).toThrow(
      /Native AxWise scope revision is pending rebuild/
    );
  });

  it('rejects a validation or confirmation bound to another scope hash', () => {
    const contracts = nativeDecisionContracts();
    contracts.scope_validation.scope_hash = 'd'.repeat(64);
    expect(() => validateNativeAxwiseDecisionContracts(contracts)).toThrow(
      /inconsistent scope hashes/
    );
  });

  it('matches AxWise lower-case semantic IDs for Unicode without locale expansion', () => {
    const packet = nativeScopePacket();
    const text = 'Straße workflow remains deterministic.';
    packet.ledger.requirements[0] = {
      ...packet.ledger.requirements[0],
      requirement_id: semanticId('req', { text: text.toLowerCase() }),
      text,
    };
    packet.ledger.acceptance[0].supports = [packet.ledger.requirements[0].requirement_id];
    const acceptancePayload = { ...packet.ledger.acceptance[0] };
    delete acceptancePayload.acceptance_id;
    packet.ledger.acceptance[0].acceptance_id = semanticId('acc', acceptancePayload);
    packet.ledger.facts[0].source_refs = ['z-reference', 'ä-reference'];
    packet.ledger.facts[0].source_authority_ids = ['z-authority', 'ä-authority'];
    packet.ledger.facts[0].fact_id = semanticId('fact', {
      claim: packet.ledger.facts[0].claim.toLowerCase(),
      source_refs: packet.ledger.facts[0].source_refs,
      source_authority_ids: packet.ledger.facts[0].source_authority_ids,
    });
    const withoutHash = { ...packet };
    delete withoutHash.scope_hash;
    packet.scope_hash = canonicalContractHash(withoutHash);

    expect(
      validateNativeAxwiseDecisionContracts(nativeDecisionContracts(packet)).scope_packet.scope_hash
    ).toBe(packet.scope_hash);
  });
});

describe('specialist request and packet', () => {
  it('treats the generic document generator as incidental but keeps real tools out', () => {
    const canonicalScope = scopePacket();
    const compactGoal = {
      plan: {
        phases: [
          {
            jobs: [
              {
                title: 'Design conversational UX',
                deliverable_type: 'markdown',
                tool_requirements: ['tool-doc-generator'],
              },
              {
                title: 'Compile Final Production PRD',
                deliverable_type: 'markdown',
                tool_requirements: ['tool-doc-generator'],
              },
            ],
          },
        ],
      },
    };
    const task = uxTask();
    task.data.tool_requirements = ['tool-doc-generator'];

    expect(isCompactArtifactWorkflow(compactGoal, task, canonicalScope)).toBe(true);
    task.data.tool_requirements = ['web-search'];
    expect(isCompactArtifactWorkflow(compactGoal, task, canonicalScope)).toBe(false);
  });

  it('keeps routed non-PRD playbooks on the general artifact executor', () => {
    const canonicalScope = scopePacket();
    const task = uxTask();
    const campaignGoal = {
      data: { work_shape_route: { playbook_id: 'campaign' } },
      plan: {
        phases: [
          {
            jobs: [
              {
                title: 'Synthesize Campaign Launch Plan',
                deliverable_type: 'markdown',
                tool_requirements: [],
              },
            ],
          },
        ],
      },
    };
    const softwareGoal = {
      ...campaignGoal,
      data: { work_shape_route: { playbook_id: 'software_prd' } },
    };

    expect(isCompactArtifactWorkflow(campaignGoal, task, canonicalScope)).toBe(false);
    expect(isCompactArtifactWorkflow(softwareGoal, task, canonicalScope)).toBe(true);
  });

  it('sends only the canonical contract, relevant quality criteria, and lens kinds', () => {
    const request = buildSpecialistRequest({
      scopePacket: scopePacket(),
      qualityContract: qualityContract(),
      task: uxTask(),
    });
    const prompt = buildSpecialistPrompt(request);

    expect(request.task.lens).toBe('conversational_ux');
    expect(request.task.expected_item_kinds).toContain('state');
    expect(request.quality_contract.criteria.map((item) => item.id)).toEqual(['Q1']);
    expect(prompt).toMatch(/^<SPECIALIST_REQUEST>/);
    expect(prompt.indexOf('<SPECIALIST_PACKET_JSON_SCHEMA>')).toBeGreaterThan(
      prompt.indexOf('</SPECIALIST_REQUEST>')
    );
    expect(prompt).toContain('FINAL OUTPUT CONTRACT:');
    expect(prompt).toContain('FINAL SEMANTIC CHECK:');
    expect(prompt).not.toContain('Teammates have already delivered');
    expect(prompt).not.toContain('Previous completed work');
    expect(prompt).not.toContain('evidence_refs');
  });

  it('builds a supported exact JSON Schema bound to the specialist context', () => {
    const request = buildSpecialistRequest({
      scopePacket: scopePacket(),
      qualityContract: qualityContract(),
      task: uxTask(),
    });
    const schema = buildSpecialistPacketJsonSchema(request);

    expect(schema.properties.version.enum).toEqual(['orqaly_specialist_packet_v1']);
    expect(schema.properties.scope_hash.enum).toEqual([HASH]);
    expect(schema.properties.task_id.enum).toEqual(['task-ux']);
    expect(schema.properties.lens.enum).toEqual(['conversational_ux']);
    expect(schema.properties.items.items.properties.kind.enum).toEqual(
      SPECIALIST_ITEM_KINDS.conversational_ux
    );
    expect(schema.properties.items.items.properties.kind.enum).not.toContain('control');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.coverage.items.additionalProperties).toBe(false);
    expect(schema.properties.items.items.additionalProperties).toBe(false);
    expect(schema.properties.tests.items.properties.then.type).toBe('array');
    expect(schema.properties.handoff.required).toEqual([
      'must_include_item_ids',
      'may_omit_item_ids',
    ]);
    expect(schema.required).toEqual([
      'version',
      'scope_hash',
      'task_id',
      'lens',
      'status',
      'coverage',
      'items',
      'tests',
      'risks',
      'conflicts',
      'open_decisions',
      'handoff',
    ]);
    expect(schema.properties.open_decisions.items.required).toContain('proposal');

    const serialized = JSON.stringify(schema);
    for (const unsupportedKeyword of [
      '$schema',
      'const',
      'default',
      'minLength',
      'minItems',
      'maxItems',
    ]) {
      expect(serialized).not.toContain(`"${unsupportedKeyword}"`);
    }

    const prompt = buildSpecialistPrompt(request);
    const schemaMatch = prompt.match(
      /<SPECIALIST_PACKET_JSON_SCHEMA>(.*?)<\/SPECIALIST_PACKET_JSON_SCHEMA>/
    );
    expect(schemaMatch).not.toBeNull();
    expect(JSON.parse(schemaMatch[1])).toEqual(schema);
  });

  it('validates coverage, references, hash, task, lens, and lens-specific kinds', () => {
    const request = buildSpecialistRequest({
      scopePacket: scopePacket(),
      qualityContract: qualityContract(),
      task: uxTask(),
    });
    expect(validateSpecialistPacket(JSON.stringify(packet()), { request })).toMatchObject({
      task_id: 'task-ux',
      lens: 'conversational_ux',
    });
    expect(() =>
      validateSpecialistPacket(packet({ items: [{ ...packet().items[0], kind: 'control' }] }), {
        request,
      })
    ).toThrow(/not allowed for lens/);
    expect(() =>
      validateSpecialistPacket(
        packet({ coverage: [{ requirement_id: 'R1', item_ids: ['UX1'], test_ids: [] }] }),
        { request }
      )
    ).toThrow(/does not cover requested requirement R2/);
    expect(() =>
      validateSpecialistPacket(
        packet({
          coverage: [
            ...packet().coverage,
            { requirement_id: 'R1', item_ids: ['UX1'], test_ids: [] },
          ],
        }),
        { request }
      )
    ).toThrow(/coverage requirement IDs must be unique/);
  });

  it('derives canonical supports from coverage without an LLM repair', () => {
    const request = buildSpecialistRequest({
      scopePacket: scopePacket(),
      qualityContract: qualityContract(),
      task: uxTask(),
    });
    const specialistItemId = 'item-data-entity-model';
    const result = validateSpecialistPacket(
      packet({
        coverage: packet().coverage.map((row) => ({
          ...row,
          item_ids: [specialistItemId],
        })),
        items: [
          {
            ...packet().items[0],
            id: specialistItemId,
            supports: ['req-data-entity-model', 'R1'],
          },
        ],
        tests: [
          {
            ...packet().tests[0],
            supports: ['req-conversational-recovery'],
          },
        ],
        risks: [
          {
            id: 'risk-alias',
            statement: 'A specialist-added support alias could widen scope.',
            severity: 'medium',
            mitigation_item_ids: [specialistItemId],
            supports: ['req-data-entity-model', 'R2', 'R2'],
          },
        ],
        handoff: { must_include_item_ids: [specialistItemId], may_omit_item_ids: [] },
      }),
      { request }
    );

    expect(result.items[0].supports).toEqual(['R1', 'R2']);
    expect(result.tests[0].supports).toEqual(['R1', 'R2']);
    expect(result.risks[0].supports).toEqual(['R2']);
    expect(validateSpecialistPacket(result, { request })).toEqual(result);
  });

  it('still rejects a specialist-added requirement in authoritative coverage', () => {
    const request = buildSpecialistRequest({
      scopePacket: scopePacket(),
      qualityContract: qualityContract(),
      task: uxTask(),
    });
    expect(() =>
      validateSpecialistPacket(
        packet({
          coverage: [
            ...packet().coverage,
            { requirement_id: 'req-data-entity-model', item_ids: ['UX1'], test_ids: [] },
          ],
        }),
        { request }
      )
    ).toThrow(/Coverage references unknown requirement req-data-entity-model/);
  });
});

describe('compact final synthesis', () => {
  it('lets an explicit user first-line literal override a descriptive AxWise title hint', () => {
    const canonicalScope = scopePacket();
    canonicalScope.deliverable.title_prefix =
      'Create the ScopeConfirm production PRD as one Markdown file';
    canonicalScope.ledger.requirements[0] = {
      ...canonicalScope.ledger.requirements[0],
      authority: 'user_explicit',
      text: 'Produce exactly one Markdown file, beginning exactly “# PRD: ScopeConfirm”.',
    };
    const request = buildSynthesisRequest({
      scopePacket: canonicalScope,
      qualityContract: qualityContract(),
      peerTasks: [{ data: { specialist_packet: packet() } }],
    });

    expect(request.output_contract.first_line).toBe('# PRD: ScopeConfirm');
    expect(buildSynthesisPrompt(request)).toContain('"exact_first_line":"# PRD: ScopeConfirm"');
  });

  it('repeats the exact canonical literals after the long synthesis request', () => {
    const canonicalScope = scopePacket();
    canonicalScope.deliverable.required_sections = [
      { id: 'SEC1', topic: 'Problem' },
      { id: 'SEC2', topic: 'Acceptance tests' },
    ];
    canonicalScope.ledger.requirements = canonicalScope.ledger.requirements.map((item, index) => ({
      ...item,
      priority: index === 0 ? 'P0' : 'P1',
    }));
    const request = buildSynthesisRequest({
      scopePacket: canonicalScope,
      qualityContract: qualityContract(),
      peerTasks: [{ data: { specialist_packet: packet() } }],
    });

    const prompt = buildSynthesisPrompt(request);
    const literalMatch = prompt.match(/<FINAL_LITERAL_CONTRACT>(.*?)<\/FINAL_LITERAL_CONTRACT>/);
    expect(literalMatch).not.toBeNull();
    expect(prompt.indexOf('<FINAL_LITERAL_CONTRACT>')).toBeGreaterThan(
      prompt.indexOf('</SYNTHESIS_REQUEST>')
    );
    expect(JSON.parse(literalMatch[1])).toEqual({
      output_format: 'raw_markdown',
      required_sections_in_order: [
        { id: 'SEC1', topic: 'Problem' },
        { id: 'SEC2', topic: 'Acceptance tests' },
      ],
      canonical_requirement_ids: ['R1', 'R2'],
      p0_requirement_ids: ['R1'],
      relevant_acceptance_ids: ['AC1'],
      exact_first_line: '# PRD: ScopeConfirm',
      runtime_model: 'gemini-3.8-flash',
      runtime_date: '2026-09-03',
    });
    expect(prompt).toContain('Every canonical requirement ID');
    expect(prompt).toContain('MUST appear verbatim');
    expect(prompt).toContain('Return raw Markdown only');
    expect(prompt).toContain('first visible response as meaningful domain content');
    expect(prompt).toContain('AxWise decides as the cognitive decision plane; Orqaly executes');
    expect(prompt).toContain('Never assign credential storage, approval-token minting');
    expect(prompt).toContain('Use one canonical state vocabulary');
    expect(prompt).toContain('Mechanically recompute every displayed formula');
    expect(prompt).toContain('define the complete privacy lifecycle');
    expect(prompt).toContain('HTTP 409 Conflict with the stable code STALE_SCOPE_VERSION');
    expect(prompt).toContain('every tenant-owned table directly with row-level security');
    expect(prompt).toContain('never copied from an empty or placeholder digest');
  });

  it('builds a deterministic traceability matrix and a 95+ evidence-focused contract', () => {
    const second = packet({
      task_id: 'task-risk',
      lens: 'risk',
      coverage: [{ requirement_id: 'R2', item_ids: ['RISK1'], test_ids: [] }],
      items: [
        {
          id: 'RISK1',
          kind: 'risk_rule',
          title: 'Materiality gate',
          specification: 'Ask only when the missing choice materially changes risk.',
          attributes: [],
          supports: ['R2'],
          source_refs: ['R2'],
          certainty: 'required',
          depends_on: [],
        },
      ],
      tests: [],
      handoff: { must_include_item_ids: ['RISK1'], may_omit_item_ids: [] },
    });
    const packets = [second, packet()];
    expect(buildCoverageMatrix(packets).find((row) => row.requirement_id === 'R2')).toEqual({
      requirement_id: 'R2',
      task_ids: ['task-risk', 'task-ux'],
      item_refs: ['task-risk:RISK1', 'task-ux:UX1'],
      test_refs: ['task-ux:UXT1'],
    });

    const request = buildSynthesisRequest({
      scopePacket: scopePacket(),
      qualityContract: qualityContract(),
      peerTasks: packets.map((specialist_packet) => ({ data: { specialist_packet } })),
    });
    const prompt = buildSynthesisPrompt(request);
    expect(request.quality_target).toMatchObject({
      existing_rubric_minimum: 95,
      generation_target: 97,
      density_target_words: { minimum: 4300, maximum: 5000, hard_limit: false },
      completeness_wins_over_density: true,
    });
    expect(prompt).toContain('evidence, traceability, internal consistency');
    expect(prompt).toContain('Completeness wins');
    expect(prompt).not.toContain('Teammates have already delivered');
  });
});
