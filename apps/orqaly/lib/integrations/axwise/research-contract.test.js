import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES,
  assessVerifiedCriticalClaimContract,
  assessResearchContextGate,
  commercialResearchPolicyContract,
  goalResearchContextGate,
  researchContextGateHash,
  verifyGoalResearchContextGate,
} from './research-contract.js';
import {
  AXWISE_RESEARCH_BUNDLE_V2,
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
  evidenceCalculationManifestHash,
  evidenceFactManifestHash,
  executionRolesForEvidenceProfile,
} from './evidence-contract-v2.js';
import { validatePlanEvidenceAuthority } from '../../goal-handlers/research-execution-contract.js';
import {
  nativeDecisionContractsFixture,
  nativeResearchContractFixture,
  nativeScopeResearchAcceptanceFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';

function nativeResearchHandoff({
  intent = 'commercial_market_launch',
  roles = COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES,
  geographies = intent === 'commercial_market_launch' ? ['EE'] : [],
  evidenceMode = 'grounded',
  requiredOutputs = [
    'customer_personas',
    'market_sources',
    'persona_resolution',
    'research_bundle',
    'research_prd',
  ],
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
  const goalId = value.id || 'goal-estonia';
  const userId = value.user_id || 'user-1';
  const orgId = value.org_id || 'org-1';
  const acceptance = nativeScopeResearchAcceptanceFixture(handoff, {
    goalId,
    userId,
    orgId,
  });
  return {
    ...value,
    id: goalId,
    user_id: userId,
    org_id: orgId,
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
  const acceptance = nativeScopeResearchAcceptanceFixture(handoff, {
    goalId: 'goal-estonia',
  });
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

function goal(overrides = {}) {
  const handoff = nativeResearchHandoff();
  const base = {
    id: 'goal-estonia',
    title: 'Launch cat food in Estonia',
    description: 'Build a source-grounded commercial market launch plan.',
    mode: 'advanced',
    data: {
      research_policy: {
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
        intent: 'commercial_market_launch',
        requested_execution_roles: [...COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES],
      },
    },
  };
  return attachResearchAuthority(
    {
      ...base,
      ...overrides,
      data: { ...base.data, ...(overrides.data || {}) },
    },
    handoff
  );
}

function commercialPrdContent() {
  return {
    prd_type: 'commercial_market_launch',
    commercial_prd: {
      market_scope: { countries: ['EE'] },
      market_and_demand_assessment: [
        { statement: 'Observed retail price signal', claim_ids: ['claim-observed'] },
      ],
      customer_segments: ['Retail category buyer'],
      buying_roles: ['Economic buyer'],
      regulatory_checklist: [{ statement: 'VAT is 24 percent', claim_ids: ['claim-statutory'] }],
      competitors: ['Evidence-backed competitor set'],
      suppliers_and_channels: ['Specialist retail'],
      pricing_and_unit_economics: {
        launch_cost: {
          statement: 'Projected launch cost',
          formula: '20 * observed_retail_price',
          input_claim_ids: ['claim-observed'],
        },
      },
      go_to_market_plan_90_days: ['Validate', 'Pilot', 'Scale'],
      risks_assumptions_and_validation: [
        {
          statement: 'Buyer conversion remains unobserved',
          evidence_class: 'synthetic_hypothesis',
          validation_plan: 'Interview qualified Estonian retail economic buyers.',
        },
      ],
    },
    metadata: {
      validation: { status: 'passed', issue_count: 0, issues: [] },
    },
  };
}

function evidenceV2GateFixture({ intent = 'operational_process' } = {}) {
  const profile = createBusinessEvidenceProfile({
    version: 'business_evidence_profile_v1',
    intent,
    economic_model: 'none',
    market_scope_hash: null,
    fact_requirements: [],
    calculation_requirements: [],
    required_role_slots: [
      'customer_market',
      'pricing_finance',
      'legal_compliance',
      'sales_distribution',
      'risk_operations',
      'domain_delivery',
    ],
  });
  const profileHash = businessEvidenceProfileHash(profile);
  const factManifestHash = evidenceFactManifestHash([]);
  const calculationManifestHash = evidenceCalculationManifestHash([]);
  const roles = executionRolesForEvidenceProfile(profile);
  const handoff = nativeResearchHandoff({
    intent,
    roles,
    geographies: [],
    evidenceMode: 'synthetic',
    requiredOutputs: ['research_bundle'],
  });
  const value = attachBundleBinding(
    {
      version: AXWISE_RESEARCH_BUNDLE_V2,
      evidence_profile: profile,
      evidence_profile_hash: profileHash,
      facts: [],
      calculations: [],
      fact_manifest_hash: factManifestHash,
      calculation_manifest_hash: calculationManifestHash,
      market_sources: [],
      market_claims: [],
      executor_personas: profile.required_role_slots.map((roleSlot, index) => ({
        persona_id: `executor-${roleSlot}`,
        role_slot: roleSlot,
        persona: { name: `${roleSlot} specialist`, role: roles[index], role_slot: roleSlot },
      })),
      persona_resolution: {
        required_execution_roles: roles,
        returned_execution_roles: roles,
      },
      quality: {
        requested_execution_roles: roles,
        returned_execution_roles: roles,
        critical_claims: { evidence_ledger: [] },
        evidence_contract: {
          version: 'evidence_contract_quality_v1',
          status: 'passed',
          profile_hash: profileHash,
          fact_manifest_hash: factManifestHash,
          calculation_manifest_hash: calculationManifestHash,
          fact_requirements: [],
          calculation_requirements: [],
        },
      },
    },
    handoff
  );
  return {
    bundle: value,
    goal: attachResearchAuthority(
      goal({
        data: {
          research_policy: {
            research_mode: 'grounded_deep',
            grounding_required: true,
            research_fail_closed: true,
            intent: profile.intent,
            business_evidence_profile: profile,
            business_evidence_profile_hash: profileHash,
          },
        },
      }),
      handoff
    ),
  };
}

function applyCommercialV2PolicyAndPersonas(fixture, verifiedCommercial = null) {
  const contract = commercialResearchPolicyContract({
    research_intent: 'commercial_market_launch',
  });
  Object.assign(fixture.goal.data.research_policy, {
    customer_role_contract: contract.customer_role_contract,
    critical_claim_policy: contract.critical_claim_policy,
  });
  if (!verifiedCommercial) return fixture;
  fixture.bundle.customer_personas = structuredClone(verifiedCommercial.customer_personas);
  fixture.bundle.selected_persona_ids = ['buyer-1'];
  fixture.bundle.persona_resolution = {
    customer_persona_id: 'buyer-1',
    customer_persona: structuredClone(verifiedCommercial.persona_resolution.customer_persona),
  };
  fixture.bundle.executor_personas = fixture.bundle.executor_personas.map((persona) => ({
    ...persona,
    evidence_refs: ['source-estonia-official', 'claim-observed', 'buyer-1'],
  }));
  return fixture;
}

function bundle(overrides = {}) {
  const roles = [...COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES];
  const prdContent = commercialPrdContent();
  const retrievedAt = new Date().toISOString();
  const claimSpecs = [
    ['claim-statutory', 'statutory_current', 'Estonia VAT is 24% effective July 2025.'],
    ['claim-statistic', 'official_statistic', 'Estonia population is 1.3 million in 2026.'],
    [
      'claim-observed',
      'observed_primary_market',
      'Retail cat food costs EUR 5 in Estonia in 2026.',
    ],
  ];
  const directDocument = `Official Estonia evidence. ${claimSpecs
    .map(([, , text]) => text)
    .join(' ')}`;
  const directDocumentHash = createHash('sha256').update(directDocument, 'utf8').digest('hex');
  const source = {
    source_id: 'source-estonia-official',
    provider: 'searxng',
    provider_source_id: 'result-estonia-official',
    provider_query_ids: ['query-estonia-commercial'],
    provider_queries: ['site:stat.ee Estonia market'],
    country_codes: ['EE'],
    url: 'https://stat.ee/market',
    retrieved_at: retrievedAt,
    source_authority: 'official_public',
    authority_verification_status: 'recognized_public_root_direct',
    authority_proof: {
      version: 'direct_authority_attestation_v1',
      proof_type: 'recognized_public_root_direct',
      source_authority: 'official_public',
      country_codes: ['EE'],
      retrieved_at: retrievedAt,
      direct: {
        final_url: 'https://stat.ee/market',
        final_host: 'stat.ee',
        content_sha256: directDocumentHash,
      },
      signature_alg: 'hmac-sha256',
      proof_signature: 'b'.repeat(64),
    },
    authority_document: {
      artifact_type: 'direct_authority_document',
      source_id: 'source-estonia-official',
      sha256: directDocumentHash,
      retrieved_at: retrievedAt,
      authority_proof_signature: 'b'.repeat(64),
    },
    citation_metadata: { result_index: 0, canonical_url: 'https://stat.ee/market' },
  };
  const sourcedClaims = claimSpecs.map(([claimId, evidenceClass, claimText]) => {
    const start = Array.from(directDocument.slice(0, directDocument.indexOf(claimText))).length;
    const claimHash = createHash('sha256').update(claimText, 'utf8').digest('hex');
    const timing =
      evidenceClass === 'statutory_current'
        ? { current: true, effective_at: '2025-07-01T00:00:00.000Z' }
        : evidenceClass === 'official_statistic'
          ? { latest_release: true, observation_end: new Date().toISOString() }
          : { observed_at: new Date().toISOString() };
    return {
      claim_id: claimId,
      subject: 'Estonia',
      predicate: 'has verified market fact',
      object: claimText,
      evidence_class: evidenceClass,
      source_ids: [source.source_id],
      country_codes: ['EE'],
      provider_response_hash: directDocumentHash,
      citation_metadata: {
        segment_start: start,
        segment_end: start + Array.from(claimText).length,
        span_target: 'direct_authority_document',
        offset_unit: 'unicode_codepoints',
        source_id: source.source_id,
      },
      provenance_artifact: {
        artifact_type: 'direct_authority_document',
        source_id: source.source_id,
        text: directDocument,
        sha256: directDocumentHash,
        authority_proof_signature: 'b'.repeat(64),
        retrieved_at: retrievedAt,
        direct_content_sha256: directDocumentHash,
        claim_binding: {
          version: 'direct_authority_claim_span_v1',
          source_id: source.source_id,
          source_url: source.url,
          authority_proof_signature: 'b'.repeat(64),
          direct_content_sha256: directDocumentHash,
          retrieved_at: retrievedAt,
          excerpt_sha256: directDocumentHash,
          document_start: 0,
          document_end: Array.from(directDocument).length,
          claim_start: start,
          claim_end: start + Array.from(claimText).length,
          claim_text_sha256: claimHash,
          signature_alg: 'hmac-sha256',
          claim_proof_signature: 'c'.repeat(64),
        },
      },
      ...timing,
    };
  });
  const marketClaims = [...sourcedClaims];
  const handoff = nativeResearchHandoff();
  return attachBundleBinding(
    {
      version: 'axwise_research_bundle_v1',
      research_prd: {
        prd_type: 'commercial_market_launch',
        intent: 'commercial_market_launch',
        content: prdContent,
        content_hash: researchContextGateHash(prdContent),
      },
      market_sources: [source],
      market_claims: marketClaims,
      customer_personas: [
        {
          persona_id: 'buyer-1',
          evidence_refs: ['source-estonia-official', 'claim-observed'],
          persona: {
            name: 'Estonian retail commercial director',
            decision_role: 'economic_buyer',
            buyer_role: true,
            selection_eligibility: 'eligible_primary',
          },
        },
      ],
      selected_persona_ids: ['buyer-1'],
      persona_resolution: {
        customer_persona_id: 'buyer-1',
        customer_persona: {
          persona_id: 'buyer-1',
          evidence_refs: ['source-estonia-official', 'claim-observed'],
          decision_role: 'economic_buyer',
          buyer_role: true,
          selection_eligibility: 'eligible_primary',
        },
        required_execution_roles: roles,
      },
      executor_personas: roles.map((role, index) => ({
        persona_id: `executor-${index + 1}`,
        required_role: role,
        evidence_refs: ['source-estonia-official', 'claim-observed', 'buyer-1'],
        persona: {
          role,
          name: role,
          mission: `Execute the ${role} workstream using the approved market evidence.`,
          capabilities: [role],
        },
      })),
      persona_assignments: roles.map((role, index) => ({
        persona_id: `executor-${index + 1}`,
        agent_id: `agent-${index + 1}`,
        assignment_role: role,
        assignment_status: 'matched_candidate',
      })),
      quality: {
        grounding_required: true,
        grounding_satisfied: true,
        critical_claims: {
          status: 'passed',
          total_count: 3,
          verified_count: 3,
          blocked_count: 0,
          conflict_count: 0,
          stale_count: 0,
          requested_claim_classes: [
            'statutory_current',
            'official_statistic',
            'observed_primary_market',
          ],
          applicable_claim_classes: [
            'statutory_current',
            'official_statistic',
            'observed_primary_market',
          ],
          not_applicable_claim_classes: [],
          mandatory_claim_classes: [
            'statutory_current',
            'official_statistic',
            'observed_primary_market',
          ],
          claims: marketClaims.map((claim) => ({
            claim_id: claim.claim_id,
            status:
              claim.evidence_class === 'traceable_calculation'
                ? 'verified_traceable_calculation'
                : 'verified_current_authoritative',
            evidence_class: claim.evidence_class,
            source_ids: claim.source_ids || [],
            country_codes: claim.country_codes,
          })),
          evidence_ledger: marketClaims.map((claim) => ({
            claim_id: claim.claim_id,
            evidence_class: claim.evidence_class,
            status:
              claim.evidence_class === 'traceable_calculation'
                ? 'verified_traceable_calculation'
                : 'verified_current_authoritative',
            country_codes: claim.country_codes,
            source_ids: claim.source_ids || [],
            sources: (claim.source_ids || []).map((sourceId) => ({
              source_id: sourceId,
              authority_proof_signature: 'b'.repeat(64),
            })),
          })),
        },
        requested_execution_roles: roles,
        returned_execution_roles: roles,
        executor_role_coverage: {
          status: 'complete',
          requested_count: 5,
          returned_count: 5,
          missing_roles: [],
          unexpected_roles: [],
          role_matches: roles.map((role) => ({
            requested_role: role,
            returned_role: role,
            covered: true,
          })),
        },
      },
      ...overrides,
    },
    handoff
  );
}

function rebindClaimsToDirectAuthorityDocument(
  value,
  sourceId = value.market_sources[0]?.source_id
) {
  const source = value.market_sources.find((item) => item.source_id === sourceId);
  const claims = value.market_claims.filter((claim) =>
    claim.source_ids?.includes(source.source_id)
  );
  const text = `Direct authority document. ${claims.map((claim) => claim.object).join(' ')}`;
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  const documentCodepoints = Array.from(text);
  source.authority_proof.direct.content_sha256 = hash;
  Object.assign(source.authority_document, {
    sha256: hash,
    retrieved_at: source.retrieved_at,
    authority_proof_signature: source.authority_proof.proof_signature,
  });
  for (const claim of claims) {
    const prefix = text.slice(0, text.indexOf(claim.object));
    const documentClaimStart = Array.from(prefix).length;
    const length = Array.from(claim.object).length;
    const excerptStart = Math.max(0, documentClaimStart - 24);
    const excerptEnd = Math.min(documentCodepoints.length, documentClaimStart + length + 24);
    const excerptText = documentCodepoints.slice(excerptStart, excerptEnd).join('');
    const excerptHash = createHash('sha256').update(excerptText, 'utf8').digest('hex');
    const start = documentClaimStart - excerptStart;
    const claimHash = createHash('sha256').update(claim.object, 'utf8').digest('hex');
    Object.assign(claim, {
      provider_response_hash: hash,
      citation_metadata: {
        segment_start: start,
        segment_end: start + length,
        offset_unit: 'unicode_codepoints',
        span_target: 'direct_authority_document',
        source_id: source.source_id,
      },
      provenance_artifact: {
        artifact_type: 'direct_authority_document',
        source_id: source.source_id,
        text: excerptText,
        sha256: excerptHash,
        authority_proof_signature: source.authority_proof.proof_signature,
        retrieved_at: source.retrieved_at,
        direct_content_sha256: hash,
        claim_binding: {
          version: 'direct_authority_claim_span_v1',
          source_id: source.source_id,
          source_url: source.url,
          authority_proof_signature: source.authority_proof.proof_signature,
          direct_content_sha256: hash,
          retrieved_at: source.retrieved_at,
          excerpt_sha256: excerptHash,
          document_start: excerptStart,
          document_end: excerptEnd,
          claim_start: start,
          claim_end: start + length,
          claim_text_sha256: claimHash,
          signature_alg: 'hmac-sha256',
          claim_proof_signature: 'c'.repeat(64),
        },
      },
    });
  }
}

function moveObservedClaimToFirstPartyCatalog(value) {
  const original = value.market_sources[0];
  const catalog = structuredClone(original);
  catalog.source_id = 'source-estonia-catalog';
  catalog.provider_source_id = 'result-estonia-catalog';
  catalog.url = 'https://shop.example.ee/cat-food';
  catalog.publisher = 'shop.example.ee';
  catalog.source_authority = 'first_party_catalog';
  catalog.authority_verification_status = 'direct_primary_market_observation';
  catalog.authority_proof.source_authority = 'first_party_catalog';
  catalog.authority_proof.proof_type = 'direct_primary_market_observation';
  catalog.authority_proof.direct.final_url = catalog.url;
  catalog.authority_proof.direct.final_host = 'shop.example.ee';
  catalog.authority_document.source_id = catalog.source_id;
  delete catalog.citation_metadata;
  value.market_sources.push(catalog);

  const observed = value.market_claims.find(
    (claim) => claim.evidence_class === 'observed_primary_market'
  );
  observed.source_ids = [catalog.source_id];
  const summary = value.quality.critical_claims.claims.find(
    (claim) => claim.claim_id === observed.claim_id
  );
  summary.source_ids = [catalog.source_id];
  const ledger = value.quality.critical_claims.evidence_ledger.find(
    (claim) => claim.claim_id === observed.claim_id
  );
  ledger.source_ids = [catalog.source_id];
  ledger.sources = [
    {
      source_id: catalog.source_id,
      authority_proof_signature: catalog.authority_proof.proof_signature,
    },
  ];
  rebindClaimsToDirectAuthorityDocument(value, original.source_id);
  rebindClaimsToDirectAuthorityDocument(value, catalog.source_id);
  return value;
}

describe('AxWise typed business-evidence Gate 1 contract', () => {
  it('accepts a revalidated noncommercial six-slot v2 contract without buyer assumptions', () => {
    const fixture = evidenceV2GateFixture();

    expect(assessResearchContextGate(fixture.bundle, fixture.goal)).toMatchObject({
      version: 2,
      status: 'ready',
      intent: 'operational_process',
      economic_model: 'none',
      required_role_slots: expect.arrayContaining([
        'customer_market',
        'pricing_finance',
        'legal_compliance',
        'sales_distribution',
        'risk_operations',
        'domain_delivery',
      ]),
      executor_role_slots: { expected: expect.any(Array), returned: expect.any(Array) },
      executor_roles: { expected: expect.any(Array), returned: expect.any(Array) },
      issues: [],
    });
  });

  it('keeps imported v2 Gate 1 evaluation independent of rollout flags and cohort membership', () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'false');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', '');
    try {
      const fixture = evidenceV2GateFixture();
      expect(assessResearchContextGate(fixture.bundle, fixture.goal)).toMatchObject({
        version: 2,
        status: 'ready',
        issues: [],
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('fails v2 Gate 1 when an additive commercial critical-claim contract is unproved', () => {
    const fixture = applyCommercialV2PolicyAndPersonas(
      evidenceV2GateFixture({ intent: 'commercial_market_launch' })
    );

    expect(assessResearchContextGate(fixture.bundle, fixture.goal)).toMatchObject({
      version: 2,
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'critical_claim_validation_blocked' }),
        expect.objectContaining({ code: 'critical_claim_provenance_incomplete' }),
      ]),
    });
  });

  it('admits v2 commercial claims only after exact current ledger provenance revalidates', () => {
    const fixture = evidenceV2GateFixture({ intent: 'commercial_market_launch' });
    const verifiedCommercial = bundle();
    const criticalClaimPolicy = commercialResearchPolicyContract({
      research_intent: 'commercial_market_launch',
    }).critical_claim_policy;
    applyCommercialV2PolicyAndPersonas(fixture, verifiedCommercial);
    fixture.bundle.market_sources = verifiedCommercial.market_sources;
    fixture.bundle.market_claims = verifiedCommercial.market_claims;
    fixture.bundle.quality.critical_claims = verifiedCommercial.quality.critical_claims;

    const assessment = assessVerifiedCriticalClaimContract(fixture.bundle, criticalClaimPolicy);
    expect(assessment).toMatchObject({
      ok: true,
      issues: [],
      claims: expect.arrayContaining([
        expect.objectContaining({
          evidence_class: 'statutory_current',
          claim_text: 'Estonia VAT is 24% effective July 2025.',
          authoritative_for_factual_claims: true,
          claim_text_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    });
    expect(JSON.stringify(assessment.claims)).not.toContain('claim_proof_signature');
    expect(JSON.stringify(assessment.claims)).not.toContain('authority_proof_signature');
    expect(assessResearchContextGate(fixture.bundle, fixture.goal)).toMatchObject({
      version: 2,
      status: 'ready',
      issues: [],
    });

    const research = {
      run: { bundle_version: AXWISE_RESEARCH_BUNDLE_V2 },
      bundle: fixture.bundle,
      facts: [],
      calculations: [],
    };
    expect(
      validatePlanEvidenceAuthority(
        { strategy: 'Use the verified current Estonian VAT rate of 24%.' },
        fixture.goal,
        research
      )
    ).toEqual({ ok: true, violations: [] });
    expect(
      validatePlanEvidenceAuthority(
        { strategy: 'Use the verified current Estonian VAT rate of twenty-four percent.' },
        fixture.goal,
        research
      )
    ).toEqual({ ok: true, violations: [] });
    expect(
      validatePlanEvidenceAuthority(
        { strategy: 'Use the verified current Estonian VAT rate of ２４％.' },
        fixture.goal,
        research
      )
    ).toEqual({ ok: true, violations: [] });
    expect(
      validatePlanEvidenceAuthority(
        { strategy: 'Use the verified current Estonian VAT rate of 22%.' },
        fixture.goal,
        research
      )
    ).toMatchObject({
      ok: false,
      violations: [
        expect.objectContaining({
          code: 'unbound_consequential_claim',
          required_evidence_classes: ['statutory_current'],
          unbound_values: ['22%'],
        }),
      ],
    });
    expect(
      validatePlanEvidenceAuthority(
        { strategy: 'Use the Estonian VAT rate of twenty-two percent.' },
        fixture.goal,
        research
      ).ok
    ).toBe(false);
    expect(
      validatePlanEvidenceAuthority(
        { strategy: 'The Estonian VAT rate changes in 2026.' },
        fixture.goal,
        research
      ).ok
    ).toBe(false);
  });

  it('rejects a producer-narrowed v2 mandatory set despite a locally passed summary', () => {
    const fixture = evidenceV2GateFixture({ intent: 'commercial_market_launch' });
    const verifiedCommercial = bundle();
    const criticalClaimPolicy = commercialResearchPolicyContract({
      research_intent: 'commercial_market_launch',
    }).critical_claim_policy;
    const observed = verifiedCommercial.market_claims.find(
      (claim) => claim.evidence_class === 'observed_primary_market'
    );
    const critical = verifiedCommercial.quality.critical_claims;
    fixture.goal.data.research_policy.critical_claim_policy = criticalClaimPolicy;
    fixture.bundle.market_sources = verifiedCommercial.market_sources;
    fixture.bundle.market_claims = [observed];
    fixture.bundle.quality.critical_claims = {
      ...critical,
      total_count: 1,
      verified_count: 1,
      requested_claim_classes: ['observed_primary_market'],
      applicable_claim_classes: ['observed_primary_market'],
      mandatory_claim_classes: ['observed_primary_market'],
      claims: critical.claims.filter((claim) => claim.evidence_class === 'observed_primary_market'),
      evidence_ledger: critical.evidence_ledger.filter(
        (claim) => claim.evidence_class === 'observed_primary_market'
      ),
    };

    expect(assessVerifiedCriticalClaimContract(fixture.bundle, criticalClaimPolicy)).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'critical_claim_provenance_incomplete',
          details: expect.arrayContaining([
            expect.objectContaining({ reason: 'critical_claim_applicability_accounting_invalid' }),
            expect.objectContaining({
              evidence_class: 'statutory_current',
              reason: 'mandatory_claim_class_missing',
            }),
            expect.objectContaining({
              evidence_class: 'official_statistic',
              reason: 'mandatory_claim_class_missing',
            }),
          ]),
        }),
      ],
    });
    expect(assessResearchContextGate(fixture.bundle, fixture.goal).status).toBe('blocked');
  });

  it('blocks profile, manifest, or exact role-slot drift through the v2 gate', () => {
    const manifestDrift = evidenceV2GateFixture();
    manifestDrift.bundle.fact_manifest_hash = 'f'.repeat(64);
    expect(
      assessResearchContextGate(manifestDrift.bundle, manifestDrift.goal).issues.map(
        (item) => item.code
      )
    ).toContain('business_evidence_contract_invalid');

    const roleDrift = evidenceV2GateFixture();
    roleDrift.bundle.executor_personas[5].role_slot = 'pricing_finance';
    expect(
      assessResearchContextGate(roleDrift.bundle, roleDrift.goal).issues.map((item) => item.code)
    ).toContain('executor_role_slot_coverage_mismatch');

    const profileDrift = evidenceV2GateFixture();
    profileDrift.goal.data.research_policy.business_evidence_profile_hash = 'e'.repeat(64);
    expect(
      assessResearchContextGate(profileDrift.bundle, profileDrift.goal).issues.map(
        (item) => item.code
      )
    ).toEqual(
      expect.arrayContaining([
        'business_evidence_profile_tampered',
        'business_evidence_contract_invalid',
      ])
    );
  });

  it('enforces the persisted commercial buyer contract with dynamic v2 role slots', () => {
    const fixture = evidenceV2GateFixture({ intent: 'commercial_market_launch' });
    const verifiedCommercial = bundle();
    applyCommercialV2PolicyAndPersonas(fixture, verifiedCommercial);
    fixture.bundle.market_sources = verifiedCommercial.market_sources;
    fixture.bundle.market_claims = verifiedCommercial.market_claims;
    fixture.bundle.quality.critical_claims = verifiedCommercial.quality.critical_claims;

    expect(assessResearchContextGate(fixture.bundle, fixture.goal)).toMatchObject({
      status: 'ready',
      issues: [],
    });

    fixture.bundle.persona_resolution.customer_persona.decision_role = 'operational_user';
    fixture.bundle.customer_personas[0].persona.decision_role = 'operational_user';
    expect(
      assessResearchContextGate(fixture.bundle, fixture.goal).issues.map((item) => item.code)
    ).toContain('primary_customer_ineligible');
  });

  it('rejects duplicate or cross-class critical-ledger ownership', () => {
    const policy = commercialResearchPolicyContract({
      research_intent: 'commercial_market_launch',
    }).critical_claim_policy;
    const duplicate = bundle();
    duplicate.market_claims.push(structuredClone(duplicate.market_claims[0]));
    expect(assessVerifiedCriticalClaimContract(duplicate, policy)).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'critical_claim_provenance_incomplete',
          details: expect.arrayContaining([
            expect.objectContaining({ reason: 'critical_evidence_duplicate_ids' }),
          ]),
        }),
      ],
    });

    const relabeled = bundle();
    relabeled.quality.critical_claims.claims[0].evidence_class = 'official_statistic';
    expect(assessVerifiedCriticalClaimContract(relabeled, policy)).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          details: expect.arrayContaining([
            expect.objectContaining({ reason: 'critical_claim_ownership_mismatch' }),
          ]),
        }),
      ],
    });

    const duplicatedLedgerSource = bundle();
    duplicatedLedgerSource.quality.critical_claims.evidence_ledger[0].sources.push(
      structuredClone(duplicatedLedgerSource.quality.critical_claims.evidence_ledger[0].sources[0])
    );
    expect(assessVerifiedCriticalClaimContract(duplicatedLedgerSource, policy)).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          details: expect.arrayContaining([
            expect.objectContaining({ reason: 'critical_claim_ownership_mismatch' }),
          ]),
        }),
      ],
    });
  });

  it('accepts AxWise signed first-party catalog offers only for primary-market claims', () => {
    const policy = commercialResearchPolicyContract({
      research_intent: 'commercial_market_launch',
    }).critical_claim_policy;
    const catalog = moveObservedClaimToFirstPartyCatalog(bundle());
    expect(assessVerifiedCriticalClaimContract(catalog, policy)).toMatchObject({
      ok: true,
      issues: [],
    });

    const forbiddenForOfficialClaims = bundle();
    forbiddenForOfficialClaims.market_sources[0].source_authority = 'first_party_catalog';
    forbiddenForOfficialClaims.market_sources[0].authority_verification_status =
      'direct_primary_market_observation';
    expect(assessVerifiedCriticalClaimContract(forbiddenForOfficialClaims, policy)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'critical_claim_provenance_incomplete' })],
    });
  });
});

