import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
  executionRolesForEvidenceProfile,
} from './evidence-contract-v2.js';
import {
  customerScopeHash,
  LEGACY_AXWISE_CLARIFICATION_QUESTIONS,
} from '../../goal-handlers/scope-confirmation.js';
import {
  buildCustomerIntelligenceRequest,
  buildCustomerRoutingRequest,
  buildExecutionPersonaPrompt,
  contextResolutionFromDecision,
  createWorkingPersonaHypothesis,
  createTaskExecutionContext,
  formatCustomerIntelligenceForPlanning,
  normalizeAgentAvailability,
  ownerClarificationContext,
  sanitizePersonaResolution,
} from './customer-intelligence.js';

const goal = {
  id: 'goal-clinic',
  user_id: 'user-1',
  org_id: 'org-1',
  title: 'Reduce missed appointments',
  description: 'We need fewer no-shows at our dental clinic.',
  parsed_category: 'healthcare_operations',
  parsed_requirements: 'Do not contact patients without approval.',
  tech_doc: {
    problem_statement: 'Missed appointments create unused clinical capacity.',
    success_criteria: ['Reduce no-shows without increasing staff workload'],
    constraints: ['Protect patient privacy'],
  },
  data: {},
};

const resolution = {
  version: 'orqaly_dual_persona_v1',
  customer_persona: {
    name: 'Clinic Operations Manager',
    confidence: 0.88,
    profile: {
      role: 'Clinic Operations Manager',
      pain_points: ['Idle capacity', 'Manual reminder work'],
      communication_style: 'direct and reassuring',
    },
    evidence: [
      {
        quote: 'Missed appointments leave chairs empty every afternoon.',
        speaker: 'Clinic manager',
        document_id: 'interview-1',
        start_char: 4,
        end_char: 58,
      },
    ],
  },
  ideal_agent_persona: {
    role: 'Healthcare Operations Specialist',
    communication_style: 'direct and reassuring',
    required_capabilities: ['appointment operations', 'privacy-aware communication'],
    operating_principles: ['Use customer evidence when recommending changes.'],
  },
  recommended_agent: {
    agent_id: 'agent-operations',
    score: 0.91,
    matched_task_terms: ['appointments'],
    matched_customer_terms: ['clinic'],
  },
  ranked_agents: [
    { agent_id: 'agent-operations', score: 0.91 },
    { agent_id: 'other-tenant-agent', score: 0.99 },
  ],
  selection_status: 'matched_candidate',
  auto_assign_allowed: false,
  requires_orqaly_authorization: true,
  evidence_count: 1,
};

afterEach(() => vi.unstubAllEnvs());

