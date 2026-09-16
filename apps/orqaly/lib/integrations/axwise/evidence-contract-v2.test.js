import { describe, expect, it } from 'vitest';
import {
  AXWISE_RESEARCH_BUNDLE_V2,
  BUSINESS_EVIDENCE_PROFILE_VERSION,
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
  evidenceCalculationDerivedIds,
  evidenceCalculationHash,
  evidenceCalculationManifestHash,
  evidenceFactHash,
  evidenceFactManifestHash,
  evidenceProfileV2AdmissionEnabledForOrg,
  evidenceProfileV2Enabled,
  evidenceProfileV2EnabledForModel,
  evidenceProfileV2ExecutionEnabledForModel,
  executionRolesForEvidenceProfile,
  parseEvidenceProfileV2AdmissionOrgIds,
  parseEvidenceProfileV2EnabledModels,
  parseEvidenceProfileV2ExecutionModels,
  validateAxwiseEvidenceBundleV2,
  validateBusinessEvidenceProfile,
  validateEvidenceProfileV2Rollout,
} from './evidence-contract-v2.js';

function profile(overrides = {}) {
  return {
    version: BUSINESS_EVIDENCE_PROFILE_VERSION,
    intent: 'operational_process',
    economic_model: 'usage_based',
    market_scope_hash: 'a'.repeat(64),
    fact_requirements: [
      {
        kind: 'usage_tariff',
        minimum_verified: 2,
        applicability: 'required_when_applicable',
      },
    ],
    calculation_requirements: [
      {
        kind: 'usage_tariff_rate_difference',
        minimum_verified: 1,
        applicability: 'required_when_applicable',
      },
    ],
    required_role_slots: ['pricing_finance', 'domain_delivery'],
    ...overrides,
  };
}

const MODEL = {
  physical_product: {
    factKind: 'physical_product_offer',
    calculationKind: 'physical_offer_price_difference',
    basis: { quantity: '1', unit: 'package' },
    payload(price, name) {
      return {
        merchant: 'Example Merchant',
        merchant_domain: 'merchant.example',
        offer_id: null,
        product_name: name,
        brand: null,
        sku: null,
        pack: { quantity: '2', unit: 'kilogram' },
        price,
        basis: this.basis,
      };
    },
  },
  subscription: {
    factKind: 'subscription_plan',
    calculationKind: 'subscription_rate_difference',
    basis: { quantity: '1', unit: 'seat_month' },
    payload(price, name) {
      return {
        provider: 'Example SaaS',
        provider_domain: 'saas.example',
        plan_id: null,
        plan_name: name,
        price,
        basis: this.basis,
        included_seats: null,
        minimum_seats: null,
      };
    },
  },
  usage_based: {
    factKind: 'usage_tariff',
    calculationKind: 'usage_tariff_rate_difference',
    basis: { quantity: '1', unit: 'load' },
    payload(price, name) {
      return {
        provider: 'Example Laundry',
        provider_domain: 'laundry.example',
        tariff_id: null,
        tariff_name: name,
        service_name: 'Self-service wash',
        price,
        basis: this.basis,
        fixed_fee: null,
      };
    },
  },
  project_service: {
    factKind: 'project_service_quote',
    calculationKind: 'project_quote_rate_difference',
    basis: { quantity: '1', unit: 'square_meter' },
    payload(price, name) {
      return {
        provider: name,
        provider_domain: null,
        quote_id: name.toLowerCase().replace(/\s+/g, '-'),
        service_name: 'Roof replacement',
        scope_hash: 'd'.repeat(64),
        price,
        basis: this.basis,
        labour_included: true,
        materials_included: true,
        valid_until: null,
      };
    },
  },
};

