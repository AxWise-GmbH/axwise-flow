import { describe, expect, it, vi } from 'vitest';
import {
  AXWISE_RESEARCH_BUNDLE_V2,
  computeResearchBundleHash,
  extractAxwiseResearchBundle,
  importGoalResearchBundle,
  hashResearchValue,
  loadGoalResearchBundle,
  normalizeAxwiseResearchBundle,
  researchBundlePointer,
} from './research-bundle.js';
import {
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
  evidenceCalculationDerivedIds,
  evidenceCalculationHash,
  evidenceCalculationManifestHash,
  evidenceFactHash,
  evidenceFactManifestHash,
  executionRolesForEvidenceProfile,
} from './evidence-contract-v2.js';
import {
  nativeDecisionContractsFixture,
  nativeResearchContractFixture,
  nativeScopeResearchAcceptanceFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';

function nativeResearchHandoff({
  intent = 'operational_process',
  roles = ['Commercial research specialist'],
  geographies = [],
  evidenceMode = 'synthetic',
  requiredOutputs = ['customer_personas', 'persona_resolution', 'research_bundle', 'research_prd'],
} = {}) {
  const contractGeographies =
    evidenceMode === 'grounded' && geographies.length === 0 ? ['EE'] : [...geographies];
  const contractRequiredOutputs =
    evidenceMode !== 'none' && roles.length > 0 && !requiredOutputs.includes('persona_resolution')
      ? [...requiredOutputs, 'persona_resolution']
      : requiredOutputs;
  const workTypes = [
    ...(intent === 'commercial_market_launch' ? ['procurement_logistics'] : []),
    ...(evidenceMode === 'grounded' ? ['research_analysis'] : []),
    'strategy_planning',
  ].sort();
  const admission = {
    version: 'axwise_scope_admission_v1',
    work_types: workTypes,
    geographies: [...contractGeographies].sort(),
    channels: [],
    success_criteria: ['The typed research contract passes Gate 1.'],
    required_capabilities: [...roles],
    requested_actions: [],
  };
  return nativeDecisionContractsFixture(
    nativeScopePacketFixture({
      admission,
      researchContract: nativeResearchContractFixture({
        documentIntent: intent,
        workTypes,
        geographies: contractGeographies,
        evidence: {
          mode: evidenceMode,
          grounding_required: evidenceMode === 'grounded',
          required_outputs: evidenceMode === 'none' ? [] : contractRequiredOutputs,
          external_sources_required: evidenceMode === 'grounded',
        },
        roles,
      }),
    })
  );
}

function attachResearchAuthority(value, handoff) {
  const baseData = value.data || {};
  const acceptance = nativeScopeResearchAcceptanceFixture(handoff, {
    goalId: value.id,
    userId: value.user_id,
    orgId: value.org_id,
  });
  return {
    ...value,
    data: {
      ...baseData,
      scope_admission: {
        version: 1,
        native_scope: true,
        status: 'accepted',
        scope_hash: handoff.scope_packet.scope_hash,
        research_acceptance: acceptance,
      },
      axwise_customer_intelligence: {
        ...(baseData.axwise_customer_intelligence || {}),
        proposal_decision_id: acceptance.proposal_decision_id,
        research_execution_inputs_hash: handoff.research_execution_inputs_hash,
        scope_packet: handoff.scope_packet,
        scope_validation: handoff.scope_validation,
        axwise_scope_confirmation: handoff.scope_confirmation,
        scope_contract_binding: handoff.scope_contract_binding,
      },
    },
  };
}

function attachBundleBinding(value, handoff) {
  const acceptance = nativeScopeResearchAcceptanceFixture(handoff);
  return {
    ...value,
    scope_contract_binding: structuredClone(handoff.scope_contract_binding),
    scope_runtime_binding: structuredClone(handoff.scope_packet.runtime),
    scope_research_acceptance: structuredClone(acceptance),
    configuration: {
      ...(value.configuration || {}),
      task_context: {
        ...(value.configuration?.task_context || {}),
        scope_contract_binding: structuredClone(handoff.scope_contract_binding),
        scope_runtime_binding: structuredClone(handoff.scope_packet.runtime),
        scope_research_acceptance: structuredClone(acceptance),
      },
    },
  };
}

const defaultHandoff = nativeResearchHandoff();
const goal = attachResearchAuthority(
  { id: 'goal-1', user_id: 'user-1', org_id: 'org-1' },
  defaultHandoff
);

function v2Fixture() {
  const evidenceProfile = createBusinessEvidenceProfile({
    version: 'business_evidence_profile_v1',
    intent: 'operational_process',
    economic_model: 'usage_based',
    market_scope_hash: 'a'.repeat(64),
    fact_requirements: [{ kind: 'usage_tariff', minimum_verified: 2, applicability: 'required' }],
    calculation_requirements: [
      {
        kind: 'usage_tariff_rate_difference',
        minimum_verified: 1,
        applicability: 'required',
      },
    ],
    required_role_slots: ['pricing_finance', 'domain_delivery'],
  });
  const makeFact = (factId, claimId, amount, provider) => {
    const fact = {
      schema_version: 'evidence_fact_v1',
      kind: 'usage_tariff',
      fact_id: factId,
      claim_id: claimId,
      source_ids: ['source-1'],
      country_codes: ['EE'],
      observed_at: '2026-08-14T08:00:00Z',
      market_scope_hash: evidenceProfile.market_scope_hash,
      topic_seed_sha256: 'b'.repeat(64),
      comparison_scope_hash: 'c'.repeat(64),
      verification_status: 'verified_current_authoritative',
      payload: {
        provider,
        provider_domain: `${provider.toLowerCase()}.example`,
        tariff_id: null,
        tariff_name: `${provider} wash`,
        service_name: 'Self-service wash',
        price: { amount, currency: 'EUR', tax_basis: 'gross' },
        basis: { quantity: '1', unit: 'load' },
        fixed_fee: null,
      },
    };
    fact.fact_hash = evidenceFactHash(fact);
    return fact;
  };
  const facts = [
    makeFact('fact-high', 'claim-high', '5', 'High'),
    makeFact('fact-low', 'claim-low', '4', 'Low'),
  ];
  const calculation = {
    schema_version: 'evidence_calculation_v1',
    kind: 'usage_tariff_rate_difference',
    formula_version: 'usage_tariff_rate_difference_v1',
    input_bindings: {
      higher: { fact_id: 'fact-high', claim_id: 'claim-high' },
      lower: { fact_id: 'fact-low', claim_id: 'claim-low' },
    },
    target_basis: { quantity: '1', unit: 'load' },
    normalized_inputs: {
      higher: { amount: '5', currency: 'EUR', tax_basis: 'gross' },
      lower: { amount: '4', currency: 'EUR', tax_basis: 'gross' },
    },
    result: { amount: '1', currency: 'EUR', tax_basis: 'gross' },
    country_codes: ['EE'],
    comparison_scope_hash: 'c'.repeat(64),
    verification_status: 'verified_traceable_calculation',
  };
  Object.assign(calculation, evidenceCalculationDerivedIds(calculation));
  calculation.calculation_hash = evidenceCalculationHash(calculation);
  const calculations = [calculation];
  const executionRoles = executionRolesForEvidenceProfile(evidenceProfile);
  const handoff = nativeResearchHandoff({
    roles: executionRoles,
    evidenceMode: 'synthetic',
    requiredOutputs: ['customer_personas', 'persona_resolution', 'research_bundle'],
  });
  const evidenceProfileHash = businessEvidenceProfileHash(evidenceProfile);
  const factManifestHash = evidenceFactManifestHash(facts);
  const calculationManifestHash = evidenceCalculationManifestHash(calculations);
  const value = attachBundleBinding(
    {
      version: AXWISE_RESEARCH_BUNDLE_V2,
      run_id: 'run-v2',
      status: 'completed',
      configuration: { research_mode: 'synthetic_only' },
      evidence_profile: evidenceProfile,
      evidence_profile_hash: evidenceProfileHash,
      facts,
      calculations,
      fact_manifest_hash: factManifestHash,
      calculation_manifest_hash: calculationManifestHash,
      market_sources: [{ source_id: 'source-1', source_type: 'official_company' }],
      market_claims: [
        { claim_id: 'claim-high', source_ids: ['source-1'] },
        { claim_id: 'claim-low', source_ids: ['source-1'] },
      ],
      customer_personas: [
        { persona_id: 'customer-1', selected: true, persona: { name: 'Laundry operator' } },
      ],
      executor_personas: [
        {
          persona_id: 'executor-pricing',
          role_slot: 'pricing_finance',
          persona: { name: 'Pricing specialist', role: 'Finance Pricing Specialist' },
        },
        {
          persona_id: 'executor-domain',
          role_slot: 'domain_delivery',
          persona: { name: 'Laundry specialist', role: 'Domain Delivery Specialist' },
        },
      ],
      persona_resolution: { customer_persona_id: 'customer-1' },
      artifacts: [],
      quality: {
        requested_execution_roles: executionRoles,
        returned_execution_roles: executionRoles,
        critical_claims: {
          topic_seed_sha256: 'b'.repeat(64),
          evidence_ledger: facts.map((fact) => ({
            claim_id: fact.claim_id,
            status: 'verified_current_authoritative',
            source_ids: [...fact.source_ids],
            country_codes: [...fact.country_codes],
            effective_or_observation_at: fact.observed_at,
            facts: [
              {
                fact_id: fact.fact_id,
                claim_id: fact.claim_id,
                topic_seed_sha256: fact.topic_seed_sha256,
              },
            ],
          })),
        },
        evidence_contract: {
          version: 'evidence_contract_quality_v1',
          status: 'passed',
          profile_hash: evidenceProfileHash,
          fact_manifest_hash: factManifestHash,
          calculation_manifest_hash: calculationManifestHash,
          fact_requirements: [
            {
              kind: 'usage_tariff',
              status: 'satisfied',
              satisfied_count: 2,
              fact_ids: ['fact-high', 'fact-low'],
              reason_code: null,
              validation_plan: null,
            },
          ],
          calculation_requirements: [
            {
              kind: 'usage_tariff_rate_difference',
              status: 'satisfied',
              satisfied_count: 1,
              calculation_ids: [calculation.calculation_id],
              reason_code: null,
              validation_plan: null,
            },
          ],
        },
      },
    },
    handoff
  );
  value.bundle_hash = computeResearchBundleHash(value);
  return {
    bundle: value,
    goal: attachResearchAuthority(
      {
        id: goal.id,
        user_id: goal.user_id,
        org_id: goal.org_id,
        data: {
          research_policy: {
            business_evidence_profile: evidenceProfile,
            business_evidence_profile_hash: evidenceProfileHash,
          },
        },
      },
      handoff
    ),
  };
}

function bundle(overrides = {}, handoff = defaultHandoff) {
  const defaultPrdContent = '# Bremen research PRD';
  const value = attachBundleBinding(
    {
      version: 'axwise_research_bundle_v1',
      bundle_id: 'bundle-1',
      run_id: 'run-1',
      configuration: { research_mode: 'grounded_deep' },
      market_scope: {
        resolved_scope: {
          countries: handoff.scope_packet.research_contract.geographies.map((country_code) => ({
            country_code,
          })),
        },
      },
      market_sources: [
        {
          source_id: 'source-1',
          source_type: 'registry',
          title: 'Bremen company registry',
          publisher: 'Bremen',
        },
      ],
      customer_personas: [
        {
          persona_id: 'customer-1',
          selected: true,
          persona: { name: 'Bremen operations buyer', stakeholder_type: 'buyer' },
        },
      ],
      executor_personas: [
        {
          persona_id: 'executor-1',
          selected: true,
          persona: { role: 'Commercial research specialist' },
        },
      ],
      persona_resolution: {
        version: 'orqaly_dual_persona_v1',
        customer_persona: { persona_id: 'customer-1' },
        ideal_agent_persona: { persona_id: 'executor-1' },
        recommended_agent: { agent_id: 'agent-1' },
      },
      research_prd: {
        status: 'ready',
        analysis_result_id: 'analysis-1',
        prd_type: handoff.scope_packet.research_contract.document_intent,
        content_hash: hashResearchValue(defaultPrdContent),
        content: defaultPrdContent,
      },
      artifacts: [{ artifact_id: 'matrix-1', artifact_type: 'risk_matrix', record_id: 'record-1' }],
      quality: {
        source_count: 1,
        requested_execution_roles: handoff.scope_packet.research_contract.executor_role_slots.map(
          (slot) => slot.role
        ),
        returned_execution_roles: handoff.scope_packet.research_contract.executor_role_slots.map(
          (slot) => slot.role
        ),
      },
      ...overrides,
    },
    handoff
  );
  value.bundle_hash = computeResearchBundleHash(value);
  return value;
}

describe('AxWise research bundle normalization', () => {
  it('extracts the canonical bundle from a completed run without dropping it', () => {
    const value = bundle();
    expect(extractAxwiseResearchBundle({ result: { data: { research_bundle: value } } })).toBe(
      value
    );
  });

  it('rejects a scope-bound bundle whose run identity differs from the durable job', () => {
    expect(() =>
      normalizeAxwiseResearchBundle(bundle(), {
        goal,
        externalRunId: 'different-provider-job',
      })
    ).toThrow(/run_id does not match the durable provider job/i);
  });

  it('verifies the canonical bundle hash and normalizes sources, personas, PRD and assignments', () => {
    const normalized = normalizeAxwiseResearchBundle(bundle(), { goal });

    expect(normalized.run).toMatchObject({
      external_run_id: 'run-1',
      bundle_version: 'axwise_research_bundle_v1',
      source_count: 1,
      persona_count: 2,
      artifact_count: 2,
      selected_persona_ids: ['customer-1'],
    });
    expect(normalized.sources[0]).toMatchObject({
      external_source_id: 'source-1',
      source_type: 'registry',
    });
    expect(normalized.personas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          external_persona_id: 'customer-1',
          persona_type: 'customer',
          stakeholder_type: 'buyer',
          selected: true,
        }),
        expect.objectContaining({
          external_persona_id: 'executor-1',
          persona_type: 'executor',
          role: 'Commercial research specialist',
          selected: false,
        }),
      ])
    );
    expect(normalized.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact_type: 'research_prd' }),
        expect.objectContaining({ artifact_type: 'risk_matrix' }),
      ])
    );
    expect(normalized.assignments).toEqual([
      expect.objectContaining({
        agent_id: 'agent-1',
        external_persona_id: 'executor-1',
        assignment_role: 'recommended_executor',
      }),
    ]);
  });

  it('keeps selected persona ids customer-only even when executor records are marked selected', () => {
    const normalized = normalizeAxwiseResearchBundle(bundle(), { goal });

    expect(normalized.run.selected_persona_ids).toEqual(['customer-1']);
    expect(normalized.run.selected_persona_ids).not.toContain('executor-1');
  });

  it('rejects an explicit executor id in AxWise selected customer persona ids', () => {
    expect(() =>
      normalizeAxwiseResearchBundle(bundle({ selected_persona_ids: ['executor-1'] }), { goal })
    ).toThrow(/must reference a customer persona/i);
  });

  it('enriches an existing PRD artifact without duplicating it and verifies its pinned hash', () => {
    const prdHash = hashResearchValue('# Bremen research PRD');
    const value = bundle({
      research_prd_hash: prdHash,
      research_prd: {
        status: 'ready',
        analysis_result_id: 'analysis-1',
        prd_type: 'commercial',
        content_hash: prdHash,
        content: '# Bremen research PRD',
      },
      artifacts: [
        {
          artifact_id: 'prd-1',
          artifact_type: 'research_prd',
          content_hash: prdHash,
        },
      ],
    });

    const normalized = normalizeAxwiseResearchBundle(value, { goal });

    expect(normalized.run.research_prd_hash).toBe(prdHash);
    expect(normalized.artifacts).toEqual([
      expect.objectContaining({
        external_artifact_id: 'prd-1',
        artifact_type: 'research_prd',
        content_hash: prdHash,
        content_text: '# Bremen research PRD',
      }),
    ]);

    const mismatched = bundle({
      research_prd_hash: 'd'.repeat(64),
      research_prd: { content_hash: prdHash, content: '# PRD' },
    });
    expect(() => normalizeAxwiseResearchBundle(mismatched, { goal })).toThrow(
      /PRD .*hash does not match/i
    );
  });

  it('rejects a tampered provider hash and a mismatched tenantless goal', () => {
    expect(() =>
      normalizeAxwiseResearchBundle({ ...bundle(), bundle_hash: 'a'.repeat(64) }, { goal })
    ).toThrow(/hash does not match/i);
    expect(() => normalizeAxwiseResearchBundle(bundle(), { goal: { id: 'goal-1' } })).toThrow(
      /owner and organization/i
    );
    expect(() =>
      normalizeAxwiseResearchBundle(bundle({ selected_persona_ids: ['missing-persona'] }), { goal })
    ).toThrow(/selected persona is missing from the bundle/i);
  });

  it('fails closed when a provider bundle has no accepted typed scope authority', () => {
    expect(() =>
      normalizeAxwiseResearchBundle(bundle(), {
        goal: { id: 'goal-1', user_id: 'user-1', org_id: 'org-1' },
      })
    ).toThrow(/scope research contract is missing/i);
  });

  it('fails closed when a bundle runtime echo differs from the approved proposal', () => {
    const changedTopRuntime = bundle();
    changedTopRuntime.scope_runtime_binding.model_resource = 'models/gemini-other';
    changedTopRuntime.bundle_hash = computeResearchBundleHash(changedTopRuntime);
    expect(() => normalizeAxwiseResearchBundle(changedTopRuntime, { goal })).toThrow(
      /scope runtime binding/i
    );

    const changedTaskRuntime = bundle();
    changedTaskRuntime.configuration.task_context.scope_runtime_binding.model_resource =
      'models/gemini-other';
    changedTaskRuntime.bundle_hash = computeResearchBundleHash(changedTaskRuntime);
    expect(() => normalizeAxwiseResearchBundle(changedTaskRuntime, { goal })).toThrow(
      /scope runtime binding/i
    );
  });

  it('fails closed when required grounded outputs or grounding evidence are missing', () => {
    const groundedHandoff = nativeResearchHandoff({
      evidenceMode: 'grounded',
      requiredOutputs: [
        'customer_personas',
        'interviews',
        'market_claims',
        'market_sources',
        'persona_resolution',
        'research_bundle',
        'research_prd',
        'synthetic_participants',
      ],
    });
    const groundedGoal = attachResearchAuthority(
      {
        ...goal,
        data: {
          ...goal.data,
          research_policy: {
            research_mode: 'grounded_deep',
            grounding_required: true,
            research_fail_closed: true,
          },
        },
      },
      groundedHandoff
    );
    expect(() =>
      normalizeAxwiseResearchBundle(
        bundle(
          {
            synthetic_participants: [{ participant_id: 'participant-1' }],
            interviews: [{ interview_id: 'interview-1', participant_id: 'participant-1' }],
          },
          groundedHandoff
        ),
        { goal: groundedGoal }
      )
    ).toThrow(/required research output is missing: market_claims/i);

    const complete = bundle(
      {
        market_claims: [],
        synthetic_participants: [{ participant_id: 'participant-1' }],
        interviews: [{ interview_id: 'interview-1', participant_id: 'participant-1' }],
        quality: { grounding_required: true, grounding_satisfied: false },
      },
      groundedHandoff
    );
    expect(() => normalizeAxwiseResearchBundle(complete, { goal: groundedGoal })).toThrow(
      /did not satisfy required grounding/i
    );

    const missingPrd = bundle(
      {
        market_claims: [],
        synthetic_participants: [{ participant_id: 'participant-1' }],
        interviews: [{ interview_id: 'interview-1', participant_id: 'participant-1' }],
        research_prd: { status: 'failed' },
        quality: { grounding_required: true, grounding_satisfied: true },
      },
      groundedHandoff
    );
    expect(() => normalizeAxwiseResearchBundle(missingPrd, { goal: groundedGoal })).toThrow(
      /required research PRD hash is missing/i
    );
  });

  it('pins multi-market imports to the requested scope and complete country cells', () => {
    const scopeHash = 'd'.repeat(64);
    const multiMarketHandoff = nativeResearchHandoff({
      geographies: ['EE', 'LV'],
      evidenceMode: 'grounded',
      requiredOutputs: ['market_sources', 'research_bundle'],
    });
    const multiMarketGoal = attachResearchAuthority(
      {
        ...goal,
        data: {
          ...goal.data,
          research_policy: {
            research_mode: 'grounded_deep',
            grounding_required: true,
            research_fail_closed: true,
            market_scope_hash: scopeHash,
            market_scope: {
              resolved_scope: {
                countries: [{ country_code: 'EE' }, { country_code: 'LV' }],
              },
            },
          },
        },
      },
      multiMarketHandoff
    );
    const complete = bundle(
      {
        market_claims: [],
        synthetic_participants: [{ participant_id: 'participant-1' }],
        interviews: [{ interview_id: 'interview-1', participant_id: 'participant-1' }],
        market_scope: {
          resolution_hash: scopeHash,
          resolved_scope: {
            countries: [{ country_code: 'EE' }, { country_code: 'LV' }],
          },
        },
        cell_coverage: [
          { country_codes: ['EE'], status: 'complete' },
          { country_codes: ['LV'], status: 'completed' },
        ],
        quality: { grounding_required: true, grounding_satisfied: true },
      },
      multiMarketHandoff
    );

    expect(normalizeAxwiseResearchBundle(complete, { goal: multiMarketGoal }).run).toMatchObject({
      bundle_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(() =>
      normalizeAxwiseResearchBundle(
        bundle(
          {
            ...complete,
            bundle_hash: undefined,
            cell_coverage: [{ country_codes: ['EE'], status: 'completed' }],
          },
          multiMarketHandoff
        ),
        { goal: multiMarketGoal }
      )
    ).toThrow(/missing completed market cells: LV/i);
    expect(() =>
      normalizeAxwiseResearchBundle(
        bundle(
          {
            ...complete,
            bundle_hash: undefined,
            market_scope: { ...complete.market_scope, resolution_hash: 'e'.repeat(64) },
          },
          multiMarketHandoff
        ),
        {
          goal: multiMarketGoal,
        }
      )
    ).toThrow(/market scope does not match/i);

    expect(() =>
      normalizeAxwiseResearchBundle(
        bundle(
          {
            ...complete,
            bundle_hash: undefined,
            market_scope: {
              ...complete.market_scope,
              resolved_scope: { countries: [{ country_code: 'EE' }] },
            },
          },
          multiMarketHandoff
        ),
        { goal: multiMarketGoal }
      )
    ).toThrow(/geography does not match.*expected EE, LV.*received EE/i);
  });

  it('accepts fail-closed Instant research without pretending web grounding occurred', () => {
    const instantGoal = {
      ...goal,
      data: {
        ...goal.data,
        research_policy: {
          research_mode: 'instant',
          grounding_required: false,
          research_fail_closed: true,
        },
      },
    };
    const instant = bundle({
      configuration: { research_mode: 'synthetic_only' },
      market_sources: [],
      market_claims: [],
      synthetic_participants: [{ participant_id: 'participant-1' }],
      interviews: [{ interview_id: 'interview-1', participant_id: 'participant-1' }],
      quality: { source_count: 0, grounding_required: false, grounding_satisfied: true },
    });

    expect(normalizeAxwiseResearchBundle(instant, { goal: instantGoal }).run).toMatchObject({
      source_count: 0,
      bundle_version: 'axwise_research_bundle_v1',
    });

    const groundedHandoff = nativeResearchHandoff({
      evidenceMode: 'grounded',
      requiredOutputs: ['market_sources', 'research_bundle'],
    });
    const groundedGoal = attachResearchAuthority(
      {
        ...instantGoal,
        data: {
          ...instantGoal.data,
          research_policy: {
            research_mode: 'grounded_fast',
            grounding_required: true,
            research_fail_closed: true,
          },
        },
      },
      groundedHandoff
    );
    const falselyGrounded = bundle(
      {
        configuration: { research_mode: 'grounded_hybrid' },
        market_sources: [],
        market_claims: [],
        synthetic_participants: [{ participant_id: 'participant-1' }],
        interviews: [{ interview_id: 'interview-1', participant_id: 'participant-1' }],
        quality: { source_count: 0, grounding_required: true, grounding_satisfied: true },
      },
      groundedHandoff
    );
    expect(() => normalizeAxwiseResearchBundle(falselyGrounded, { goal: groundedGoal })).toThrow(
      /empty: market_sources/i
    );
  });

  it('rejects inconsistent bundle quality counts', () => {
    expect(() =>
      normalizeAxwiseResearchBundle(bundle({ quality: { source_count: 99 } }), { goal })
    ).toThrow(/quality source_count does not match/i);
  });

  it('retains role-pending assignments in the raw bundle without persisting a null agent binding', () => {
    const value = bundle({
      persona_assignments: [
        {
          assignment_id: 'assignment-1',
          persona_id: 'executor-1',
          required_role: 'Commercial research specialist',
          agent_id: null,
          assignment_status: 'role_match_pending',
          requires_orqaly_authorization: true,
        },
      ],
    });

    const normalized = normalizeAxwiseResearchBundle(value, { goal });

    expect(normalized.assignments).toEqual([]);
    expect(normalized.run.raw_bundle.persona_assignments).toEqual(value.persona_assignments);
  });

  it('normalizes the production AxWise PRD object and matched required-role assignment', () => {
    const prdContent = {
      operational: { objective: 'Validate Bremen demand', milestones: ['Interview buyers'] },
      technical: { evidence_policy: 'source-linked' },
    };
    const prdHash = computeResearchBundleHash(prdContent);
    const value = bundle({
      research_prd_hash: prdHash,
      research_prd: {
        status: 'completed',
        analysis_result_id: 42,
        cached_prd_id: 17,
        prd_type: 'both',
        content_hash: prdHash,
        content: prdContent,
      },
      persona_assignments: [
        {
          assignment_id: 'assignment-1',
          persona_id: 'executor-1',
          required_role: 'Commercial research specialist',
          agent_id: 'agent-1',
          assignment_status: 'matched_candidate',
        },
        {
          assignment_id: 'assignment-2',
          persona_id: 'executor-1',
          required_role: 'Commercial research specialist',
          agent_id: null,
          assignment_status: 'role_match_pending',
        },
      ],
      quality: { source_count: 1, persona_assignment_count: 2 },
    });

    const normalized = normalizeAxwiseResearchBundle(value, { goal });

    expect(normalized.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifact_type: 'research_prd',
          content_hash: prdHash,
          content_text: JSON.stringify(prdContent, null, 2),
        }),
      ])
    );
    expect(normalized.assignments).toEqual([
      expect.objectContaining({
        agent_id: 'agent-1',
        external_persona_id: 'executor-1',
        assignment_role: 'Commercial research specialist',
      }),
    ]);
  });

  it('builds a compact stable goal pointer rather than copying the raw bundle', () => {
    const pointer = researchBundlePointer({
      id: 'db-run-1',
      external_run_id: 'run-1',
      bundle_version: 'axwise_research_bundle_v1',
      bundle_hash: 'b'.repeat(64),
      research_prd_hash: 'c'.repeat(64),
      selected_persona_ids: ['executor-1', 'customer-1', 'executor-1'],
      source_count: 3,
      persona_count: 2,
      artifact_count: 1,
      raw_bundle: { huge: true },
    });
    expect(pointer).toEqual({
      run_id: 'db-run-1',
      external_run_id: 'run-1',
      bundle_version: 'axwise_research_bundle_v1',
      bundle_hash: 'b'.repeat(64),
      research_prd_hash: 'c'.repeat(64),
      selected_persona_ids: ['customer-1', 'executor-1'],
      source_count: 3,
      persona_count: 2,
      artifact_count: 1,
      imported_at: null,
    });
    expect(pointer).not.toHaveProperty('raw_bundle');
  });
});