describe('AxWise customer intelligence contract', () => {
  it('turns a vague non-software goal into a domain-neutral dual-persona request', () => {
    const request = buildCustomerIntelligenceRequest({
      goal,
      agents: [
        {
          id: 'agent-operations',
          name: 'Operations Strategist',
          category: 'operations',
          capabilities: ['process improvement'],
          metadata: { tools: 'web-search' },
        },
      ],
    });

    expect(request.outputs.persona_resolution).toBe(true);
    expect(request.task_context.category).toBe('healthcare_operations');
    expect(request.task_context.constraints).toContain(
      'Do not assume this is a software-development task'
    );
    expect(request.raw_questionnaire_content).toContain('Who directly experiences the problem');
    expect(request.raw_questionnaire_content).not.toMatch(/product owner|project manager/i);
    expect(request.config.performance_profile).toBe('quality_fast');
    expect(request.questions_data.stakeholders.primary).toHaveLength(3);
    expect(request.questions_data.stakeholders.secondary).toHaveLength(2);
    expect(request.questions_data.timeEstimate.totalQuestions).toBe(7);
    expect(request.agent_candidates[0]).toMatchObject({
      agent_id: 'agent-operations',
      role: 'Operations Strategist',
      tools: ['web-search'],
    });
  });

  it('lets AxWise decide whether bounded persona research is worth running', () => {
    const request = buildCustomerRoutingRequest({
      goal,
      agents: [
        {
          id: 'agent-operations',
          name: 'Operations Strategist',
          category: 'operations',
          capabilities: ['process improvement'],
          metadata: { tools: ['web-search'], availability_status: 'available' },
        },
      ],
    });

    expect(request).toMatchObject({
      contract_version: '1.0',
      task: { task_class: 'customer_context_resolution', domain: 'healthcare_operations' },
      research_policy: {
        allow_hybrid_research: true,
        required: false,
        minimum_mode: 'auto',
        grounding_required: false,
        fail_closed: false,
        minimum_value_of_information: 0.2,
        maximum_research_iterations: 1,
      },
      planning: null,
    });
    expect(request.available_agents[0]).toMatchObject({
      agent_id: 'agent-operations',
      org_id: 'org-1',
    });
    expect(request.research_brief.research_questions).not.toEqual([]);
    expect(request.research_brief.research_questions).toHaveLength(7);
  });

  it('maps the durable advanced research policy into the full AxWise grounding contract', () => {
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        tech_doc: {
          ...goal.tech_doc,
          required_capabilities: ['Healthcare Operations Specialist'],
        },
        data: {
          research_policy: {
            version: 2,
            research_mode: 'grounded_deep',
            grounding_required: true,
            research_fail_closed: true,
            location: 'Bremen, Germany',
            market_scope_hash: 'a'.repeat(64),
            market_scope: {
              schema_version: 'market_scope_v2',
              raw_input: 'Baltics',
              selectors: [],
              resolved_scope: {
                countries: [
                  { country_code: 'EE', country_name: 'Estonia' },
                  { country_code: 'LV', country_name: 'Latvia' },
                  { country_code: 'LT', country_name: 'Lithuania' },
                ],
                excluded_country_codes: [],
                coverage_mode: 'weighted',
              },
              ambiguities: [],
              confirmation: { required: false, confirmed: false },
            },
          },
        },
      },
      agents: [],
    });

    expect(request.research_policy).toMatchObject({
      required: true,
      minimum_mode: 'grounded_deep',
      grounding_required: true,
      fail_closed: true,
      performance_profile: 'standard',
      required_outputs: [
        'market_sources',
        'market_claims',
        'synthetic_participants',
        'interviews',
        'customer_personas',
        'persona_resolution',
        'research_prd',
        'research_bundle',
      ],
      allowed_source_types: [
        'company_registry',
        'google_search_result',
        'official_company_website',
        'provided_document',
      ],
    });
    expect(request.research_brief.location).toBe('Bremen, Germany');
    expect(request.research_brief.market_scope).toMatchObject({
      schema_version: 'market_scope_v2',
      raw_input: 'Baltics',
      resolved_scope: {
        countries: expect.arrayContaining([expect.objectContaining({ country_code: 'EE' })]),
      },
    });
    expect(request.research_brief).toMatchObject({ depth: 'comprehensive', sample_size: 2 });
    expect(request.research_brief.required_execution_roles).toEqual([]);

    const fast = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: {
          research_policy: {
            research_mode: 'grounded_fast',
            grounding_required: true,
            research_fail_closed: true,
            location: 'Bremen',
          },
        },
      },
      agents: [],
    });
    expect(fast.research_policy.performance_profile).toBe('quality_fast');
    expect(fast.research_brief.sample_size).toBe(1);
    expect(fast.research_brief).toMatchObject({ depth: 'detailed', sample_size: 1 });
  });

  it('sends the typed commercial PRD, primary-buyer, critical-claim, and exact-role contract', () => {
    const roles = [
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ];
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        title: 'Estonia cat food commercial market launch',
        tech_doc: {
          ...goal.tech_doc,
          success_criteria: [
            { metric: 'Retail buyer interviews', threshold: 5 },
            { metric: 'Traceable margin model', threshold: 'complete' },
          ],
        },
        data: {
          research_policy: {
            research_mode: 'grounded_deep',
            grounding_required: true,
            research_fail_closed: true,
            location: 'Estonia',
            intent: 'commercial_market_launch',
            requested_execution_roles: roles,
            requested_execution_roles_source: 'owner_request',
          },
        },
      },
      agents: [],
    });

    expect(request.research_brief).toMatchObject({
      research_prd_type: 'commercial_market_launch',
      required_execution_roles: roles,
      customer_role_contract: {
        primary_roles: ['economic_buyer', 'decision_authority'],
        require_primary_buyer: true,
      },
      critical_claim_policy: {
        required: true,
        fail_closed: true,
        freshness_days: 120,
        mandatory_claim_classes: [
          'statutory_current',
          'official_statistic',
          'observed_primary_market',
        ],
        freshness_by_class: {
          official_statistic: 730,
          observed_primary_market: 120,
        },
      },
    });
    expect(request.research_brief).not.toHaveProperty('business_evidence_profile');
    expect(request.task.desired_outcome).toContain('metric: Retail buyer interviews');
    expect(request.task.desired_outcome).not.toContain('[object Object]');
  });

  it('emits an exact pinned v2 profile and all six dynamic role slots', () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'subscription');
    const evidenceProfile = createBusinessEvidenceProfile({
      version: 'business_evidence_profile_v1',
      intent: 'software_product',
      economic_model: 'subscription',
      market_scope_hash: 'a'.repeat(64),
      fact_requirements: [
        { kind: 'subscription_plan', minimum_verified: 0, applicability: 'optional' },
      ],
      calculation_requirements: [
        {
          kind: 'subscription_rate_difference',
          minimum_verified: 0,
          applicability: 'optional',
        },
      ],
      required_role_slots: [
        'customer_market',
        'pricing_finance',
        'legal_compliance',
        'sales_distribution',
        'risk_operations',
        'domain_delivery',
      ],
    });
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: {
          research_policy: {
            research_mode: 'grounded_deep',
            grounding_required: true,
            research_fail_closed: true,
            intent: evidenceProfile.intent,
            market_scope_hash: evidenceProfile.market_scope_hash,
            business_evidence_profile: evidenceProfile,
            business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
            requested_execution_roles: ['must not override the pinned slots'],
          },
        },
      },
      agents: [],
    });

    expect(request.research_brief.business_evidence_profile).toEqual(evidenceProfile);
    expect(request.research_brief.research_prd_type).toBe('software_product');
    expect(request.research_brief.required_execution_roles).toEqual(
      executionRolesForEvidenceProfile(evidenceProfile)
    );
    expect(request.research_brief.required_execution_roles).toHaveLength(6);
    expect(request.research_brief).not.toHaveProperty('critical_claim_policy');
    expect(request.task.constraints.join(' ')).not.toContain('exactly these five roles');
  });

  it('adds the commercial buyer and critical-claim contract to a pinned v2 profile', () => {
    const evidenceProfile = createBusinessEvidenceProfile({
      version: 'business_evidence_profile_v1',
      intent: 'commercial_market_launch',
      economic_model: 'physical_product',
      market_scope_hash: 'a'.repeat(64),
      fact_requirements: [
        { kind: 'physical_product_offer', minimum_verified: 2, applicability: 'required' },
      ],
      calculation_requirements: [
        {
          kind: 'physical_offer_price_difference',
          minimum_verified: 1,
          applicability: 'required',
        },
      ],
      required_role_slots: ['customer_market', 'pricing_finance', 'legal_compliance'],
    });
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        title: 'Launch physical cat food offers in Estonia',
        data: {
          research_policy: {
            research_mode: 'grounded_deep',
            grounding_required: true,
            research_fail_closed: true,
            intent: 'commercial_market_launch',
            market_scope_hash: evidenceProfile.market_scope_hash,
            business_evidence_profile: evidenceProfile,
            business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
          },
        },
      },
      agents: [],
    });

    expect(request.research_brief).toMatchObject({
      business_evidence_profile: evidenceProfile,
      research_prd_type: 'commercial_market_launch',
      customer_role_contract: {
        primary_roles: ['economic_buyer', 'decision_authority'],
        require_primary_buyer: true,
      },
      critical_claim_policy: {
        required: true,
        fail_closed: true,
        mandatory_claim_classes: [
          'statutory_current',
          'official_statistic',
          'observed_primary_market',
        ],
      },
    });
    expect(Object.keys(request.research_brief.customer_role_contract).sort()).toEqual([
      'ineligible_roles',
      'primary_roles',
      'require_primary_buyer',
    ]);
    expect(Object.keys(request.research_brief.critical_claim_policy).sort()).toEqual([
      'fail_closed',
      'freshness_by_class',
      'freshness_days',
      'mandatory_claim_classes',
      'required',
    ]);
    expect(request.research_brief.required_execution_roles).toEqual(
      executionRolesForEvidenceProfile(evidenceProfile)
    );
    expect(request.task.constraints.join(' ')).toContain('Critical claim contract');
    expect(request.task.constraints.join(' ')).not.toContain('exactly these five roles');
  });

  it.each([
    ['global rollback', 'false', ''],
    ['model removed from rollout', 'true', 'physical_product'],
    ['empty rollout', 'true', ''],
    ['malformed rollout', 'true', 'none,none'],
  ])('can reconstruct a pinned request during %s', (_label, globalFlag, enabledModels) => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', globalFlag);
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', enabledModels);
    const evidenceProfile = createBusinessEvidenceProfile({
      version: 'business_evidence_profile_v1',
      intent: 'software_product',
      economic_model: 'none',
      market_scope_hash: null,
      fact_requirements: [],
      calculation_requirements: [],
      required_role_slots: [],
    });

    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: {
          research_policy: {
            business_evidence_profile: evidenceProfile,
            business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
          },
        },
      },
      agents: [],
    });

    expect(request.research_brief).toMatchObject({
      business_evidence_profile: evidenceProfile,
      research_prd_type: 'software_product',
    });
  });

  it('keeps profile-absent v1 request emission unchanged under a malformed v2 rollout list', () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product,physical_product');

    const request = buildCustomerRoutingRequest({ goal, agents: [] });
    expect(request.research_brief).not.toHaveProperty('business_evidence_profile');
  });

  it('reconstructs pinned v2 requests after new admission closes during queue drain', () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'subscription');
    const evidenceProfile = createBusinessEvidenceProfile({
      version: 'business_evidence_profile_v1',
      intent: 'software_product',
      economic_model: 'subscription',
      market_scope_hash: 'a'.repeat(64),
      fact_requirements: [],
      calculation_requirements: [],
      required_role_slots: ['domain_delivery'],
    });

    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: {
          research_policy: {
            market_scope_hash: evidenceProfile.market_scope_hash,
            business_evidence_profile: evidenceProfile,
            business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
          },
        },
      },
      agents: [],
    });

    expect(request.research_brief.business_evidence_profile).toEqual(evidenceProfile);
    expect(request.research_brief.research_prd_type).toBe('software_product');
  });

  it('keeps fail-closed Instant research optional until AxWise selects a run', () => {
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: {
          research_policy: {
            research_mode: 'instant',
            grounding_required: false,
            research_fail_closed: true,
            location: null,
          },
        },
      },
      agents: [],
    });

    expect(request.research_policy).toMatchObject({
      required: false,
      minimum_mode: 'instant',
      grounding_required: false,
      fail_closed: true,
    });
    expect(request.research_brief.location).toBeNull();
    expect(request.research_brief).toMatchObject({ depth: 'quick', sample_size: 1 });
  });

  it('keeps explicitly required Instant research fail-closed against a persisted false', () => {
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: {
          research_policy: {
            research_mode: 'instant',
            required: true,
            grounding_required: false,
            research_fail_closed: false,
          },
        },
      },
      agents: [],
    });

    expect(request.research_policy).toMatchObject({
      required: true,
      minimum_mode: 'instant',
      grounding_required: false,
      fail_closed: true,
    });
  });

  it('normalizes richer Agent Hub lifecycle states to the AxWise availability contract', () => {
    expect(normalizeAgentAvailability('active')).toBe('available');
    expect(normalizeAgentAvailability('running')).toBe('busy');
    expect(normalizeAgentAvailability('paused')).toBe('offline');
    expect(normalizeAgentAvailability('blocked')).toBe('offline');
    expect(normalizeAgentAvailability('unexpected-state')).toBe('unknown');

    const request = buildCustomerRoutingRequest({
      goal,
      agents: [
        {
          id: 'agent-paused',
          name: 'Paused specialist',
          status: 'paused',
          metadata: {},
        },
      ],
    });
    expect(request.available_agents[0].availability).toBe('offline');
  });

  it('routes a human evidence request through AxWise instead of forcing research', () => {
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: {
          axwise_customer_intelligence: {
            user_research_request: {
              feedback: 'Verify who authorizes reminder-policy changes at the clinic.',
            },
          },
        },
      },
      agents: [],
    });

    expect(request.task.requested_actions).toEqual(['gather_customer_evidence']);
    expect(request.task.constraints).toContain(
      'Human reviewer requested additional supporting evidence: Verify who authorizes reminder-policy changes at the clinic.'
    );
    expect(request.research_brief.research_questions[0]).toContain(
      'Verify who authorizes reminder-policy changes at the clinic.'
    );
    expect(request.research_policy.allow_hybrid_research).toBe(true);
    expect(request.planning).toBeNull();
  });

  it('sends an unresolved stakeholder as missing data instead of a fake catalogue value', () => {
    const vagueGoal = { ...goal, tech_doc: { ...goal.tech_doc } };
    delete vagueGoal.tech_doc.target_audience;
    const request = buildCustomerRoutingRequest({ goal: vagueGoal, agents: [] });

    expect(request.task.stakeholders).toEqual([]);
    expect(request.research_brief.target_stakeholders).toContain('Unknown');
  });

  it('uses an accepted AxWise scope as declared context without upgrading it to fact', () => {
    const decisionId = 'decision-owner-scope';
    const clarificationScope = {
      target_customer: 'Original audience',
      problem: 'Original problem',
      desired_outcome: 'Original outcome',
    };
    clarificationScope.scope_hash = customerScopeHash(decisionId, clarificationScope);
    const clarifiedGoal = {
      ...goal,
      tech_doc: {
        ...goal.tech_doc,
        target_audience: 'Original audience',
        problem_statement: 'Original problem',
      },
      data: {
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: decisionId,
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            accepted_at: '2026-08-22T12:00:00.000Z',
            provenance: 'user_confirmed_assumption',
            source_decision_id: decisionId,
            source_scope_hash: clarificationScope.scope_hash,
            target_customer: 'Corrected clinic owners',
            problem: 'Corrected appointment-capacity problem',
            desired_outcome: 'Reduce no-shows by 20%',
            optional_details: 'Start with the Berlin clinics.',
          },
        },
      },
    };

    expect(ownerClarificationContext(clarifiedGoal)).toMatchObject({
      targetCustomer: 'Corrected clinic owners',
      problem: 'Corrected appointment-capacity problem',
      desiredOutcome: 'Reduce no-shows by 20%',
      provenance: 'user_confirmed_assumption',
    });

    const request = buildCustomerRoutingRequest({ goal: clarifiedGoal, agents: [] });
    expect(request.task.stakeholders).toEqual(['Corrected clinic owners']);
    expect(request.task.desired_outcome).toBe('Reduce no-shows by 20%');
    expect(request.task.constraints).toContain(
      'Goal owner scope correction: Start with the Berlin clinics.'
    );

    const context = contextResolutionFromDecision(clarifiedGoal, {
      routing_mode: 'human_controlled',
      routing_assessment: { uncertainty: 0.6 },
      required_capabilities: [],
      recommended_agents: [],
      candidate_rankings: [],
      evidence: [],
      input_snapshot: { task: { desired_outcome: 'Original outcome' } },
    });
    expect(context.customer_persona).toMatchObject({
      name: 'Corrected clinic owners',
      trust: {
        status: 'declared_unverified',
        verified: false,
        owner_scope_confirmation: {
          provenance: 'user_confirmed_assumption',
          underlying_facts_verified: false,
        },
      },
      profile: {
        problem: 'Corrected appointment-capacity problem',
        desired_outcome: 'Reduce no-shows by 20%',
      },
    });
  });

  it('changes the provider request for a no-edit acceptance with one unverified declaration item', () => {
    const decisionId = 'decision-no-edit-scope';
    const scopedGoal = {
      ...goal,
      tech_doc: {
        ...goal.tech_doc,
        target_audience: 'Clinic operations managers',
        success_tiers: { target: 'Reduce no-shows without increasing staff workload' },
      },
    };
    const clarificationScope = {
      business_idea: scopedGoal.title,
      target_customer: scopedGoal.tech_doc.target_audience,
      problem: scopedGoal.tech_doc.problem_statement,
      desired_outcome: scopedGoal.tech_doc.success_tiers.target,
      constraints: scopedGoal.tech_doc.constraints,
    };
    clarificationScope.scope_hash = customerScopeHash(decisionId, clarificationScope);
    const acceptedGoal = {
      ...scopedGoal,
      data: {
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: decisionId,
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            accepted_at: '2026-08-22T12:00:00.000Z',
            provenance: 'user_confirmed_assumption',
            source_decision_id: decisionId,
            source_scope_hash: clarificationScope.scope_hash,
            target_customer: clarificationScope.target_customer,
            problem: clarificationScope.problem,
            desired_outcome: clarificationScope.desired_outcome,
          },
        },
      },
    };

    const agents = [
      {
        id: 'agent-operations',
        name: 'Operations Strategist',
        category: 'operations',
        status: 'active',
        capabilities: ['process improvement'],
        metadata: { tools: [], availability_status: 'available' },
      },
    ];
    const before = buildCustomerRoutingRequest({ goal: scopedGoal, agents });
    const after = buildCustomerRoutingRequest({ goal: acceptedGoal, agents });
    const hash = (request) =>
      createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 20);

    const { objective: beforeObjective, ...beforeTask } = before.task;
    const { objective: afterObjective, ...afterTask } = after.task;
    expect(afterTask).toEqual(beforeTask);
    expect(afterObjective).not.toBe(beforeObjective);
    expect(afterObjective).toContain('Missed appointments create unused clinical capacity.');
    expect(afterObjective).toContain('Reduce no-shows without increasing staff workload');
    expect(after.upstream_decision_id).toBe(decisionId);
    expect(hash(after)).not.toBe(hash(before));
    expect(after.evidence_catalogue).toContainEqual(
      expect.objectContaining({
        reference_id: 'orqaly-owner-scope-confirmation',
        provenance: 'operational',
        verified: false,
        verification_source: 'none',
        content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );

    const providerEcho = contextResolutionFromDecision(acceptedGoal, {
      routing_mode: 'evidence_assisted',
      routing_assessment: { uncertainty: 0.2 },
      recommended_agents: [],
      candidate_rankings: [],
      evidence: [
        {
          reference_id: 'orqaly-owner-scope-confirmation',
          provenance: 'operational',
          verified: true,
          verification_source: 'axwise_audit',
          quality: 1,
        },
      ],
    });
    expect(providerEcho.customer_persona.evidence[0]).toMatchObject({
      reference_id: 'orqaly-owner-scope-confirmation',
      provenance: 'operational',
      verified: false,
      verification_source: 'none',
    });
    expect(providerEcho.customer_persona.trust).toMatchObject({
      status: 'declared_unverified',
      verified: false,
    });
  });

  it('keeps the confirmed objective above the current AxWise specificity threshold', () => {
    const decisionId = 'decision-specific-scope';
    const clarificationScope = {
      business_idea: 'Reduce missed appointments',
      target_customer: 'Clinic operations managers',
      problem: 'Missed appointments create unused clinical capacity',
      desired_outcome: 'Reduce no-shows without increasing staff workload',
    };
    clarificationScope.scope_hash = customerScopeHash(decisionId, clarificationScope);
    const acceptedGoal = {
      ...goal,
      tech_doc: {
        ...goal.tech_doc,
        target_audience: clarificationScope.target_customer,
        success_tiers: { target: clarificationScope.desired_outcome },
      },
      data: {
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          decision_id: decisionId,
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            provenance: 'user_confirmed_assumption',
            source_decision_id: decisionId,
            source_scope_hash: clarificationScope.scope_hash,
            target_customer: clarificationScope.target_customer,
            problem: clarificationScope.problem,
            desired_outcome: clarificationScope.desired_outcome,
          },
        },
      },
    };

    const request = buildCustomerRoutingRequest({
      goal: acceptedGoal,
      agents: [
        {
          id: 'agent-operations',
          name: 'Operations Strategist',
          category: 'operations',
          status: 'active',
          capabilities: ['process improvement'],
          metadata: { tools: [], availability_status: 'available' },
        },
      ],
    });
    const genericPhrases = [
      'analyze this',
      'do this',
      'fix it',
      'handle this',
      'help me',
      'improve it',
      'make it better',
      'take care of it',
    ];
    const normalizedObjective = request.task.objective.toLowerCase();

    // These are the current deterministic AxWise TaskClassifier objective
    // checks. Orqaly still honors the provider's returned route; it does not
    // locally convert a human_clarification decision.
    expect(request.task.objective.trim().split(/\s+/).length).toBeGreaterThanOrEqual(6);
    expect(genericPhrases.some((phrase) => normalizedObjective.includes(phrase))).toBe(false);
    expect(request.task.stakeholders).toEqual(['Clinic operations managers']);
    expect(request.available_agents).toHaveLength(1);
    expect(request.upstream_decision_id).toBe(decisionId);
  });

  it('keeps legacy customer-clarification answers unverified', () => {
    const clarifiedGoal = {
      ...goal,
      data: {
        po_answers: [
          { question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[0], answer: 'Clinic managers' },
          { question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[1], answer: 'Reduce no-shows' },
          {
            question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[2],
            answer: 'Use appointment records only',
          },
        ],
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: 'legacy-clarification-decision',
          clarification_questions: [...LEGACY_AXWISE_CLARIFICATION_QUESTIONS],
        },
      },
    };

    const request = buildCustomerRoutingRequest({ goal: clarifiedGoal, agents: [] });
    expect(request.evidence_catalogue[0]).toMatchObject({
      provenance: 'operational',
      verified: false,
      verification_source: 'none',
    });
  });

  it('keeps retained legacy answers unverified after the API upgrades their scope', () => {
    const decisionId = 'legacy-clarification-decision';
    const clarificationScope = {
      version: 'orqaly_axwise_scope_confirmation_v1',
      source: 'legacy_po_clarification_answers',
      business_idea: goal.title,
      target_customer: 'Clinic managers',
      problem: 'Missed appointments create unused capacity',
      desired_outcome: 'Reduce no-shows',
      constraints: [],
      evidence: [],
      routing_reasons: [],
      summary: 'Confirm the declared clinic scope.',
      trust: { status: 'declared_inferred_unverified', verified: false },
    };
    clarificationScope.scope_hash = customerScopeHash(decisionId, clarificationScope);
    const upgradedGoal = {
      ...goal,
      data: {
        po_questions: [...LEGACY_AXWISE_CLARIFICATION_QUESTIONS],
        po_answers: [
          { question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[0], answer: 'Clinic managers' },
          { question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[1], answer: 'Reduce no-shows' },
          {
            question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[2],
            answer: 'Use appointment records only',
          },
        ],
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          decision_id: decisionId,
          clarification_questions: [...LEGACY_AXWISE_CLARIFICATION_QUESTIONS],
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            accepted_at: '2026-08-22T12:00:00.000Z',
            provenance: 'user_confirmed_assumption',
            source_decision_id: decisionId,
            source_scope_hash: clarificationScope.scope_hash,
            target_customer: clarificationScope.target_customer,
            problem: clarificationScope.problem,
            desired_outcome: clarificationScope.desired_outcome,
            scope: clarificationScope,
          },
        },
      },
    };

    const request = buildCustomerRoutingRequest({ goal: upgradedGoal, agents: [] });
    expect(request.upstream_decision_id).toBe(decisionId);
    expect(request.evidence_catalogue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference_id: 'orqaly-owner-scope-confirmation',
          verified: false,
          verification_source: 'none',
        }),
        expect.objectContaining({
          reference_id: 'orqaly-po-answer-1',
          verified: false,
          verification_source: 'none',
        }),
      ])
    );

    const providerEcho = contextResolutionFromDecision(upgradedGoal, {
      routing_mode: 'evidence_assisted',
      routing_assessment: { uncertainty: 0.2 },
      recommended_agents: [],
      candidate_rankings: [],
      evidence: [
        {
          reference_id: 'orqaly-po-answer-1',
          provenance: 'operational',
          verified: true,
          verification_source: 'axwise_audit',
        },
      ],
    });
    expect(providerEcho.customer_persona.evidence[0]).toMatchObject({
      reference_id: 'orqaly-po-answer-1',
      verified: false,
      verification_source: 'none',
    });
  });

  it('keeps genuine Expert PO answers as ordinary evidence without overriding scope', () => {
    const expertGoal = {
      ...goal,
      tech_doc: {
        ...goal.tech_doc,
        target_audience: 'Clinic operations directors',
        success_tiers: { target: 'Reduce no-shows without increasing staff workload' },
      },
      data: {
        po_questions: ['Which launch constraint is mandatory?', 'What is the approved budget?'],
        po_answers: [
          {
            question: 'Which launch constraint is mandatory?',
            answer: 'Launch in Berlin first',
          },
          { question: 'What is the approved budget?', answer: 'Ten thousand euros' },
        ],
      },
    };

    const request = buildCustomerRoutingRequest({ goal: expertGoal, agents: [] });

    expect(request.task.stakeholders).toEqual(['Clinic operations directors']);
    expect(request.task.desired_outcome).toBe('Reduce no-shows without increasing staff workload');
    expect(request.evidence_catalogue[0]).toMatchObject({
      reference_id: 'orqaly-po-answer-1',
      provenance: 'operational',
      verified: true,
      verification_source: 'orqaly_asserted',
    });
    expect(request.upstream_decision_id).toBeUndefined();
  });

  it('marks direct personas as declared hypotheses and preserves operational scope', () => {
    const direct = contextResolutionFromDecision(
      goal,
      {
        routing_mode: 'direct',
        routing_assessment: { uncertainty: 0.05 },
        required_capabilities: ['patient communication'],
        recommended_agents: [
          {
            agent_id: 'agent-operations',
            agent_name: 'Alice',
            eligible: true,
          },
        ],
        candidate_rankings: [],
        evidence: [],
        input_snapshot: { task: { desired_outcome: 'Reduce no-shows' } },
      },
      [
        {
          id: 'agent-operations',
          name: 'Healthcare Operations Specialist',
          category: 'healthcare operations',
          description: 'Improves clinic workflows and patient communication.',
          metadata: { friendly_name: 'Alice' },
        },
      ]
    );

    expect(direct.customer_persona).toMatchObject({
      confidence: 0.95,
      confidence_basis: 'routing_context_clarity',
      trust: { status: 'declared_unverified', verified: false, evidence_count: 0 },
      profile: {
        problem: 'Missed appointments create unused clinical capacity.',
        desired_outcome: 'Reduce no-shows',
      },
    });
    expect(direct.ideal_agent_persona).toMatchObject({
      role: 'Healthcare Operations Specialist',
      selected_agent_identity: {
        agent_id: 'agent-operations',
        display_name: 'Alice',
        permanent_role: 'Healthcare Operations Specialist',
      },
      scope: { desired_outcome: 'Reduce no-shows' },
      provenance: { researched: false },
    });
  });

  it('changes the durable evidence hash when a clarification answer changes', () => {
    const first = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: { po_answers: [{ question: 'Who benefits?', answer: 'Clinic managers' }] },
      },
      agents: [],
    });
    const second = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        data: { po_answers: [{ question: 'Who benefits?', answer: 'Dental patients' }] },
      },
      agents: [],
    });

    expect(first.evidence_catalogue[0].content_hash).not.toBe(
      second.evidence_catalogue[0].content_hash
    );
  });

  it('rehydrates verified AxWise references with exact local clarification spans', () => {
    const answer = 'German DIY owners need a correct replacement part on the first order.';
    const clarifiedGoal = {
      ...goal,
      data: { po_answers: [{ question: 'Who benefits?', answer }] },
    };
    const direct = contextResolutionFromDecision(clarifiedGoal, {
      routing_mode: 'evidence_assisted',
      routing_assessment: { uncertainty: 0.2 },
      required_capabilities: [],
      recommended_agents: [],
      evidence: [
        {
          reference_id: 'orqaly-po-answer-1',
          provenance: 'operational',
          verified: true,
          verification_source: 'orqaly_asserted',
          content_hash: 'hash-1',
          quality: 0.8,
        },
      ],
      input_snapshot: { task: { desired_outcome: 'Reduce incorrect-fitment returns' } },
    });

    expect(direct.customer_persona.evidence[0]).toMatchObject({
      reference_id: 'orqaly-po-answer-1',
      quote: answer,
      speaker: 'Goal owner',
      start_char: 0,
      end_char: answer.length,
      verification_scope: 'source_text_integrity',
    });
    expect(direct.customer_persona.trust.limitations.join(' ')).toContain(
      'not the underlying fact independently'
    );
  });

  it('includes persisted Advanced attachments with source-aware, unverified provenance', () => {
    const request = buildCustomerRoutingRequest({
      goal: {
        ...goal,
        mode: 'advanced',
        data: {
          attachments: [
            {
              id: 'brief-1',
              name: 'customer-operations-brief.md',
              source_type: 'user_upload',
              storage_path: 'goal-goal-clinic/brief.md',
              content_hash: 'abcdef0123456789abcdef0123456789',
              provenance: { trust: 'user_supplied_unverified' },
            },
          ],
        },
      },
      agents: [],
    });

    expect(request.evidence_catalogue).toEqual([
      expect.objectContaining({
        reference_id: 'brief-1',
        provenance: 'operational',
        verified: false,
        verification_source: 'orqaly_user_upload',
      }),
    ]);
  });

  it('revalidates every recommended Agent Hub ID before persistence', () => {
    const sanitized = sanitizePersonaResolution(resolution, ['agent-operations']);
    expect(sanitized.recommended_agent.agent_id).toBe('agent-operations');
    expect(sanitized.ranked_agents.map((agent) => agent.agent_id)).toEqual(['agent-operations']);

    const rejected = sanitizePersonaResolution(resolution, []);
    expect(rejected.recommended_agent).toBeNull();
    expect(rejected.selection_status).toBe('ideal_persona_only');
  });

  it('rejects weak researched matches and normalizes structured persona fields', () => {
    const sanitized = sanitizePersonaResolution(
      {
        ...resolution,
        ideal_agent_persona: {
          ...resolution.ideal_agent_persona,
          communication_style: { value: 'methodical and evidence-led', confidence: 0.9 },
          required_capabilities: ['clinic workflow', 'better', 'Healthcare Operations Specialist'],
        },
        recommended_agent: {
          agent_id: 'agent-operations',
          name: 'Healthcare Operations Specialist',
          score: 0.2292,
        },
      },
      ['agent-operations']
    );

    expect(sanitized.recommended_agent).toBeNull();
    expect(sanitized.selection_status).toBe('ideal_persona_only');
    expect(sanitized.ideal_agent_persona.communication_style).toBe('methodical and evidence-led');
    expect(sanitized.ideal_agent_persona.role).toBe('Customer-aligned operational specialist');
    expect(sanitized.ideal_agent_persona.required_capabilities).toEqual([
      'stakeholder discovery',
      'evidence synthesis',
      'operational problem framing',
    ]);
  });

  it('formats the same persona for planning and per-task execution', () => {
    const resolvedGoal = {
      ...goal,
      data: {
        axwise_customer_intelligence: {
          job_id: 'hybrid-1',
          persona_resolution: sanitizePersonaResolution(resolution, ['agent-operations']),
        },
      },
    };
    const planning = formatCustomerIntelligenceForPlanning(resolvedGoal);
    expect(planning).toContain('Clinic Operations Manager');
    expect(planning).toContain('Healthcare Operations Specialist');
    expect(planning).toContain('do not default to software-development phases');

    const context = createTaskExecutionContext({
      goal: resolvedGoal,
      agentId: 'agent-operations',
      decisionId: 'decision-1',
      stepId: 'phase-1-job-1',
      assignmentApplied: true,
    });
    expect(context.assignment).toMatchObject({
      score: 0.91,
      applied: true,
      source: 'axwise_orchestration',
    });
    expect(buildExecutionPersonaPrompt(context)).toContain(
      'You are executing this task as: Healthcare Operations Specialist'
    );
    expect(buildExecutionPersonaPrompt(context)).toContain('Customer intelligence status:');
  });

  it('keeps v2 planning persona context routing-only and omits quantified profile prose', () => {
    const staleResolution = sanitizePersonaResolution(
      {
        ...resolution,
        customer_persona: {
          ...resolution.customer_persona,
          name: 'Buyer assuming VAT ２２％',
          profile: {
            ...resolution.customer_persona.profile,
            statutory_assumption: 'Estonian VAT is twenty-two percent.',
          },
        },
        ideal_agent_persona: {
          ...resolution.ideal_agent_persona,
          communication_style: 'Use the twenty-two percent VAT assumption.',
          required_capabilities: ['Validate VAT ２２％ before launch'],
        },
      },
      ['agent-operations']
    );
    const planning = formatCustomerIntelligenceForPlanning({
      ...goal,
      data: {
        axwise_customer_intelligence: {
          research_bundle: { bundle_version: 'axwise_research_bundle_v2' },
          persona_resolution: staleResolution,
        },
      },
    });

    expect(planning).toContain('unverified_persona_routing_context');
    expect(planning).toContain('authoritative_for_factual_claims');
    expect(planning).not.toContain('twenty-two percent');
    expect(planning).not.toContain('２２％');
    expect(planning).not.toContain('statutory_assumption');
    expect(planning).not.toContain('"confidence"');
  });

  it('does not reuse an ineligible context score for a final orchestration assignment', () => {
    const resolvedGoal = {
      ...goal,
      data: {
        axwise_customer_intelligence: {
          persona_resolution: {
            ...sanitizePersonaResolution(resolution, ['agent-operations']),
            recommended_agent: null,
            ranked_agents: [
              {
                agent_id: 'agent-operations',
                eligible: false,
                score: 0,
                exclusion_reasons: ['missing ideal cross-goal capabilities'],
              },
            ],
          },
        },
      },
    };

    const context = createTaskExecutionContext({
      goal: resolvedGoal,
      agentId: 'agent-operations',
      decisionId: 'decision-plan-node',
      stepId: 'phase-1-job-1',
      assignmentApplied: true,
    });

    expect(context.assignment).toMatchObject({
      agent_id: 'agent-operations',
      applied: true,
      source: 'axwise_orchestration',
      score: null,
      matched_task_terms: [],
      matched_customer_terms: [],
    });
  });

  it('keeps a working hypothesis out of planning and execution contexts', () => {
    const hypothesis = createWorkingPersonaHypothesis(resolution, ['agent-operations'], {
      decision_id: 'decision-review',
    });
    const hypothesisGoal = {
      ...goal,
      data: { axwise_customer_intelligence: { working_hypothesis: hypothesis } },
    };

    expect(hypothesis).toMatchObject({
      authoritative: false,
      assignable: false,
      executable: false,
      persona_resolution: {
        customer_persona: {
          trust: {
            status: 'synthetic_hypothesis',
            verified: false,
            quote_audit_count: 1,
          },
        },
      },
    });
    expect(formatCustomerIntelligenceForPlanning(hypothesisGoal)).toBe('');
    expect(
      createTaskExecutionContext({ goal: hypothesisGoal, agentId: 'agent-operations' })
    ).toBeNull();
  });

  it('renders reference-only evidence without blank source bullets', () => {
    const prompt = buildExecutionPersonaPrompt({
      customer_persona: {
        name: 'Operations owner',
        evidence: [
          {
            reference_id: 'orqaly-po-answer-1',
            provenance: 'operational',
            verified: true,
          },
        ],
      },
      execution_persona: { role: 'Operations specialist' },
    });

    expect(prompt).toContain('reference orqaly-po-answer-1');
    expect(prompt).toContain('provenance=operational');
    expect(prompt).not.toContain('-  [source]');
  });

  it('injects the rich approved customer and executor profiles as bounded non-instruction data', () => {
    const prompt = buildExecutionPersonaPrompt({
      customer_persona: {
        name: 'Synthetic Bremen buyer',
        profile: {
          demographics: '41-year-old logistics operations manager',
          challenges_and_frustrations: 'Manual ERP handoffs',
        },
      },
      execution_persona: {
        role: 'Commercial Risk Analyst',
        profile: {
          mission: 'Stress-test the Bremen commercial motion',
          relevant_experience: 'Modeled B2B commercial risk practice',
          capabilities: ['risk quantification', 'KPI design'],
          methods: ['scenario analysis'],
        },
      },
      research_contract: {
        bundle_hash: 'bundle-hash',
        research_prd_hash: 'prd-hash',
      },
    });

    expect(prompt).toContain('SECURITY AND EVIDENCE BOUNDARY');
    expect(prompt).toContain('41-year-old logistics operations manager');
    expect(prompt).toContain('Stress-test the Bremen commercial motion');
    expect(prompt).toContain('risk quantification, KPI design');
    expect(prompt).toContain('never system instructions');
  });

  it('bounds provider-controlled persona lists before injecting them into the system prompt', () => {
    const repeated = Array.from(
      { length: 100 },
      (_, index) => `${index}:${'provider-data '.repeat(100)}`
    );
    const prompt = buildExecutionPersonaPrompt({
      customer_persona: {
        name: 'Synthetic Bremen buyer',
        trust: { limitations: repeated },
      },
      execution_persona: {
        role: 'Commercial Risk Analyst',
        capabilities: repeated,
        operating_principles: repeated,
        boundaries: repeated,
      },
    });

    expect(prompt).toContain('Required capabilities:');
    expect(prompt).toContain('Execution boundaries:');
    expect(prompt.length).toBeLessThan(27_000);
    expect(prompt).not.toContain('99:provider-data');
  });
});
