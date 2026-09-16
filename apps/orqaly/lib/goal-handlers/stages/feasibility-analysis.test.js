import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeLlmTracked: vi.fn(),
  listConfiguredToolIds: vi.fn(),
  loadGoal: vi.fn(),
  updateGoal: vi.fn(),
  enqueueGoalAction: vi.fn(),
  logGoalEvent: vi.fn(),
  notifyGoalEvent: vi.fn(),
}));

vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: (...args) => mocks.executeLlmTracked(...args),
}));

vi.mock('../../security/tool-credential-status.js', () => ({
  listConfiguredToolIds: (...args) => mocks.listConfiguredToolIds(...args),
}));

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  parseLlmJson: (value) => JSON.parse(value),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../_helpers.js', () => ({
  CATEGORY_TOOLS: {
    research: ['tool-web-search'],
    content: [],
    outreach: ['tool-email'],
    analysis: ['tool-web-search'],
    development: ['tool-github'],
    design: ['tool-canva'],
    automation: ['tool-browser'],
    general: ['tool-web-search'],
  },
  loadGoal: (...args) => mocks.loadGoal(...args),
  updateGoal: (...args) => mocks.updateGoal(...args),
  enqueueGoalAction: (...args) => mocks.enqueueGoalAction(...args),
  logGoalEvent: (...args) => mocks.logGoalEvent(...args),
  notifyGoalEvent: (...args) => mocks.notifyGoalEvent(...args),
  pickTestModel: vi.fn(() => ({ provider: 'gemini', model: 'gemini-test' })),
}));

import {
  checkToolAvailability,
  handle,
  isAxwiseManagedGroundedResearch,
} from './feasibility-analysis.js';
import {
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
  executionRolesForEvidenceProfile,
} from '../../integrations/axwise/evidence-contract-v2.js';
import {
  confirmMarketScope,
  marketScopeHashPayload,
  resolveMarketExpression,
} from '../../_shared/market-scope.js';

const ORG_ID = '94e11a63-49fb-4568-9807-5c26e15dd8ea';
const RECEIPT_AT = '2026-08-14T22:14:37.672Z';
const EXECUTION_OPEN = Object.freeze({
  AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'true',
  AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS: '',
  AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product',
  AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS: '',
});

function canonicalMarket() {
  const marketScope = confirmMarketScope(resolveMarketExpression('Estonia'));
  const marketScopeHash = createHash('sha256')
    .update(JSON.stringify(marketScopeHashPayload(marketScope)))
    .digest('hex');
  marketScope.resolution_hash = marketScopeHash;
  return { marketScope, marketScopeHash };
}

function pr59Goal() {
  const { marketScope, marketScopeHash } = canonicalMarket();
  const profile = createBusinessEvidenceProfile(
    {
      intent: 'commercial_market_launch',
      economic_model: 'physical_product',
      fact_requirements: [
        {
          kind: 'physical_product_offer',
          minimum_verified: 2,
          applicability: 'required',
        },
      ],
      calculation_requirements: [
        {
          kind: 'physical_offer_price_difference',
          minimum_verified: 1,
          applicability: 'required',
        },
      ],
      required_role_slots: [
        'customer_market',
        'pricing_finance',
        'legal_compliance',
        'sales_distribution',
        'risk_operations',
      ],
    },
    { marketScopeHash }
  );
  return {
    id: 'f87c5d14-9ede-401e-9bd2-b86b09effd99',
    user_id: 'user_pr59',
    org_id: ORG_ID,
    status: 'feasibility',
    mode: 'advanced',
    execution_mode: 'auto',
    title: 'PR59 Production V2 — Estonia Cat Food Evidence Canary',
    description:
      'Create an Estonia-only commercial launch plan for cat food. Ground it in the current standard VAT and effective date from the national tax authority, the latest completed official cat-food import statistic, and two current signed first-party Estonian offers. Treat every requested evidence value as unknown until acquired.',
    budget_usd: 50,
    spent_usd: 0,
    parsed_category: 'commerce',
    parsed_requirements: '',
    data: {
      attachments: [],
      evidence: {
        status: 'persisted',
        attachment_count: 0,
        persisted_at: RECEIPT_AT,
      },
      smart_request_admission: {
        version: 1,
        status: 'started',
        authorized_agent_ids: ['agent-1'],
        checked_at: RECEIPT_AT,
        started_at: RECEIPT_AT,
      },
      research_policy: {
        version: 2,
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
        location: 'Estonia',
        market_scope: marketScope,
        market_scope_hash: marketScopeHash,
        evidence_contract_version: 2,
        intent: profile.intent,
        business_evidence_profile: profile,
        business_evidence_profile_hash: businessEvidenceProfileHash(profile),
        required_role_slots: [...profile.required_role_slots],
        requested_execution_roles: executionRolesForEvidenceProfile(profile),
      },
    },
  };
}

