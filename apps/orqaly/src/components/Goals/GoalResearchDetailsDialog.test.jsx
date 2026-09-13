import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GoalResearchDetailsDialog from './GoalResearchDetailsDialog';

const goal = {
  id: 'goal-bremen',
  title: 'Bremen commercial launch',
  data: {
    axwise_customer_intelligence: {
      status: 'completed',
      research_bundle: {
        run_id: 'run-bremen',
        bundle_version: 'axwise_research_bundle_v1',
        source_count: 2,
        persona_count: 2,
        selected_persona_ids: ['owner-manager'],
      },
      research_bundle_summary: {
        confidence: 0.81,
        stages: [
          { id: 'source-discovery', name: 'Source discovery', status: 'completed', count: 2 },
        ],
      },
      research_bundle_full: {
        market_scope: {
          schema_version: 'market_scope_v2',
          resolution_hash: 'a'.repeat(64),
          resolved_scope: {
            coverage_mode: 'weighted',
            countries: [
              { country_code: 'EE', country_name: 'Estonia', priority: 'primary' },
              { country_code: 'LV', country_name: 'Latvia', priority: 'standard' },
            ],
          },
        },
        cell_coverage: [
          {
            country_codes: ['EE'],
            status: 'complete',
            source_count: 5,
            authoritative_source_count: 2,
          },
          {
            country_codes: ['LV'],
            status: 'completed',
            source_count: 4,
            authoritative_source_count: 1,
          },
        ],
        customer_personas: [
          {
            persona_id: 'owner-manager',
            persona: {
              name: 'Bremen owner-manager',
              confidence: 0.84,
              decision_role: 'economic_buyer',
              buyer_role: true,
              selection_eligibility: 'eligible_primary',
              evidence_refs: ['interview-1'],
              evidence: [
                {
                  quote: 'I need predictable fixed-price delivery.',
                  document_id: 'interview-1',
                  start_char: 10,
                  end_char: 50,
                },
              ],
              background: 'Runs a regional logistics SME.',
              demographic_details: { region: 'Bremen', company_size: 'SME' },
              pain_points: ['Unclear scope and surprise fees'],
              goals_and_motivations: ['Predictable fixed-price delivery'],
              triggers: ['A delayed customer project'],
              limitations: ['Synthetic participant evidence'],
            },
          },
        ],
        executor_personas: [
          {
            persona_id: 'research-lead',
            required_role: 'Commercial research lead',
            persona: {
              role: 'Commercial research lead',
              mission: 'Build a source-grounded commercial plan.',
              relevant_experience: 'Synthetic role profile; no real career claim.',
              domain_knowledge: ['Bremen SME procurement'],
              capabilities: ['market evidence synthesis'],
              methods: ['Trace material claims to sources'],
              boundaries: ['State uncertainty explicitly'],
              output_contract: { expected_outputs: ['A cited commercial plan'] },
              research_context: {
                source_ids: ['external-1'],
                claim_refs: [{ claim_id: 'claim-1' }],
              },
            },
          },
        ],
        market_sources: [
          {
            id: 'transcript-1',
            title: 'Synthetic interview transcript',
            url: 'https://example.test/transcript',
            verified: true,
            start_char: 12,
            end_char: 55,
          },
          {
            id: 'external-1',
            title: 'External market source',
            url: 'http://insecure.example.test/source',
            externally_verified: true,
            provider: 'searxng',
            provider_source_id: 'search-result-17',
            provider_query_ids: ['query-estonia-4'],
            source_authority: 'official_public',
            authority_verification_status: 'publisher_domain_verified',
            authority_proof: {
              proof_type: 'recognized_public_root_direct',
              signature_alg: 'hmac-sha256',
              proof_signature: 'b'.repeat(64),
            },
            country_codes: ['EE'],
            retrieved_at: '2026-08-12T10:00:00Z',
            citation_metadata: { publisher: 'Statistics Estonia' },
          },
        ],
        research_prd: 'Research scope and acceptance criteria.',
        market_claims: [
          {
            claim_id: 'claim-1',
            subject: 'Bremen logistics buyers',
            predicate: 'require',
            object: 'predictable implementation scope',
            evidence_refs: ['external-1'],
            status: 'verified',
            citation_metadata: {
              segment_start: 12,
              segment_end: 44,
              offset_unit: 'unicode_codepoints',
              span_target: 'direct_authority_document',
              source_id: 'external-1',
            },
            provenance_artifact: {
              artifact_type: 'direct_authority_document',
              source_id: 'external-1',
              sha256: 'd'.repeat(64),
              claim_binding: {
                version: 'direct_authority_claim_span_v1',
                signature_alg: 'hmac-sha256',
                claim_proof_signature: 'c'.repeat(64),
              },
            },
          },
        ],
        quality: {
          critical_claims: {
            status: 'passed',
            total_count: 1,
            verified_count: 1,
            blocked_count: 0,
            conflict_count: 0,
            stale_count: 0,
            claims: [
              {
                claim_id: 'claim-1',
                status: 'verified_current_authoritative',
                evidence_class: 'observed_primary_market',
                source_ids: ['external-1'],
              },
            ],
          },
        },
        method: { approach: 'Source review plus synthetic participant simulation.' },
        limitations: ['Synthetic interviews are directional, not customer testimony.'],
      },
    },
  },
};