function evidenceBundle(economicModel) {
  const spec = MODEL[economicModel];
  const evidenceProfile = createBusinessEvidenceProfile({
    version: BUSINESS_EVIDENCE_PROFILE_VERSION,
    intent: economicModel === 'subscription' ? 'software_product' : 'commercial_market_launch',
    economic_model: economicModel,
    market_scope_hash: 'a'.repeat(64),
    fact_requirements: [{ kind: spec.factKind, minimum_verified: 2, applicability: 'required' }],
    calculation_requirements: [
      { kind: spec.calculationKind, minimum_verified: 1, applicability: 'required' },
    ],
    required_role_slots: ['pricing_finance', 'domain_delivery'],
  });
  const money = (amount) => ({ amount, currency: 'EUR', tax_basis: 'net' });
  const makeFact = (id, claimId, amount, name) => {
    const fact = {
      schema_version: 'evidence_fact_v1',
      kind: spec.factKind,
      fact_id: id,
      claim_id: claimId,
      source_ids: ['source-1'],
      country_codes: ['EE'],
      observed_at: '2026-08-14T08:00:00Z',
      market_scope_hash: evidenceProfile.market_scope_hash,
      topic_seed_sha256: 'b'.repeat(64),
      comparison_scope_hash: 'c'.repeat(64),
      verification_status: 'verified_current_authoritative',
      payload: spec.payload(money(amount), name),
    };
    fact.fact_hash = evidenceFactHash(fact);
    return fact;
  };
  const facts = [
    makeFact(
      'fact-high',
      'claim-high',
      economicModel === 'subscription'
        ? '120'
        : economicModel === 'usage_based'
          ? '5'
          : economicModel === 'project_service'
            ? '80'
            : '35',
      'Higher'
    ),
    makeFact(
      'fact-low',
      'claim-low',
      economicModel === 'subscription'
        ? '90'
        : economicModel === 'usage_based'
          ? '4'
          : economicModel === 'project_service'
            ? '65'
            : '29',
      'Lower'
    ),
  ];
  const higher = facts[0].payload.price;
  const lower = facts[1].payload.price;
  const difference = String(Number(higher.amount) - Number(lower.amount));
  const calculation = {
    schema_version: 'evidence_calculation_v1',
    kind: spec.calculationKind,
    formula_version: `${spec.calculationKind}_v1`,
    input_bindings: {
      higher: { fact_id: facts[0].fact_id, claim_id: facts[0].claim_id },
      lower: { fact_id: facts[1].fact_id, claim_id: facts[1].claim_id },
    },
    target_basis: spec.basis,
    normalized_inputs: { higher, lower },
    result: money(difference),
    country_codes: ['EE'],
    comparison_scope_hash: 'c'.repeat(64),
    verification_status: 'verified_traceable_calculation',
  };
  Object.assign(calculation, evidenceCalculationDerivedIds(calculation));
  calculation.calculation_hash = evidenceCalculationHash(calculation);
  const calculations = [calculation];
  const profileHash = businessEvidenceProfileHash(evidenceProfile);
  const factManifestHash = evidenceFactManifestHash(facts);
  const calculationManifestHash = evidenceCalculationManifestHash(calculations);
  return {
    version: AXWISE_RESEARCH_BUNDLE_V2,
    evidence_profile: evidenceProfile,
    evidence_profile_hash: profileHash,
    facts,
    calculations,
    fact_manifest_hash: factManifestHash,
    calculation_manifest_hash: calculationManifestHash,
    market_sources: [{ source_id: 'source-1' }],
    market_claims: [
      { claim_id: 'claim-high', source_ids: ['source-1'] },
      { claim_id: 'claim-low', source_ids: ['source-1'] },
    ],
    quality: {
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
        profile_hash: profileHash,
        fact_manifest_hash: factManifestHash,
        calculation_manifest_hash: calculationManifestHash,
        fact_requirements: [
          {
            kind: spec.factKind,
            status: 'satisfied',
            satisfied_count: 2,
            fact_ids: facts.map((fact) => fact.fact_id),
            reason_code: null,
            validation_plan: null,
          },
        ],
        calculation_requirements: [
          {
            kind: spec.calculationKind,
            status: 'satisfied',
            satisfied_count: 1,
            calculation_ids: [calculation.calculation_id],
            reason_code: null,
            validation_plan: null,
          },
        ],
      },
    },
  };
}