function legacyPr59Goal() {
  const goal = pr59Goal();
  delete goal.data.smart_request_admission;
  return goal;
}

function clone(value) {
  return structuredClone(value);
}

function historicalAdmin() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };
  return { from: vi.fn(() => query) };
}

function feasibilityResult(recommendation = 'proceed') {
  return {
    content: JSON.stringify({
      complexity_score: 0.7,
      complexity_reason: 'The evidence contract is deliberately rigorous.',
      profitability: {
        estimated_token_cost: 2,
        estimated_service_cost: 0,
        revenue_potential: 'medium',
        revenue_potential_reason: 'A launch can create revenue.',
        roi_projection: 'positive',
      },
      feasibility: {
        success_probability: 0.8,
        risk_factors: ['Evidence acquisition must complete before planning.'],
        competitive_analysis: 'The market is competitive.',
        tool_availability: {
          available: ['hallucinated-tool'],
          missing: ['tool-web-search'],
        },
      },
      historical: { similar_goals_count: 999 },
      recommendation,
      recommendation_reason:
        recommendation === 'adjust'
          ? 'The commercial scope itself needs user clarification.'
          : 'The admitted evidence workflow is feasible.',
    }),
    provider: 'gemini',
    estimatedCostUsd: 0,
  };
}

describe('AxWise-managed feasibility research boundary', () => {
  beforeEach(() => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', '');
    mocks.listConfiguredToolIds.mockResolvedValue(new Set());
    mocks.updateGoal.mockResolvedValue(undefined);
    mocks.enqueueGoalAction.mockResolvedValue(undefined);
    mocks.logGoalEvent.mockResolvedValue(undefined);
    mocks.notifyGoalEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('recognizes the exact started PR59 contract while new admission is closed', () => {
    expect(isAxwiseManagedGroundedResearch(pr59Goal(), EXECUTION_OPEN)).toBe(true);
  });

  it('removes only web search while retaining actual execution-tool prerequisites', async () => {
    const result = await checkToolAvailability(
      null,
      'user_pr59',
      'Research, email, code, design, and automate browser work',
      { axwiseManagedResearch: true }
    );

    expect(mocks.listConfiguredToolIds).toHaveBeenCalledWith(null, 'user_pr59', [
      'tool-email',
      'tool-github',
      'tool-canva',
      'tool-browser',
    ]);
    expect(result).toEqual({
      available: [],
      missing: ['tool-email', 'tool-github', 'tool-canva', 'tool-browser'],
    });
  });

  it('retains web search for ordinary Advanced research', async () => {
    const goal = pr59Goal();
    delete goal.data.smart_request_admission;
    delete goal.data.evidence;
    delete goal.data.research_policy.business_evidence_profile;
    delete goal.data.research_policy.business_evidence_profile_hash;

    expect(isAxwiseManagedGroundedResearch(goal, EXECUTION_OPEN)).toBe(false);
    await expect(
      checkToolAvailability(null, goal.user_id, 'Research the market', {
        axwiseManagedResearch: false,
      })
    ).resolves.toEqual({ available: [], missing: ['tool-web-search'] });
  });

  it.each([
    ['tenantless row', (goal) => (goal.org_id = '')],
    ['noncanonical tenant', (goal) => (goal.org_id = ORG_ID.toUpperCase())],
    ['missing user binding', (goal) => (goal.user_id = '')],
    ['draft admission', (goal) => (goal.data.smart_request_admission.status = 'draft')],
    [
      'missing agent catalogue',
      (goal) => (goal.data.smart_request_admission.authorized_agent_ids = []),
    ],
    [
      'duplicated agent receipt',
      (goal) => (goal.data.smart_request_admission.authorized_agent_ids = ['agent-1', 'agent-1']),
    ],
    [
      'start receipt timestamp drift',
      (goal) => (goal.data.smart_request_admission.checked_at = '2026-08-14T22:14:36.672Z'),
    ],
    [
      'evidence receipt timestamp drift',
      (goal) => (goal.data.evidence.persisted_at = '2026-08-14T22:14:38.672Z'),
    ],
    ['unpersisted evidence', (goal) => (goal.data.evidence.status = 'awaiting_persistence')],
    ['attachment count drift', (goal) => (goal.data.evidence.attachment_count = 1)],
    ['v1 policy', (goal) => (goal.data.research_policy.version = 1)],
    ['contract version drift', (goal) => (goal.data.research_policy.evidence_contract_version = 1)],
    ['instant mode', (goal) => (goal.data.research_policy.research_mode = 'instant')],
    ['grounding disabled', (goal) => (goal.data.research_policy.grounding_required = false)],
    ['fail-open policy', (goal) => (goal.data.research_policy.research_fail_closed = false)],
    [
      'profile hash drift',
      (goal) => (goal.data.research_policy.business_evidence_profile_hash = 'b'.repeat(64)),
    ],
    ['intent drift', (goal) => (goal.data.research_policy.intent = 'operational_process')],
    ['market hash drift', (goal) => (goal.data.research_policy.market_scope_hash = 'c'.repeat(64))],
    [
      'role slot drift',
      (goal) => (goal.data.research_policy.required_role_slots = ['customer_market']),
    ],
    [
      'executor role drift',
      (goal) => (goal.data.research_policy.requested_execution_roles = ['Researcher']),
    ],
    [
      'malformed profile',
      (goal) => (goal.data.research_policy.business_evidence_profile.unadmitted = true),
    ],
  ])('fails closed for %s', (_label, mutate) => {
    const goal = clone(pr59Goal());
    mutate(goal);
    expect(isAxwiseManagedGroundedResearch(goal, EXECUTION_OPEN)).toBe(false);
  });

  it('does not exempt an empty none-model envelope from web research', () => {
    const goal = pr59Goal();
    const policy = goal.data.research_policy;
    const profile = createBusinessEvidenceProfile(
      {
        intent: 'commercial_market_launch',
        economic_model: 'none',
        market_scope_hash: policy.market_scope_hash,
        fact_requirements: [],
        calculation_requirements: [],
        required_role_slots: [],
      },
      { marketScopeHash: policy.market_scope_hash }
    );
    policy.business_evidence_profile = profile;
    policy.business_evidence_profile_hash = businessEvidenceProfileHash(profile);
    policy.required_role_slots = [];
    policy.requested_execution_roles = [];

    expect(
      isAxwiseManagedGroundedResearch(goal, {
        ...EXECUTION_OPEN,
        AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'none',
      })
    ).toBe(false);
  });

  it.each([
    ['global v2 disabled', { AXWISE_EVIDENCE_PROFILE_V2_ENABLED: 'false' }],
    ['execution closed', { AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: '' }],
    [
      'execution allowlist malformed',
      { AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS: 'physical_product,physical_product' },
    ],
  ])('retains web search when %s', (_label, override) => {
    expect(isAxwiseManagedGroundedResearch(pr59Goal(), { ...EXECUTION_OPEN, ...override })).toBe(
      false
    );
  });

  it('does not re-add web search when another credential lookup fails', async () => {
    mocks.listConfiguredToolIds.mockRejectedValueOnce(new Error('metadata unavailable'));

    await expect(
      checkToolAvailability(null, 'user_pr59', 'Research and send email', {
        axwiseManagedResearch: true,
      })
    ).resolves.toEqual({ available: [], missing: ['tool-email'] });
  });

  it('redirects a historical Smart-start row before the legacy stage can consume raw prose', async () => {
    const goal = pr59Goal();
    mocks.loadGoal.mockResolvedValueOnce(goal);

    const result = await handle(historicalAdmin(), { goalId: goal.id }, null);

    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
    expect(mocks.listConfiguredToolIds).not.toHaveBeenCalled();
    expect(mocks.updateGoal).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'state_changed' });
  });

  it('does not override a legitimate non-tool adjust recommendation', async () => {
    const goal = legacyPr59Goal();
    mocks.loadGoal.mockResolvedValueOnce(goal);
    mocks.executeLlmTracked.mockResolvedValueOnce(feasibilityResult('adjust'));

    const result = await handle(historicalAdmin(), { goalId: goal.id }, null);

    expect(mocks.updateGoal).toHaveBeenCalledWith(expect.anything(), goal.id, {
      status: 'paused',
    });
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'adjust' });
  });
});