describe('AxWise research bundle v2 normalization', () => {
  it('never downgrades a pinned v2 goal or accepts reserved v2 fields in a v1 label', () => {
    const pinned = v2Fixture();
    expect(() => normalizeAxwiseResearchBundle(bundle(), { goal: pinned.goal })).toThrow(
      /requires an AxWise v2 bundle/i
    );

    for (const smuggled of [
      bundle({ facts: [] }),
      bundle({ evidence_profile: pinned.bundle.evidence_profile }),
      bundle({ quality: { evidence_contract: {} } }),
    ]) {
      expect(() => normalizeAxwiseResearchBundle(smuggled, { goal })).toThrow(
        /reserved v2 evidence fields/i
      );
    }
  });

  it('dual-reads a profile-pinned v2 bundle and normalizes typed evidence rows', () => {
    const fixture = v2Fixture();

    const normalized = normalizeAxwiseResearchBundle(fixture.bundle, { goal: fixture.goal });

    expect(normalized.run).toMatchObject({
      bundle_version: AXWISE_RESEARCH_BUNDLE_V2,
      evidence_profile_version: 'business_evidence_profile_v1',
      evidence_profile_hash: fixture.bundle.evidence_profile_hash,
      fact_manifest_hash: fixture.bundle.fact_manifest_hash,
      calculation_manifest_hash: fixture.bundle.calculation_manifest_hash,
      fact_count: 2,
      calculation_count: 1,
    });
    expect(normalized.facts).toEqual([
      expect.objectContaining({
        external_fact_id: 'fact-high',
        claim_id: 'claim-high',
        fact_kind: 'usage_tariff',
        source_ids: ['source-1'],
        source_hashes: [expect.stringMatching(/^[a-f0-9]{64}$/)],
      }),
      expect.objectContaining({ external_fact_id: 'fact-low' }),
    ]);
    expect(normalized.calculations).toEqual([
      expect.objectContaining({
        external_calculation_id: fixture.bundle.calculations[0].calculation_id,
        calculation_kind: 'usage_tariff_rate_difference',
        input_fact_ids: ['fact-high', 'fact-low'],
      }),
    ]);
    expect(normalized.contextGate).toMatchObject({
      version: 2,
      status: 'ready',
      required_role_slots: ['domain_delivery', 'pricing_finance'],
    });
  });

  it('keeps normalized v2 result import independent of rollout flags and cohort membership', () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'false');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', '');
    try {
      const fixture = v2Fixture();
      expect(normalizeAxwiseResearchBundle(fixture.bundle, { goal: fixture.goal })).toMatchObject({
        run: { bundle_version: AXWISE_RESEARCH_BUNDLE_V2 },
        facts: expect.any(Array),
        calculations: expect.any(Array),
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('normalizes and imports a fail-closed v2 none-model contract with zero role slots', async () => {
    const fixture = v2Fixture();
    const evidenceProfile = createBusinessEvidenceProfile({
      version: 'business_evidence_profile_v1',
      intent: 'operational_process',
      economic_model: 'none',
      market_scope_hash: null,
      fact_requirements: [],
      calculation_requirements: [],
      required_role_slots: [],
    });
    const profileHash = businessEvidenceProfileHash(evidenceProfile);
    const noRoleHandoff = nativeResearchHandoff({
      roles: [],
      evidenceMode: 'synthetic',
      requiredOutputs: ['research_bundle'],
    });
    fixture.goal = attachResearchAuthority(
      {
        ...fixture.goal,
        data: {
          ...fixture.goal.data,
          research_policy: {
            research_mode: 'instant',
            grounding_required: false,
            research_fail_closed: true,
            business_evidence_profile: evidenceProfile,
            business_evidence_profile_hash: profileHash,
          },
        },
      },
      noRoleHandoff
    );
    Object.assign(fixture.bundle, {
      evidence_profile: evidenceProfile,
      evidence_profile_hash: profileHash,
      facts: [],
      calculations: [],
      fact_manifest_hash: evidenceFactManifestHash([]),
      calculation_manifest_hash: evidenceCalculationManifestHash([]),
      executor_personas: [],
      synthetic_participants: [{ participant_id: 'participant-1' }],
      interviews: [{ interview_id: 'interview-1' }],
      research_prd: { content: 'Operational context without an executor role requirement.' },
      quality: {
        ...fixture.bundle.quality,
        requested_execution_roles: [],
        returned_execution_roles: [],
        critical_claims: { evidence_ledger: [] },
        evidence_contract: {
          version: 'evidence_contract_quality_v1',
          status: 'passed',
          profile_hash: profileHash,
          fact_manifest_hash: evidenceFactManifestHash([]),
          calculation_manifest_hash: evidenceCalculationManifestHash([]),
          fact_requirements: [],
          calculation_requirements: [],
        },
      },
    });
    Object.assign(fixture.bundle, attachBundleBinding(fixture.bundle, noRoleHandoff));
    fixture.bundle.bundle_hash = computeResearchBundleHash(fixture.bundle);

    expect(normalizeAxwiseResearchBundle(fixture.bundle, { goal: fixture.goal })).toMatchObject({
      contextGate: { version: 2, status: 'ready', required_role_slots: [] },
      run: { fact_count: 0, calculation_count: 0 },
      facts: [],
      calculations: [],
    });

    const { admin, writes } = importerAdmin();
    await expect(
      importGoalResearchBundle(admin, fixture.goal, fixture.bundle, {
        externalRunId: fixture.bundle.run_id,
      })
    ).resolves.toMatchObject({ counts: { facts: 0, calculations: 0 } });
    expect(writes.map((write) => write.table)).not.toContain('goal_research_facts');
    expect(writes.map((write) => write.table)).not.toContain('goal_research_calculations');
  });

  it('pins the compact v2 pointer to both typed manifests and counts', () => {
    const fixture = v2Fixture();
    const normalized = normalizeAxwiseResearchBundle(fixture.bundle, { goal: fixture.goal });
    const pointer = researchBundlePointer({ id: 'db-v2', ...normalized.run });

    expect(pointer).toMatchObject({
      run_id: 'db-v2',
      bundle_version: AXWISE_RESEARCH_BUNDLE_V2,
      evidence_profile_hash: fixture.bundle.evidence_profile_hash,
      fact_manifest_hash: fixture.bundle.fact_manifest_hash,
      calculation_manifest_hash: fixture.bundle.calculation_manifest_hash,
      fact_count: 2,
      calculation_count: 1,
      required_role_slots: ['domain_delivery', 'pricing_finance'],
    });
  });

  it.each([
    [
      'a goal-profile mismatch',
      (fixture) => {
        fixture.goal.data.research_policy.business_evidence_profile_hash = 'f'.repeat(64);
      },
      /profile hash/i,
    ],
    [
      'incomplete role-slot coverage',
      (fixture) => {
        fixture.bundle.executor_personas.pop();
        fixture.bundle.bundle_hash = computeResearchBundleHash(fixture.bundle);
      },
      /role_slot coverage/i,
    ],
    [
      'a tampered calculation result',
      (fixture) => {
        fixture.bundle.calculations[0].result.amount = '99';
        fixture.bundle.calculations[0].calculation_hash = evidenceCalculationHash(
          fixture.bundle.calculations[0]
        );
        fixture.bundle.calculation_manifest_hash = evidenceCalculationManifestHash(
          fixture.bundle.calculations
        );
        fixture.bundle.quality.evidence_contract.calculation_manifest_hash =
          fixture.bundle.calculation_manifest_hash;
        fixture.bundle.bundle_hash = computeResearchBundleHash(fixture.bundle);
      },
      /difference|result/i,
    ],
  ])('rejects %s', (_label, mutate, expected) => {
    const fixture = v2Fixture();
    mutate(fixture);
    expect(() => normalizeAxwiseResearchBundle(fixture.bundle, { goal: fixture.goal })).toThrow(
      expected
    );
  });
});

function importerAdmin(existingRun = null) {
  const writes = [];
  const personaIds = new Map();
  let persistedRun = null;
  const rpc = vi.fn(async (_name, params) => ({
    data: {
      ...persistedRun,
      id: params.p_run_id,
      version_status: 'current',
      imported_at: '2026-08-12T10:00:00.000Z',
    },
    error: null,
  }));

  function query(table) {
    const state = { operation: 'select', filters: [] };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((field, value) => {
        state.filters.push([field, value]);
        return builder;
      }),
      maybeSingle: vi.fn(async () => ({ data: existingRun, error: null })),
      single: vi.fn(async () => ({ data: persistedRun, error: null })),
      upsert: vi.fn((payload, options) => {
        state.operation = 'upsert';
        writes.push({ table, payload, options });
        if (table === 'goal_research_runs') {
          persistedRun = { ...payload, id: 'db-run-1' };
        }
        if (table === 'goal_research_personas') {
          for (const [index, persona] of payload.entries()) {
            personaIds.set(persona.external_persona_id, `db-persona-${index + 1}`);
          }
        }
        return builder;
      }),
      then: (resolve) => {
        if (table === 'goal_research_personas' && state.operation === 'select') {
          return resolve({
            data: [...personaIds].map(([external_persona_id, id]) => ({
              id,
              external_persona_id,
            })),
            error: null,
          });
        }
        return resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  return {
    admin: { from: vi.fn(query), rpc },
    writes,
    rpc,
  };
}

describe('importGoalResearchBundle', () => {
  it('persists a normalized bundle, resolves assignments and atomically activates it', async () => {
    const { admin, writes, rpc } = importerAdmin();

    const value = bundle();
    const result = await importGoalResearchBundle(admin, goal, value, {
      externalRunId: value.run_id,
    });

    expect(writes.map((write) => write.table)).toEqual([
      'goal_research_runs',
      'goal_research_sources',
      'goal_research_personas',
      'goal_research_artifacts',
      'goal_agent_persona_assignments',
    ]);
    expect(writes[0].options).toEqual({ onConflict: 'goal_id,bundle_hash' });
    expect(writes.at(-1).payload[0]).toMatchObject({
      agent_id: 'agent-1',
      external_persona_id: 'executor-1',
      assignment_source: 'axwise',
      persona_id: 'db-persona-2',
      user_id: 'user-1',
      org_id: 'org-1',
    });
    expect(writes.at(-1).options).toEqual({
      onConflict: 'research_run_id,agent_id,persona_id,assignment_source',
    });
    expect(rpc).toHaveBeenCalledWith('activate_goal_research_run', {
      p_run_id: 'db-run-1',
      p_user_id: 'user-1',
    });
    expect(result).toMatchObject({
      pointer: {
        run_id: 'db-run-1',
        bundle_version: 'axwise_research_bundle_v1',
        source_count: 1,
        persona_count: 2,
        artifact_count: 2,
      },
      counts: { sources: 1, personas: 2, artifacts: 2, assignments: 1 },
    });
    expect(result).not.toHaveProperty('reused');
  });

  it('reuses an already-current identical bundle without writes or another activation', async () => {
    const value = bundle();
    const existing = {
      id: 'db-run-current',
      external_run_id: value.run_id,
      bundle_version: value.version,
      bundle_hash: value.bundle_hash,
      version_status: 'current',
      selected_persona_ids: ['customer-1'],
      source_count: 1,
      persona_count: 2,
      artifact_count: 2,
    };
    const { admin, writes, rpc } = importerAdmin(existing);

    const result = await importGoalResearchBundle(admin, goal, value, {
      externalRunId: value.run_id,
    });

    expect(result.reused).toBe(true);
    expect(result.run).toBe(existing);
    expect(writes).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats provider external ids only as values and never interpolates them into filters', async () => {
    const externalSourceId = 'source-1),goal_id.neq.goal-1';
    const value = bundle({
      market_sources: [
        {
          source_id: externalSourceId,
          source_type: 'registry',
          title: 'Untrusted provider identifier',
        },
      ],
    });
    const { admin, writes } = importerAdmin();

    await importGoalResearchBundle(admin, goal, value, { externalRunId: value.run_id });

    const sourceWrite = writes.find((write) => write.table === 'goal_research_sources');
    expect(sourceWrite.payload[0].external_source_id).toBe(externalSourceId);
    expect(admin.from).not.toHaveBeenCalledWith(expect.stringContaining(externalSourceId));
  });

  it('persists v2 facts and calculations before activating the run', async () => {
    const fixture = v2Fixture();
    const { admin, writes, rpc } = importerAdmin();

    const result = await importGoalResearchBundle(admin, fixture.goal, fixture.bundle, {
      externalRunId: fixture.bundle.run_id,
    });

    expect(writes.map((write) => write.table)).toEqual([
      'goal_research_runs',
      'goal_research_sources',
      'goal_research_personas',
      'goal_research_facts',
      'goal_research_calculations',
    ]);
    expect(writes.find((write) => write.table === 'goal_research_facts')).toMatchObject({
      options: { onConflict: 'research_run_id,external_fact_id' },
      payload: [
        expect.objectContaining({
          external_fact_id: 'fact-high',
          goal_id: 'goal-1',
          user_id: 'user-1',
          org_id: 'org-1',
        }),
        expect.objectContaining({ external_fact_id: 'fact-low' }),
      ],
    });
    expect(writes.find((write) => write.table === 'goal_research_calculations')).toMatchObject({
      options: { onConflict: 'research_run_id,external_calculation_id' },
      payload: [
        expect.objectContaining({
          external_calculation_id: fixture.bundle.calculations[0].calculation_id,
        }),
      ],
    });
    expect(rpc).toHaveBeenCalledWith('activate_goal_research_run', {
      p_run_id: 'db-run-1',
      p_user_id: 'user-1',
    });
    expect(result.counts).toMatchObject({ facts: 2, calculations: 1 });
  });
});

function chainResult(data) {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe('loadGoalResearchBundle', () => {
  it('loads only the current goal+owner+organization scoped run and normalized children', async () => {
    const run = { id: 'db-run-1', raw_bundle: bundle(), version_status: 'current' };
    const tables = {
      goal_research_runs: { select: vi.fn(() => chainResult(run)) },
      goal_research_sources: {
        select: vi.fn(() => chainResult([{ id: 'source-row', source_hash: 'a'.repeat(64) }])),
      },
      goal_research_personas: {
        select: vi.fn(() =>
          chainResult([
            {
              id: 'persona-row',
              external_persona_id: 'persona-1',
              profile: { role: 'Specialist' },
              payload: { persona_id: 'persona-1' },
            },
          ])
        ),
      },
      goal_research_artifacts: {
        select: vi.fn(() =>
          chainResult([
            {
              id: 'artifact-row',
              content_text: '# PRD',
              content_hash: 'b'.repeat(64),
              payload: { artifact_type: 'research_prd' },
            },
          ])
        ),
      },
      goal_agent_persona_assignments: { select: vi.fn(() => chainResult([])) },
    };
    const admin = { from: vi.fn((table) => tables[table]) };

    const result = await loadGoalResearchBundle(admin, goal);

    expect(result.run).toBe(run);
    expect(result.personas[0]).toMatchObject({
      persona_id: 'persona-1',
      data: { persona_id: 'persona-1' },
    });
    expect(result.artifacts[0]).toMatchObject({
      content: '# PRD',
      hash: 'b'.repeat(64),
    });
    expect(result.bundle.version).toBe('axwise_research_bundle_v1');
    const runQuery = tables.goal_research_runs.select.mock.results[0].value;
    expect(runQuery.eq).toHaveBeenCalledWith('goal_id', 'goal-1');
    expect(runQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(runQuery.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(runQuery.eq).toHaveBeenCalledWith('version_status', 'current');
  });

  it('loads typed child rows only for a v2 current run', async () => {
    const fixture = v2Fixture();
    const run = {
      id: 'db-run-v2',
      bundle_version: AXWISE_RESEARCH_BUNDLE_V2,
      raw_bundle: fixture.bundle,
      version_status: 'current',
    };
    const tableRows = {
      goal_research_runs: run,
      goal_research_sources: [],
      goal_research_personas: [],
      goal_research_artifacts: [],
      goal_agent_persona_assignments: [],
      goal_research_facts: [
        {
          id: 'fact-row',
          external_fact_id: 'fact-high',
          fact_kind: 'usage_tariff',
          payload: { provider: 'High' },
        },
      ],
      goal_research_calculations: [
        {
          id: 'calculation-row',
          external_calculation_id: fixture.bundle.calculations[0].calculation_id,
          calculation_kind: 'usage_tariff_rate_difference',
          payload: { formula_version: 'usage_tariff_rate_difference_v1' },
        },
      ],
    };
    const tables = Object.fromEntries(
      Object.entries(tableRows).map(([table, data]) => [
        table,
        { select: vi.fn(() => chainResult(data)) },
      ])
    );
    const admin = { from: vi.fn((table) => tables[table]) };

    const result = await loadGoalResearchBundle(admin, fixture.goal);

    expect(result.facts).toEqual([
      expect.objectContaining({
        fact_id: 'fact-high',
        kind: 'usage_tariff',
        data: { provider: 'High' },
      }),
    ]);
    expect(result.calculations).toEqual([
      expect.objectContaining({
        calculation_id: fixture.bundle.calculations[0].calculation_id,
        kind: 'usage_tariff_rate_difference',
      }),
    ]);
    expect(admin.from).toHaveBeenCalledWith('goal_research_facts');
    expect(admin.from).toHaveBeenCalledWith('goal_research_calculations');
  });
});
