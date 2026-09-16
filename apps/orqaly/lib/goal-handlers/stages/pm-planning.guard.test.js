import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeLlm = vi.fn();
const parseLlmJson = vi.fn();
const loadGoal = vi.fn();
const updateGoal = vi.fn();
const updateGoalIfStatus = vi.fn(async () => true);
const updateGoalIfNativeScopeBinding = vi.fn(async () => true);
const updateGoalIfSnapshot = vi.fn(async () => true);
const enqueueGoalAction = vi.fn();
const loadGoalResearchBundle = vi.fn();
const normalizePlanShape = vi.fn();
const recordStageLlmUsage = vi.fn();
const logGoalEvent = vi.fn();
const retrieveRelevant = vi.fn();
const formatMemoriesForPrompt = vi.fn();
const findAgentByRole = vi.fn();

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  executeLlm: (...args) => executeLlm(...args),
  parseLlmJson: (...args) => parseLlmJson(...args),
}));

vi.mock('../_helpers.js', () => ({
  logGoalEvent: (...args) => logGoalEvent(...args),
  updateGoal: (...args) => updateGoal(...args),
  updateGoalIfStatus: (...args) => updateGoalIfStatus(...args),
  updateGoalIfNativeScopeBinding: (...args) => updateGoalIfNativeScopeBinding(...args),
  updateGoalIfSnapshot: (...args) => updateGoalIfSnapshot(...args),
  loadGoal: (...args) => loadGoal(...args),
  enqueueGoalAction: (...args) => enqueueGoalAction(...args),
  generateId: vi.fn((prefix) => `${prefix}-test`),
  recordStageLlmUsage: (...args) => recordStageLlmUsage(...args),
  findAgentByRole: (...args) => findAgentByRole(...args),
  trackAgentWork: vi.fn(),
  computeHistoricalAverages: vi.fn(),
  pickTestModel: vi.fn(() => ({ provider: 'gemini', model: 'gemini-3.8-flash' })),
  normalizePlanShape: (...args) => normalizePlanShape(...args),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../integrations/axwise/research-bundle.js', () => ({
  loadGoalResearchBundle: (...args) => loadGoalResearchBundle(...args),
}));

vi.mock('../../memory/retrieve.js', () => ({
  retrieveRelevant: (...args) => retrieveRelevant(...args),
  formatMemoriesForPrompt: (...args) => formatMemoriesForPrompt(...args),
}));

import {
  alignPlanJobsToRequiredRoles,
  buildAvailableExecutorRoles,
  buildStrictSingleMarkdownPrdPlan,
  handle,
} from './pm-planning.js';
import { canonicalContractHash } from '../../agent-handlers/compact-agent-contracts.js';
import {
  nativeDecisionContractsFixture,
  nativeResearchContractFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from '../approval-audit.js';
import { selectWorkShapePlaybook } from '../work-shape-playbooks.js';
import {
  businessEvidenceProfileHash,
  evidenceCalculationManifestHash,
  evidenceFactManifestHash,
} from '../../integrations/axwise/evidence-contract-v2.js';

function v2PlanningFixture() {
  const profile = {
    version: 'business_evidence_profile_v1',
    intent: 'operational_process',
    economic_model: 'none',
    market_scope_hash: 'a'.repeat(64),
    fact_requirements: [],
    calculation_requirements: [],
    required_role_slots: [],
  };
  const profileHash = businessEvidenceProfileHash(profile);
  const factManifestHash = evidenceFactManifestHash([]);
  const calculationManifestHash = evidenceCalculationManifestHash([]);
  const pointer = {
    run_id: 'run-1',
    bundle_hash: 'bundle-hash',
    research_prd_hash: null,
    selected_persona_ids: [],
    bundle_version: 'axwise_research_bundle_v2',
    evidence_profile_version: 'business_evidence_profile_v1',
    evidence_profile_hash: profileHash,
    fact_manifest_hash: factManifestHash,
    calculation_manifest_hash: calculationManifestHash,
    fact_count: 0,
    calculation_count: 0,
    required_role_slots: [],
  };
  const goal = {
    id: 'goal-1',
    user_id: 'user-1',
    org_id: 'org-1',
    status: 'planning',
    mode: 'advanced',
    title: 'Prepare an operational rollout',
    description: 'Produce a bounded implementation plan.',
    budget_usd: 10,
    spent_usd: 0,
    tech_doc: {},
    data: {
      research_policy: {
        required: false,
        research_fail_closed: false,
        grounding_required: false,
        business_evidence_profile: profile,
        business_evidence_profile_hash: profileHash,
      },
      axwise_customer_intelligence: { research_bundle: pointer },
      goal_approvals: {},
    },
  };
  goal.data.goal_approvals.context = approvedApproval(
    'context',
    buildContextApprovalSnapshot(goal),
    'user-1'
  );
  return {
    goal,
    research: {
      run: {
        id: 'run-1',
        goal_id: 'goal-1',
        user_id: 'user-1',
        org_id: 'org-1',
        version_status: 'current',
        bundle_hash: 'bundle-hash',
        research_prd_hash: null,
        selected_persona_ids: [],
        source_count: 0,
        bundle_version: pointer.bundle_version,
        evidence_profile_version: pointer.evidence_profile_version,
        evidence_profile_hash: profileHash,
        fact_manifest_hash: factManifestHash,
        calculation_manifest_hash: calculationManifestHash,
        fact_count: 0,
        calculation_count: 0,
      },
      facts: [],
      calculations: [],
      personas: [],
      assignments: [],
      sources: [],
      artifacts: [],
      bundle: {},
    },
  };
}

function softwarePrdNativePacket() {
  return nativeScopePacketFixture({
    admission: {
      version: 'axwise_scope_admission_v1',
      work_types: ['software_development'],
      geographies: [],
      channels: [],
      success_criteria: ['The implementation-ready PRD is reviewable'],
      required_capabilities: [],
      requested_actions: [],
    },
  });
}

function strictNativePrdGoal(packet = softwarePrdNativePacket()) {
  const contracts = nativeDecisionContractsFixture(packet);
  return {
    id: 'goal-prd',
    user_id: 'user-1',
    org_id: 'org-1',
    title: 'Create a production-ready PRD',
    description: 'Produce exactly one self-contained product requirements document in Markdown.',
    data: {
      strict_quality: true,
      axwise_customer_intelligence: {
        scope_packet: contracts.scope_packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
        routing_assessment: { selected_mode: 'direct' },
      },
    },
  };
}

function githubInventedPrdPlan() {
  return {
    strategy: 'Use every available specialist and GitHub.',
    phases: Array.from({ length: 3 }, (_, phaseIndex) => ({
      name: `Phase ${phaseIndex + 1}`,
      description: 'Prepare part of the PRD.',
      jobs: Array.from({ length: 2 }, (_, jobIndex) => ({
        title: `PRD task ${phaseIndex + 1}.${jobIndex + 1}`,
        description: 'Write one Markdown section.',
        required_role: 'Analyst',
        deliverable_type: 'markdown',
        tool_requirements: ['tool-github'],
      })),
    })),
  };
}

function executableStrictNativePrdGoal(packet = softwarePrdNativePacket()) {
  const goal = {
    ...strictNativePrdGoal(packet),
    status: 'planning',
    mode: 'advanced',
    budget_usd: 10,
    spent_usd: 0,
    tech_doc: {},
    updated_at: '2026-08-24T10:02:00.000Z',
  };
  goal.data.axwise_customer_intelligence.generation = '1';
  goal.data.axwise_customer_intelligence.updated_at = '2026-08-24T10:00:00.000Z';
  acceptNativePlanningScope(goal);
  return goal;
}

function acceptNativePlanningScope(goal) {
  const packet = goal.data.axwise_customer_intelligence.scope_packet;
  const route = selectWorkShapePlaybook({ goal, scopePacket: packet });
  goal.data.work_shape_route = route;
  goal.data.scope_admission = {
    version: 1,
    native_scope: true,
    status: 'accepted',
    state_key: 'axwise_customer_intelligence',
    scope_hash: packet.scope_hash,
    playbook_id: route.playbook_id,
    route_version: route.version,
    accepted_at: new Date().toISOString(),
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
  };
  goal.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
  };
  return route;
}