function loadedPhysicalEvidence() {
  const fact = (id, productName, merchant, amount, sourceId) => ({
    external_fact_id: id,
    fact_kind: 'physical_product_offer',
    schema_version: 'evidence_fact_v1',
    verification_status: 'verified_current_authoritative',
    source_ids: [sourceId],
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
      _physical_product_projection_authorization: 'hidden-authorization-token',
    },
  });
  return {
    run: {
      id: 'run-physical-v2',
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
        market_scope_hash: 'must-not-render',
      },
      quality: {
        evidence_contract: {
          status: 'passed',
          profile_hash: 'must-not-render',
          fact_manifest_hash: 'must-not-render',
        },
        critical_claims: {
          evidence_ledger: [
            {
              facts: [
                {
                  signed_offer_sha256: 'must-not-render',
                  _physical_product_projection_authorization: 'hidden-authorization-token',
                },
              ],
            },
          ],
        },
      },
    },
    sources: [
      {
        external_source_id: 'source-high',
        source_data: {
          title: 'Merchant High offer',
          url: 'https://merchant-high.example/offer',
        },
      },
      {
        external_source_id: 'source-low',
        source_data: {
          title: 'Merchant Low offer',
          url: 'https://merchant-low.example/offer',
        },
      },
    ],
    personas: [],
    artifacts: [],
    assignments: [],
    facts: [
      fact(
        'fact-high',
        'Atlantic C++ / $Special$ dry food',
        'Merchant High',
        '25.4',
        'source-high'
      ),
      fact('fact-low', 'Baltic dry food', 'Merchant Low', '20', 'source-low'),
    ],
    calculations: [
      {
        external_calculation_id: 'calculation-physical',
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
          calculation_id: 'calculation-physical',
          input_bindings: {
            higher: { fact_id: 'fact-high', claim_id: 'claim-high' },
            lower: { fact_id: 'fact-low', claim_id: 'claim-low' },
          },
          normalized_inputs: { private_detail: 'must-not-render' },
          target_basis: { quantity: '1', unit: 'package' },
          result: { amount: '5.4', currency: 'EUR', tax_basis: 'gross' },
        },
      },
    ],
  };
}

