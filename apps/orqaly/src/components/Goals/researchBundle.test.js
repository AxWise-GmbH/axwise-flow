import { describe, expect, it } from 'vitest';
import {
  getGoalResearchBundle,
  hasTranscriptSpan,
  isExternallyVerifiedResearchSource,
  researchConfidencePercent,
} from './researchBundle';

describe('goal research bundle normalization', () => {
  it('combines the compact goal pointer with an axwise_research_bundle_v1 response', () => {
    const goal = {
      id: 'goal-bremen',
      data: {
        axwise_customer_intelligence: {
          status: 'completed',
          research_bundle: {
            run_id: 'run-bremen',
            bundle_version: 'axwise_research_bundle_v1',
            source_count: 7,
            persona_count: 3,
            artifact_count: 2,
            selected_persona_ids: ['persona-owner'],
          },
          research_bundle_summary: {
            stages: [
              { id: 'sources', label: 'Market sources', status: 'completed', count: 7 },
              { id: 'personas', label: 'Customer personas', status: 'completed', count: 3 },
            ],
          },
        },
      },
    };
    const response = {
      run: { id: 'run-bremen', status: 'completed' },
      bundle: {
        schema_version: 'axwise_research_bundle_v1',
        configuration: {
          research_mode: 'grounded_deep',
          simulation: { performance_profile: 'quality_fast' },
        },
        synthetic_participants: [{ id: 'participant-1', name: 'Synthetic owner-manager' }],
        interviews: [{ id: 'interview-1', title: 'Owner-manager interview' }],
        quality: { confidence: 0.82, coverage: 0.75 },
        market_claims: ['Bremen SMB buyers value fixed-scope offers.'],
        patterns: ['Trust and local proof recur across interviews.'],
        contradictions: ['Price sensitivity varies by sector.'],
        limitations: ['Synthetic participants are not customer testimony.'],
      },
      sources: [
        {
          id: 'source-1',
          source_data: { title: 'Official Bremen statistics', url: 'https://example.test/source' },
        },
      ],
      personas: [
        {
          id: 'persona-owner',
          persona_type: 'customer',
          profile: {
            name: 'Bremen owner-manager',
            pain_points: ['Unclear commercial scope'],
            goals_and_motivations: ['Predictable delivery'],
          },
          payload: {
            persona_id: 'persona-owner',
            persona: { name: 'Bremen owner-manager' },
          },
        },
        {
          id: 'persona-executor',
          persona_type: 'executor',
          role: 'Commercial research lead',
          profile: {
            role: 'Commercial research lead',
            mission: 'Build a source-grounded commercial plan.',
            capabilities: ['market evidence synthesis'],
            methods: ['Trace claims to sources'],
          },
          payload: {
            persona_id: 'persona-executor',
            persona: { role: 'Commercial research lead' },
          },
        },
      ],
      artifacts: [
        {
          id: 'artifact-prd',
          artifact_type: 'research_prd',
          content: 'Research questions and acceptance criteria',
        },
      ],
      assignments: [{ id: 'assignment-1', persona_id: 'persona-executor', agent_id: 'agent-1' }],
    };

    const result = getGoalResearchBundle(goal, response);

    expect(result).toMatchObject({
      available: true,
      runId: 'run-bremen',
      bundleId: null,
      schemaVersion: 'axwise_research_bundle_v1',
      mode: 'grounded_deep',
      performanceProfile: 'quality_fast',
      completedStages: 2,
      confidence: 82,
      coverage: { percent: 75 },
      counts: {
        sources: 1,
        personas: 2,
        customerPersonas: 1,
        participants: 1,
        interviews: 1,
        executorPersonas: 1,
        artifacts: 1,
      },
      selectedPersonaIds: ['persona-owner'],
      researchPrd: 'Research questions and acceptance criteria',
    });
    expect(result.customerPersonas[0].name).toBe('Bremen owner-manager');
    expect(result.customerPersonas[0].profile.pain_points).toEqual(['Unclear commercial scope']);
    expect(result.executorPersonas[0].name).toBe('Commercial research lead');
    expect(result.executorPersonas[0].profile).toMatchObject({
      mission: 'Build a source-grounded commercial plan.',
      capabilities: ['market evidence synthesis'],
    });
    expect(result.marketSources[0].name).toBe('Official Bremen statistics');
    expect(result.assignments).toHaveLength(1);
    expect(result.marketClaims).toHaveLength(1);
    expect(result.patterns).toHaveLength(1);
  });

  it('keeps legacy or missing research data explicit instead of inventing counts', () => {
    expect(getGoalResearchBundle({ id: 'legacy', data: {} })).toMatchObject({
      available: false,
      stages: [],
      completedStages: 0,
      confidence: null,
      counts: {
        sources: 0,
        personas: 0,
        customerPersonas: 0,
        participants: 0,
        interviews: 0,
      },
    });
  });

  it('normalizes only persisted typed v2 facts and calculations into a display allowlist', () => {
    const physicalFact = (id, productName, amount, merchant) => ({
      external_fact_id: id,
      fact_kind: 'physical_product_offer',
      schema_version: 'evidence_fact_v1',
      verification_status: 'verified_current_authoritative',
      source_ids: [`source-${id}`],
      country_codes: ['EE'],
      observed_at: '2026-08-14T08:00:00Z',
      fact_hash: 'f'.repeat(64),
      payload: {
        merchant,
        merchant_domain: `${merchant.toLowerCase()}.example`,
        offer_id: `offer-${id}`,
        product_name: productName,
        brand: 'North Star',
        sku: `SKU-${id}`,
        pack: { quantity: '2', unit: 'kilogram' },
        price: { amount, currency: 'EUR', tax_basis: 'gross' },
        basis: { quantity: '1', unit: 'package' },
        signed_offer_sha256: 'a'.repeat(64),
        _physical_product_projection_authorization: 'must-not-render',
      },
    });
    const response = {
      run: {
        id: 'run-v2',
        bundle_version: 'axwise_research_bundle_v2',
        evidence_profile_version: 'business_evidence_profile_v1',
        fact_count: 2,
        calculation_count: 1,
        status: 'completed',
      },
      bundle: {
        version: 'axwise_research_bundle_v2',
        status: 'completed',
        evidence_profile: {
          version: 'business_evidence_profile_v1',
          intent: 'commercial_market_launch',
          economic_model: 'physical_product',
          evidence_profile_hash: 'must-not-render',
        },
        quality: { evidence_contract: { status: 'passed', profile_hash: 'must-not-render' } },
      },
      sources: [
        {
          external_source_id: 'source-fact-high',
          source_data: {
            title: 'High merchant offer',
            url: 'https://merchant-high.example/offer',
          },
        },
        {
          external_source_id: 'source-fact-low',
          source_data: {
            title: 'Low merchant offer',
            url: 'https://merchant-low.example/offer',
          },
        },
      ],
      facts: [
        physicalFact('fact-high', 'Atlantic C++ / $Special$ dry food', '25.4', 'MerchantHigh'),
        physicalFact('fact-low', 'Baltic dry food', '20', 'MerchantLow'),
      ],
      calculations: [
        {
          external_calculation_id: 'calculation-1',
          calculation_kind: 'physical_offer_price_difference',
          schema_version: 'evidence_calculation_v1',
          verification_status: 'verified_traceable_calculation',
          input_fact_ids: ['fact-high', 'fact-low'],
          country_codes: ['EE'],
          target_basis: { quantity: '1', unit: 'package' },
          result: { amount: '5.4', currency: 'EUR', tax_basis: 'gross' },
          calculation_hash: 'c'.repeat(64),
          payload: {
            schema_version: 'evidence_calculation_v1',
            kind: 'physical_offer_price_difference',
            calculation_id: 'calculation-1',
            input_bindings: {
              higher: { fact_id: 'fact-high', claim_id: 'claim-high' },
              lower: { fact_id: 'fact-low', claim_id: 'claim-low' },
            },
            target_basis: { quantity: '1', unit: 'package' },
            result: { amount: '5.4', currency: 'EUR', tax_basis: 'gross' },
            normalized_inputs: { secret: 'must-not-render' },
          },
        },
      ],
    };

    const result = getGoalResearchBundle(
      {
        data: {
          axwise_customer_intelligence: {
            research_bundle: { bundle_version: 'axwise_research_bundle_v2' },
          },
        },
      },
      response
    );

    expect(result).toMatchObject({
      typedEvidence: true,
      typedEvidenceDetailsLoaded: true,
      evidenceProfile: {
        version: 'business_evidence_profile_v1',
        intent: 'commercial_market_launch',
        economicModel: 'physical_product',
      },
      evidenceContract: { status: 'passed' },
      counts: { facts: 2, calculations: 1 },
    });
    expect(result.facts[0]).toMatchObject({
      id: 'fact-high',
      kind: 'physical_product_offer',
      sourceIds: ['source-fact-high'],
      payload: {
        merchant: 'MerchantHigh',
        productName: 'Atlantic C++ / $Special$ dry food',
        pack: { quantity: '2', unit: 'kilogram' },
        price: { amount: '25.4', currency: 'EUR', taxBasis: 'gross' },
      },
    });
    expect(result.facts[0].payload).not.toHaveProperty('offerId');
    expect(result.calculations[0]).toMatchObject({
      inputFactIds: { higher: 'fact-high', lower: 'fact-low' },
      result: { amount: '5.4', currency: 'EUR', taxBasis: 'gross' },
      targetBasis: { quantity: '1', unit: 'package' },
    });
    expect(JSON.stringify({ facts: result.facts, calculations: result.calculations })).not.toMatch(
      /must-not-render|sha256|hash|authorization|normalized_inputs/i
    );

    const incomplete = getGoalResearchBundle(
      {
        data: {
          axwise_customer_intelligence: {
            research_bundle: { bundle_version: 'axwise_research_bundle_v2' },
          },
        },
      },
      { ...response, facts: response.facts.slice(0, 1) }
    );
    expect(incomplete).toMatchObject({
      typedEvidenceDetailsLoaded: false,
      counts: { facts: 2 },
    });
    expect(incomplete.facts).toHaveLength(1);
  });

  it('ignores typed-looking child rows when the loaded run is not v2', () => {
    const result = getGoalResearchBundle(
      { data: {} },
      {
        run: { bundle_version: 'axwise_research_bundle_v1', fact_count: 99 },
        bundle: { version: 'axwise_research_bundle_v1' },
        facts: [
          {
            external_fact_id: 'smuggled-fact',
            fact_kind: 'physical_product_offer',
            schema_version: 'evidence_fact_v1',
            payload: { product_name: 'Must not appear' },
          },
        ],
        calculations: [],
      }
    );

    expect(result).toMatchObject({
      typedEvidence: false,
      typedEvidenceDetailsLoaded: false,
      counts: { facts: 0, calculations: 0 },
      facts: [],
      calculations: [],
    });
    expect(JSON.stringify(result)).not.toContain('Must not appear');
  });

  it('labels inferred compact-pointer categories as imported outputs, not provider stage telemetry', () => {
    const result = getGoalResearchBundle({
      data: {
        axwise_customer_intelligence: {
          research_bundle: {
            run_id: 'run-pointer',
            bundle_version: 'axwise_research_bundle_v1',
            bundle_hash: 'a'.repeat(64),
            research_prd_hash: 'b'.repeat(64),
            source_count: 5,
            persona_count: 3,
            artifact_count: 1,
          },
        },
      },
    });

    expect(result.stages.map((stage) => stage.name)).toEqual([
      'Imported market sources',
      'Imported persona records',
      'Imported Research PRD',
    ]);
    expect(result.stageLabel).toBe('Imported outputs');
    expect(result.hasProviderStageTelemetry).toBe(false);
    expect(result.completedStages).toBe(3);
    expect(result.counts).toMatchObject({ sources: 5, personas: 3, artifacts: 1 });
  });

  it('does not call an instant zero-source pointer market grounding', () => {
    const result = getGoalResearchBundle({
      data: {
        axwise_customer_intelligence: {
          research_bundle: {
            run_id: 'run-instant',
            bundle_version: 'axwise_research_bundle_v1',
            source_count: 0,
            persona_count: 2,
            artifact_count: 1,
          },
        },
      },
    });

    expect(result.stages.map((stage) => stage.name)).not.toContain('Market grounding');
    expect(result.stages.map((stage) => stage.name)).not.toContain('Imported market sources');
  });

  it('does not equate transcript integrity with external verification', () => {
    const transcriptEvidence = { verified: true, start_char: 10, end_char: 40 };
    expect(hasTranscriptSpan(transcriptEvidence)).toBe(true);
    expect(isExternallyVerifiedResearchSource(transcriptEvidence)).toBe(false);
    expect(
      isExternallyVerifiedResearchSource({
        verified: true,
        verification_scope: 'external',
      })
    ).toBe(true);
    expect(researchConfidencePercent(0.734)).toBe(73);
    expect(researchConfidencePercent(88)).toBe(88);
  });

  it('normalizes nested provider labels without leaking markup, nulls, or object coercion', () => {
    const result = getGoalResearchBundle({
      id: 'goal-rich-labels',
      data: {
        axwise_customer_intelligence: {
          research_bundle_full: {
            market_sources: [
              {
                source_id: 'source-1',
                title: { name: '**Statistics Estonia**' },
                description: '[object Object]',
              },
            ],
            customer_personas: [
              {
                persona_id: 'customer-1',
                persona: { name: { value: '**Kadri Tamm**' }, summary: 'null' },
              },
            ],
          },
        },
      },
    });

    expect(result.marketSources[0]).toMatchObject({
      name: 'Statistics Estonia',
      description: '',
    });
    expect(result.customerPersonas[0]).toMatchObject({ name: 'Kadri Tamm', description: '' });
    expect(JSON.stringify(result.marketSources)).not.toMatch(/\*\*|\[object Object\]|"null"/i);
  });
});