function packetWithDeliverable(overrides) {
  const packet = nativeScopePacketFixture();
  const withoutHash = {
    ...packet,
    deliverable: { ...packet.deliverable, ...overrides },
  };
  delete withoutHash.scope_hash;
  return { ...withoutHash, scope_hash: canonicalContractHash(withoutHash) };
}

function ordinaryPlannerResult() {
  return {
    strategy: 'Draft and review the requested artifact.',
    phases: [
      {
        name: 'Draft',
        description: 'Create the requested artifact.',
        jobs: [
          {
            title: 'Prepare the requested artifact',
            description: 'Draft the approved requirements and acceptance criteria.',
            required_role: 'Product Manager',
            deliverable_type: 'markdown',
            tool_requirements: [],
            acceptance_criteria: ['The artifact covers the approved scope'],
            estimate_hours: 1,
          },
        ],
      },
    ],
    confidence_score: 90,
    estimated_total_hours: 1,
    estimated_total_tokens: 2500,
  };
}

function mixedCustomNativePacket(overrides = {}) {
  return nativeScopePacketFixture({
    admission: {
      version: 'axwise_scope_admission_v1',
      work_types: ['mixed_custom'],
      geographies: [],
      channels: [],
      success_criteria: ['The approved deliverable is reviewable'],
      required_capabilities: [],
      requested_actions: [],
      ...overrides,
    },
  });
}

function nativeGoalWithResearchPointer() {
  const goal = executableStrictNativePrdGoal(mixedCustomNativePacket());
  goal.data.research_policy = {
    required: true,
    research_mode: 'grounded_fast',
    grounding_required: true,
  };
  goal.data.axwise_customer_intelligence.research_bundle = {
    run_id: 'run-native-1',
    bundle_hash: 'b'.repeat(64),
  };
  acceptNativePlanningScope(goal);
  return goal;
}

function nativeV2PlanningFixture() {
  const { goal, research } = v2PlanningFixture();
  goal.updated_at = '2026-08-24T10:02:00.000Z';
  const contracts = nativeDecisionContractsFixture(mixedCustomNativePacket());
  Object.assign(goal.data.axwise_customer_intelligence, {
    scope_packet: contracts.scope_packet,
    scope_validation: contracts.scope_validation,
    axwise_scope_confirmation: contracts.scope_confirmation,
    scope_contract_binding: contracts.scope_contract_binding,
    research_execution_inputs_hash: contracts.research_execution_inputs_hash,
    generation: '1',
    updated_at: '2026-08-24T10:00:00.000Z',
    routing_assessment: { selected_mode: 'research_assisted' },
  });
  acceptNativePlanningScope(goal);
  return { goal, research };
}

function persistedPlanPatch(goalId) {
  return (
    updateGoal.mock.calls.find(([, id, patch]) => id === goalId && patch.plan)?.[2] ||
    updateGoalIfNativeScopeBinding.mock.calls.find(
      ([, id, , , patch]) => id === goalId && patch.plan
    )?.[4]
  );
}