describe('business evidence profile v1', () => {
  it('canonicalizes requirements and role slots and produces a stable lowercase hash', () => {
    const canonical = createBusinessEvidenceProfile(
      profile({ required_role_slots: ['domain_delivery', 'pricing_finance'] })
    );

    expect(canonical.required_role_slots).toEqual(['pricing_finance', 'domain_delivery']);
    expect(executionRolesForEvidenceProfile(canonical)).toEqual([
      'Finance Pricing Specialist',
      'Domain Delivery Specialist',
    ]);
    expect(businessEvidenceProfileHash(canonical)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('permits an empty role-slot roster, including for a non-economic profile', () => {
    const value = profile({
      economic_model: 'none',
      market_scope_hash: null,
      fact_requirements: [],
      calculation_requirements: [],
      required_role_slots: [],
    });

    expect(validateBusinessEvidenceProfile(value)).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ['unknown top-level fields', profile({ surprise: true }), 'unsupported'],
    [
      'an economic-model mismatch',
      profile({
        fact_requirements: [
          { kind: 'subscription_plan', minimum_verified: 1, applicability: 'required' },
        ],
      }),
      'incompatible',
    ],
    [
      'a zero required minimum',
      profile({
        fact_requirements: [
          { kind: 'usage_tariff', minimum_verified: 0, applicability: 'required' },
        ],
      }),
      'at least one',
    ],
    ['an uppercase SHA-256 value', profile({ market_scope_hash: 'A'.repeat(64) }), 'SHA-256'],
    [
      'duplicate role slots',
      profile({ required_role_slots: ['pricing_finance', 'pricing_finance'] }),
      'duplicated',
    ],
  ])('rejects %s', (_label, value, message) => {
    const result = validateBusinessEvidenceProfile(value);
    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.message).join(' ')).toMatch(new RegExp(message, 'i'));
  });

  it('is disabled unless the exact environment flag is truthy', () => {
    expect(evidenceProfileV2Enabled({})).toBe(false);
    expect(evidenceProfileV2Enabled({ AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'false' })).toBe(false);
    expect(evidenceProfileV2Enabled({ AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true' })).toBe(true);
  });

  it('admits only explicitly allowlisted economic models on top of the global flag', () => {
    const env = {
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: 'physical_product',
      AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product',
    };
    expect(parseEvidenceProfileV2EnabledModels(env)).toEqual({
      ok: true,
      models: ['physical_product'],
      errors: [],
    });
    expect(evidenceProfileV2EnabledForModel('physical_product', env)).toBe(true);
    expect(parseEvidenceProfileV2ExecutionModels(env)).toEqual({
      ok: true,
      models: ['physical_product'],
      errors: [],
    });
    expect(evidenceProfileV2ExecutionEnabledForModel('physical_product', env)).toBe(true);
    for (const economicModel of ['subscription', 'usage_based', 'project_service', 'none']) {
      expect(evidenceProfileV2EnabledForModel(economicModel, env)).toBe(false);
    }
  });

  it.each([
    ['', true],
    ['physical_product,unknown', false],
    ['physical_product,physical_product', false],
    ['physical_product,', false],
    ['PHYSICAL_PRODUCT', false],
  ])('fails the model rollout closed for %j', (configuredModels, valid) => {
    const env = {
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: configuredModels,
      AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: configuredModels,
    };
    expect(parseEvidenceProfileV2EnabledModels(env).ok).toBe(valid);
    expect(parseEvidenceProfileV2ExecutionModels(env).ok).toBe(valid);
    expect(evidenceProfileV2EnabledForModel('physical_product', env)).toBe(false);
    expect(evidenceProfileV2ExecutionEnabledForModel('physical_product', env)).toBe(false);
  });

  it('still requires the global flag when a model is allowlisted', () => {
    expect(
      evidenceProfileV2EnabledForModel('physical_product', {
        AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'false',
        AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: 'physical_product',
        AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product',
      })
    ).toBe(false);
    expect(
      evidenceProfileV2ExecutionEnabledForModel('physical_product', {
        AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'false',
        AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product',
      })
    ).toBe(false);
  });

  it('rejects admission-only models while allowing an execution-only drain window', () => {
    const stranded = {
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: 'physical_product',
      AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: '',
    };
    expect(validateEvidenceProfileV2Rollout(stranded)).toMatchObject({
      ok: false,
      missingExecutionModels: ['physical_product'],
    });
    expect(evidenceProfileV2EnabledForModel('physical_product', stranded)).toBe(false);

    const draining = {
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: '',
      AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product',
    };
    expect(validateEvidenceProfileV2Rollout(draining)).toMatchObject({
      ok: true,
      admissionModels: [],
      executionModels: ['physical_product'],
    });
    expect(evidenceProfileV2EnabledForModel('physical_product', draining)).toBe(false);
    expect(evidenceProfileV2ExecutionEnabledForModel('physical_product', draining)).toBe(true);
  });

  it('admits only exact resolved organization UUIDs in the backend cohort', () => {
    const canaryOrgId = '11111111-1111-4111-8111-111111111111';
    const env = {
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS: canaryOrgId,
    };
    expect(parseEvidenceProfileV2AdmissionOrgIds(env)).toEqual({
      ok: true,
      orgIds: [canaryOrgId],
      errors: [],
    });
    expect(evidenceProfileV2AdmissionEnabledForOrg(canaryOrgId, env)).toBe(true);
    expect(
      evidenceProfileV2AdmissionEnabledForOrg('22222222-2222-4222-8222-222222222222', env)
    ).toBe(false);
  });

  it.each([
    ['', true],
    ['not-a-uuid', false],
    ['11111111-1111-4111-8111-111111111111,11111111-1111-4111-8111-111111111111', false],
    ['11111111-1111-4111-8111-111111111111,', false],
    ['11111111-1111-4111-8111-11111111111A', false],
  ])('fails the admission cohort closed for %j', (configuredOrgIds, valid) => {
    const env = {
      AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
      AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS: configuredOrgIds,
    };
    expect(parseEvidenceProfileV2AdmissionOrgIds(env).ok).toBe(valid);
    expect(
      evidenceProfileV2AdmissionEnabledForOrg('11111111-1111-4111-8111-111111111111', env)
    ).toBe(false);
  });
});

describe('AxWise evidence bundle v2', () => {
  it('matches Python ordinal manifest ordering beyond single-digit IDs', () => {
    const facts = Array.from({ length: 13 }, (_, index) => ({
      fact_id: `claim-${index}:fact:1`,
      fact_hash: index.toString(16).padStart(64, '0'),
    }));
    const calculations = Array.from({ length: 13 }, (_, index) => ({
      calculation_id: `evidence-calculation-${index}:scope`,
      calculation_hash: (index + 100).toString(16).padStart(64, '0'),
    }));

    expect(evidenceFactManifestHash(facts)).toBe(
      'b767279b7ac3e28365d5deb2b85c01a99ec5089cd37ab14e4fe6a613b38b753a'
    );
    expect(evidenceCalculationManifestHash(calculations)).toBe(
      '9b11d27db233b6bfca9c1a8b9f2e021ceae39d1e6376bc0663277ca88dc51558'
    );
  });

  it.each(Object.keys(MODEL))('accepts a complete %s evidence contract', (economicModel) => {
    const value = evidenceBundle(economicModel);

    const result = validateAxwiseEvidenceBundleV2(value, {
      expectedProfile: value.evidence_profile,
      expectedProfileHash: value.evidence_profile_hash,
    });

    expect(result).toMatchObject({ ok: true, issues: [] });
  });

  it.each([
    [
      'profile hash drift',
      (value) => {
        value.evidence_profile_hash = 'f'.repeat(64);
      },
    ],
    [
      'an unknown fact field',
      (value) => {
        value.facts[0].category = 'cat food';
      },
    ],
    [
      'a missing source',
      (value) => {
        value.facts[0].source_ids = ['source-missing'];
      },
    ],
    [
      'a foreign claim binding',
      (value) => {
        value.calculations[0].input_bindings.higher.claim_id = 'claim-low';
      },
    ],
    [
      'the same fact twice',
      (value) => {
        value.calculations[0].input_bindings.lower = {
          ...value.calculations[0].input_bindings.higher,
        };
      },
    ],
    [
      'a tampered result',
      (value) => {
        value.calculations[0].result.amount = '999';
      },
    ],
    [
      'a manifest mismatch',
      (value) => {
        value.fact_manifest_hash = 'e'.repeat(64);
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const value = evidenceBundle('subscription');
    mutate(value);

    const result = validateAxwiseEvidenceBundleV2(value, {
      expectedProfile: value.evidence_profile,
      expectedProfileHash: businessEvidenceProfileHash(value.evidence_profile),
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a required requirement mislabeled not applicable', () => {
    const value = evidenceBundle('usage_based');
    const coverage = value.quality.evidence_contract.fact_requirements[0];
    coverage.status = 'not_applicable';
    coverage.satisfied_count = 0;
    coverage.fact_ids = [];
    coverage.reason_code = 'business_model_not_in_scope';

    const result = validateAxwiseEvidenceBundleV2(value);

    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.code)).toContain('required_marked_not_applicable');
  });

  it('does not let an unqualified verified_facts summary replace the authoritative ledger', () => {
    const value = evidenceBundle('subscription');
    value.quality.critical_claims.evidence_ledger = [];
    value.quality.critical_claims.verified_facts = value.facts.map((fact) => ({
      fact_id: fact.fact_id,
      claim_id: fact.claim_id,
    }));

    const result = validateAxwiseEvidenceBundleV2(value);

    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.code)).toContain('unverified_ledger_fact');
  });

  it('requires exact authoritative ledger status and source ownership for every fact', () => {
    const traced = evidenceBundle('usage_based');
    traced.quality.critical_claims.evidence_ledger[0].status = 'verified_traceable_calculation';
    expect(validateAxwiseEvidenceBundleV2(traced).issues.map((item) => item.code)).toContain(
      'unverified_ledger_fact'
    );

    const wrongSource = evidenceBundle('usage_based');
    wrongSource.quality.critical_claims.evidence_ledger[0].source_ids = ['source-other'];
    expect(validateAxwiseEvidenceBundleV2(wrongSource).issues.map((item) => item.code)).toContain(
      'unverified_ledger_fact'
    );

    for (const mutate of [
      (value) => {
        value.quality.critical_claims.evidence_ledger[0].country_codes = ['LV'];
      },
      (value) => {
        value.quality.critical_claims.evidence_ledger[0].effective_or_observation_at =
          '2026-08-13T08:00:00Z';
      },
      (value) => {
        value.quality.critical_claims.evidence_ledger[0].facts[0].topic_seed_sha256 = 'e'.repeat(
          64
        );
      },
    ]) {
      const drift = evidenceBundle('usage_based');
      mutate(drift);
      expect(validateAxwiseEvidenceBundleV2(drift).issues.map((item) => item.code)).toContain(
        'unverified_ledger_fact'
      );
    }

    const missingNestedClaim = evidenceBundle('usage_based');
    delete missingNestedClaim.quality.critical_claims.evidence_ledger[0].facts[0].claim_id;
    expect(
      validateAxwiseEvidenceBundleV2(missingNestedClaim).issues.map((item) => item.code)
    ).toContain('unverified_ledger_fact');

    const duplicateOwnership = evidenceBundle('usage_based');
    duplicateOwnership.quality.critical_claims.evidence_ledger.push(
      structuredClone(duplicateOwnership.quality.critical_claims.evidence_ledger[0])
    );
    expect(
      validateAxwiseEvidenceBundleV2(duplicateOwnership).issues.map((item) => item.code)
    ).toContain('unverified_ledger_fact');
  });

  it('uses the authoritative ledger when the optional v1 market-claim projection is empty', () => {
    const value = evidenceBundle('subscription');
    value.market_claims = [];

    expect(validateAxwiseEvidenceBundleV2(value)).toMatchObject({ ok: true, issues: [] });
  });

  it('rejects duplicate market source or optional market claim ids', () => {
    const duplicateSource = evidenceBundle('subscription');
    duplicateSource.market_sources.push(structuredClone(duplicateSource.market_sources[0]));
    expect(
      validateAxwiseEvidenceBundleV2(duplicateSource).issues.map((item) => item.code)
    ).toContain('duplicate_source_id');

    const duplicateClaim = evidenceBundle('subscription');
    duplicateClaim.market_claims.push(structuredClone(duplicateClaim.market_claims[0]));
    expect(
      validateAxwiseEvidenceBundleV2(duplicateClaim).issues.map((item) => item.code)
    ).toContain('duplicate_claim_id');
  });

  it('accepts equivalent RFC3339 UTC forms but rejects a different evidence instant', () => {
    const equivalent = evidenceBundle('usage_based');
    equivalent.quality.critical_claims.evidence_ledger[0].effective_or_observation_at =
      '2026-08-14T08:00:00+00:00';
    expect(validateAxwiseEvidenceBundleV2(equivalent)).toMatchObject({ ok: true, issues: [] });

    const different = evidenceBundle('usage_based');
    different.quality.critical_claims.evidence_ledger[0].effective_or_observation_at =
      '2026-08-14T08:00:01+00:00';
    expect(validateAxwiseEvidenceBundleV2(different).issues.map((item) => item.code)).toContain(
      'unverified_ledger_fact'
    );

    const missingTimezone = evidenceBundle('usage_based');
    missingTimezone.quality.critical_claims.evidence_ledger[0].effective_or_observation_at =
      '2026-08-14T08:00:00';
    expect(
      validateAxwiseEvidenceBundleV2(missingTimezone).issues.map((item) => item.code)
    ).toContain('unverified_ledger_fact');
  });

  it('binds the derived calculation id to canonical inputs and rejects a claim-id namespace', () => {
    const value = evidenceBundle('project_service');
    value.calculations[0].calculation_id = 'tampered-calculation-id';
    value.calculations[0].calculation_hash = evidenceCalculationHash(value.calculations[0]);
    value.calculation_manifest_hash = evidenceCalculationManifestHash(value.calculations);
    value.quality.evidence_contract.calculation_manifest_hash = value.calculation_manifest_hash;
    value.quality.evidence_contract.calculation_requirements[0].calculation_ids = [
      value.calculations[0].calculation_id,
    ];
    expect(validateAxwiseEvidenceBundleV2(value).issues.map((item) => item.code)).toContain(
      'calculation_id_mismatch'
    );

    const smuggledClaim = evidenceBundle('project_service');
    smuggledClaim.calculations[0].claim_id = 'calculation-claim-smuggled';
    smuggledClaim.calculations[0].calculation_hash = evidenceCalculationHash(
      smuggledClaim.calculations[0]
    );
    smuggledClaim.calculation_manifest_hash = evidenceCalculationManifestHash(
      smuggledClaim.calculations
    );
    smuggledClaim.quality.evidence_contract.calculation_manifest_hash =
      smuggledClaim.calculation_manifest_hash;
    expect(validateAxwiseEvidenceBundleV2(smuggledClaim).issues.map((item) => item.code)).toContain(
      'unknown_field'
    );
  });

  it('rejects null market scope for evidence-bearing models and noncanonical decimals', () => {
    const nullScope = profile({ economic_model: 'usage_based', market_scope_hash: null });
    expect(validateBusinessEvidenceProfile(nullScope).issues.map((item) => item.code)).toContain(
      'market_scope_required'
    );

    for (const mutate of [
      (value) => {
        value.facts[0].payload.price.amount = '5.00';
      },
      (value) => {
        value.facts[0].payload.basis.quantity = '1.0';
      },
    ]) {
      const value = evidenceBundle('usage_based');
      mutate(value);
      value.facts[0].fact_hash = evidenceFactHash(value.facts[0]);
      value.fact_manifest_hash = evidenceFactManifestHash(value.facts);
      value.quality.evidence_contract.fact_manifest_hash = value.fact_manifest_hash;
      expect(validateAxwiseEvidenceBundleV2(value).issues.map((item) => item.code)).toContain(
        'invalid_decimal'
      );
    }
  });

  it('does not block an otherwise passed contract for optional evidence gaps', () => {
    const value = evidenceBundle('physical_product');
    value.evidence_profile.fact_requirements[0].applicability = 'optional';
    value.evidence_profile.fact_requirements[0].minimum_verified = 0;
    value.evidence_profile_hash = businessEvidenceProfileHash(value.evidence_profile);
    value.quality.evidence_contract.profile_hash = value.evidence_profile_hash;
    value.quality.evidence_contract.fact_requirements[0] = {
      kind: 'physical_product_offer',
      status: 'insufficient_evidence',
      satisfied_count: 2,
      fact_ids: value.facts.map((fact) => fact.fact_id),
      reason_code: null,
      validation_plan: 'Collect more optional offer observations if the decision needs them.',
    };

    expect(validateAxwiseEvidenceBundleV2(value)).toMatchObject({ ok: true, issues: [] });
  });

  it('rejects project quotes with different scope or inclusion semantics', () => {
    const value = evidenceBundle('project_service');
    value.facts[1].payload.materials_included = false;
    value.facts[1].fact_hash = evidenceFactHash(value.facts[1]);
    value.fact_manifest_hash = evidenceFactManifestHash(value.facts);
    value.quality.evidence_contract.fact_manifest_hash = value.fact_manifest_hash;

    const result = validateAxwiseEvidenceBundleV2(value);

    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.code)).toContain('project_scope_mismatch');
  });
});