describe('AxWise commercial research Gate 1 contract', () => {
  it('accepts a fully verified buyer-led commercial bundle with exactly five matched roles', () => {
    expect(assessResearchContextGate(bundle(), goal())).toMatchObject({
      status: 'ready',
      intent: 'commercial_market_launch',
      selected_customer_role: 'economic_buyer',
      executor_roles: { matched: 5 },
      issues: [],
    });
  });

  it('blocks stale or unresolved critical claims, a software PRD, and a secondary-only customer', () => {
    const value = bundle();
    value.research_prd.prd_type = 'software_product';
    value.persona_resolution.customer_persona = {
      persona_id: 'buyer-1',
      decision_role: 'operational_user',
      buyer_role: false,
      selection_eligibility: 'secondary_only',
    };
    value.quality.critical_claims = {
      status: 'blocked',
      total_count: 3,
      verified_count: 2,
      blocked_count: 1,
      conflict_count: 0,
      stale_count: 1,
    };

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'research_prd_type_mismatch',
        'critical_claim_validation_blocked',
        'primary_customer_ineligible',
      ])
    );
  });

  it('fails closed when a critical-claim status summary omits negative counts', () => {
    const value = bundle();
    value.quality.critical_claims = {
      status: 'passed',
      total_count: 3,
      verified_count: 3,
    };

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'critical_claim_validation_blocked'
    );
  });

  it('fails closed when a passed critical-claim summary is not backed by an exact source span', () => {
    const value = bundle();
    value.market_sources[0].authority_document.sha256 = 'e'.repeat(64);

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'critical_claim_provenance_incomplete'
    );
  });

  it('rejects a search-result snippet even when the linked URL has a separate authority proof', () => {
    const value = bundle();
    const claim = value.market_claims[0];
    const snippet = claim.object;
    const hash = createHash('sha256').update(snippet, 'utf8').digest('hex');
    Object.assign(claim, {
      provider_response_hash: hash,
      citation_metadata: {
        segment_start: 0,
        segment_end: Array.from(snippet).length,
        offset_unit: 'unicode_codepoints',
        span_target: 'source_snippet',
      },
      provenance_artifact: {
        artifact_type: 'source_snippet',
        text: snippet,
        sha256: hash,
      },
    });

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'critical_claim_provenance_incomplete'
    );
  });

  it('fails closed when the Research PRD content does not match its supplied hash', () => {
    const value = bundle();
    value.research_prd.content.commercial_prd.competitors.push('Tampered competitor');

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'research_prd_unpinned'
    );
  });

  it('fails closed when producer PRD validation is absent or non-passed', () => {
    const value = bundle();
    delete value.research_prd.content.metadata.validation;
    value.research_prd.content_hash = researchContextGateHash(value.research_prd.content);

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'research_prd_validation_blocked'
    );
  });

  it('fails closed when commercial PRD sections are scalar placeholders', () => {
    const value = bundle();
    value.research_prd.content.commercial_prd = Object.fromEntries(
      Object.keys(value.research_prd.content.commercial_prd).map((section) => [section, false])
    );
    value.research_prd.content_hash = researchContextGateHash(value.research_prd.content);

    const issue = assessResearchContextGate(value, goal()).issues.find(
      (item) => item.code === 'research_prd_unpinned'
    );
    expect(issue?.details).toEqual(
      expect.arrayContaining([expect.stringContaining('commercial_section_empty:')])
    );
  });

  it('verifies multibyte text using the canonical direct-authority Unicode span contract', () => {
    const value = bundle();
    const claim = value.market_claims[2];
    claim.object = 'Tallinna kassitoit maksab Eestis 5 €.';
    rebindClaimsToDirectAuthorityDocument(value);

    expect(assessResearchContextGate(value, goal())).toMatchObject({ status: 'ready', issues: [] });

    claim.citation_metadata.segment_start += 1;
    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'critical_claim_provenance_incomplete'
    );
  });

  it('verifies UTF-8 byte offsets against the complete retained multipart response', () => {
    const value = bundle();
    const source = value.market_sources[0];
    source.source_authority = 'official_registry';
    source.provider = 'openregister';
    source.provider_source_id = 'EE-12345';
    source.registry = { register_number: '12345' };
    delete source.authority_proof;
    delete source.authority_verification_status;
    delete source.authority_document;
    value.quality.critical_claims.evidence_ledger.forEach((entry) => {
      entry.sources.forEach((ledgerSource) => delete ledgerSource.authority_proof_signature);
    });
    value.market_claims.forEach((claim) => {
      const text = claim.object;
      const hash = createHash('sha256').update(text, 'utf8').digest('hex');
      claim.provider_response_hash = hash;
      claim.citation_metadata = {
        segment_start: 0,
        segment_end: Array.from(text).length,
        offset_unit: 'unicode_codepoints',
        span_target: 'official_registry_record',
      };
      claim.provenance_artifact = {
        artifact_type: 'official_registry_record',
        text,
        sha256: hash,
      };
    });
    const claim = value.market_claims[2];
    claim.object = 'Hinnale lisandub käibemaks 24%.';
    const responseParts = ['Registrikirje õ.', `Tõend: ${claim.object}`];
    const partHashes = responseParts.map((text) =>
      createHash('sha256').update(text, 'utf8').digest('hex')
    );
    const responseText = responseParts.join('');
    const responseHash = createHash('sha256').update(responseText, 'utf8').digest('hex');
    claim.provider_response_hash = responseHash;
    claim.citation_metadata = {
      segment_start: Buffer.from('Tõend: ', 'utf8').length,
      segment_end: Buffer.from(`Tõend: ${claim.object}`, 'utf8').length,
      part_index: 1,
      offset_unit: 'utf8_bytes',
      span_target: 'provider_response_part',
    };
    claim.provenance_artifact = {
      artifact_type: 'provider_response_part',
      part_index: 1,
      text: responseParts[1],
      sha256: partHashes[1],
      response_part_hashes: partHashes,
      response_parts: responseParts,
      response_parts_sha256: createHash('sha256')
        .update(partHashes.join('\n'), 'ascii')
        .digest('hex'),
      provider_response_text: responseText,
      provider_response_sha256: responseHash,
    };

    expect(assessResearchContextGate(value, goal())).toMatchObject({ status: 'ready', issues: [] });

    claim.provenance_artifact.response_parts[0] = 'tampered';
    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'critical_claim_provenance_incomplete'
    );
  });

  it('verifies legacy Unicode-codepoint spans without using UTF-16 offsets', () => {
    const value = bundle();
    const claim = value.market_claims[1];
    claim.object = 'Eesti 🐈 turg on 1.3 million in 2026.';
    rebindClaimsToDirectAuthorityDocument(value);

    expect(assessResearchContextGate(value, goal())).toMatchObject({ status: 'ready', issues: [] });
  });

  it('fails closed when a cited source omits jurisdiction, retrieval, query, or authority audit', () => {
    const value = bundle();
    delete value.market_sources[0].provider_query_ids;
    delete value.market_sources[0].provider_queries;

    const issue = assessResearchContextGate(value, goal()).issues.find(
      (item) => item.code === 'critical_claim_provenance_incomplete'
    );
    expect(issue?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_id: 'source-estonia-official',
          reason: 'source_audit_incomplete',
        }),
      ])
    );
  });

  it('rejects a provider redirect and missing mandatory evidence class despite a passed summary', () => {
    const value = bundle();
    value.market_sources[0].authority_verification_status = 'provider_redirect_unverified';
    value.quality.critical_claims.mandatory_claim_classes = ['official_statistic'];
    value.quality.critical_claims.claims[1].evidence_class = 'observed_primary_market';

    const issue = assessResearchContextGate(value, goal()).issues.find(
      (item) => item.code === 'critical_claim_provenance_incomplete'
    );
    expect(issue?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidence_class: 'official_statistic',
          reason: 'mandatory_claim_class_missing',
        }),
        expect.objectContaining({ reason: 'source_audit_incomplete' }),
      ])
    );
  });

  it('uses class-specific freshness and does not force an inapplicable claim class', () => {
    const annual = bundle();
    annual.market_claims[1].observation_end = new Date(Date.now() - 500 * 86_400_000).toISOString();
    expect(assessResearchContextGate(annual, goal())).toMatchObject({ status: 'ready' });

    annual.market_claims[1].observation_end = new Date(Date.now() - 800 * 86_400_000).toISOString();
    expect(
      assessResearchContextGate(annual, goal()).issues.find(
        (item) => item.code === 'critical_claim_provenance_incomplete'
      )?.details
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: 'claim-statistic',
          reason: 'official_statistic_observation_date_stale_or_missing',
        }),
      ])
    );

    const noStatisticRequired = bundle();
    noStatisticRequired.market_claims[1].evidence_class = 'observed_primary_market';
    noStatisticRequired.market_claims[1].observed_at = new Date().toISOString();
    noStatisticRequired.quality.critical_claims.claims[1].evidence_class =
      'observed_primary_market';
    noStatisticRequired.quality.critical_claims.evidence_ledger[1].evidence_class =
      'observed_primary_market';
    noStatisticRequired.quality.critical_claims.mandatory_claim_classes = [
      'statutory_current',
      'observed_primary_market',
    ];
    noStatisticRequired.quality.critical_claims.applicable_claim_classes = [
      'statutory_current',
      'observed_primary_market',
    ];
    noStatisticRequired.quality.critical_claims.not_applicable_claim_classes = [
      {
        evidence_class: 'official_statistic',
        reason: 'no_material_claim_of_this_class_in_grounded_goal_corpus',
      },
    ];
    expect(assessResearchContextGate(noStatisticRequired, goal())).toMatchObject({
      status: 'ready',
      issues: [],
    });
  });

  it('fails closed on omitted applicability classes or an unreasoned not-applicable claim', () => {
    const omitted = bundle();
    omitted.quality.critical_claims.applicable_claim_classes = [
      'statutory_current',
      'observed_primary_market',
    ];
    omitted.quality.critical_claims.mandatory_claim_classes = [
      'statutory_current',
      'observed_primary_market',
    ];
    omitted.quality.critical_claims.not_applicable_claim_classes = [];
    expect(
      assessResearchContextGate(omitted, goal()).issues.find(
        (item) => item.code === 'critical_claim_provenance_incomplete'
      )?.details
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'critical_claim_applicability_accounting_invalid' }),
      ])
    );

    omitted.quality.critical_claims.not_applicable_claim_classes = [
      { evidence_class: 'official_statistic', reason: '' },
    ];
    expect(assessResearchContextGate(omitted, goal()).status).toBe('blocked');
  });

  it('rejects a critical source whose authority proof does not match the evidence ledger', () => {
    const value = bundle();
    value.market_sources[0].authority_proof.proof_signature = 'c'.repeat(64);

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'critical_claim_provenance_incomplete'
    );
  });

  it('accepts the bounded OpenRegister proof contract without an HMAC authority proof', () => {
    const value = bundle();
    const source = value.market_sources[0];
    source.source_authority = 'official_registry';
    source.provider = 'openregister';
    source.provider_source_id = 'EE-12345';
    source.registry = { register_number: '12345' };
    delete source.authority_proof;
    delete source.authority_verification_status;
    delete source.authority_document;
    value.market_claims.forEach((claim) => {
      const text = claim.object;
      const hash = createHash('sha256').update(text, 'utf8').digest('hex');
      claim.provider_response_hash = hash;
      claim.citation_metadata = {
        segment_start: 0,
        segment_end: Array.from(text).length,
        span_target: 'official_registry_record',
        offset_unit: 'unicode_codepoints',
      };
      claim.provenance_artifact = {
        artifact_type: 'official_registry_record',
        text,
        sha256: hash,
      };
    });
    value.quality.critical_claims.evidence_ledger.forEach((entry) => {
      entry.sources.forEach((ledgerSource) => delete ledgerSource.authority_proof_signature);
    });

    expect(assessResearchContextGate(value, goal())).toMatchObject({ status: 'ready', issues: [] });
  });

  it('fails closed when buyer_role is missing even if the decision role sounds primary', () => {
    const value = bundle();
    delete value.persona_resolution.customer_persona.buyer_role;
    delete value.customer_personas[0].persona.buyer_role;

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'primary_customer_ineligible'
    );
  });

  it('fails closed when customer or executor persona evidence references are missing', () => {
    const value = bundle();
    delete value.persona_resolution.customer_persona.evidence_refs;
    delete value.customer_personas[0].evidence_refs;
    value.executor_personas[2].evidence_refs = ['unresolved-evidence-id'];

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'persona_evidence_contract_incomplete'
    );
  });

  it('blocks extra or missing executor roles but permits pre-materialization role-pending rows', () => {
    const value = bundle();
    value.quality.returned_execution_roles = [
      ...COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES.slice(0, 4),
      'Backend Developer',
    ];
    value.quality.executor_role_coverage = {
      status: 'blocked',
      requested_count: 5,
      returned_count: 5,
      missing_roles: [COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES[4]],
      unexpected_roles: ['Backend Developer'],
    };
    value.persona_assignments[4] = {
      ...value.persona_assignments[4],
      agent_id: null,
      assignment_status: 'role_match_pending',
    };

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(['executor_role_coverage_mismatch'])
    );
    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).not.toContain(
      'executor_assignment_incompatible'
    );
  });

  it('passes Gate 1 with five exact personas and role-pending assignments in a new workspace', () => {
    const value = bundle();
    value.quality.returned_execution_roles[3] = 'Business Development & Sales Specialist';
    value.persona_assignments = value.persona_assignments.map((assignment) => ({
      ...assignment,
      agent_id: null,
      assignment_status: 'role_match_pending',
    }));

    expect(assessResearchContextGate(value, goal())).toMatchObject({
      status: 'ready',
      executor_roles: { matched: 0 },
      issues: [],
    });
  });

  it('blocks a claimed 5/5 coverage summary when the executor persona topology is incomplete', () => {
    const value = bundle();
    value.executor_personas = value.executor_personas.slice(0, 4);

    expect(assessResearchContextGate(value, goal()).issues.map((item) => item.code)).toContain(
      'executor_persona_topology_incomplete'
    );
  });

  it('fails a grounded goal closed when its compact pointer lacks the quality verdict', () => {
    const value = goal();
    const binding = value.data.axwise_customer_intelligence.scope_contract_binding;
    value.data.axwise_customer_intelligence = {
      ...value.data.axwise_customer_intelligence,
      research_bundle: {
        bundle_hash: 'a'.repeat(64),
        scope_contract_hash: binding.contract_hash,
        scope_hash: binding.scope_hash,
        scope_research_acceptance_hash: value.data.scope_admission.research_acceptance.binding_hash,
      },
    };
    expect(goalResearchContextGate(value)).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'research_quality_gate_missing' }],
    });
  });

  it('does not let mutable Auto policy weaken a grounded typed contract', () => {
    const value = goal();
    value.data.research_policy = {
      research_mode: 'auto',
      grounding_required: false,
      research_fail_closed: true,
    };
    value.data.axwise_customer_intelligence = {
      ...value.data.axwise_customer_intelligence,
      research_bundle: null,
    };

    expect(goalResearchContextGate(value)).toMatchObject({
      status: 'blocked',
      required: true,
      issues: [{ code: 'research_bundle_scope_contract_stale' }],
    });
  });

  it('rejects a tampered compact quality verdict even if it says ready', () => {
    const value = goal();
    const binding = value.data.axwise_customer_intelligence.scope_contract_binding;
    const contextGate = {
      version: 1,
      status: 'ready',
      required: true,
      intent: binding.document_intent,
      contract_hash: binding.contract_hash,
      scope_hash: binding.scope_hash,
      issues: [],
    };
    value.data.axwise_customer_intelligence = {
      ...value.data.axwise_customer_intelligence,
      research_bundle: {
        bundle_hash: 'a'.repeat(64),
        scope_contract_hash: binding.contract_hash,
        scope_hash: binding.scope_hash,
        scope_research_acceptance_hash: value.data.scope_admission.research_acceptance.binding_hash,
        context_gate: { ...contextGate, issues: [{ code: 'removed_by_tamper' }] },
        context_gate_hash: researchContextGateHash(contextGate),
      },
    };
    expect(goalResearchContextGate(value).issues[0].code).toBe('research_quality_gate_tampered');
  });

  it('recomputes Gate 1 from the immutable tenant-scoped current bundle', async () => {
    const value = goal({ user_id: 'user-1', org_id: 'org-1' });
    const rawBundle = bundle();
    const gate = assessResearchContextGate(rawBundle, value);
    const bundleHash = researchContextGateHash(rawBundle);
    const binding = value.data.axwise_customer_intelligence.scope_contract_binding;
    value.data.axwise_customer_intelligence = {
      ...value.data.axwise_customer_intelligence,
      research_bundle: {
        run_id: 'run-1',
        bundle_hash: bundleHash,
        context_gate: gate,
        context_gate_hash: researchContextGateHash(gate),
        scope_contract_hash: binding.contract_hash,
        scope_hash: binding.scope_hash,
        scope_research_acceptance_hash: value.data.scope_admission.research_acceptance.binding_hash,
      },
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: 'run-1',
          bundle_hash: bundleHash,
          version_status: 'current',
          raw_bundle: rawBundle,
        },
        error: null,
      })),
    };

    await expect(
      verifyGoalResearchContextGate({ from: vi.fn(() => query) }, value)
    ).resolves.toMatchObject({ status: 'ready' });
    expect(query.eq).toHaveBeenCalledWith('goal_id', 'goal-estonia');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(query.eq).toHaveBeenCalledWith('version_status', 'current');

    rawBundle.research_prd.content = '# tampered after import';
    await expect(
      verifyGoalResearchContextGate({ from: vi.fn(() => query) }, value)
    ).resolves.toMatchObject({
      status: 'blocked',
      issues: [{ code: 'research_bundle_not_current' }],
    });
  });
});
