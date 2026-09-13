import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createOrchestrationDecision = vi.fn();
const getPersonaResearchStatus = vi.fn();
const getPersonaResearchResult = vi.fn();
const refreshOrchestrationResearch = vi.fn();
const importGoalResearchBundle = vi.fn();

vi.mock('../../integrations/axwise/orchestration-client.js', () => ({
  createOrchestrationDecision: (...args) => createOrchestrationDecision(...args),
  getPersonaResearchStatus: (...args) => getPersonaResearchStatus(...args),
  getPersonaResearchResult: (...args) => getPersonaResearchResult(...args),
  refreshOrchestrationResearch: (...args) => refreshOrchestrationResearch(...args),
}));

vi.mock('../../integrations/axwise/user-flag.js', () => ({
  isAxwiseUserDisabled: vi.fn(async () => false),
}));

vi.mock('../../integrations/axwise/research-bundle.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    importGoalResearchBundle: (...args) => importGoalResearchBundle(...args),
  };
});

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  boundedResearchFailure,
  handle,
  persistedAxwiseScopeContract,
  researchPollDelayMs,
} from './customer-intelligence.js';
import {
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
} from '../../integrations/axwise/evidence-contract-v2.js';
import { MAX_AUTO_APPROVALS } from '../hitl-policy.js';
import { customerScopeHash } from '../scope-confirmation.js';
import {
  nativeDecisionContractsFixture,
  nativeMaterialQuestionContractsFixture,
  nativeResearchContractFixture,
  nativeScopeResearchAcceptanceFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../approval-audit.js';
import { selectWorkShapePlaybook } from '../work-shape-playbooks.js';

function createAdmin(
  initialGoal,
  {
    orgAgents = [{ agent_id: 'agent-operations' }],
    orgAgentsError = null,
    beforeConditionalUpdate = null,
  } = {}
) {
  let goal = structuredClone(initialGoal);
  let conditionalHookUsed = false;
  const jobs = [];
  const events = [];
  const axwiseCalls = [];
  const agents = [
    {
      id: 'agent-operations',
      name: 'Operations Strategist',
      description: 'Improves real-world workflows.',
      category: 'operations',
      status: 'active',
      capabilities: ['process improvement'],
      metadata: { tools: ['web-search'], availability_status: 'available' },
    },
  ];

  return {
    get goal() {
      return goal;
    },
    jobs,
    events,
    axwiseCalls,
    from(table) {
      if (table === 'goals') {
        return {
          select: () => {
            const filters = [];
            const selectedGoal = () => {
              const matches = filters.every(({ field, value }) => {
                if (field === 'id') return String(goal.id) === String(value);
                if (field === 'user_id') return String(goal.user_id) === String(value);
                return false;
              });
              return matches ? structuredClone(goal) : null;
            };
            const query = {
              eq: (field, value) => {
                filters.push({ field, value });
                return query;
              },
              single: async () => {
                const data = selectedGoal();
                return data
                  ? { data, error: null }
                  : { data: null, error: { message: 'Goal not found' } };
              },
              maybeSingle: async () => ({ data: selectedGoal(), error: null }),
            };
            return query;
          },
          update: (patch) => {
            const filters = [];
            const currentValue = (field) => {
              if (field === 'id') return goal.id;
              if (field === 'status') return goal.status;
              if (field === 'data->axwise_customer_intelligence->>decision_id') {
                return goal.data?.axwise_customer_intelligence?.decision_id ?? null;
              }
              if (field === 'data->axwise_customer_intelligence->>job_id') {
                return goal.data?.axwise_customer_intelligence?.job_id ?? null;
              }
              if (field === 'data->axwise_customer_intelligence->>generation') {
                return goal.data?.axwise_customer_intelligence?.generation ?? null;
              }
              if (field === 'data->scope_revision->>revision_token') {
                return goal.data?.scope_revision?.revision_token ?? null;
              }
              return undefined;
            };
            const apply = () => {
              if (filters.length > 1 && beforeConditionalUpdate && !conditionalHookUsed) {
                conditionalHookUsed = true;
                beforeConditionalUpdate(goal);
              }
              const matches = filters.every(({ field, value, operator }) =>
                operator === 'is'
                  ? currentValue(field) == null && value == null
                  : String(currentValue(field)) === String(value)
              );
              if (!matches) return null;
              goal = { ...goal, ...structuredClone(patch) };
              return { id: goal.id };
            };
            const query = {
              eq: (field, value) => {
                filters.push({ field, value, operator: 'eq' });
                return query;
              },
              is: (field, value) => {
                filters.push({ field, value, operator: 'is' });
                return query;
              },
              select: () => query,
              maybeSingle: async () => ({ data: apply(), error: null }),
              then: (resolve) => resolve({ data: apply(), error: null }),
            };
            return query;
          },
        };
      }
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: structuredClone(agents), error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'org_agents') {
        const query = {
          select: () => query,
          eq: () => query,
          then: (resolve) =>
            resolve({
              data: structuredClone(orgAgents),
              error: orgAgentsError,
            }),
        };
        return {
          ...query,
        };
      }
      if (table === 'agent_jobs') {
        return {
          insert: async (value) => {
            jobs.push(structuredClone(value));
            return { error: null };
          },
        };
      }
      if (table === 'goal_log') {
        return {
          insert: async (value) => {
            events.push(structuredClone(value));
            return { error: null };
          },
        };
      }
      if (table === 'axwise_calls') {
        return {
          insert: async (value) => {
            axwiseCalls.push(structuredClone(value));
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function baseGoal(data = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    org_id: 'org-1',
    title: 'Reduce missed appointments',
    description: 'We need fewer no-shows at our dental clinic.',
    parsed_category: 'healthcare_operations',
    parsed_requirements: '',
    budget_usd: 20,
    iteration: 0,
    status: 'analyzing',
    tech_doc: {
      target_audience: 'Clinic operations managers responsible for appointment capacity',
      problem_statement: 'Missed appointments create unused clinical capacity.',
      success_criteria: ['Reduce no-shows'],
    },
    data,
  };
}

function acceptedScopeGoal() {
  const sourceDecisionId = 'decision-context-1';
  const clarificationScope = {
    business_idea: 'Reduce missed appointments',
    target_customer: 'Clinic owners',
    problem: 'Unused appointment capacity',
    desired_outcome: 'Reduce no-shows by 20%',
  };
  clarificationScope.scope_hash = customerScopeHash(sourceDecisionId, clarificationScope);
  return {
    ...baseGoal({
      axwise_customer_intelligence: {
        status: 'scope_confirmed',
        decision_id: sourceDecisionId,
        clarification_scope: clarificationScope,
        scope_confirmation: {
          status: 'accepted',
          provenance: 'user_confirmed_assumption',
          source_decision_id: sourceDecisionId,
          source_scope_hash: clarificationScope.scope_hash,
          target_customer: clarificationScope.target_customer,
          problem: clarificationScope.problem,
          desired_outcome: clarificationScope.desired_outcome,
        },
        job_id: null,
        request_hash: null,
      },
    }),
    status: 'researching_customer',
  };
}

function activeResearchHandoff({ grounded = false } = {}) {
  const roles = ['Healthcare Operations Specialist'];
  const workTypes = [...(grounded ? ['research_analysis'] : []), 'strategy_planning'].sort();
  const packet = nativeScopePacketFixture({
    admission: {
      version: 'axwise_scope_admission_v1',
      work_types: workTypes,
      geographies: grounded ? ['DE'] : [],
      channels: [],
      success_criteria: ['The accepted customer context passes Gate 1.'],
      required_capabilities: roles,
      requested_actions: [],
    },
    researchContract: nativeResearchContractFixture({
      documentIntent: 'operational_process',
      workTypes,
      geographies: grounded ? ['DE'] : [],
      evidence: {
        mode: grounded ? 'grounded' : 'synthetic',
        grounding_required: grounded,
        required_outputs: [
          'customer_personas',
          ...(grounded ? ['market_sources'] : []),
          'persona_resolution',
          'research_bundle',
        ].sort(),
        external_sources_required: grounded,
      },
      roles,
    }),
  });
  return nativeDecisionContractsFixture(packet);
}

function acceptedTypedResearchGoal(data = {}, { grounded = false, orgId = 'org-1' } = {}) {
  const handoff = activeResearchHandoff({ grounded });
  const acceptance = nativeScopeResearchAcceptanceFixture(handoff, {
    goalId: 'goal-1',
    userId: 'user-1',
    orgId,
  });
  const goal = {
    ...baseGoal({
      ...data,
      axwise_customer_intelligence: {
        status: 'scope_confirmed',
        decision_id: acceptance.proposal_decision_id,
        proposal_decision_id: acceptance.proposal_decision_id,
        research_execution_inputs_hash: handoff.research_execution_inputs_hash,
        request_hash: null,
        job_id: null,
        generation: 1,
        updated_at: '2026-08-24T08:30:00.000Z',
        scope_packet: handoff.scope_packet,
        scope_validation: handoff.scope_validation,
        axwise_scope_confirmation: handoff.scope_confirmation,
        scope_contract_binding: handoff.scope_contract_binding,
        ...(data.axwise_customer_intelligence || {}),
      },
    }),
    org_id: orgId,
    status: 'researching_customer',
  };
  const route = selectWorkShapePlaybook({ goal, scopePacket: handoff.scope_packet });
  goal.data.work_shape_route = route;
  goal.data.scope_admission = {
    version: 1,
    native_scope: true,
    status: 'accepted',
    state_key: 'axwise_customer_intelligence',
    scope_hash: handoff.scope_packet.scope_hash,
    playbook_id: route.playbook_id,
    route_version: route.version,
    accepted_at: acceptance.accepted_at,
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
    research_acceptance: acceptance,
  };
  goal.data.goal_approvals = {
    ...(data.goal_approvals || {}),
    context: {
      ...approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
      approval_basis: 'accepted_typed_scope',
    },
  };
  return goal;
}

function acceptedProviderDecision(goal, routingMode = 'research_assisted', overrides = {}) {
  const handoff = nativeDecisionContractsFixture(
    goal.data.axwise_customer_intelligence.scope_packet
  );
  const acceptance = goal.data.scope_admission.research_acceptance;
  const value = {
    ...decision(routingMode),
    ...handoff,
    scope_research_acceptance: structuredClone(acceptance),
    parent_decision_id: acceptance.proposal_decision_id,
    ...overrides,
  };
  if (value.research_job) {
    value.research_job = {
      ...value.research_job,
      decision_id: value.decision_id,
      scope_contract_binding: structuredClone(handoff.scope_contract_binding),
      scope_research_acceptance: structuredClone(acceptance),
      scope_runtime_binding: structuredClone(handoff.scope_packet.runtime),
    };
  }
  return value;
}

function acceptedProviderJobEnvelope(goal, value = {}) {
  return {
    job_id: goal.data.axwise_customer_intelligence.job_id || 'hybrid-1',
    ...value,
    scope_contract_binding: structuredClone(
      goal.data.axwise_customer_intelligence.scope_contract_binding
    ),
    scope_runtime_binding: structuredClone(
      goal.data.axwise_customer_intelligence.scope_packet.runtime
    ),
    scope_research_acceptance: structuredClone(goal.data.scope_admission.research_acceptance),
  };
}

function acceptedProviderResultEnvelope(goal, value = {}) {
  const acceptance = structuredClone(goal.data.scope_admission.research_acceptance);
  return {
    job_id: goal.data.axwise_customer_intelligence.job_id || 'hybrid-1',
    ...value,
    scope_contract_binding: structuredClone(
      goal.data.axwise_customer_intelligence.scope_contract_binding
    ),
    scope_runtime_binding: structuredClone(
      goal.data.axwise_customer_intelligence.scope_packet.runtime
    ),
    scope_research_acceptance: acceptance,
    job: {
      job_id: goal.data.axwise_customer_intelligence.job_id || 'hybrid-1',
      ...(value.job || {}),
      scope_contract_binding: structuredClone(
        goal.data.axwise_customer_intelligence.scope_contract_binding
      ),
      scope_runtime_binding: structuredClone(
        goal.data.axwise_customer_intelligence.scope_packet.runtime
      ),
      scope_research_acceptance: structuredClone(acceptance),
    },
  };
}

function pinnedNoneEvidencePolicy() {
  const businessEvidenceProfile = createBusinessEvidenceProfile({
    intent: 'operational_process',
    economic_model: 'none',
    market_scope_hash: null,
    fact_requirements: [],
    calculation_requirements: [],
    required_role_slots: [],
  });
  return {
    version: 1,
    research_mode: 'instant',
    grounding_required: false,
    research_fail_closed: true,
    location: null,
    business_evidence_profile: businessEvidenceProfile,
    business_evidence_profile_hash: businessEvidenceProfileHash(businessEvidenceProfile),
  };
}

const personaResolution = {
  version: 'orqaly_dual_persona_v1',
  customer_persona: {
    name: 'Clinic Operations Manager',
    confidence: 0.88,
    profile: { role: 'Clinic Operations Manager' },
    evidence: [
      {
        quote: 'No-shows leave chairs empty.',
        speaker: 'Manager',
        document_id: 'interview-1',
        start_char: 0,
        end_char: 27,
      },
    ],
  },
  ideal_agent_persona: {
    role: 'Healthcare Operations Specialist',
    communication_style: 'direct and reassuring',
    required_capabilities: ['appointment operations'],
    operating_principles: ['Use evidence.'],
  },
  recommended_agent: { agent_id: 'agent-operations', score: 0.9 },
  ranked_agents: [{ agent_id: 'agent-operations', score: 0.9 }],
  evidence_count: 1,
};

function decision(routingMode = 'research_assisted') {
  const proposalContracts = nativeDecisionContractsFixture();
  return {
    ...proposalContracts,
    contract_version: '1.0',
    decision_id: 'decision-context-1',
    request_id: 'request-1',
    task_id: 'goal-1',
    routing_mode: routingMode,
    status: routingMode === 'human_clarification' ? 'clarification_required' : 'recommended',
    scorer_version: 'weighted-direct-v1.0.0',
    router_version: 'deterministic-voi-v1.0.0',
    requires_orqaly_authorization: true,
    routing_assessment: {
      uncertainty: 0.75,
      selected_mode: routingMode,
      reasons:
        routingMode === 'human_clarification' ? ['stakeholders are unspecified or unresolved'] : [],
    },
    required_capabilities: ['process improvement'],
    recommended_agents: [
      {
        agent_id: 'agent-operations',
        agent_name: 'Operations Strategist',
        eligible: true,
        score: 0.9,
      },
    ],
    candidate_rankings: [
      {
        agent_id: 'agent-operations',
        agent_name: 'Operations Strategist',
        eligible: true,
        score: 0.9,
      },
    ],
    evidence: [],
    input_snapshot: { task: { desired_outcome: 'Reduce no-shows' } },
    research_job:
      routingMode === 'research_assisted'
        ? { job_id: 'hybrid-1', status: 'queued', decision_id: 'decision-context-1' }
        : null,
  };
}

describe('customer-intelligence goal stage', () => {
  it('rejects an older unbound queued job while a revision generation is active', async () => {
    const revised = baseGoal({
      context_revision_feedback: 'Run a physical retail campaign instead.',
      scope_revision: {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
        revision_token: 'revision-current',
        desired_outcome: 'Run a physical retail campaign instead.',
      },
      axwise_customer_intelligence: { status: 'revision_requested' },
    });
    const admin = createAdmin(revised);

    const result = await handle(admin, { goalId: revised.id });

    expect(result.status).toBe('stale_scope_revision');
    expect(createOrchestrationDecision).not.toHaveBeenCalled();
    expect(admin.goal).toEqual(revised);
    expect(admin.jobs).toEqual([]);
  });

  it('lets only the scope-admission job bound to the current revision token rebuild', async () => {
    const contracts = nativeDecisionContractsFixture();
    createOrchestrationDecision.mockResolvedValue({ ...decision('direct'), ...contracts });
    const revised = baseGoal({
      context_revision_feedback: 'Run a physical retail campaign instead.',
      scope_revision: {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
        revision_token: 'revision-current',
        desired_outcome: 'Run a physical retail campaign instead.',
      },
      axwise_customer_intelligence: { status: 'revision_requested' },
    });
    const admin = createAdmin(revised);

    const result = await handle(admin, {
      goalId: revised.id,
      scope_revision_token: 'revision-current',
    });

    expect(result.status).toBe('awaiting_context_approval');
    expect(createOrchestrationDecision).toHaveBeenCalledTimes(1);
    expect(admin.goal.data.scope_revision).toMatchObject({
      status: 'incorporated',
      revision_token: 'revision-current',
      replacement_scope_hash: contracts.scope_packet.scope_hash,
    });
    expect(admin.goal.data).not.toHaveProperty('context_revision_feedback');
  });

  it('fails closed when AxWise returns the superseded hash for a correction', async () => {
    const contracts = nativeDecisionContractsFixture();
    createOrchestrationDecision.mockResolvedValue({ ...decision('direct'), ...contracts });
    const revised = baseGoal({
      context_revision_feedback: 'Run a physical retail campaign instead.',
      scope_revision: {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
        revision_token: 'revision-current',
        desired_outcome: 'Run a physical retail campaign instead.',
        source_scope_hash: contracts.scope_packet.scope_hash,
      },
      axwise_customer_intelligence: { status: 'revision_requested' },
    });
    const admin = createAdmin(revised);

    const result = await handle(admin, {
      goalId: revised.id,
      scope_revision_token: 'revision-current',
    });

    expect(result).toMatchObject({
      status: 'needs_human',
      reason: 'scope_revision_not_applied',
    });
    expect(admin.goal).toMatchObject({
      status: 'needs_human',
      data: {
        failure_code: 'axwise_scope_revision_not_applied',
        scope_revision: {
          status: 'rebuild_rejected',
          rejected_scope_hash: contracts.scope_packet.scope_hash,
        },
        axwise_customer_intelligence: {
          status: 'scope_revision_rejected',
          scope_packet: null,
        },
      },
    });
  });

  it('stops a worker loaded before a revision token rotates from landing stale output', async () => {
    const contracts = nativeDecisionContractsFixture();
    createOrchestrationDecision.mockResolvedValue({ ...decision('direct'), ...contracts });
    const original = baseGoal({ axwise_customer_intelligence: {} });
    const admin = createAdmin(original, {
      beforeConditionalUpdate: (currentGoal) => {
        currentGoal.data.scope_revision = {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-rotated-after-load',
          desired_outcome: 'Use the corrected scope.',
        };
        currentGoal.data.context_revision_feedback = 'Use the corrected scope.';
      },
    });

    const result = await handle(admin, { goalId: original.id });

    expect(result.status).toBe('stale_generation');
    expect(admin.goal.data.scope_revision.revision_token).toBe('revision-rotated-after-load');
    expect(admin.goal.data.axwise_customer_intelligence.scope_packet).toBeUndefined();
  });

  it('preserves an initial native handoff when a refreshed decision omits handoff fields', () => {
    const initial = {
      scope_packet: { version: 'axwise_scope_packet_v1', scope_hash: 'a'.repeat(64) },
      scope_validation: { version: 'axwise_scope_validation_v1' },
      quality_contract: { version: 'axwise_quality_contract_v1' },
      axwise_scope_confirmation: { status: 'proceed_or_edit' },
    };
    expect({ ...initial, ...persistedAxwiseScopeContract({ decision_id: 'refreshed' }) }).toEqual(
      initial
    );
  });

  it('fails closed on a partial native handoff instead of persisting it', () => {
    expect(() =>
      persistedAxwiseScopeContract({
        scope_packet: { version: 'axwise_scope_packet_v1' },
      })
    ).toThrow(/partial scope handoff/);
  });

  it('persists a validated native handoff on the completed direct path', async () => {
    const contracts = nativeDecisionContractsFixture();
    createOrchestrationDecision.mockResolvedValue({ ...decision('direct'), ...contracts });
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      scope_packet: { scope_hash: contracts.scope_packet.scope_hash },
      scope_validation: {
        version: 'axwise_scope_validation_v1',
        scope_hash: contracts.scope_packet.scope_hash,
      },
      quality_contract: { version: 'axwise_quality_contract_v1' },
      axwise_scope_confirmation: {
        status: 'proceed_or_edit',
        scope_hash: contracts.scope_packet.scope_hash,
      },
    });
    expect(admin.goal.data.scope_admission).toMatchObject({
      version: 1,
      status: 'awaiting_confirmation',
      state_key: 'axwise_customer_intelligence',
      scope_hash: contracts.scope_packet.scope_hash,
    });
  });

  it('persists a validated native handoff before evaluating provider clarification', async () => {
    const contracts = nativeDecisionContractsFixture();
    createOrchestrationDecision.mockResolvedValue({
      ...decision('human_controlled'),
      ...contracts,
    });
    const vagueGoal = baseGoal();
    delete vagueGoal.tech_doc.target_audience;
    const admin = createAdmin(vagueGoal);

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      scope_packet: { scope_hash: contracts.scope_packet.scope_hash },
      scope_validation: { scope_hash: contracts.scope_packet.scope_hash },
      quality_contract: { version: 'axwise_quality_contract_v1' },
      axwise_scope_confirmation: { scope_hash: contracts.scope_packet.scope_hash },
      status: 'scope_proposed',
      persona_resolution: null,
    });
  });

  it('does not retry deterministic credentials/configuration failures or cancellation', () => {
    expect(
      boundedResearchFailure(
        { error: 'invalid credential configuration', retryable: true },
        'failed'
      )
    ).toMatchObject({ code: 'research_service_not_ready', retryable: false });
    expect(boundedResearchFailure({ retryable: true }, 'cancelled')).toMatchObject({
      code: 'research_cancelled',
      retryable: false,
    });
  });
  beforeEach(() => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    vi.stubEnv('AXWISE_RESEARCH_POLL_MS', '1000');
    global.fetch = vi.fn(async () => ({ ok: true }));
    createOrchestrationDecision.mockReset();
    getPersonaResearchStatus.mockReset();
    getPersonaResearchResult.mockReset();
    refreshOrchestrationResearch.mockReset();
    importGoalResearchBundle.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['paused', 'cancelled', 'failed', 'completed', 'completed_with_warnings', 'needs_human'])(
    'does not revive a %s goal when a queued stage arrives late',
    async (status) => {
      const admin = createAdmin({ ...baseGoal(), status });

      const result = await handle(admin, { goalId: 'goal-1' });

      expect(result).toMatchObject({
        status: 'stage_not_eligible',
        goalStatus: status,
      });
      expect(admin.goal.status).toBe(status);
      expect(createOrchestrationDecision).not.toHaveBeenCalled();
      expect(getPersonaResearchStatus).not.toHaveBeenCalled();
      expect(admin.events).toEqual([]);
    }
  );

  it('asks AxWise to propose scope first and starts research only after exact owner acceptance', async () => {
    const proposal = activeResearchHandoff();
    createOrchestrationDecision.mockResolvedValue({
      ...decision('research_assisted'),
      ...proposal,
      research_job: null,
    });
    const proposalAdmin = createAdmin(baseGoal());

    const proposed = await handle(proposalAdmin, { goalId: 'goal-1' });

    expect(proposed).toMatchObject({ status: 'awaiting_context_approval' });
    expect(proposalAdmin.goal.data.scope_admission.status).toBe('awaiting_confirmation');
    expect(proposalAdmin.goal.data.axwise_customer_intelligence.job_id).toBeNull();
    expect(proposalAdmin.goal.data.axwise_customer_intelligence.research_execution_preview).toEqual(
      {
        version: 'orqaly_scope_research_execution_preview_v1',
        proposal_decision_id: 'decision-context-1',
        scope_hash: proposal.scope_packet.scope_hash,
        contract_hash: proposal.scope_packet.research_contract.contract_hash,
        research_execution_inputs_hash: proposal.research_execution_inputs_hash,
        destination: 'Google Gemini API',
        purpose: 'Scope-bound customer, executor, and evidence research',
        data_categories: [
          'Accepted goal/task prose and typed scope/constraints',
          'Business/research brief, questions, geography, and evidence requirements',
          'Executor candidate role/profile/capability fields needed for matching',
          'Generated synthetic participant/interview/persona/PRD content',
          'Public-source snippets and grounded evidence',
        ],
        excluded_categories: [
          'Credentials and API secrets',
          'Payment data',
          'Raw auth/session tokens',
          'Unrelated goals',
        ],
        model: 'gemini-3.8-flash',
        maximum_cost_usd: expect.any(Number),
        estimated_cost_usd: expect.any(Number),
        maximum_latency_ms: expect.any(Number),
        estimated_latency_ms: expect.any(Number),
      }
    );
    expect(proposalAdmin.jobs).toEqual([]);

    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockReset();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'queued', jobId: 'hybrid-1' });
    expect(createOrchestrationDecision.mock.calls[0][0].scope_packet).toEqual(
      acceptedGoal.data.axwise_customer_intelligence.scope_packet
    );
    expect(admin.goal.status).toBe('researching_customer');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      job_id: 'hybrid-1',
      status: 'queued',
      routing_mode: 'research_assisted',
      candidate_agent_ids: ['agent-operations'],
    });
    expect(admin.jobs).toEqual([
      expect.objectContaining({
        status: 'queued',
        payload: expect.objectContaining({
          type: 'orchestrate-goal',
          action: 'customer-intelligence',
          goalId: 'goal-1',
          research_poll: true,
          research_decision_id: 'decision-context-1',
          research_job_id: 'hybrid-1',
        }),
      }),
    ]);
    expect(admin.axwiseCalls).toEqual([
      expect.objectContaining({
        integration_point: 'goal.customer-intelligence',
        status: 'ok',
        applied_outcome: 'context-routed',
      }),
    ]);
    expect(createOrchestrationDecision.mock.calls[0][0]).toMatchObject({
      upstream_decision_id: 'proposal-decision-1',
      scope_research_acceptance: acceptedGoal.data.scope_admission.research_acceptance,
      task: { domain: 'strategy_planning' },
      research_policy: { allow_hybrid_research: true, maximum_research_iterations: 1 },
      planning: null,
    });
  });

  it('queues the next bounded poll while durable AxWise research is still running', async () => {
    vi.useFakeTimers();
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0; // Simulate the worker claiming the first durable poll.
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, {
        status: 'running',
        stage: 'grounding_market',
        progress_percentage: 74,
        elapsed_ms: 59_000,
      })
    );

    const resultPromise = handle(admin, { goalId: 'goal-1' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result).toMatchObject({ status: 'running', jobId: 'hybrid-1' });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      current_stage: 'grounding_market',
      progress_percentage: 74,
    });
    expect(admin.jobs).toEqual([
      expect.objectContaining({
        status: 'queued',
        payload: expect.objectContaining({
          type: 'orchestrate-goal',
          action: 'customer-intelligence',
          goalId: 'goal-1',
          research_poll: true,
          research_decision_id: 'decision-context-1',
          research_job_id: 'hybrid-1',
        }),
      }),
    ]);
  });

  it('binds the first and every subsequent research poll to the active scope revision', async () => {
    vi.useFakeTimers();
    const acceptedGoal = acceptedTypedResearchGoal();
    const packet = acceptedGoal.data.axwise_customer_intelligence.scope_packet;
    acceptedGoal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-evidence-2',
      kind: 'evidence_refresh',
      desired_outcome: 'Refresh the evidence for the current scope.',
      source_scope_hash: packet.scope_hash,
    };
    Object.assign(acceptedGoal.data.axwise_customer_intelligence, {
      status: 'evidence_requested',
      user_research_request: { feedback: 'Refresh the evidence for the current scope.' },
    });
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);

    const initial = await handle(admin, {
      goalId: 'goal-1',
      scope_revision_token: 'revision-evidence-2',
    });

    expect(initial).toMatchObject({ status: 'queued', jobId: 'hybrid-1' });
    expect(createOrchestrationDecision.mock.calls[0][1].idempotencyKey).toContain(
      ':scope-revision:revision-evidence-2'
    );
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0].payload).toMatchObject({
      action: 'customer-intelligence',
      research_poll: true,
      research_decision_id: 'decision-context-1',
      research_job_id: 'hybrid-1',
      scope_revision_token: 'revision-evidence-2',
    });

    admin.jobs.length = 0; // Simulate the first poll being claimed.
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'running' })
    );
    const continuationPromise = handle(admin, {
      goalId: 'goal-1',
      research_poll: true,
      research_decision_id: 'decision-context-1',
      research_job_id: 'hybrid-1',
      scope_revision_token: 'revision-evidence-2',
    });
    await vi.runAllTimersAsync();
    const continuation = await continuationPromise;
    vi.useRealTimers();

    expect(continuation.status).toBe('running');
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0].payload).toMatchObject({
      action: 'customer-intelligence',
      research_poll: true,
      scope_revision_token: 'revision-evidence-2',
    });
  });

  it('rejects a stale research poll after scope acceptance cleared the active run', async () => {
    const admin = createAdmin({
      ...baseGoal({
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          decision_id: 'decision-context-1',
          job_id: null,
          request_hash: null,
        },
      }),
      status: 'researching_customer',
    });

    const result = await handle(admin, {
      goalId: 'goal-1',
      research_poll: true,
      research_decision_id: 'decision-context-1',
      research_job_id: 'hybrid-1',
    });

    expect(result.status).toBe('stale_research_poll');
    expect(createOrchestrationDecision).not.toHaveBeenCalled();
    expect(getPersonaResearchStatus).not.toHaveBeenCalled();
  });

  it('rejects a research poll when either persisted or payload run identity is empty', async () => {
    const admin = createAdmin({
      ...baseGoal({
        axwise_customer_intelligence: {
          status: 'running',
          decision_id: null,
          job_id: 'hybrid-1',
        },
      }),
      status: 'researching_customer',
    });

    const result = await handle(admin, {
      goalId: 'goal-1',
      research_poll: true,
      research_decision_id: '',
      research_job_id: 'hybrid-1',
    });

    expect(result.status).toBe('stale_research_poll');
    expect(getPersonaResearchStatus).not.toHaveBeenCalled();
  });

  it('keeps configured research polling between one and fifteen seconds', () => {
    expect(researchPollDelayMs({})).toBe(3_000);
    expect(researchPollDelayMs({ AXWISE_RESEARCH_POLL_MS: '0' })).toBe(1_000);
    expect(researchPollDelayMs({ AXWISE_RESEARCH_POLL_MS: '25000' })).toBe(15_000);
  });

  it('keeps an accepted scope retryable when the deployment kill switch is closed', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'false');
    const admin = createAdmin(acceptedScopeGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      status: 'retry_pending',
      reason: 'confirmed_scope_dispatch_failed',
    });
    expect(admin.goal).toMatchObject({
      status: 'researching_customer',
      data: {
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          scope_confirmation: { status: 'accepted' },
        },
      },
    });
    expect(admin.goal.data.goal_approvals).toBeUndefined();
    expect(createOrchestrationDecision).not.toHaveBeenCalled();
  });

  it('keeps an accepted scope retryable when Agent Hub membership cannot be loaded', async () => {
    const admin = createAdmin(acceptedScopeGoal(), {
      orgAgentsError: { message: 'organization mapping unavailable' },
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      status: 'retry_pending',
      reason: 'confirmed_scope_dispatch_failed',
    });
    expect(admin.goal.status).toBe('researching_customer');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'scope_confirmed',
      last_dispatch_error: expect.stringContaining('organization-scoped Agent Hub catalogue'),
      scope_confirmation: { status: 'accepted' },
    });
    expect(admin.goal.data.goal_approvals).toBeUndefined();
    expect(createOrchestrationDecision).not.toHaveBeenCalled();
  });

  it.each([
    ['initial dispatch', {}],
    [
      'explicit retry dispatch',
      {
        axwise_customer_intelligence: {
          version: 'orqaly_customer_intelligence_v2',
          status: 'retry_queued',
          retry_count: 1,
          decision_id: null,
          job_id: null,
          request_hash: null,
        },
      },
    ],
  ])('blocks a new pinned-v2 %s when execution rollout is closed', async (_label, data) => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', '');
    const admin = createAdmin({
      ...baseGoal({ research_policy: pinnedNoneEvidencePolicy(), ...data }),
      ...(data.axwise_customer_intelligence ? { status: 'researching_customer' } : {}),
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'required_research_blocked' });
    expect(createOrchestrationDecision).not.toHaveBeenCalled();
  });

  it('polls and imports an already-dispatched v2 job after execution rollout is closed', async () => {
    const canaryOrgId = '11111111-1111-4111-8111-111111111111';
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'none');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', canaryOrgId);
    const researchPolicy = pinnedNoneEvidencePolicy();
    const acceptedGoal = acceptedTypedResearchGoal(
      { research_policy: researchPolicy },
      { orgId: canaryOrgId }
    );
    const initialScopeContracts = acceptedGoal.data.axwise_customer_intelligence;
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);

    expect(await handle(admin, { goalId: 'goal-1' })).toMatchObject({
      status: 'queued',
      jobId: 'hybrid-1',
    });

    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'false');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', '');
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      acceptedProviderDecision(admin.goal, 'evidence_assisted', {
        decision_id: 'decision-context-2',
        parent_decision_id: 'decision-context-1',
        research_job: null,
      })
    );
    const researchBundle = {
      version: 'axwise_research_bundle_v2',
      run_id: 'hybrid-1',
      bundle_hash: 'b'.repeat(64),
      persona_resolution: personaResolution,
    };
    getPersonaResearchResult.mockResolvedValue(
      acceptedProviderResultEnvelope(admin.goal, {
        status: 'completed',
        result: { data: { research_bundle: researchBundle } },
      })
    );
    const pointer = {
      run_id: 'db-research-run-1',
      external_run_id: 'hybrid-1',
      bundle_version: 'axwise_research_bundle_v2',
      bundle_hash: 'b'.repeat(64),
      research_prd_hash: 'c'.repeat(64),
      evidence_profile_hash: researchPolicy.business_evidence_profile_hash,
      fact_manifest_hash: 'd'.repeat(64),
      calculation_manifest_hash: 'e'.repeat(64),
      fact_count: 0,
      calculation_count: 0,
      required_role_slots: [],
      selected_persona_ids: ['customer-1'],
      source_count: 0,
      persona_count: 1,
      artifact_count: 1,
      scope_contract_hash: initialScopeContracts.scope_packet.research_contract.contract_hash,
      scope_hash: initialScopeContracts.scope_packet.scope_hash,
      scope_research_acceptance_hash:
        acceptedGoal.data.scope_admission.research_acceptance.binding_hash,
    };
    importGoalResearchBundle.mockResolvedValue({ pointer });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human' });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      scope_packet: { scope_hash: initialScopeContracts.scope_packet.scope_hash },
      scope_validation: { scope_hash: initialScopeContracts.scope_packet.scope_hash },
      quality_contract: { version: 'axwise_quality_contract_v1' },
      axwise_scope_confirmation: {
        scope_hash: initialScopeContracts.scope_packet.scope_hash,
      },
    });
    expect(createOrchestrationDecision).toHaveBeenCalledTimes(1);
    expect(getPersonaResearchStatus).toHaveBeenCalledWith('hybrid-1', {
      orgId: canaryOrgId,
      userId: 'user-1',
    });
    expect(getPersonaResearchResult).toHaveBeenCalledWith('hybrid-1', {
      orgId: canaryOrgId,
      userId: 'user-1',
    });
    expect(importGoalResearchBundle).toHaveBeenCalledWith(
      admin,
      expect.any(Object),
      researchBundle,
      { externalRunId: 'hybrid-1' }
    );
    expect(admin.goal.data.axwise_customer_intelligence.research_bundle).toEqual(pointer);
    expect(admin.goal.data.goal_approvals.context).toMatchObject({ status: 'invalidated' });
  });

  it('uses the research retry generation in AxWise idempotency without changing duplicate keys', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('research_assisted'));
    const retryData = {
      research_policy: {
        version: 1,
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
        location: 'Estonia',
      },
      axwise_customer_intelligence: {
        version: 'orqaly_customer_intelligence_v2',
        status: 'retry_queued',
        retry_count: 1,
      },
    };
    const firstAdmin = createAdmin(baseGoal(retryData));
    const duplicateAdmin = createAdmin(baseGoal(retryData));

    await handle(firstAdmin, { goalId: 'goal-1' });
    await handle(duplicateAdmin, { goalId: 'goal-1' });

    const firstKey = createOrchestrationDecision.mock.calls[0][1].idempotencyKey;
    const duplicateKey = createOrchestrationDecision.mock.calls[1][1].idempotencyKey;
    expect(firstKey).toMatch(/:retry:1$/);
    expect(duplicateKey).toBe(firstKey);
  });

  it('persists a bounded failure reason, stage, and retryability without upstream detail', async () => {
    const admin = createAdmin({
      ...baseGoal({
        research_policy: {
          version: 1,
          research_mode: 'grounded_deep',
          grounding_required: true,
          research_fail_closed: true,
          location: 'Estonia',
        },
        axwise_customer_intelligence: {
          version: 'orqaly_customer_intelligence_v2',
          status: 'running',
          decision_id: 'decision-1',
          job_id: 'job-1',
          current_stage: 'grounding_market',
        },
      }),
      status: 'researching_customer',
    });
    const existing = admin.goal.data.axwise_customer_intelligence;
    const routingRequest = (
      await import('../../integrations/axwise/customer-intelligence.js')
    ).buildCustomerRoutingRequest({
      goal: admin.goal,
      agents: [
        {
          id: 'agent-operations',
          name: 'Operations Strategist',
          description: 'Improves real-world workflows.',
          category: 'operations',
          status: 'active',
          capabilities: ['process improvement'],
          metadata: { tools: ['web-search'], availability_status: 'available' },
        },
      ],
    });
    const { createHash } = await import('node:crypto');
    existing.request_hash = createHash('sha256')
      .update(JSON.stringify(routingRequest))
      .digest('hex')
      .slice(0, 20);
    getPersonaResearchStatus.mockResolvedValue({
      status: 'failed',
      stage: 'grounding_market',
      error: 'evidence source rejected: https://private-provider.invalid?secret=abc',
      retryable: true,
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'required_research_blocked' });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'required_research_blocked',
      reason: 'Required market evidence could not be verified.',
      current_stage: 'grounding_market',
      research_failure: {
        code: 'grounding_failed',
        message: 'Required market evidence could not be verified.',
        stage: 'grounding_market',
        retryable: true,
      },
    });
    expect(JSON.stringify(admin.goal.data.axwise_customer_intelligence)).not.toContain(
      'private-provider'
    );
    expect(JSON.stringify(admin.events)).not.toContain('private-provider');
  });

  it('persists bounded AxWise diagnostics when customer routing falls back', async () => {
    createOrchestrationDecision.mockRejectedValue(
      Object.assign(
        new Error(
          'AxWise orchestration API error: HTTP 404 [AXWISE_UPSTREAM_DECISION_NOT_FOUND] (request trace-404)'
        ),
        {
          status: 404,
          code: 'AXWISE_UPSTREAM_DECISION_NOT_FOUND',
          requestId: 'trace-404',
        }
      )
    );
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'degraded',
      error_code: 'AXWISE_UPSTREAM_DECISION_NOT_FOUND',
      http_status: 404,
      axwise_request_id: 'trace-404',
    });
    expect(admin.axwiseCalls).toEqual([
      expect.objectContaining({
        integration_point: 'goal.customer-intelligence',
        status: 'error',
        degraded: true,
        applicable_conditions: {
          error_code: 'AXWISE_UPSTREAM_DECISION_NOT_FOUND',
          http_status: 404,
          axwise_request_id: 'trace-404',
        },
      }),
    ]);
  });

  it('never degrades past a malformed native scope handoff', async () => {
    createOrchestrationDecision.mockResolvedValue({
      ...decision('direct'),
      scope_packet: { version: 'axwise_scope_packet_v1' },
    });
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'provider_contract_failed' });
    expect(admin.goal).toMatchObject({
      status: 'needs_human',
      data: {
        failure_code: 'axwise_context_decision_invalid',
        axwise_customer_intelligence: {
          status: 'provider_contract_failed',
          clarification_code: 'provider_contract_invalid',
          contract_error_code: 'COMPACT_SCOPE_PACKET_INVALID',
        },
      },
    });
    expect(admin.goal.data.goal_approvals).toBeUndefined();
  });

  it('keeps a confirmed scope fail-closed when its chained provider decision cannot be created', async () => {
    const clarificationScope = {
      business_idea: 'Reduce missed appointments',
      target_customer: 'Clinic owners',
      problem: 'Unused appointment capacity',
      desired_outcome: 'Reduce no-shows by 20%',
    };
    clarificationScope.scope_hash = customerScopeHash('decision-context-1', clarificationScope);
    const upstreamError = Object.assign(new Error('AxWise upstream decision was not found'), {
      status: 404,
      code: 'AXWISE_UPSTREAM_DECISION_NOT_FOUND',
      requestId: 'trace-scope-404',
    });
    createOrchestrationDecision.mockRejectedValue(upstreamError);
    const admin = createAdmin({
      ...baseGoal({
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          decision_id: 'decision-context-1',
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            provenance: 'user_confirmed_assumption',
            source_decision_id: 'decision-context-1',
            source_scope_hash: clarificationScope.scope_hash,
            target_customer: clarificationScope.target_customer,
            problem: clarificationScope.problem,
            desired_outcome: clarificationScope.desired_outcome,
          },
          job_id: null,
          request_hash: null,
        },
      }),
      status: 'researching_customer',
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'provider_contract_failed' });
    expect(admin.goal).toMatchObject({
      status: 'needs_human',
      data: {
        failure_code: 'axwise_confirmed_scope_dispatch_failed',
        axwise_customer_intelligence: {
          status: 'provider_contract_failed',
          clarification_kind: 'hard_block',
          clarification_code: 'provider_contract_invalid',
          job_id: null,
          request_hash: null,
          last_dispatch_error: 'AxWise upstream decision was not found',
          scope_confirmation: expect.objectContaining({
            status: 'accepted',
            source_decision_id: 'decision-context-1',
          }),
        },
      },
    });
    expect(admin.goal.data.axwise_customer_intelligence.persona_resolution).toBeNull();
    expect(admin.goal.data.goal_approvals).toBeUndefined();
    expect(admin.events.some((event) => event.event_type === 'awaiting_context_approval')).toBe(
      false
    );
  });

  it('treats a local invalid-decision error after scope acceptance as non-retryable', async () => {
    const clarificationScope = {
      business_idea: 'Reduce missed appointments',
      target_customer: 'Clinic owners',
      problem: 'Unused appointment capacity',
      desired_outcome: 'Reduce no-shows by 20%',
    };
    clarificationScope.scope_hash = customerScopeHash('decision-context-1', clarificationScope);
    createOrchestrationDecision.mockResolvedValue({
      contract_version: '1.0',
      task_id: 'goal-1',
      routing_mode: 'direct',
      requires_orqaly_authorization: true,
    });
    const admin = createAdmin({
      ...baseGoal({
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          decision_id: 'decision-context-1',
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            provenance: 'user_confirmed_assumption',
            source_decision_id: 'decision-context-1',
            source_scope_hash: clarificationScope.scope_hash,
            target_customer: clarificationScope.target_customer,
            problem: clarificationScope.problem,
            desired_outcome: clarificationScope.desired_outcome,
          },
          job_id: null,
          request_hash: null,
        },
      }),
      status: 'researching_customer',
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'provider_contract_failed' });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'provider_contract_failed',
      error_code: 'ORQALY_AXWISE_DECISION_INVALID',
      scope_confirmation: expect.objectContaining({ status: 'accepted' }),
    });
    expect(admin.goal.data.goal_approvals).toBeUndefined();
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'decision-unrelated'],
  ])('fails closed when an accepted-scope response has a %s parent link', async (_, parentId) => {
    const response = {
      ...decision('direct'),
      decision_id: 'decision-context-2',
    };
    if (parentId) response.parent_decision_id = parentId;
    createOrchestrationDecision.mockResolvedValue(response);
    const admin = createAdmin(acceptedScopeGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'provider_contract_failed' });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'provider_contract_failed',
      error_code: 'ORQALY_AXWISE_UPSTREAM_LINK_INVALID',
      scope_confirmation: expect.objectContaining({ status: 'accepted' }),
    });
    expect(admin.goal.data.goal_approvals).toBeUndefined();
  });

  it('fails closed in needs_human when required grounded research cannot reach AxWise', async () => {
    createOrchestrationDecision.mockRejectedValue(new Error('AxWise unavailable'));
    const admin = createAdmin(
      baseGoal({
        research_policy: {
          version: 1,
          research_mode: 'grounded_deep',
          grounding_required: true,
          research_fail_closed: true,
          location: 'Bremen, Germany',
        },
      })
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'required_research_blocked' });
    expect(admin.goal.status).toBe('needs_human');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'required_research_blocked',
      degraded: false,
      persona_resolution: null,
    });
    expect(admin.goal.data.goal_approvals).toBeUndefined();
  });

  it('lets typed scope admission resolve geography before enforcing grounded research', async () => {
    const contracts = activeResearchHandoff({ grounded: true });
    createOrchestrationDecision.mockResolvedValue({
      ...decision('research_assisted'),
      ...contracts,
      research_job: null,
    });
    const admin = createAdmin(
      baseGoal({
        research_policy: {
          version: 1,
          research_mode: 'grounded_fast',
          grounding_required: true,
          research_fail_closed: true,
          location: null,
        },
      })
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(createOrchestrationDecision).toHaveBeenCalledTimes(1);
    expect(
      admin.goal.data.axwise_customer_intelligence.scope_packet.research_contract
    ).toMatchObject({ geographies: ['DE'], evidence: { mode: 'grounded' } });
  });

  it('skips research for a direct decision and waits for context confirmation', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('direct'));
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'awaiting_context_approval', routingMode: 'direct' });
    expect(getPersonaResearchStatus).not.toHaveBeenCalled();
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence.persona_resolution).toBeNull();
    expect(admin.jobs).toHaveLength(0);
    expect(admin.goal.data.goal_approvals.context).toMatchObject({ status: 'pending' });
  });

  it('requires scope acceptance before enforcing a grounded execution route', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('direct'));
    const admin = createAdmin(
      baseGoal({
        research_policy: {
          version: 1,
          research_mode: 'grounded_deep',
          grounding_required: true,
          research_fail_closed: true,
          location: 'Bremen, Germany',
        },
      })
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'awaiting_context_approval' });
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence.job_id).toBeNull();
  });

  it.each(['auto', 'instant'])(
    'accepts a direct decision for trivial fail-closed %s routing',
    async (researchMode) => {
      createOrchestrationDecision.mockResolvedValue(decision('direct'));
      const admin = createAdmin(
        baseGoal({
          research_policy: {
            version: 1,
            research_mode: researchMode,
            grounding_required: false,
            research_fail_closed: true,
            location: null,
          },
        })
      );

      const result = await handle(admin, { goalId: 'goal-1' });

      expect(result).toMatchObject({
        status: 'awaiting_context_approval',
        routingMode: 'direct',
      });
      expect(admin.goal.status).toBe('awaiting_context_approval');
      expect(admin.goal.data.goal_approvals.context).toMatchObject({ status: 'pending' });
      expect(createOrchestrationDecision.mock.calls[0][0].research_policy).toMatchObject({
        required: false,
        minimum_mode: researchMode,
        grounding_required: false,
        fail_closed: true,
      });
    }
  );

  it('keeps a selected optional Auto run fail-closed when that run fails', async () => {
    const acceptedGoal = acceptedTypedResearchGoal({
      research_policy: {
        version: 1,
        research_mode: 'auto',
        grounding_required: false,
        research_fail_closed: true,
        location: null,
      },
    });
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);

    expect(await handle(admin, { goalId: 'goal-1' })).toMatchObject({
      status: 'queued',
      jobId: 'hybrid-1',
    });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, {
        status: 'failed',
        stage: 'synthetic_interviews',
        error: 'selected research failed',
        retryable: true,
      })
    );

    const result = await handle(admin, {
      goalId: 'goal-1',
      research_poll: true,
      research_decision_id: 'decision-context-1',
      research_job_id: 'hybrid-1',
    });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'required_research_blocked' });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'required_research_blocked',
      research_failure: {
        code: 'research_failed',
        stage: 'synthetic_interviews',
        retryable: true,
      },
    });
  });

  it('requires scope acceptance before enforcing an ungrounded execution route', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('direct'));
    const admin = createAdmin(
      baseGoal({
        research_policy: {
          version: 1,
          research_mode: 'instant',
          required: true,
          grounding_required: false,
          research_fail_closed: false,
          location: null,
        },
      })
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'awaiting_context_approval' });
    expect(admin.goal.data.axwise_customer_intelligence.job_id).toBeNull();
    expect(createOrchestrationDecision.mock.calls[0][0].research_policy).toMatchObject({
      required: true,
      fail_closed: true,
    });
  });

  it('stores one AxWise working scope instead of manufacturing three PO questions', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('human_clarification'));
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.po_questions).toBeUndefined();
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'scope_proposed',
      persona_resolution: null,
    });
    expect(admin.jobs).toEqual([]);
  });

  it.each([
    'missing authority requires human clarification',
    'provider-specific unexplained escalation',
    'consequential contradictory evidence requires human clarification',
  ])('defers provider escalation %j until after typed scope acceptance', async (reason) => {
    const response = decision('human_clarification');
    response.routing_assessment.reasons = [reason];
    createOrchestrationDecision.mockResolvedValue(response);
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'awaiting_context_approval' });
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'scope_proposed',
    });
  });

  it('shows a future-router typed proposal before consuming its route semantics', async () => {
    const response = decision('human_clarification');
    response.router_version = 'deterministic-voi-v2.0.0';
    createOrchestrationDecision.mockResolvedValue(response);
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'awaiting_context_approval' });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'scope_proposed',
      persona_resolution: null,
    });
  });

  it('offers typed scope confirmation before requiring an available organization agent', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('human_clarification'));
    const admin = createAdmin(baseGoal(), { orgAgents: [] });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'awaiting_context_approval' });
    expect(admin.goal.data.axwise_customer_intelligence.clarification_scope).toBeUndefined();
  });

  it('does not let a legacy scope confirmation bypass the typed proposal gate', async () => {
    const clarificationScope = {
      business_idea: 'Reduce missed appointments',
      target_customer: 'Clinic owners',
      problem: 'Unused appointment capacity',
      desired_outcome: 'Reduce no-shows by 20%',
    };
    clarificationScope.scope_hash = customerScopeHash('decision-context-1', clarificationScope);
    createOrchestrationDecision.mockResolvedValue({
      ...decision('direct'),
      decision_id: 'decision-context-2',
      parent_decision_id: 'decision-context-1',
    });
    const admin = createAdmin({
      ...baseGoal({
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: 'decision-context-1',
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            source_decision_id: 'decision-context-1',
            source_scope_hash: clarificationScope.scope_hash,
            provenance: 'user_confirmed_assumption',
            accepted_at: '2026-08-22T12:00:00.000Z',
            target_customer: 'Clinic owners',
            problem: 'Unused appointment capacity',
            desired_outcome: 'Reduce no-shows by 20%',
          },
        },
      }),
      status: 'researching_customer',
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      status: 'awaiting_context_approval',
      routingMode: 'direct',
    });
    expect(createOrchestrationDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        upstream_decision_id: 'decision-context-1',
        task: expect.objectContaining({
          stakeholders: ['Clinic owners'],
          objective: expect.stringContaining('Unused appointment capacity'),
        }),
        evidence_catalogue: expect.arrayContaining([
          expect.objectContaining({
            reference_id: 'orqaly-owner-scope-confirmation',
            verified: false,
            verification_source: 'none',
          }),
        ]),
      }),
      expect.any(Object)
    );
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      decision_id: 'decision-context-2',
      routing_mode: 'direct',
      status: 'scope_proposed',
      persona_resolution: null,
    });
  });

  it('keeps a repeated legacy provider clarification behind typed scope confirmation', async () => {
    const clarificationScope = {
      business_idea: 'Reduce missed appointments',
      target_customer: 'Clinic owners',
      problem: 'Unused appointment capacity',
      desired_outcome: 'Reduce no-shows by 20%',
    };
    clarificationScope.scope_hash = customerScopeHash('decision-context-1', clarificationScope);
    createOrchestrationDecision.mockResolvedValue({
      ...decision('human_clarification'),
      decision_id: 'decision-context-2',
      parent_decision_id: 'decision-context-1',
    });
    const admin = createAdmin({
      ...baseGoal({
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          decision_id: 'decision-context-1',
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            source_decision_id: 'decision-context-1',
            source_scope_hash: clarificationScope.scope_hash,
            provenance: 'user_confirmed_assumption',
            accepted_at: '2026-08-22T12:00:00.000Z',
            target_customer: 'Clinic owners',
            problem: 'Unused appointment capacity',
            desired_outcome: 'Reduce no-shows by 20%',
          },
          job_id: null,
          request_hash: null,
        },
      }),
      status: 'researching_customer',
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      decision_id: 'decision-context-2',
      routing_mode: 'human_clarification',
      status: 'scope_proposed',
      persona_resolution: null,
      job_id: null,
    });
    expect(
      admin.events.some(
        (event) => event.event_type === 'axwise_customer_scope_confirmation_applied'
      )
    ).toBe(false);
  });

  it('does not apply a scope confirmation bound to an old hash', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('human_clarification'));
    const clarificationScope = {
      target_customer: 'Clinic owners',
      desired_outcome: 'Reduce no-shows',
    };
    clarificationScope.scope_hash = customerScopeHash('decision-context-1', clarificationScope);
    const admin = createAdmin(
      baseGoal({
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: 'decision-context-1',
          clarification_scope: clarificationScope,
          scope_confirmation: {
            status: 'accepted',
            source_decision_id: 'decision-context-1',
            source_scope_hash: '0'.repeat(64),
            provenance: 'user_confirmed_assumption',
            target_customer: 'Clinic owners',
            desired_outcome: 'Reduce no-shows',
          },
        },
      })
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(
      admin.events.some(
        (event) => event.event_type === 'axwise_customer_scope_confirmation_applied'
      )
    ).toBe(false);
  });

  it('proposes typed scope before interpreting a human-controlled vague goal', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('human_controlled'));
    const vagueGoal = baseGoal();
    delete vagueGoal.tech_doc.target_audience;
    const admin = createAdmin(vagueGoal);

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      routing_mode: 'human_controlled',
      status: 'scope_proposed',
      persona_resolution: null,
    });
    expect(admin.jobs).toEqual([]);
  });

  it('allows a clear customer persona to proceed before first-run Agent Hub creation', async () => {
    const response = decision('human_controlled');
    response.recommended_agents = [];
    response.candidate_rankings = [];
    createOrchestrationDecision.mockResolvedValue(response);
    const admin = createAdmin(baseGoal());

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      status: 'awaiting_context_approval',
      routingMode: 'human_controlled',
    });
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.axwise_customer_intelligence.persona_resolution).toBeNull();
    expect(admin.jobs).toHaveLength(0);
  });

  it('sends no Agent Hub candidates when the organization has no mapped agents', async () => {
    const response = decision('human_controlled');
    response.recommended_agents = [];
    response.candidate_rankings = [];
    createOrchestrationDecision.mockResolvedValue(response);
    const admin = createAdmin(baseGoal(), { orgAgents: [] });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      status: 'awaiting_context_approval',
      routingMode: 'human_controlled',
    });
    expect(createOrchestrationDecision).toHaveBeenCalledTimes(1);
    expect(createOrchestrationDecision.mock.calls[0][0].available_agents).toEqual([]);
    expect(admin.goal.data.axwise_customer_intelligence.authorization).toBeUndefined();
  });

  it('surfaces organization membership lookup errors without calling AxWise unscoped', async () => {
    const admin = createAdmin(baseGoal(), {
      orgAgentsError: { message: 'organization mapping unavailable' },
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(createOrchestrationDecision).not.toHaveBeenCalled();
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'degraded',
      degraded: true,
    });
    expect(admin.goal.data.axwise_customer_intelligence.reason).toContain(
      'Unable to verify the organization-scoped Agent Hub catalogue'
    );
  });

  it('rejects a completed persona result that omits its accepted research bundle', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      acceptedProviderDecision(admin.goal, 'evidence_assisted', {
        decision_id: 'decision-context-2',
        parent_decision_id: 'decision-context-1',
        research_job: null,
      })
    );
    getPersonaResearchResult.mockResolvedValue(
      acceptedProviderResultEnvelope(admin.goal, {
        status: 'completed',
        result: { data: { persona_resolution: personaResolution } },
      })
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'required_research_blocked' });
    expect(admin.goal.status).toBe('needs_human');
    expect(admin.goal.data.failure_reason).toContain('missing the required research bundle');
    expect(admin.jobs).toEqual([]);
  });

  it('imports the exact accepted bundle and never opens a redundant scope question', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      acceptedProviderDecision(admin.goal, 'evidence_assisted', {
        decision_id: 'decision-context-2',
        parent_decision_id: 'decision-context-1',
        research_job: null,
      })
    );
    const researchBundle = {
      version: 'axwise_research_bundle_v1',
      run_id: 'hybrid-1',
      bundle_hash: 'b'.repeat(64),
      persona_resolution: personaResolution,
    };
    getPersonaResearchResult.mockResolvedValue(
      acceptedProviderResultEnvelope(admin.goal, {
        status: 'completed',
        result: { data: { research_bundle: researchBundle } },
      })
    );
    const pointer = {
      run_id: 'db-research-run-1',
      external_run_id: 'hybrid-1',
      bundle_version: 'axwise_research_bundle_v1',
      bundle_hash: 'b'.repeat(64),
      research_prd_hash: 'c'.repeat(64),
      selected_persona_ids: ['customer-1', 'executor-1'],
      source_count: 8,
      persona_count: 2,
      artifact_count: 1,
      scope_contract_hash:
        acceptedGoal.data.axwise_customer_intelligence.scope_packet.research_contract.contract_hash,
      scope_hash: acceptedGoal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      scope_research_acceptance_hash:
        acceptedGoal.data.scope_admission.research_acceptance.binding_hash,
    };
    importGoalResearchBundle.mockResolvedValue({ pointer });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('needs_human');
    expect(importGoalResearchBundle).toHaveBeenCalledWith(
      admin,
      expect.any(Object),
      researchBundle,
      {
        externalRunId: 'hybrid-1',
      }
    );
    expect(admin.goal.data.axwise_customer_intelligence.research_bundle).toEqual(pointer);
    expect(admin.goal.data.goal_approvals.context).toMatchObject({ status: 'invalidated' });
  });

  it('fails closed instead of polling forever when a completed required bundle is invalid', async () => {
    const acceptedGoal = acceptedTypedResearchGoal({
      research_policy: {
        version: 1,
        research_mode: 'instant',
        grounding_required: false,
        research_fail_closed: true,
        location: null,
      },
    });
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      acceptedProviderDecision(admin.goal, 'evidence_assisted', {
        decision_id: 'decision-context-2',
        parent_decision_id: 'decision-context-1',
        research_job: null,
      })
    );
    getPersonaResearchResult.mockResolvedValue(
      acceptedProviderResultEnvelope(admin.goal, {
        status: 'completed',
        result: { data: { research_bundle: { version: 'axwise_research_bundle_v1' } } },
      })
    );
    importGoalResearchBundle.mockRejectedValue(
      new Error('AxWise selected persona is missing from the bundle: customer-1')
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'required_research_blocked' });
    expect(admin.goal.status).toBe('needs_human');
    expect(admin.goal.data.failure_reason).toContain('selected persona is missing');
  });

  it('preserves insufficient synthetic research only as a non-executable working hypothesis', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      acceptedProviderDecision(admin.goal, 'human_clarification', {
        decision_id: 'decision-context-2',
        parent_decision_id: 'decision-context-1',
        research_job: null,
      })
    );
    const researchBundlePointer = {
      run_id: 'research-run-db-1',
      external_run_id: 'hybrid-1',
      bundle_hash: 'b'.repeat(64),
    };
    getPersonaResearchResult.mockResolvedValue(
      acceptedProviderResultEnvelope(admin.goal, {
        status: 'completed',
        result: {
          data: {
            research_bundle: {
              version: 'axwise_research_bundle_v1',
              run_id: 'hybrid-1',
              persona_resolution: personaResolution,
            },
          },
        },
      })
    );
    importGoalResearchBundle.mockResolvedValue({ pointer: researchBundlePointer });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_po_input');
    expect(admin.goal.status).toBe('awaiting_po_input');
    const intelligence = admin.goal.data.axwise_customer_intelligence;
    expect(intelligence.persona_resolution).toBeNull();
    expect(intelligence).toMatchObject({
      job_id: null,
      request_id: null,
      request_hash: null,
      completed_research_iterations: 1,
      clarification_source_research_run: {
        decision_id: 'decision-context-1',
        parent_decision_id: 'decision-context-1',
        refreshed_decision_id: 'decision-context-2',
        job_id: 'hybrid-1',
        terminal_status: 'completed',
        retry_count: 0,
        research_bundle: researchBundlePointer,
      },
    });
    expect(intelligence.working_hypothesis).toMatchObject({
      version: 'orqaly_working_hypothesis_v1',
      review_status: 'awaiting_verification',
      authoritative: false,
      assignable: false,
      executable: false,
      persona_resolution: {
        source_type: 'synthetic_working_hypothesis',
        customer_persona: {
          name: 'Clinic Operations Manager',
          trust: { status: 'synthetic_hypothesis', verified: false },
        },
        recommended_agent: { agent_id: 'agent-operations' },
      },
    });
    expect(admin.jobs).toEqual([]);
  });

  it('rejects an accepted decision that changes the owner-bound execution inputs hash', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted', {
        research_execution_inputs_hash: 'f'.repeat(64),
      })
    );
    const admin = createAdmin(acceptedGoal);

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'provider_contract_failed' });
    expect(admin.goal.data.axwise_customer_intelligence.job_id).toBeNull();
  });

  it('rejects an accepted decision whose runtime echo differs from the approved proposal', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    const changedRuntime = acceptedProviderDecision(acceptedGoal, 'research_assisted');
    changedRuntime.scope_runtime_binding.model_resource = 'models/gemini-other';
    createOrchestrationDecision.mockResolvedValue(changedRuntime);
    const admin = createAdmin(acceptedGoal);

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'provider_contract_failed' });
    expect(admin.goal.data.axwise_customer_intelligence.job_id).toBeNull();
  });

  it('rejects a completed result whose top-level job differs from its exact nested job', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      acceptedProviderDecision(admin.goal, 'evidence_assisted', {
        decision_id: 'decision-context-2',
        parent_decision_id: 'decision-context-1',
        research_job: null,
      })
    );
    getPersonaResearchResult.mockResolvedValue(
      acceptedProviderResultEnvelope(admin.goal, {
        job_id: 'different-provider-job',
        status: 'completed',
        result: { data: { persona_resolution: personaResolution } },
      })
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human', reason: 'provider_contract_failed' });
  });

  it('does not let a delayed terminal worker overwrite a newly accepted scope', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const initialAdmin = createAdmin(acceptedGoal);
    await handle(initialAdmin, { goalId: 'goal-1' });
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(initialAdmin.goal, { status: 'running' })
    );
    const delayedAdmin = createAdmin(initialAdmin.goal, {
      beforeConditionalUpdate: (currentGoal) => {
        const intelligence = currentGoal.data.axwise_customer_intelligence;
        currentGoal.status = 'researching_customer';
        intelligence.status = 'scope_confirmed';
        intelligence.decision_id = 'decision-context-2';
        intelligence.job_id = null;
        intelligence.request_hash = null;
        intelligence.clarification_scope = {
          source: 'newer_accepted_scope',
          scope_hash: 'newer-scope-hash',
        };
        intelligence.scope_confirmation = { status: 'accepted', marker: 'newer-owner-action' };
      },
    });

    const result = await handle(delayedAdmin, {
      goalId: 'goal-1',
      research_poll: true,
      research_decision_id: 'decision-context-1',
      research_job_id: 'hybrid-1',
    });

    expect(result.status).toBe('stale_generation');
    expect(delayedAdmin.goal).toMatchObject({
      status: 'researching_customer',
      data: {
        axwise_customer_intelligence: {
          status: 'scope_confirmed',
          decision_id: 'decision-context-2',
          job_id: null,
          scope_confirmation: { status: 'accepted', marker: 'newer-owner-action' },
        },
      },
    });
    expect(
      delayedAdmin.events.some(
        (event) => event.event_type === 'axwise_customer_intelligence_clarification'
      )
    ).toBe(false);
  });

  it.each([
    ['missing', null],
    [
      'unlinked',
      {
        ...decision('evidence_assisted'),
        decision_id: 'decision-context-2',
        parent_decision_id: 'some-other-decision',
      },
    ],
  ])('fails closed for a %s post-research provider decision', async (_, refreshed) => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      refreshed
        ? acceptedProviderDecision(admin.goal, 'evidence_assisted', {
            decision_id: refreshed.decision_id,
            parent_decision_id: refreshed.parent_decision_id,
            research_job: null,
          })
        : null
    );

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      status: 'needs_human',
      reason: 'provider_contract_failed',
    });
    expect(admin.goal).toMatchObject({
      status: 'needs_human',
      data: {
        failure_code: 'axwise_context_decision_invalid',
        axwise_customer_intelligence: {
          status: 'provider_contract_failed',
          clarification_scope: null,
          scope_confirmation: null,
          job_id: null,
          clarification_source_research_run: {
            job_id: 'hybrid-1',
            terminal_status: 'completed',
          },
        },
      },
    });
  });

  it('keeps transient polling errors pending for reconciler retry', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockRejectedValue(new Error('temporary timeout'));

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('retry_pending');
    expect(admin.goal.status).toBe('researching_customer');
    expect(admin.goal.data.axwise_customer_intelligence.last_poll_error).toBe('temporary timeout');
    expect(admin.jobs).toEqual([]);
  });

  it('keeps transient post-research refresh errors pending for retry', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockRejectedValue(new Error('temporary refresh outage'));

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('retry_pending');
    expect(admin.goal.status).toBe('researching_customer');
    expect(admin.goal.data.axwise_customer_intelligence.last_poll_error).toBe(
      'temporary refresh outage'
    );
    expect(admin.jobs).toEqual([]);
  });

  it('fails closed instead of making an unusable research result a scope question', async () => {
    const acceptedGoal = acceptedTypedResearchGoal();
    createOrchestrationDecision.mockResolvedValue(
      acceptedProviderDecision(acceptedGoal, 'research_assisted')
    );
    const admin = createAdmin(acceptedGoal);
    await handle(admin, { goalId: 'goal-1' });
    admin.jobs.length = 0;
    getPersonaResearchStatus.mockResolvedValue(
      acceptedProviderJobEnvelope(admin.goal, { status: 'completed' })
    );
    refreshOrchestrationResearch.mockResolvedValue(
      acceptedProviderDecision(admin.goal, 'evidence_assisted', {
        decision_id: 'decision-context-2',
        parent_decision_id: 'decision-context-1',
        research_job: null,
      })
    );
    const researchBundle = { version: 'axwise_research_bundle_v1', run_id: 'hybrid-1' };
    getPersonaResearchResult.mockResolvedValue(
      acceptedProviderResultEnvelope(admin.goal, {
        status: 'completed',
        result: { data: { research_bundle: researchBundle } },
      })
    );
    importGoalResearchBundle.mockResolvedValue({
      pointer: { run_id: 'research-run-db-1', bundle_hash: 'b'.repeat(64) },
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      status: 'needs_human',
      reason: 'provider_human_escalation',
    });
    expect(admin.goal.status).toBe('needs_human');
    expect(admin.goal.data.axwise_customer_intelligence.reason).toContain(
      'research result was unusable'
    );
    expect(admin.goal.data.axwise_customer_intelligence.clarification_scope).toBeNull();
    expect(admin.jobs).toEqual([]);
  });
});