describe('pm-planning stage entry guard', () => {
  beforeEach(() => {
    loadGoalResearchBundle.mockResolvedValue(null);
    normalizePlanShape.mockImplementation((value) => value);
    retrieveRelevant.mockResolvedValue([]);
    formatMemoriesForPrompt.mockReturnValue('');
    findAgentByRole.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(['paused', 'cancelled', 'failed', 'completed', 'completed_with_warnings', 'needs_human'])(
    'does not revive a %s goal',
    async (status) => {
      loadGoal.mockResolvedValue({ id: 'goal-1', status });

      const result = await handle({}, { goalId: 'goal-1' });

      expect(result).toMatchObject({
        action: 'pm-planning',
        status: 'stage_not_eligible',
        goalStatus: status,
      });
      expect(updateGoal).not.toHaveBeenCalled();
      expect(executeLlm).not.toHaveBeenCalled();
      expect(enqueueGoalAction).not.toHaveBeenCalled();
    }
  );

  it('lets only one native planning worker acquire the exact planning attempt', async () => {
    const goal = executableStrictNativePrdGoal(mixedCustomNativePacket());
    loadGoal.mockResolvedValue(goal);
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(false);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({ action: 'pm-planning', status: 'state_changed' });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledTimes(1);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({ goal_updated_at: goal.updated_at }),
      expect.objectContaining({
        status: 'planning',
        data: expect.objectContaining({
          native_planning_attempt: expect.objectContaining({
            version: 'orqaly_native_planning_attempt_v1',
            attempt_id: 'npa-test',
            status: 'running',
          }),
        }),
      })
    );
    expect(executeLlm).not.toHaveBeenCalled();
    expect(logGoalEvent).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('makes missing PO and AxWise specialists plan-eligible without exposing coordinators', () => {
    const goal = {
      tech_doc: {
        required_capabilities: [
          'finance_pricing_specialist',
          'gdpr_legal_compliance_specialist',
          'non_executing_coordinator_team_lead',
        ],
      },
      data: {
        axwise_customer_intelligence: {
          persona_resolution: {
            ideal_agent_persona: {
              required_capabilities: ['commercial_risk_analyst'],
            },
          },
        },
      },
    };

    expect(
      buildAvailableExecutorRoles(goal, [
        { name: 'Marketing Strategist' },
        { name: 'QA Tester' },
        { name: 'Team Lead' },
      ])
    ).toEqual([
      'Marketing Strategist',
      'QA Tester',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Commercial Risk Analyst',
    ]);
  });

  it('deterministically aligns the exact Bremen task scopes to five specialists', () => {
    const plan = {
      phases: [
        {
          name: 'Bremen SMB ICP Definition',
          jobs: [
            {
              title: 'Define three Bremen SMB ICPs',
              description:
                'Specify pains, buying triggers, buyer roles, and qualification criteria.',
              required_role: 'Marketing Strategist',
            },
          ],
        },
        {
          name: 'Service Packaging and GDPR',
          jobs: [
            {
              title: 'Design three fixed-price EUR service packages',
              description: 'Define package pricing, scope, exclusions, and commercial terms.',
              required_role: 'QA Tester',
            },
            {
              title: 'Define the GDPR-safe delivery framework',
              description: 'Map data protection boundaries, lawful data flows, and mitigations.',
              required_role: 'QA Tester',
            },
          ],
        },
        {
          name: 'German Outreach',
          jobs: [
            {
              title: 'Create a four-week German outreach cadence',
              description:
                'Provide email and LinkedIn templates, weekly sales targets, and objection handling.',
              required_role: 'QA Tester',
            },
          ],
        },
        {
          name: 'Funnel, Measurement, and Risk',
          jobs: [
            {
              title: 'Specify the conversion funnel and KPI measurement methodology',
              description: 'Define stage formulas, data inputs, thresholds, and owners.',
              required_role: 'Marketing Strategist',
            },
            {
              title: 'Create the commercial risk matrix and mitigation strategy',
              description: 'Score each risk and define concrete mitigations and controls.',
              required_role: 'Marketing Strategist',
            },
          ],
        },
      ],
    };
    const requiredRoles = [
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ];
    const before = plan.phases.flatMap((phase) =>
      phase.jobs.map((job) => ({ title: job.title, description: job.description }))
    );

    const result = alignPlanJobsToRequiredRoles(plan, requiredRoles);

    expect(result.valid).toBe(true);
    expect(result.uncoveredRoles).toEqual([]);
    expect(plan.phases.flatMap((phase) => phase.jobs.map((job) => job.required_role))).toEqual([
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
      'Commercial Risk Analyst',
    ]);
    expect(
      plan.phases.flatMap((phase) =>
        phase.jobs.map((job) => ({ title: job.title, description: job.description }))
      )
    ).toEqual(before);
    expect(JSON.stringify(plan)).not.toMatch(/QA Tester|Team Lead|Project Manager/);

    const repeatedPlan = structuredClone({ phases: plan.phases });
    const repeated = alignPlanJobsToRequiredRoles(repeatedPlan, requiredRoles);
    expect(repeated.valid).toBe(true);
    expect(repeatedPlan).toEqual(plan);
  });

  it('covers all six native specialists without silently truncating the role contract', () => {
    const requiredRoles = [
      'Customer Research Specialist',
      'Pricing Finance Specialist',
      'Privacy Compliance Specialist',
      'Sales Outreach Specialist',
      'Commercial Risk Analyst',
      'Logistics Operations Specialist',
    ];
    const plan = {
      phases: [
        {
          name: 'Canonical specialist work',
          jobs: requiredRoles.map((role) => ({
            title: `${role} work package`,
            description: `Complete the accepted ${role} responsibilities and handoff.`,
            required_role: role,
          })),
        },
      ],
    };

    const result = alignPlanJobsToRequiredRoles(plan, requiredRoles);

    expect(result).toMatchObject({ valid: true, uncoveredRoles: [], unmappableTasks: [] });
    expect(plan.phases[0].jobs.map((job) => job.required_role)).toEqual(requiredRoles);
  });

  it('fails closed when the plan has fewer jobs than the accepted specialist contract', () => {
    const requiredRoles = [
      'Customer Research Specialist',
      'Pricing Finance Specialist',
      'Privacy Compliance Specialist',
      'Sales Outreach Specialist',
      'Commercial Risk Analyst',
      'Logistics Operations Specialist',
    ];
    const plan = {
      phases: [
        {
          name: 'Incomplete specialist work',
          jobs: requiredRoles.slice(0, 5).map((role) => ({
            title: `${role} work package`,
            description: `Complete the accepted ${role} responsibilities.`,
            required_role: role,
          })),
        },
      ],
    };

    expect(alignPlanJobsToRequiredRoles(plan, requiredRoles)).toMatchObject({
      valid: false,
      uncoveredRoles: ['Logistics Operations Specialist'],
    });
  });

  it('fails closed when a task has no semantic signal for any required specialist', () => {
    const plan = {
      phases: [
        {
          name: 'Execution',
          jobs: [
            {
              title: 'Prepare output',
              description: 'Complete the work.',
              required_role: 'QA Tester',
            },
          ],
        },
      ],
    };

    const result = alignPlanJobsToRequiredRoles(plan, [
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
    ]);

    expect(result).toMatchObject({
      valid: false,
      unmappableTasks: ['Prepare output'],
    });
    expect(plan.phases[0].jobs[0].required_role).toBe('QA Tester');
  });

  it('accepts an exact bounded specialist assignment for a generically worded task', () => {
    const plan = {
      phases: [
        {
          name: 'Measurement Plan',
          jobs: [
            {
              title: 'Specify methodology and required inputs',
              description: 'Define the baseline, cadence, and reporting format.',
              required_role: 'E-commerce Operations Analyst',
            },
          ],
        },
      ],
    };

    const result = alignPlanJobsToRequiredRoles(plan, ['E-commerce Operations Analyst']);

    expect(result).toMatchObject({ valid: true, uncoveredRoles: [], unmappableTasks: [] });
    expect(plan.phases[0].jobs[0].required_role).toBe('E-commerce Operations Analyst');
  });

  it('replaces a GitHub-inventing strict native PRD plan with exactly two specialists and synthesis', () => {
    const packet = nativeScopePacketFixture();
    const operationalPacketWithoutHash = {
      ...packet,
      deliverable: { ...packet.deliverable, type: 'operational_process_prd' },
    };
    delete operationalPacketWithoutHash.scope_hash;
    const operationalPacket = {
      ...operationalPacketWithoutHash,
      scope_hash: canonicalContractHash(operationalPacketWithoutHash),
    };
    const goal = strictNativePrdGoal(operationalPacket);
    goal.data.prd_quality_gate = { required: true, validation_profile: 'scope_confirm' };
    const untrustedPlan = githubInventedPrdPlan();
    const before = structuredClone(untrustedPlan);

    const result = buildStrictSingleMarkdownPrdPlan({
      goal,
      plan: untrustedPlan,
      requiredRoles: [
        'Product Manager',
        'Conversational UX Designer',
        'Software Architect',
        'Security Engineer',
        'Risk Analyst',
      ],
    });

    expect(result).toMatchObject({
      applied: true,
      previousPhaseCount: 3,
      previousJobCount: 6,
      removedPlannerToolIds: ['tool-github'],
    });
    expect(result.plan.phases.map((phase) => phase.jobs.length)).toEqual([2, 1]);
    expect(result.plan.phases.flatMap((phase) => phase.jobs).map((job) => job.title)).toEqual([
      'Define Product Requirements and Conversational UX',
      'Define Architecture and Technical Assurance',
      'Synthesize Final Production PRD',
    ]);
    expect(
      result.plan.phases.flatMap((phase) => phase.jobs).flatMap((job) => job.tool_requirements)
    ).toEqual([]);
    expect(result.plan.phases.every((phase) => phase.tool_requirements.length === 0)).toBe(true);
    expect(
      result.plan.phases.flatMap((phase) => phase.jobs).map((job) => job.required_role)
    ).toEqual(['Product Manager', 'Software Architect', 'Product Manager']);
    const architectureJob = result.plan.phases[0].jobs.find(
      (job) => job.title === 'Define Architecture and Technical Assurance'
    );
    const architectureContract = [
      architectureJob.description,
      architectureJob.requirements,
      ...architectureJob.acceptance_criteria,
    ].join('\n');
    expect(architectureJob.acceptance_criteria).toHaveLength(8);
    expect(architectureContract).toContain('AxWise is the cognitive decision plane');
    expect(architectureContract).toContain(
      'Orqaly owns authenticated tenancy, durable workflow state and orchestration, agent and tool availability, authorization and approval-token issuance, budgets and quotas, connector and external actions, monitoring and recovery, and final artifact delivery'
    );
    for (const forbiddenAxwiseRole of [
      'AxWise MUST NOT be described or implemented as the credential store',
      'token issuer',
      'outbound execution gateway',
    ]) {
      expect(architectureContract).toContain(forbiddenAxwiseRole);
    }
    expect(architectureContract).toContain('HTTP 409 Conflict');
    expect(architectureContract).toContain('STALE_SCOPE_VERSION');
    expect(architectureContract).toContain('zero internal and external side effects');
    expect(architectureContract).toContain(
      'every tenant-owned or transitively tenant-owned table MUST contain a direct non-null tenant_id'
    );
    expect(architectureContract).toContain(
      'FOREIGN KEY (tenant_id, parent_id) REFERENCES parent (tenant_id, id)'
    );
    for (const clause of [
      'ENABLE ROW LEVEL SECURITY',
      'FORCE ROW LEVEL SECURITY',
      'USING',
      'WITH CHECK',
      'cross-tenant SELECT, INSERT, UPDATE, DELETE',
      'composite-FK insert/update tests',
    ]) {
      expect(architectureContract).toContain(clause);
    }
    const canonicalBytes =
      '{"action":"execute","scope_id":"8c1f2e79-43ab-4b6e-9c01-7d2a3f4e5b60","scope_version":7,"tenant_id":"4f9b7a21-65d3-4c8e-a102-9e6f5d4c3b2a"}';
    const fixtureDigest = createHash('sha256').update(canonicalBytes, 'utf8').digest('hex');
    expect(fixtureDigest).toBe('195e3047c9e7bed6f4b1b03f098e6c7a3be5b645dd82d5d2d1e434f7d0278399');
    expect(architectureContract).toContain(`canonical bytes \`${canonicalBytes}\``);
    expect(architectureContract).toContain(`SHA-256 \`${fixtureDigest}\``);
    expect(architectureContract).toContain(
      'exactly one unsettled signing model as `[PROPOSED] Ed25519 with JWT alg=EdDSA`'
    );
    for (const claim of [
      'iss',
      'aud',
      'jti',
      'payload_hash',
      'scope_version or session_version',
      'exp',
    ]) {
      expect(architectureContract).toContain(claim);
    }
    expect(architectureContract).toContain(
      'otherwise mark it clearly as non-decodable illustrative text'
    );
    expect(architectureContract).toContain('one canonical state enum');
    expect(architectureContract).toContain('every formula, threshold, timeout budget');
    expect(architectureContract).toContain('Privacy lifecycle');
    expect(architectureContract).toContain('Append-only audit claims');
    expect(untrustedPlan).toEqual(before);
    expect(
      buildStrictSingleMarkdownPrdPlan({
        goal,
        plan: untrustedPlan,
        requiredRoles: ['Product Manager', 'Software Architect'],
      }).plan
    ).toEqual(result.plan);
  });

  it('keeps ScopeConfirm-specific security choices out of a generic strict PRD', () => {
    const genericPacket = packetWithDeliverable({
      type: 'generic_product_prd',
      title_prefix: '# PRD: Generic Product',
    });
    const goal = strictNativePrdGoal(genericPacket);
    goal.data.prd_quality_gate = { required: true, validation_profile: 'generic_prd' };

    const result = buildStrictSingleMarkdownPrdPlan({
      goal,
      plan: githubInventedPrdPlan(),
      requiredRoles: ['Product Manager', 'Software Architect'],
    });

    expect(result.applied).toBe(true);
    const architectureJob = result.plan.phases[0].jobs.find(
      (job) => job.title === 'Define Architecture and Technical Assurance'
    );
    const architectureContract = [
      architectureJob.description,
      architectureJob.requirements,
      ...architectureJob.acceptance_criteria,
    ].join('\n');
    expect(architectureJob.acceptance_criteria).toHaveLength(6);
    expect(architectureContract).toContain(
      'Tenant isolation, privacy, authorization, and external side-effect gates are testable'
    );
    for (const scopeConfirmClause of [
      'STALE_SCOPE_VERSION',
      'Ed25519',
      'JWT alg=EdDSA',
      'ENABLE ROW LEVEL SECURITY',
      'FORCE ROW LEVEL SECURITY',
      '195e3047c9e7bed6f4b1b03f098e6c7a3be5b645dd82d5d2d1e434f7d0278399',
      'AxWise is the cognitive decision plane',
      'AxWise MUST NOT be described or implemented as the credential store',
    ]) {
      expect(architectureContract).not.toContain(scopeConfirmClause);
    }
  });

  it('does not compact explicitly authorized, research-assisted, or non-Markdown workflows', () => {
    const plan = githubInventedPrdPlan();
    const goal = strictNativePrdGoal();

    expect(
      buildStrictSingleMarkdownPrdPlan({
        goal: { ...goal, data: { ...goal.data, authorized_tool_ids: ['tool-github'] } },
        plan,
      })
    ).toMatchObject({ applied: false, plan });
    expect(buildStrictSingleMarkdownPrdPlan({ goal, plan, researchRequired: true })).toMatchObject({
      applied: false,
      plan,
    });
    expect(
      buildStrictSingleMarkdownPrdPlan({
        goal: {
          ...goal,
          data: {
            ...goal.data,
            axwise_customer_intelligence: {
              ...goal.data.axwise_customer_intelligence,
              routing_assessment: { selected_mode: 'research_assisted' },
            },
          },
        },
        plan,
      })
    ).toMatchObject({ applied: false, plan });

    const packet = nativeScopePacketFixture();
    const mixedPacketWithoutHash = {
      ...packet,
      deliverable: { ...packet.deliverable, type: 'deployment', presentation: 'mixed' },
    };
    delete mixedPacketWithoutHash.scope_hash;
    const mixedPacket = {
      ...mixedPacketWithoutHash,
      scope_hash: canonicalContractHash(mixedPacketWithoutHash),
    };
    expect(
      buildStrictSingleMarkdownPrdPlan({ goal: strictNativePrdGoal(mixedPacket), plan })
    ).toMatchObject({ applied: false, plan });
  });

  it('bypasses PM inference and LLM usage for an eligible strict native Markdown PRD', async () => {
    const goal = executableStrictNativePrdGoal();
    const packet = goal.data.axwise_customer_intelligence.scope_packet;
    const acceptedRoute = selectWorkShapePlaybook({ goal, scopePacket: packet });
    goal.data.work_shape_route = acceptedRoute;
    goal.data.scope_admission = {
      version: 1,
      status: 'accepted',
      state_key: 'axwise_customer_intelligence',
      scope_hash: packet.scope_hash,
      playbook_id: acceptedRoute.playbook_id,
      route_version: acceptedRoute.version,
      accepted_at: new Date().toISOString(),
      requires_authorization: acceptedRoute.requires_authorization,
      maximum_side_effect: acceptedRoute.maximum_side_effect,
      grants_authorization: false,
    };
    goal.data.goal_approvals = {
      context: approvedApproval('context', buildContextApprovalSnapshot(goal), 'user-1'),
    };
    loadGoal.mockResolvedValue(goal);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({ action: 'pm-planning', phases: 2, confidenceScore: 96 });
    expect(executeLlm).not.toHaveBeenCalled();
    expect(parseLlmJson).not.toHaveBeenCalled();
    expect(recordStageLlmUsage).not.toHaveBeenCalled();
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({ scope_hash: packet.scope_hash }),
      expect.objectContaining({
        plan: expect.objectContaining({
          phases: [
            expect.objectContaining({ jobs: expect.any(Array) }),
            expect.objectContaining({ jobs: expect.any(Array) }),
          ],
        }),
        spent_usd: 0,
      })
    );
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'team-formation', goal.id);
  });

  it('fails closed and reopens context approval when the accepted native scope or route drifts', async () => {
    const acceptedPacket = nativeScopePacketFixture({
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['outreach_campaign'],
        geographies: [],
        channels: ['email'],
        success_criteria: ['The campaign is measurable'],
        required_capabilities: ['Campaign strategy'],
        requested_actions: [],
      },
    });
    const goal = executableStrictNativePrdGoal(acceptedPacket);
    const acceptedRoute = selectWorkShapePlaybook({ goal, scopePacket: acceptedPacket });
    goal.data.work_shape_route = acceptedRoute;
    goal.data.scope_admission = {
      version: 1,
      status: 'accepted',
      state_key: 'axwise_customer_intelligence',
      scope_hash: acceptedPacket.scope_hash,
      playbook_id: acceptedRoute.playbook_id,
      route_version: acceptedRoute.version,
      accepted_at: new Date().toISOString(),
      requires_authorization: false,
      maximum_side_effect: 'none',
      grants_authorization: false,
    };
    goal.data.goal_approvals = {
      context: approvedApproval('context', buildContextApprovalSnapshot(goal), 'user-1'),
    };

    const replacementPacket = nativeScopePacketFixture({
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['procurement_logistics'],
        geographies: ['EE'],
        channels: ['B2B distributors'],
        success_criteria: ['The distribution plan is reviewable'],
        required_capabilities: ['Supply chain planning'],
        requested_actions: [],
      },
    });
    const replacementContracts = nativeDecisionContractsFixture(replacementPacket);
    Object.assign(goal.data.axwise_customer_intelligence, {
      scope_packet: replacementContracts.scope_packet,
      scope_validation: replacementContracts.scope_validation,
      axwise_scope_confirmation: replacementContracts.scope_confirmation,
    });
    loadGoal.mockResolvedValue(goal);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'scope_drift_reapproval_required',
      scopeHash: replacementPacket.scope_hash,
      reasons: expect.arrayContaining([
        'accepted_scope_hash_changed',
        'accepted_playbook_changed',
        'approved_native_scope_identity_changed',
      ]),
    });
    expect(executeLlm).not.toHaveBeenCalled();
    expect(recordStageLlmUsage).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({
        scope_hash: replacementPacket.scope_hash,
        context_snapshot_hash: goal.data.goal_approvals.context.snapshot_hash,
      }),
      expect.objectContaining({
        status: 'awaiting_context_approval',
        data: expect.objectContaining({
          work_shape_route: null,
          scope_admission: expect.objectContaining({
            status: 'awaiting_confirmation',
            scope_hash: replacementPacket.scope_hash,
            playbook_id: null,
            grants_authorization: false,
          }),
          goal_approvals: expect.objectContaining({
            context: expect.objectContaining({ status: 'pending' }),
          }),
        }),
      })
    );
  });

  it('does not let retry_from_stage bypass the exact native Gate-1 approval', async () => {
    const goal = executableStrictNativePrdGoal();
    goal.data.last_human_resolution = {
      type: 'retry_from_stage',
      stage: 'pm-planning',
    };
    goal.data.scope_admission = {
      ...goal.data.scope_admission,
      status: 'awaiting_confirmation',
      accepted_at: null,
    };
    goal.data.goal_approvals.context = {
      ...goal.data.goal_approvals.context,
      status: 'invalidated',
      invalidation_reason: 'retry_from_stage',
    };
    loadGoal.mockResolvedValue(goal);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'scope_drift_reapproval_required',
      reasons: expect.arrayContaining([
        'context_approval_missing_or_stale',
        'native_scope_admission_not_accepted',
      ]),
    });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({
        scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
        context_snapshot_hash: goal.data.goal_approvals.context.snapshot_hash,
      }),
      expect.objectContaining({
        status: 'awaiting_context_approval',
        data: expect.objectContaining({
          scope_admission: expect.objectContaining({ status: 'awaiting_confirmation' }),
          goal_approvals: expect.objectContaining({
            context: expect.objectContaining({ status: 'pending' }),
          }),
        }),
      })
    );
    expect(executeLlm).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'missing',
      (goal) => {
        delete goal.data.axwise_customer_intelligence.scope_packet;
      },
    ],
    [
      'wrong-version',
      (goal) => {
        goal.data.axwise_customer_intelligence.scope_packet.version = 'axwise_scope_packet_v2';
      },
    ],
  ])('does not enter the legacy planner when the native packet is %s', async (_name, mutate) => {
    const goal = executableStrictNativePrdGoal();
    mutate(goal);
    loadGoal.mockResolvedValue(goal);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'scope_drift_reapproval_required',
      reasons: expect.arrayContaining([
        'canonical_scope_unavailable',
        'native_scope_binding_incomplete',
      ]),
    });
    expect(updateGoalIfSnapshot).toHaveBeenCalledWith(
      {},
      goal,
      expect.objectContaining({
        status: 'awaiting_context_approval',
        data: expect.objectContaining({
          scope_admission: expect.objectContaining({
            state_key: 'axwise_customer_intelligence',
            status: 'awaiting_confirmation',
          }),
        }),
      })
    );
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
    expect(recordStageLlmUsage).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('emits nothing when damaged-native recovery loses its full goal snapshot', async () => {
    const goal = executableStrictNativePrdGoal();
    goal.user_id = 'user-1';
    delete goal.data.axwise_customer_intelligence.scope_packet;
    loadGoal.mockResolvedValue(goal);
    updateGoalIfSnapshot.mockResolvedValueOnce(false);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({ status: 'state_changed' });
    expect(updateGoalIfSnapshot).toHaveBeenCalledWith(
      {},
      goal,
      expect.objectContaining({ status: 'awaiting_context_approval' })
    );
    expect(updateGoalIfStatus).not.toHaveBeenCalled();
    expect(logGoalEvent).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it.each([
    {
      workType: 'content_asset_creation',
      playbookId: 'simple_content',
      expectedPhaseJobs: [1],
    },
    {
      workType: 'research_analysis',
      playbookId: 'research_strategy',
      expectedPhaseJobs: [1, 1],
    },
    {
      workType: 'outreach_campaign',
      playbookId: 'campaign',
      expectedPhaseJobs: [2, 1],
    },
    {
      workType: 'procurement_logistics',
      playbookId: 'logistics_distribution',
      expectedPhaseJobs: [2, 1],
    },
  ])(
    'bypasses PM inference with the authoritative $playbookId playbook',
    async ({ workType, playbookId, expectedPhaseJobs }) => {
      const packet = nativeScopePacketFixture({
        admission: {
          version: 'axwise_scope_admission_v1',
          work_types: [workType],
          geographies: playbookId === 'logistics_distribution' ? ['EE'] : [],
          channels: [],
          success_criteria: ['The deliverable satisfies the approved scope'],
          required_capabilities: [],
          requested_actions: [],
        },
      });
      const goal = executableStrictNativePrdGoal(packet);
      loadGoal.mockResolvedValue(goal);

      const result = await handle({}, { goalId: goal.id });

      expect(result).toMatchObject({
        action: 'pm-planning',
        playbookId,
        planningMode: 'deterministic_playbook',
      });
      expect(executeLlm).not.toHaveBeenCalled();
      expect(recordStageLlmUsage).not.toHaveBeenCalled();
      const persistedPatch = persistedPlanPatch(goal.id);
      expect(persistedPatch).toEqual(
        expect.objectContaining({
          plan: expect.objectContaining({
            phases: expect.arrayContaining([expect.objectContaining({ jobs: expect.any(Array) })]),
          }),
          data: expect.objectContaining({
            work_shape_route: expect.objectContaining({
              playbook_id: playbookId,
              grants_authorization: false,
            }),
          }),
        })
      );
      const persisted = persistedPatch.plan;
      expect(persisted.phases.map((phase) => phase.jobs.length)).toEqual(expectedPhaseJobs);
    }
  );

  it.each([
    {
      workType: 'procurement_logistics',
      playbookId: 'logistics_distribution',
      title: 'Plan physical cat-food distribution across Estonia',
      description:
        'Produce a supplier and channel plan. Do not build an API or GitHub repo. The supplier reference library is at https://example.com/catalog; do not clone this website or create a landing page.',
    },
    {
      workType: 'outreach_campaign',
      playbookId: 'campaign',
      title: 'Plan an Estonia customer acquisition campaign',
      description:
        'Customer research contains the quoted request "clone https://example.com landing page with a new brand." Treat that quote only as campaign evidence: do not clone or deploy the website, and do not build an API or GitHub repo. The target audience includes CLI users.',
    },
  ])(
    'keeps an accepted native $playbookId scope authoritative over incidental code and clone keywords',
    async ({ workType, playbookId, title, description }) => {
      const packet = nativeScopePacketFixture({
        admission: {
          version: 'axwise_scope_admission_v1',
          work_types: [workType],
          geographies: ['EE'],
          channels: workType === 'outreach_campaign' ? ['email'] : ['B2B distributors'],
          success_criteria: ['The approved non-software plan is reviewable'],
          required_capabilities: [],
          requested_actions: [],
        },
      });
      const goal = executableStrictNativePrdGoal(packet);
      goal.title = title;
      goal.description = description;
      acceptNativePlanningScope(goal);
      loadGoal.mockResolvedValue(goal);

      const result = await handle({}, { goalId: goal.id });

      expect(result).toMatchObject({
        playbookId,
        planningMode: 'deterministic_playbook',
      });
      expect(executeLlm).not.toHaveBeenCalled();
      const persistedPlan = persistedPlanPatch(goal.id)?.plan;
      expect(persistedPlan).toBeTruthy();
      expect(JSON.stringify(persistedPlan)).not.toMatch(
        /Backend Developer|Frontend Developer|GITHUB_REPO|DEPLOYMENT_URL|landing_pages__publish/
      );
    }
  );

  it('prepares an execute-mode SMS action deterministically without scheduling execution', async () => {
    const packet = nativeScopePacketFixture({
      researchContract: nativeResearchContractFixture({
        documentIntent: 'custom',
        workTypes: ['external_service_operation', 'outreach_campaign'],
        geographies: ['EE'],
        roles: ['Operations Strategist', 'QA Tester'],
      }),
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['external_service_operation', 'outreach_campaign'],
        geographies: ['EE'],
        channels: ['sms'],
        success_criteria: ['Every target has a terminal provider receipt'],
        required_capabilities: ['Twilio'],
        requested_actions: [
          {
            action: 'Send the approved SMS to the approved recipients',
            mode: 'execute',
            side_effect: 'irreversible',
            requires_authorization: true,
          },
        ],
      },
    });
    const goal = executableStrictNativePrdGoal(packet);
    loadGoal.mockResolvedValue(goal);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      playbookId: 'external_action',
      planningMode: 'deterministic_playbook',
    });
    expect(executeLlm).not.toHaveBeenCalled();
    const persisted = persistedPlanPatch(goal.id);
    expect(persisted.data.work_shape_route).toMatchObject({
      requires_authorization: true,
      maximum_side_effect: 'irreversible',
      grants_authorization: false,
    });
    const jobs = persisted.plan.phases.flatMap((phase) => phase.jobs);
    const handoff = jobs.find((job) => job.title === 'Produce Authorization Handoff Manifest');
    expect(jobs.every((job) => job.tool_requirements.length === 0)).toBe(true);
    expect(jobs.some((job) => job.category === 'external_action_execution')).toBe(false);
    expect(handoff.description).toContain('ACTION_BLOCKED_NO_AUTHORIZATION');
    expect(handoff.requirements).toContain('grants_authorization=false');
  });

  it('retains PM inference for an authoritative mixed/custom admission', async () => {
    const packet = nativeScopePacketFixture({
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['procurement_logistics', 'software_development'],
        geographies: ['EE'],
        channels: [],
        success_criteria: ['The custom cross-domain deliverable is reviewable'],
        required_capabilities: [],
        requested_actions: [],
      },
    });
    const goal = executableStrictNativePrdGoal(packet);
    loadGoal.mockResolvedValue(goal);
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.01 });
    parseLlmJson.mockReturnValue(ordinaryPlannerResult());

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({ playbookId: 'mixed_custom', planningMode: 'llm' });
    expect(executeLlm).toHaveBeenCalledTimes(1);
    expect(recordStageLlmUsage).toHaveBeenCalledTimes(1);
  });

  it('keeps a corrected report scope authoritative over stale presentation, landing, and social wording', async () => {
    const basePacket = mixedCustomNativePacket();
    const reportPacketWithoutHash = {
      ...basePacket,
      intent: {
        ...basePacket.intent,
        objective: 'Produce a written operating report for leadership review.',
        desired_outcome: 'One evidence-aware Markdown report with findings and recommendations.',
        non_goals: [
          'Do not create a landing page',
          'Do not create a presentation',
          'Do not create a social media campaign or banner set',
        ],
      },
      deliverable: {
        ...basePacket.deliverable,
        type: 'markdown',
        count: 1,
        title_prefix: '# Operating Report',
        required_sections: ['Executive summary', 'Findings', 'Recommendations'],
        presentation: 'markdown_artifact',
      },
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['mixed_custom'],
        geographies: [],
        channels: [],
        success_criteria: ['The written report is reviewable'],
        required_capabilities: [],
        requested_actions: [],
      },
    };
    delete reportPacketWithoutHash.scope_hash;
    const reportPacket = {
      ...reportPacketWithoutHash,
      scope_hash: canonicalContractHash(reportPacketWithoutHash),
    };
    const goal = executableStrictNativePrdGoal(reportPacket);
    goal.title = 'Create a pitch deck, landing page, and social media strategy';
    goal.description =
      'The old request also mentioned presentation slides, SMM banners, and a marketing website.';
    goal.tech_doc = {
      problem_statement: 'Build the stale landing-page and presentation request.',
      recommended_approach: 'Use the stale social campaign topology.',
    };
    acceptNativePlanningScope(goal);
    loadGoal.mockResolvedValue(goal);
    formatMemoriesForPrompt.mockReturnValue('POISON CROSS-GOAL MEMORY');
    findAgentByRole.mockResolvedValue({
      id: 'pm-stale',
      role: 'Project Manager',
      system_prompt: 'POISON STORED PM SYSTEM PROMPT',
    });
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.01 });
    parseLlmJson.mockReturnValue(ordinaryPlannerResult());

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({ playbookId: 'mixed_custom', planningMode: 'llm' });
    const prompt = executeLlm.mock.calls[0][0].prompt;
    expect(prompt).toContain('Produce a written operating report for leadership review.');
    expect(prompt).toContain('APPROVED NATIVE AXWISE PLANNING AUTHORITY (BINDING)');
    expect(prompt).not.toContain('POISON CROSS-GOAL MEMORY');
    expect(prompt).not.toContain(goal.title);
    expect(prompt).not.toContain(goal.description);
    expect(prompt).not.toContain(goal.tech_doc.problem_statement);
    expect(prompt).not.toContain(goal.tech_doc.recommended_approach);
    expect(prompt).not.toContain('MANDATORY STRUCTURE for this landing page / website goal');
    expect(prompt).not.toContain('MANDATORY STRUCTURE for this pitch deck / presentation goal');
    expect(prompt).not.toContain('MANDATORY STRUCTURE for this social media strategy goal');
    expect(prompt).not.toContain(
      'MANDATORY STRUCTURE for this social media banner / ad creative goal'
    );
    expect(prompt).not.toContain('MANDATORY STRUCTURE for this URL-clone / restyle');
    expect(prompt).not.toContain('MANDATORY STRUCTURE for this CLI / library / script');
    expect(retrieveRelevant).not.toHaveBeenCalled();
    expect(executeLlm.mock.calls[0][0].systemPrompt).toContain(
      "You are Orqaly's domain-neutral Operational Planner."
    );
    expect(executeLlm.mock.calls[0][0].systemPrompt).not.toContain(
      'POISON STORED PM SYSTEM PROMPT'
    );
  });

  it('drops an in-flight native plan when its exact scope binding changes before persistence', async () => {
    const packet = nativeScopePacketFixture({
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['mixed_custom'],
        geographies: [],
        channels: [],
        success_criteria: ['The approved deliverable is reviewable'],
        required_capabilities: [],
        requested_actions: [],
      },
    });
    const goal = executableStrictNativePrdGoal(packet);
    loadGoal.mockResolvedValue(goal);
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.01 });
    parseLlmJson.mockReturnValue(ordinaryPlannerResult());
    // Entry still owns the reviewed generation. The second CAS represents a
    // scope correction that lands while the planner model is in flight.
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      action: 'pm-planning',
      status: 'stale_native_scope',
      scopeHash: packet.scope_hash,
    });
    expect(executeLlm).toHaveBeenCalledTimes(1);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledTimes(2);
    expect(updateGoalIfNativeScopeBinding.mock.calls[1][4]).toEqual(
      expect.objectContaining({ plan: expect.any(Object) })
    );
    expect(updateGoal.mock.calls).not.toContainEqual([
      {},
      goal.id,
      expect.objectContaining({ plan: expect.anything() }),
    ]);
    expect(recordStageLlmUsage).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('never plans an old approved packet while its native scope revision is pending rebuild', async () => {
    const packet = nativeScopePacketFixture({
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['mixed_custom'],
        geographies: [],
        channels: [],
        success_criteria: ['The approved deliverable is reviewable'],
        required_capabilities: [],
        requested_actions: [],
      },
    });
    const goal = executableStrictNativePrdGoal(packet);
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-current',
    };
    loadGoal.mockResolvedValue(goal);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'scope_drift_reapproval_required',
      reasons: expect.arrayContaining(['native_scope_revision_pending']),
    });
    expect(executeLlm).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('fails closed instead of invoking the raw-goal legacy planner for a native scope', async () => {
    const packet = nativeScopePacketFixture({
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['mixed_custom'],
        geographies: [],
        channels: [],
        success_criteria: ['The custom deliverable is reviewable'],
        required_capabilities: [],
        requested_actions: [],
      },
    });
    const goal = executableStrictNativePrdGoal(packet);
    loadGoal.mockResolvedValue(goal);
    executeLlm.mockResolvedValue({ content: 'not valid planner JSON', estimatedCostUsd: 0.02 });
    parseLlmJson.mockReturnValue(null);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'needs_human_native_scope_planner',
      scopeHash: packet.scope_hash,
    });
    expect(executeLlm).toHaveBeenCalledTimes(1);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenLastCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({ scope_hash: packet.scope_hash }),
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_code: 'native_scope_planner_invalid',
          failure_stage: 'pm-planning:native-scope-authority',
        }),
      })
    );
    expect(recordStageLlmUsage).toHaveBeenCalledTimes(1);
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'an explicitly authorized connector',
      mutate(goal) {
        goal.data.authorized_tool_ids = ['tool-github'];
      },
    },
    {
      name: 'research-assisted routing',
      mutate(goal) {
        goal.data.axwise_customer_intelligence.routing_assessment = {
          selected_mode: 'research_assisted',
        };
      },
    },
    {
      name: 'a code deliverable',
      packet: packetWithDeliverable({ type: 'code', presentation: 'structured_data' }),
      mutate(goal) {
        goal.description = 'Implement a CLI and return its code repository.';
      },
    },
    {
      name: 'a deployment deliverable',
      packet: packetWithDeliverable({ type: 'deployment', presentation: 'mixed' }),
      mutate(goal) {
        goal.description = 'Build and deploy a web app.';
      },
    },
    {
      name: 'a non-Markdown chat response',
      packet: packetWithDeliverable({ type: 'answer', presentation: 'chat_response' }),
    },
  ])('retains PM inference for $name', async ({ packet, mutate }) => {
    const goal = executableStrictNativePrdGoal(packet || nativeScopePacketFixture());
    mutate?.(goal);
    acceptNativePlanningScope(goal);
    loadGoal.mockResolvedValue(goal);
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.01 });
    parseLlmJson.mockReturnValue(ordinaryPlannerResult());

    await handle({}, { goalId: goal.id });

    expect(executeLlm).toHaveBeenCalledTimes(1);
    expect(recordStageLlmUsage).toHaveBeenCalledTimes(1);
  });

  it('fails closed before planning when required grounded research cannot be loaded', async () => {
    loadGoal.mockResolvedValue({
      id: 'goal-1',
      user_id: 'user-1',
      org_id: 'org-1',
      status: 'planning',
      mode: 'advanced',
      tech_doc: {},
      data: {
        research_policy: {
          required: true,
          mode: 'grounded_deep',
          grounding_required: true,
        },
      },
    });
    loadGoalResearchBundle.mockRejectedValue(new Error('research relation unavailable'));

    const result = await handle({}, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human_research_boundary' });
    expect(executeLlm).not.toHaveBeenCalled();
    expect(updateGoal).toHaveBeenLastCalledWith(
      {},
      'goal-1',
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_stage: 'pm-planning:research-boundary',
          axwise_customer_intelligence: expect.objectContaining({
            status: 'required_research_blocked',
            research_failure: expect.objectContaining({
              code: 'research_bundle_load_failed',
              retryable: true,
            }),
          }),
        }),
      })
    );
  });

  it('blocks an unbound statutory value before persisting the generated plan', async () => {
    const { goal, research } = v2PlanningFixture();
    goal.user_id = 'saved-gemini-owner';
    research.run.user_id = goal.user_id;
    goal.data.goal_approvals.context = approvedApproval(
      'context',
      buildContextApprovalSnapshot(goal),
      goal.user_id
    );
    const generatedPlan = {
      strategy: 'Apply a VAT rate of 22 percent during rollout.',
      phases: [
        {
          name: 'Execution',
          description: 'Implement the approved operating model.',
          jobs: [
            {
              title: 'Prepare rollout',
              description: 'Create the qualitative rollout materials.',
              required_role: 'Operations Strategist',
              deliverable_type: 'markdown',
              tool_requirements: [],
            },
          ],
        },
      ],
    };
    loadGoal.mockResolvedValue(goal);
    loadGoalResearchBundle.mockResolvedValue(research);
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.01 });
    parseLlmJson.mockReturnValue(generatedPlan);

    const result = await handle({}, { goalId: 'goal-1' });

    expect(result).toMatchObject({ status: 'needs_human_evidence_authority' });
    expect(executeLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        userId: goal.user_id,
      })
    );
    expect(updateGoal).toHaveBeenLastCalledWith(
      {},
      'goal-1',
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_stage: 'pm-planning:evidence-authority',
          evidence_authority: expect.objectContaining({ status: 'blocked' }),
        }),
      })
    );
    expect(updateGoal.mock.calls).not.toContainEqual([
      {},
      'goal-1',
      expect.objectContaining({ plan: expect.anything() }),
    ]);
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'research bundle load failure',
      arrange: () =>
        loadGoalResearchBundle.mockRejectedValue(new Error('research relation unavailable')),
      failureCode: 'research_bundle_load_failed',
    },
    {
      name: 'stale or incomplete research bundle',
      arrange: () => loadGoalResearchBundle.mockResolvedValue(null),
      failureCode: 'research_contract_invalid',
    },
  ])('does not persist a stale native scope after $name', async ({ arrange, failureCode }) => {
    const goal = nativeGoalWithResearchPointer();
    loadGoal.mockResolvedValue(goal);
    arrange();
    // Entry owns the accepted packet; the failure transition loses ownership
    // because a corrected native scope landed while research was being loaded.
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'stale_native_scope',
      scopeHash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
    });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledTimes(2);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenLastCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({
        scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
        planning_authority: expect.objectContaining({ context_status: 'approved' }),
      }),
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_stage: 'pm-planning:research-boundary',
          axwise_customer_intelligence: expect.objectContaining({
            research_failure: expect.objectContaining({ code: failureCode }),
          }),
        }),
      })
    );
    expect(updateGoal).not.toHaveBeenCalled();
    expect(logGoalEvent).not.toHaveBeenCalled();
    expect(recordStageLlmUsage).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
  });

  it('blocks when fail-closed Auto research selected a run whose current bundle is missing', async () => {
    const goal = nativeGoalWithResearchPointer();
    goal.data.research_policy = {
      required: false,
      research_mode: 'auto',
      grounding_required: false,
      research_fail_closed: true,
    };
    loadGoal.mockResolvedValue(goal);
    loadGoalResearchBundle.mockResolvedValue(null);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({ status: 'needs_human_research_boundary' });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenLastCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({
        scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      }),
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_stage: 'pm-planning:research-boundary',
          research_boundary: expect.objectContaining({
            reasons: expect.arrayContaining(['research_bundle_missing']),
          }),
        }),
      })
    );
    expect(executeLlm).not.toHaveBeenCalled();
  });

  it('does not persist a stale native evidence-authority rejection after scope correction', async () => {
    const { goal, research } = nativeV2PlanningFixture();
    goal.user_id = 'saved-gemini-owner';
    research.run.user_id = goal.user_id;
    acceptNativePlanningScope(goal);
    loadGoal.mockResolvedValue(goal);
    loadGoalResearchBundle.mockResolvedValue(research);
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.01 });
    parseLlmJson.mockReturnValue({
      strategy: 'Apply a VAT rate of 22 percent during rollout.',
      phases: [
        {
          name: 'Execution',
          description: 'Implement the approved operating model.',
          jobs: [
            {
              title: 'Prepare rollout',
              description: 'Create the qualitative rollout materials.',
              required_role: 'Operations Strategist',
              deliverable_type: 'markdown',
              tool_requirements: [],
            },
          ],
        },
      ],
    });
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'stale_native_scope',
      scopeHash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
    });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledTimes(2);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenLastCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({
        scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
        planning_authority: expect.objectContaining({ context_status: 'approved' }),
      }),
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_stage: 'pm-planning:evidence-authority',
        }),
      })
    );
    expect(updateGoal).not.toHaveBeenCalled();
    expect(logGoalEvent).not.toHaveBeenCalled();
    expect(recordStageLlmUsage).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('does not persist a stale native role-alignment rejection after scope correction', async () => {
    const packet = mixedCustomNativePacket({ required_capabilities: ['Quantum Cartographer'] });
    const goal = executableStrictNativePrdGoal(packet);
    loadGoal.mockResolvedValue(goal);
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.01 });
    parseLlmJson.mockReturnValue({
      strategy: 'Prepare the approved output.',
      phases: [
        {
          name: 'Execution',
          description: 'Prepare the output.',
          jobs: [
            {
              title: 'Prepare output',
              description: 'Create the approved artifact.',
              required_role: 'Team Lead',
              deliverable_type: 'markdown',
              tool_requirements: [],
            },
          ],
        },
      ],
    });
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await handle({}, { goalId: goal.id });

    expect(result).toMatchObject({
      status: 'stale_native_scope',
      scopeHash: packet.scope_hash,
    });
    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledTimes(2);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenLastCalledWith(
      {},
      goal.id,
      'planning',
      expect.objectContaining({
        scope_hash: packet.scope_hash,
        planning_authority: expect.objectContaining({ context_status: 'approved' }),
      }),
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({ failure_stage: 'pm-planning:role-alignment' }),
      })
    );
    expect(updateGoal).not.toHaveBeenCalled();
    expect(logGoalEvent).not.toHaveBeenCalled();
    expect(recordStageLlmUsage).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });
});