describe('feasibility adjust gate, hands-off goals', () => {
  beforeEach(() => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', '');
    mocks.listConfiguredToolIds.mockResolvedValue(new Set());
    mocks.updateGoal.mockResolvedValue(undefined);
    mocks.enqueueGoalAction.mockResolvedValue(undefined);
    mocks.logGoalEvent.mockResolvedValue(undefined);
    mocks.notifyGoalEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('continues past an adjust recommendation on an unattended advanced goal', async () => {
    // pr59Goal is mode:'advanced', which used to pause here unconditionally.
    // hitl_mode is the only thing that reaches advanced goals.
    const goal = { ...legacyPr59Goal(), hitl_mode: 'unattended' };
    mocks.loadGoal.mockResolvedValueOnce(goal);
    mocks.executeLlmTracked.mockResolvedValueOnce(feasibilityResult('adjust'));

    const result = await handle(historicalAdmin(), { goalId: goal.id }, null);

    expect(result).toMatchObject({ status: 'proceed_with_warning' });
    expect(mocks.updateGoal).not.toHaveBeenCalledWith(expect.anything(), goal.id, {
      status: 'paused',
    });
    expect(mocks.enqueueGoalAction).toHaveBeenCalledWith(expect.anything(), 'po-analysis', goal.id);
    expect(mocks.logGoalEvent).toHaveBeenCalledWith(
      expect.anything(),
      goal.id,
      'feasibility_adjust_noted',
      expect.objectContaining({ hands_off_reason: 'unattended' })
    );
  });

  it('still pauses an advanced checkpoints goal on adjust', async () => {
    const goal = { ...legacyPr59Goal(), hitl_mode: 'checkpoints' };
    mocks.loadGoal.mockResolvedValueOnce(goal);
    mocks.executeLlmTracked.mockResolvedValueOnce(feasibilityResult('adjust'));

    const result = await handle(historicalAdmin(), { goalId: goal.id }, null);

    expect(result).toMatchObject({ status: 'adjust' });
    expect(mocks.updateGoal).toHaveBeenCalledWith(expect.anything(), goal.id, {
      status: 'paused',
    });
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('keeps the legacy simple plus auto hands-off path working', async () => {
    const goal = { ...legacyPr59Goal(), mode: 'simple', execution_mode: 'auto' };
    mocks.loadGoal.mockResolvedValueOnce(goal);
    mocks.executeLlmTracked.mockResolvedValueOnce(feasibilityResult('adjust'));

    const result = await handle(historicalAdmin(), { goalId: goal.id }, null);

    expect(result).toMatchObject({ status: 'proceed_with_warning' });
    expect(mocks.logGoalEvent).toHaveBeenCalledWith(
      expect.anything(),
      goal.id,
      'feasibility_adjust_noted',
      expect.objectContaining({ hands_off_reason: 'simple/auto mode' })
    );
  });
});