describe('GoalResearchDetailsDialog', () => {
  it('exposes accessible research sections and preserves evidence semantics', () => {
    render(<GoalResearchDetailsDialog open goal={goal} onClose={() => {}} />);

    expect(screen.getByRole('tablist', { name: 'Research detail sections' })).toBeInTheDocument();
    const scrollRegion = screen.getByRole('region', { name: 'Research details content' });
    expect(scrollRegion.parentElement).toHaveStyle({ overflow: 'hidden' });
    expect(scrollRegion).toHaveStyle({
      flex: '1',
      minHeight: '0',
      overflowY: 'auto',
    });
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'research-tab-overview'
    );
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByText('Run: run-bremen')).toBeInTheDocument();
    expect(
      screen.getByText('Estonia · priority · 5 sources · 2 authoritative')
    ).toBeInTheDocument();
    expect(screen.getByText('Latvia · 4 sources · 1 authoritative')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(
      screen.getByText(/Bremen logistics buyers.*require.*predictable implementation scope/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Evidence: external-1 · verified/i)).toBeInTheDocument();
    expect(screen.getByText('Critical check: verified current authoritative')).toBeInTheDocument();
    expect(screen.getByText('Class: observed primary market')).toBeInTheDocument();
    expect(screen.getByText('Exact span: 12–44 characters')).toBeInTheDocument();
    expect(screen.getByText('Direct authority proof: cccccccccccc…')).toBeInTheDocument();
    expect(screen.getByText('Evidence hash: dddddddddddd…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Market sources' }));

    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'research-tab-sources');
    expect(screen.getByText('Transcript span checked')).toBeInTheDocument();
    expect(screen.getByText('Externally verified')).toBeInTheDocument();
    expect(screen.getByText('Authority: official_public')).toBeInTheDocument();
    expect(screen.getByText('Authority check: publisher_domain_verified')).toBeInTheDocument();
    expect(screen.getByText('Authority proof: recognized public root direct')).toBeInTheDocument();
    expect(screen.getByText('Authority signature: bbbbbbbbbbbb…')).toBeInTheDocument();
    expect(screen.getByText('Provider: searxng')).toBeInTheDocument();
    expect(screen.getByText('Source ID: search-result-17')).toBeInTheDocument();
    expect(screen.getByText('Query ID: query-estonia-4')).toBeInTheDocument();
    expect(screen.getByText('Jurisdiction: EE')).toBeInTheDocument();
    expect(screen.getByText(/Citation: publisher: Statistics Estonia/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open source' })).toHaveLength(1);
    expect(screen.queryByText('(verified)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Customer personas' }));
    expect(screen.getByText('Confidence 84%')).toBeInTheDocument();
    expect(screen.getByText('Customer role: economic buyer')).toBeInTheDocument();
    expect(screen.getByText('Eligibility: eligible primary')).toBeInTheDocument();
    expect(screen.getByText('Evidence: interview-1')).toBeInTheDocument();
    expect(screen.getByText(/I need predictable fixed-price delivery/i)).toBeInTheDocument();
    expect(screen.getByText('Unclear scope and surprise fees')).toBeInTheDocument();
    expect(screen.getByText(/region: Bremen.*company size: SME/i)).toBeInTheDocument();
    expect(screen.getByText('Predictable fixed-price delivery')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Executor personas' }));
    expect(screen.getByText('Build a source-grounded commercial plan.')).toBeInTheDocument();
    expect(screen.getByText('market evidence synthesis')).toBeInTheDocument();
    expect(screen.getByText('Trace material claims to sources')).toBeInTheDocument();
    expect(screen.getByText('State uncertainty explicitly')).toBeInTheDocument();
    expect(screen.getByText('A cited commercial plan')).toBeInTheDocument();
    expect(screen.getByText('Evidence: external-1')).toBeInTheDocument();
    expect(screen.getByText('Evidence: claim-1')).toBeInTheDocument();
  });

  it('renders structured Research PRD sections without collapsing them to Not provided', () => {
    const structuredGoal = structuredClone(goal);
    structuredGoal.data.axwise_customer_intelligence.research_bundle_full.research_prd = {
      scope: {
        objective: '**Create a Bremen commercial plan**',
        constraints: ['* GDPR-safe delivery', 'Fixed-price packages', null, '[object Object]'],
        unit_economics: {
          formula: String.raw`\[ ROI = \frac{revenue}{cost} \times 100\% \]`,
        },
      },
    };

    render(<GoalResearchDetailsDialog open goal={structuredGoal} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Research PRD' }));

    expect(screen.getByRole('heading', { name: 'scope' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'objective' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'constraints' })).toBeInTheDocument();
    expect(screen.getByText('Create a Bremen commercial plan')).toBeInTheDocument();
    expect(screen.getByText('GDPR-safe delivery')).toBeInTheDocument();
    expect(screen.getByText('Fixed-price packages')).toBeInTheDocument();
    expect(screen.getByText('ROI = revenue / cost × 100%')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Not provided')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent(
      /\*\*|\[object Object\]|\bnull\b|\\(?:frac|times)/i
    );
  });

  it('renders persisted physical evidence and its pack-total calculation without raw internals', async () => {
    const v2Goal = {
      id: 'goal-physical-v2',
      title: 'Physical offer review',
      data: {
        axwise_customer_intelligence: {
          status: 'completed',
          research_bundle: {
            bundle_version: 'axwise_research_bundle_v2',
            fact_count: 2,
            calculation_count: 1,
          },
        },
      },
    };

    render(
      <GoalResearchDetailsDialog
        open
        goal={v2Goal}
        initialTab="evidence"
        loadBundle={async () => loadedPhysicalEvidence()}
        onClose={() => {}}
      />
    );

    await screen.findAllByText('Atlantic C++ / $Special$ dry food');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'research-tab-evidence'
    );
    expect(screen.getByText('Evidence status: passed')).toBeInTheDocument();
    expect(screen.getByText('Profile: business_evidence_profile_v1')).toBeInTheDocument();
    expect(screen.getByText('Economic model: physical product')).toBeInTheDocument();
    expect(screen.getByText('Facts').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Calculations').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Merchant High')).toBeInTheDocument();
    expect(screen.getByText('Merchant Low')).toBeInTheDocument();
    expect(screen.getAllByText('2 kilogram')).toHaveLength(4);
    expect(screen.getAllByText('25.4 EUR · tax gross')).toHaveLength(2);
    expect(screen.getAllByText('20 EUR · tax gross')).toHaveLength(2);
    expect(screen.getAllByText('2026-08-14T08:00:00Z')).toHaveLength(2);
    expect(screen.getAllByText('EE')).toHaveLength(3);
    expect(screen.getByText('Observed pack-total price difference')).toBeInTheDocument();
    expect(screen.getByText('5.4 EUR · tax gross')).toBeInTheDocument();
    expect(screen.getByText('Target basis').parentElement).toHaveTextContent('1 package');
    expect(screen.getByText('Source ID: source-high')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open source source-high' })).toHaveAttribute(
      'href',
      'https://merchant-high.example/offer'
    );
    expect(screen.getByText(/Orqaly does not recompute or infer this value/i)).toBeInTheDocument();
    expect(screen.queryByText(/offer-fact-(?:high|low)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/hidden-authorization-token|must-not-render/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent(
      /sha256|manifest hash|profile hash|normalized inputs|authorization/i
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Method & confidence' }));
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent(
      /must-not-render|signed offer|sha256|authorization|manifest hash|profile hash/i
    );
  });

  it('does not fall back to embedded raw v2 evidence when persisted child rows are not loaded', () => {
    const rawOnlyGoal = {
      id: 'goal-raw-only',
      title: 'Raw-only evidence must stay hidden',
      data: {
        axwise_customer_intelligence: {
          status: 'completed',
          research_bundle: {
            bundle_version: 'axwise_research_bundle_v2',
            fact_count: 1,
          },
          research_bundle_full: {
            version: 'axwise_research_bundle_v2',
            facts: [
              {
                kind: 'physical_product_offer',
                payload: { product_name: 'Embedded product must stay hidden' },
              },
            ],
          },
        },
      },
    };

    render(
      <GoalResearchDetailsDialog open goal={rawOnlyGoal} initialTab="evidence" onClose={() => {}} />
    );

    expect(screen.getByText(/Raw bundle fallback is disabled/i)).toBeInTheDocument();
    expect(screen.queryByText('Embedded product must stay hidden')).not.toBeInTheDocument();
  });

  it('shows a safe notice instead of a raw future-model payload', async () => {
    const response = loadedPhysicalEvidence();
    response.run.fact_count = 1;
    response.run.calculation_count = 0;
    response.bundle.evidence_profile.economic_model = 'subscription';
    response.facts = [
      {
        external_fact_id: 'subscription-fact',
        fact_kind: 'subscription_plan',
        schema_version: 'evidence_fact_v1',
        verification_status: 'verified_current_authoritative',
        source_ids: ['source-high'],
        country_codes: ['EE'],
        observed_at: '2026-08-14T08:00:00Z',
        payload: {
          provider: 'Provider name must stay hidden',
          plan_name: 'Secret plan must stay hidden',
        },
      },
    ];
    response.calculations = [];
    const subscriptionGoal = {
      id: 'goal-subscription-v2',
      title: 'Subscription evidence',
      data: {
        axwise_customer_intelligence: {
          research_bundle: { bundle_version: 'axwise_research_bundle_v2' },
        },
      },
    };

    render(
      <GoalResearchDetailsDialog
        open
        goal={subscriptionGoal}
        initialTab="evidence"
        loadBundle={async () => response}
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText('Subscription plan')).toBeInTheDocument());
    expect(
      screen.getByText(/model-specific human-review view is not enabled/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Provider name must stay hidden|Secret plan must stay hidden/i)
    ).not.toBeInTheDocument();
  });

  it('shows an explicit legacy empty state instead of fabricated research', () => {
    render(
      <GoalResearchDetailsDialog
        open
        goal={{ id: 'legacy', title: 'Legacy goal', data: {} }}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/No AxWise research bundle is attached/i)).toBeInTheDocument();
    expect(screen.getByText(/No stage telemetry is available/i)).toBeInTheDocument();
  });
});