describe('customer-intelligence context gate, unattended goals', () => {
  beforeEach(() => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    vi.stubEnv('AXWISE_RESEARCH_POLL_MS', '1000');
    global.fetch = vi.fn(async () => ({ ok: true }));
    createOrchestrationDecision.mockReset();
    getPersonaResearchStatus.mockReset();
    getPersonaResearchResult.mockReset();
    refreshOrchestrationResearch.mockReset();
    importGoalResearchBundle.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function contextApprovalJobs(admin) {
    return admin.jobs.filter(
      (job) =>
        job?.payload?.action === 'context-approval' && job?.payload?.context_action === 'approve'
    );
  }

  it('never mints an owner scope acceptance for an unattended goal', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('direct'));
    const admin = createAdmin({ ...baseGoal(), hitl_mode: 'unattended' });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.goal_approvals.context).toMatchObject({ status: 'pending' });

    expect(contextApprovalJobs(admin)).toHaveLength(0);
    expect(admin.goal.data.hitl_auto_approvals).toBeUndefined();
  });

  it('does not auto-approve while native AxWise requires one material answer', async () => {
    const materialQuestion = 'Which approved customer segment should receive the pilot?';
    createOrchestrationDecision.mockResolvedValue({
      ...decision('direct'),
      ...nativeMaterialQuestionContractsFixture(materialQuestion),
    });
    const admin = createAdmin({ ...baseGoal(), hitl_mode: 'unattended' });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(contextApprovalJobs(admin)).toHaveLength(0);
    expect(admin.goal.data.hitl_auto_approvals).toBeUndefined();
    expect(
      admin.goal.data.axwise_customer_intelligence.axwise_scope_confirmation.material_question
    ).toBe(materialQuestion);
  });

  it('always leaves a valid native AxWise scope for human Gate 1 review', async () => {
    createOrchestrationDecision.mockResolvedValue({
      ...decision('direct'),
      ...nativeDecisionContractsFixture(),
    });
    const admin = createAdmin({ ...baseGoal(), hitl_mode: 'unattended' });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(admin.goal.status).toBe('awaiting_context_approval');
    expect(admin.goal.data.goal_approvals.context).toMatchObject({ status: 'pending' });
    expect(contextApprovalJobs(admin)).toHaveLength(0);
    expect(admin.goal.data.hitl_auto_approvals).toBeUndefined();
  });

  it('does not consume an unattended auto-approval attempt for native scope', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('direct'));
    const admin = createAdmin({ ...baseGoal(), hitl_mode: 'unattended' });

    await handle(admin, { goalId: 'goal-1' });

    expect(admin.goal.data.hitl_auto_approvals).toBeUndefined();
  });

  it('stops auto-approving once the attempt cap is reached', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('direct'));
    const admin = createAdmin({
      ...baseGoal({ hitl_auto_approvals: { context: MAX_AUTO_APPROVALS } }),
      hitl_mode: 'unattended',
    });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(contextApprovalJobs(admin)).toHaveLength(0);
    expect(admin.goal.data.hitl_auto_approvals).toEqual({ context: MAX_AUTO_APPROVALS });
  });

  it('never auto-approves a checkpoints goal', async () => {
    createOrchestrationDecision.mockResolvedValue(decision('direct'));
    const admin = createAdmin({ ...baseGoal(), hitl_mode: 'checkpoints' });

    const result = await handle(admin, { goalId: 'goal-1' });

    expect(result.status).toBe('awaiting_context_approval');
    expect(contextApprovalJobs(admin)).toHaveLength(0);
    expect(admin.goal.data.hitl_auto_approvals).toBeUndefined();
  });
});
