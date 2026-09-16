import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agent-handlers/job-processor.js', () => ({
  processNextJob: vi.fn(async () => ({ processed: 0 })),
}));
vi.mock('../goal-handlers/_helpers.js', () => {
  const triggerProcessNext = vi.fn(() => true);
  return {
    triggerProcessNext,
    wakeAgentJobExact: vi.fn(async (_admin, job, { triggerProcessNextImpl, env }) => {
      const triggered = await triggerProcessNextImpl(
        env === process.env ? { jobId: job.id } : { jobId: job.id, env }
      );
      if (triggered !== true) {
        const error = new Error('Unable to wake Preview agent job');
        error.code = 'PREVIEW_EXACT_WAKE_UNAVAILABLE';
        throw error;
      }
      return { jobId: job.id, triggered: true };
    }),
  };
});

import {
  handleCreate,
  handleCreateSmartRequestDraft,
  handlePreparePhysicalEvidenceProfile,
  handleStartSmartRequest,
  normalizeGoalResearchPolicy,
  normalizeGoalToolMode,
  validateOrganizationAgentCatalogue,
} from './goals.js';
import {
  BUSINESS_EVIDENCE_PROFILE_VERSION,
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
  executionRolesForEvidenceProfile,
} from '../integrations/axwise/evidence-contract-v2.js';
import { processNextJob } from '../agent-handlers/job-processor.js';
import { triggerProcessNext } from '../goal-handlers/_helpers.js';

const CANARY_ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function smartRequestDraftAdmin() {
  const insertedGoals = [];
  const insertedJobs = [];
  const admin = {
    insertedGoals,
    insertedJobs,
    from: vi.fn((table) => {
      if (table === 'organizations') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { id: CANARY_ORG_ID }, error: null })),
        };
        return query;
      }
      if (table === 'org_agents') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          then(resolve) {
            return Promise.resolve({ data: [{ agent_id: 'agent-1' }], error: null }).then(resolve);
          },
        };
        return query;
      }
      if (table === 'agents') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(async () => ({ data: [{ id: 'agent-1' }], error: null })),
        };
        return query;
      }
      if (table === 'goals') {
        return {
          insert: vi.fn((payload) => {
            insertedGoals.push(payload);
            const query = {
              select: vi.fn(() => query),
              single: vi.fn(async () => ({
                data: {
                  id: 'goal-1',
                  ...payload,
                  loop_chain_root_id: 'goal-1',
                  created_at: '2026-08-10T00:00:00.000Z',
                },
                error: null,
              })),
            };
            return query;
          }),
        };
      }
      if (table === 'goal_log') {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      if (table === 'agent_jobs') {
        return {
          insert: vi.fn(async (payload) => {
            insertedJobs.push(payload);
            return { error: null };
          }),
        };
      }
      throw new Error(`Unexpected table access: ${table}`);
    }),
  };
  return admin;
}

function idempotentLegacyCreateAdmin() {
  let goal = null;
  const jobs = [];
  const filtersMatch = (row, filters) =>
    filters.every(([field, expected]) => {
      const current = field.startsWith('payload->>')
        ? row.payload?.[field.slice('payload->>'.length)]
        : row[field];
      return current === expected || String(current) === String(expected);
    });
  const queryFor = (row, { patch = null } = {}) => {
    const filters = [];
    const query = {
      eq(field, value) {
        filters.push([field, value]);
        return query;
      },
      select() {
        return query;
      },
      async maybeSingle() {
        if (!row() || !filtersMatch(row(), filters)) return { data: null, error: null };
        if (patch) Object.assign(row(), structuredClone(patch));
        return { data: structuredClone(row()), error: null };
      },
      then(resolve, reject) {
        return query.maybeSingle().then(resolve, reject);
      },
    };
    return query;
  };
  const admin = {
    jobs,
    get goal() {
      return structuredClone(goal);
    },
    from(table) {
      if (table === 'organizations') {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: { id: CANARY_ORG_ID }, error: null }),
        };
        return query;
      }
      if (table === 'goals') {
        return {
          insert: (payload) => {
            const query = {
              select: () => query,
              single: async () => {
                if (goal) {
                  return {
                    data: null,
                    error: { code: '23505', message: 'duplicate deterministic goal id' },
                  };
                }
                goal = {
                  ...structuredClone(payload),
                  loop_chain_root_id: payload.id,
                  created_at: '2026-08-22T20:00:00.000Z',
                  updated_at: '2026-08-22T20:00:00.000Z',
                };
                return { data: structuredClone(goal), error: null };
              },
            };
            return query;
          },
          select: () => queryFor(() => goal),
          update: (patch) => queryFor(() => goal, { patch }),
        };
      }
      if (table === 'agent_jobs') {
        return {
          insert: async (payload) => {
            jobs.push({ ...structuredClone(payload), worker_scope: 'preview' });
            return { error: null };
          },
          select: () => {
            let selected = null;
            const query = queryFor(() => selected);
            const originalEq = query.eq;
            query.eq = (field, value) => {
              selected = jobs.find((job) => filtersMatch(job, [[field, value]])) || null;
              return originalEq.call(query, field, value);
            };
            return query;
          },
          update: (patch) => {
            const filters = [];
            const query = {
              eq(field, value) {
                filters.push([field, value]);
                return query;
              },
              select() {
                return query;
              },
              async maybeSingle() {
                const job = jobs.find((candidate) => filtersMatch(candidate, filters));
                if (!job) return { data: null, error: null };
                Object.assign(job, structuredClone(patch));
                return { data: structuredClone(job), error: null };
              },
            };
            return query;
          },
        };
      }
      if (table === 'goal_log') return { insert: async () => ({ error: null }) };
      throw new Error(`Unexpected table access: ${table}`);
    },
  };
  return admin;
}

function smartRequestStartAdmin({
  casSucceeds = true,
  rollbackSucceeds = true,
  jobInsertError = null,
  knowledgeDocuments = [],
} = {}) {
  const draft = {
    id: 'goal-start-1',
    user_id: 'user-1',
    org_id: CANARY_ORG_ID,
    title: 'Started Smart Request',
    status: 'draft',
    parsed_category: 'commerce',
    parsed_priority: 'high',
    parsed_requirements: '',
    executor_type: 'organization',
    data: {
      evidence: { status: 'awaiting_persistence', attachment_count: 0 },
      smart_request_admission: {
        version: 1,
        status: 'draft',
        authorized_agent_ids: ['agent-1'],
        checked_at: '2026-08-14T22:00:00.000Z',
      },
    },
  };
  const state = { goalUpdates: [], goalUpdateFilters: [], jobs: [], logs: [], kbFilters: [] };
  const admin = {
    state,
    from: vi.fn((table) => {
      if (table === 'organizations') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { id: CANARY_ORG_ID }, error: null })),
        };
        return query;
      }
      if (table === 'org_agents') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          then(resolve) {
            return Promise.resolve({ data: [{ agent_id: 'agent-1' }], error: null }).then(resolve);
          },
        };
        return query;
      }
      if (table === 'agents') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(async () => ({ data: [{ id: 'agent-1' }], error: null })),
        };
        return query;
      }
      if (table === 'goals') {
        let updatePayload = null;
        let updateIndex = -1;
        const updateFilters = [];
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((field, value) => {
            if (updatePayload) updateFilters.push([field, value]);
            return query;
          }),
          update: vi.fn((payload) => {
            updatePayload = payload;
            updateIndex = state.goalUpdates.length;
            state.goalUpdates.push(payload);
            state.goalUpdateFilters.push(updateFilters);
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            if (!updatePayload) return { data: draft, error: null };
            return {
              data: (updateIndex === 0 ? casSucceeds : rollbackSucceeds)
                ? { ...draft, ...updatePayload }
                : null,
              error: null,
            };
          }),
        };
        return query;
      }
      if (table === 'knowledge_documents') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((column, value) => {
            state.kbFilters.push(['eq', column, value]);
            return query;
          }),
          in: vi.fn(async (column, values) => {
            state.kbFilters.push(['in', column, values]);
            return { data: knowledgeDocuments, error: null };
          }),
        };
        return query;
      }
      if (table === 'agent_jobs') {
        return {
          insert: vi.fn(async (payload) => {
            if (!jobInsertError) state.jobs.push(payload);
            return { error: jobInsertError };
          }),
          select: vi.fn(() => {
            const query = {
              eq: vi.fn(() => query),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            };
            return query;
          }),
        };
      }
      if (table === 'goal_log') {
        return {
          insert: vi.fn(async (payload) => {
            state.logs.push(payload);
            return { error: null };
          }),
        };
      }
      throw new Error(`Unexpected table access: ${table}`);
    }),
  };
  return admin;
}

function catalogueAdmin({
  mappings = [],
  agents = [],
  mappingError = null,
  agentError = null,
} = {}) {
  const filters = [];
  return {
    filters,
    from: vi.fn((table) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column, value) => {
          filters.push([table, 'eq', column, value]);
          return query;
        }),
        in: vi.fn((column, values) => {
          filters.push([table, 'in', column, values]);
          return Promise.resolve({ data: agents, error: agentError });
        }),
        then(resolve) {
          if (table === 'org_agents') {
            return Promise.resolve({ data: mappings, error: mappingError }).then(resolve);
          }
          return Promise.resolve({ data: agents, error: agentError }).then(resolve);
        },
      };
      return query;
    }),
  };
}

function organizationBoundaryAdmin({ owned = true } = {}) {
  const filters = [];
  return {
    filters,
    from: vi.fn((table) => {
      if (table !== 'organizations') throw new Error(`Unexpected table access: ${table}`);
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column, value) => {
          filters.push([column, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data: owned ? { id: CANARY_ORG_ID } : null,
          error: null,
        })),
      };
      return query;
    }),
  };
}

function enablePhysicalEvidenceRollout(orgIds = CANARY_ORG_ID) {
  vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
  vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'physical_product');
  vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
  vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', orgIds);
}

function physicalEvidencePreparationBody(overrides = {}) {
  return {
    mode: 'advanced',
    org_id: 'client-selected-org',
    research_mode: 'grounded_deep',
    grounding_required: true,
    research_fail_closed: true,
    research_location: 'Estonia',
    ...overrides,
  };
}

describe('Smart Request goal admission boundary', () => {
  it('wakes exactly the worker row inserted by the legacy create path', async () => {
    const admin = smartRequestDraftAdmin();

    const result = await handleCreate(
      admin,
      { id: 'user-1' },
      { title: 'Exact worker wake', org_id: CANARY_ORG_ID }
    );

    expect(result.status).toBe(201);
    expect(admin.insertedJobs).toHaveLength(1);
    expect(admin.insertedJobs[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(processNextJob).toHaveBeenCalledWith(admin, null, admin.insertedJobs[0].id);
    expect(processNextJob).not.toHaveBeenCalledWith(admin, null);
  });

  it('does not acknowledge legacy creation when the Preview worker rejects its exact job', async () => {
    const admin = smartRequestDraftAdmin();
    const kickProcessing = vi.fn(async () => ({ mode: 'preview-worker', triggered: false }));

    const result = await handleCreate(
      admin,
      { id: 'user-1' },
      { title: 'Unwoken exact worker', org_id: CANARY_ORG_ID },
      { kickProcessing }
    );

    expect(result).toMatchObject({
      status: 503,
      error:
        'Goal processing could not be handed to the Preview worker. Reconciliation is required; refresh and do not create replacement work.',
      data: {
        goal_id: 'goal-1',
        job_id: admin.insertedJobs[0].id,
        retry_safe: false,
      },
    });
    expect(admin.insertedJobs).toHaveLength(1);
    expect(kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', {
      jobId: admin.insertedJobs[0].id,
    });
  });

  it('returns the same durable ids instead of creating a duplicate after handoff failure', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_create_idempotency');
    const admin = idempotentLegacyCreateAdmin();
    const kickProcessing = vi.fn(async () => ({ mode: 'preview-worker', triggered: false }));
    const body = {
      title: 'Idempotent Preview create',
      org_id: CANARY_ORG_ID,
      source_request_id: 'request-create-1',
    };

    const first = await handleCreate(admin, { id: 'user-1' }, body, { kickProcessing });
    const second = await handleCreate(admin, { id: 'user-1' }, body, { kickProcessing });

    expect(first).toMatchObject({
      status: 503,
      data: {
        goal_id: expect.any(String),
        job_id: expect.any(String),
        reconciliation_state: 'terminalized-safe:parked',
        retry_safe: false,
      },
    });
    expect(second).toMatchObject({
      status: 503,
      data: {
        goal_id: first.data.goal_id,
        job_id: first.data.job_id,
        reconciliation_state: 'duplicate-create:parked',
        retry_safe: false,
      },
    });
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0].status).toBe('failed');
    expect(admin.goal).toMatchObject({
      id: first.data.goal_id,
      status: 'needs_human',
      data: {
        goal_handoff_reconciliation: { job_id: first.data.job_id, status: 'required' },
      },
    });
    expect(kickProcessing).toHaveBeenCalledTimes(1);
  });

  describe('physical evidence profile preparation', () => {
    it('returns the fixed canonical profile and full hashes without mutating goal state', async () => {
      enablePhysicalEvidenceRollout();
      const admin = organizationBoundaryAdmin();

      const result = await handlePreparePhysicalEvidenceProfile(
        admin,
        { id: 'user-1' },
        physicalEvidencePreparationBody()
      );

      expect(result).toMatchObject({
        status: 200,
        data: {
          research_intent: 'commercial_market_launch',
          business_evidence_profile: {
            version: 'business_evidence_profile_v1',
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
          business_evidence_profile_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          market_scope_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          requested_execution_roles: [
            'Marketing ICP Specialist',
            'Finance Pricing Specialist',
            'GDPR Legal Compliance Specialist',
            'Business Development Sales Specialist',
            'Commercial Risk Analyst',
          ],
          binding: {
            org_id: CANARY_ORG_ID,
            research_mode: 'grounded_deep',
            market_scope_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
      });
      expect(result.data.business_evidence_profile.market_scope_hash).toBe(
        result.data.market_scope_hash
      );
      expect(result.data.binding.market_scope_hash).toBe(result.data.market_scope_hash);
      expect(admin.from).toHaveBeenCalledTimes(1);
    });

    it('rejects an unowned organization before disclosing rollout or profile state', async () => {
      enablePhysicalEvidenceRollout();
      const admin = organizationBoundaryAdmin({ owned: false });

      const result = await handlePreparePhysicalEvidenceProfile(
        admin,
        { id: 'user-1' },
        physicalEvidencePreparationBody()
      );

      expect(result).toMatchObject({ status: 403, error: expect.stringMatching(/not owned/i) });
      expect(admin.filters).toEqual([
        ['id', 'client-selected-org'],
        ['user_id', 'user-1'],
        ['is_active', true],
      ]);
      expect(admin.from).toHaveBeenCalledTimes(1);
    });

    it('rejects an owned organization outside the admission cohort', async () => {
      enablePhysicalEvidenceRollout(OTHER_ORG_ID);
      const admin = organizationBoundaryAdmin();

      const result = await handlePreparePhysicalEvidenceProfile(
        admin,
        { id: 'user-1' },
        physicalEvidencePreparationBody()
      );

      expect(result).toMatchObject({
        status: 403,
        error: expect.stringMatching(/not enabled for this organization/i),
      });
    });

    it('rejects preparation while new profile admission is disabled', async () => {
      vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
      vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
      vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
      vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', CANARY_ORG_ID);
      const admin = organizationBoundaryAdmin();

      const result = await handlePreparePhysicalEvidenceProfile(
        admin,
        { id: 'user-1' },
        physicalEvidencePreparationBody()
      );

      expect(result).toMatchObject({
        status: 409,
        error: expect.stringMatching(/admission is not enabled/i),
      });
    });

    it('rejects a profile without a resolved grounded market', async () => {
      enablePhysicalEvidenceRollout();
      const admin = organizationBoundaryAdmin();

      const result = await handlePreparePhysicalEvidenceProfile(
        admin,
        { id: 'user-1' },
        physicalEvidencePreparationBody({ research_location: '' })
      );

      expect(result).toMatchObject({
        status: 400,
        error: expect.stringMatching(/research_location is required/i),
      });
    });

    it('treats preparation as data, then revalidates rollout flags during goal creation', async () => {
      enablePhysicalEvidenceRollout();
      const prepared = await handlePreparePhysicalEvidenceProfile(
        organizationBoundaryAdmin(),
        { id: 'user-1' },
        physicalEvidencePreparationBody()
      );
      expect(prepared.status).toBe(200);

      vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
      const admin = smartRequestDraftAdmin();
      const result = await handleCreateSmartRequestDraft(
        admin,
        { id: 'user-1' },
        {
          title: 'Prepared profile must not bypass create admission',
          ...physicalEvidencePreparationBody(),
          research_intent: prepared.data.research_intent,
          requested_execution_roles: prepared.data.requested_execution_roles,
          business_evidence_profile: prepared.data.business_evidence_profile,
          business_evidence_profile_hash: prepared.data.business_evidence_profile_hash,
        }
      );

      expect(result).toMatchObject({
        status: 400,
        error: expect.stringMatching(/economic_model physical_product is not enabled/i),
      });
      expect(admin.insertedGoals).toHaveLength(0);
    });
  });

  it('normalizes the persisted tool policy and defaults invalid callers to tool-enabled mode', () => {
    expect(normalizeGoalToolMode('no_tools')).toBe('no_tools');
    expect(normalizeGoalToolMode('existing_only')).toBe('existing_only');
    expect(normalizeGoalToolMode('with_tools')).toBe('with_tools');
    expect(normalizeGoalToolMode('ignore-policy')).toBe('with_tools');
    expect(normalizeGoalToolMode()).toBe('with_tools');
  });

  it('normalizes research policy with safe mode-specific defaults and explicit overrides', () => {
    expect(normalizeGoalResearchPolicy({ mode: 'simple' })).toEqual({
      version: 1,
      research_mode: 'instant',
      required: false,
      grounding_required: false,
      research_fail_closed: false,
      location: null,
    });
    expect(normalizeGoalResearchPolicy({ mode: 'advanced' })).toEqual({
      version: 1,
      research_mode: 'instant',
      required: false,
      grounding_required: false,
      research_fail_closed: false,
      location: null,
    });
    expect(
      normalizeGoalResearchPolicy({
        mode: 'advanced',
        research_mode: 'grounded_fast',
        grounding_required: false,
        research_fail_closed: false,
        research_location: 'Bremen, Germany',
      })
    ).toMatchObject({
      version: 2,
      research_mode: 'grounded_fast',
      grounding_required: false,
      research_fail_closed: false,
      location: 'Bremen, Germany',
    });
    expect(
      normalizeGoalResearchPolicy({
        mode: 'advanced',
        research_mode: 'grounded_fast',
        grounding_required: false,
        research_fail_closed: false,
        research_location: 'Bremen, Germany',
      })
    ).toMatchObject({
      market_scope: {
        schema_version: 'market_scope_v2',
        resolved_scope: {
          countries: [expect.objectContaining({ country_code: 'DE', localities: ['Bremen'] })],
        },
      },
      market_scope_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(normalizeGoalResearchPolicy({ mode: 'simple', research_mode: 'unsafe' })).toMatchObject({
      research_mode: 'instant',
    });
  });

  it('preserves profile-absent commercial title inference for v1 callers', () => {
    expect(
      normalizeGoalResearchPolicy({
        mode: 'advanced',
        title: 'Launch a physical cat-food offer into the Estonia market',
      })
    ).toMatchObject({
      intent: 'commercial_market_launch',
      customer_role_contract: { require_primary_buyer: true },
      critical_claim_policy: { required: true, fail_closed: true },
    });
  });

  it('persists the explicit tool policy on a two-step Smart Request draft', async () => {
    const admin = smartRequestDraftAdmin();

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'No-tools Smart Request',
        org_id: 'org-1',
        tool_mode: 'no_tools',
      }
    );

    expect(result).toMatchObject({
      status: 201,
      data: { data: { tool_mode: 'no_tools' } },
    });
    expect(admin.insertedGoals[0]).toMatchObject({
      status: 'draft',
      data: { tool_mode: 'no_tools' },
    });
  });

  it.each([
    ['omitted by an older client', {}],
    ['explicitly disabled by a crafted client', { research_fail_closed: false }],
  ])('server-enforces fail-closed AxWise admission when it is %s', async (_label, patch) => {
    const admin = smartRequestDraftAdmin();

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Canonical AxWise scope',
        org_id: 'org-1',
        mode: 'simple',
        research_mode: 'auto',
        ...patch,
      }
    );

    expect(result).toMatchObject({
      status: 201,
      data: {
        data: {
          research_policy: {
            research_mode: 'auto',
            required: false,
            grounding_required: false,
            research_fail_closed: true,
          },
        },
      },
    });
    const persistedPolicy = admin.insertedGoals[0].data.research_policy;
    expect(persistedPolicy.research_fail_closed).toBe(true);
    expect(persistedPolicy.required).toBe(false);
  });

  it('persists explicit ungrounded research as required and fail-closed server-side', async () => {
    const admin = smartRequestDraftAdmin();

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Run an exact synthetic evidence pass',
        org_id: 'org-1',
        mode: 'simple',
        research_mode: 'instant',
        research_required: true,
        research_fail_closed: false,
      }
    );

    expect(result).toMatchObject({
      status: 201,
      data: {
        data: {
          research_policy: {
            research_mode: 'instant',
            required: true,
            grounding_required: false,
            research_fail_closed: true,
          },
        },
      },
    });
  });

  it('persists explicit advanced research policy on a Smart Request draft', async () => {
    const admin = smartRequestDraftAdmin();

    await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Grounded Bremen research',
        org_id: 'org-1',
        mode: 'advanced',
        research_mode: 'grounded_fast',
        grounding_required: true,
        research_fail_closed: true,
        research_location: 'Bremen, Germany',
      }
    );

    expect(admin.insertedGoals[0]).toMatchObject({
      mode: 'advanced',
      data: {
        research_policy: {
          version: 2,
          research_mode: 'grounded_fast',
          grounding_required: true,
          research_fail_closed: true,
          location: 'Bremen, Germany',
        },
      },
    });
  });

  it('persists the canonical commercial intent, buyer policy, claims policy, and five roles', async () => {
    const admin = smartRequestDraftAdmin();
    const requestedRoles = [
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ];

    await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Estonia cat food commercial launch',
        org_id: 'org-1',
        mode: 'advanced',
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
        research_location: 'Estonia',
        research_intent: 'commercial_market_launch',
        requested_execution_roles: requestedRoles,
      }
    );

    expect(admin.insertedGoals[0].data.research_policy).toMatchObject({
      intent: 'commercial_market_launch',
      requested_execution_roles: requestedRoles,
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
  });

  it('persists a validated v2 evidence profile and derives dynamic execution roles when enabled', async () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', CANARY_ORG_ID);
    const scopePolicy = normalizeGoalResearchPolicy({
      mode: 'advanced',
      research_mode: 'grounded_deep',
      grounding_required: true,
      research_fail_closed: true,
      research_location: 'Estonia',
    });
    const evidenceProfile = createBusinessEvidenceProfile(
      {
        intent: 'operational_process',
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
        required_role_slots: ['domain_delivery', 'pricing_finance'],
      },
      { marketScopeHash: scopePolicy.market_scope_hash }
    );
    const admin = smartRequestDraftAdmin();

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Evaluate physical product offer pricing',
        org_id: 'org-1',
        mode: 'advanced',
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
        research_location: 'Estonia',
        research_intent: 'operational_process',
        business_evidence_profile: evidenceProfile,
        business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
      }
    );

    expect(result.status).toBe(201);
    expect(admin.insertedGoals[0].data.research_policy).toMatchObject({
      evidence_contract_version: 2,
      intent: 'operational_process',
      business_evidence_profile: evidenceProfile,
      business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
      required_role_slots: ['pricing_finance', 'domain_delivery'],
      requested_execution_roles: ['Finance Pricing Specialist', 'Domain Delivery Specialist'],
    });
    expect(admin.insertedGoals[0].org_id).toBe(CANARY_ORG_ID);
  });

  it('persists additive commercial authority policy while v2 profile slots own executor roles', async () => {
    enablePhysicalEvidenceRollout();
    const scopePolicy = normalizeGoalResearchPolicy({
      mode: 'advanced',
      research_location: 'Estonia',
    });
    const evidenceProfile = createBusinessEvidenceProfile(
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
        required_role_slots: ['legal_compliance', 'pricing_finance'],
      },
      { marketScopeHash: scopePolicy.market_scope_hash }
    );
    const admin = smartRequestDraftAdmin();

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Estonia physical-product commercial launch',
        org_id: 'org-1',
        mode: 'advanced',
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
        research_location: 'Estonia',
        business_evidence_profile: evidenceProfile,
        business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
      }
    );

    expect(result.status).toBe(201);
    expect(admin.insertedGoals[0].data.research_policy).toMatchObject({
      evidence_contract_version: 2,
      intent: 'commercial_market_launch',
      business_evidence_profile: evidenceProfile,
      required_role_slots: evidenceProfile.required_role_slots,
      requested_execution_roles: executionRolesForEvidenceProfile(evidenceProfile),
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
        authoritative_current_source_required: true,
        conflict_resolution_required: true,
      },
    });
  });

  it('admits a physical-product profile while a physical-only rollout rejects every other model', async () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', CANARY_ORG_ID);
    const scopePolicy = normalizeGoalResearchPolicy({
      mode: 'advanced',
      research_location: 'Estonia',
    });
    const makeProfile = (economicModel) =>
      createBusinessEvidenceProfile(
        {
          intent: 'operational_process',
          economic_model: economicModel,
          fact_requirements:
            economicModel === 'physical_product'
              ? [
                  {
                    kind: 'physical_product_offer',
                    minimum_verified: 2,
                    applicability: 'required',
                  },
                ]
              : [],
          calculation_requirements:
            economicModel === 'physical_product'
              ? [
                  {
                    kind: 'physical_offer_price_difference',
                    minimum_verified: 1,
                    applicability: 'required',
                  },
                ]
              : [],
          required_role_slots: [],
        },
        { marketScopeHash: scopePolicy.market_scope_hash }
      );
    const request = (economicModel) => {
      const evidenceProfile = makeProfile(economicModel);
      const admin = smartRequestDraftAdmin();
      return {
        admin,
        result: handleCreateSmartRequestDraft(
          admin,
          { id: 'user-1' },
          {
            title: `Evaluate ${economicModel}`,
            org_id: 'org-1',
            mode: 'advanced',
            research_location: 'Estonia',
            research_intent: 'operational_process',
            business_evidence_profile: evidenceProfile,
            business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
          }
        ),
      };
    };

    const physical = request('physical_product');
    expect(await physical.result).toMatchObject({ status: 201 });
    expect(physical.admin.insertedGoals).toHaveLength(1);

    for (const economicModel of ['subscription', 'usage_based', 'project_service', 'none']) {
      const blocked = request(economicModel);
      expect(await blocked.result).toMatchObject({
        status: 400,
        error: expect.stringMatching(/economic_model .* is not enabled/i),
      });
      expect(blocked.admin.insertedGoals).toHaveLength(0);
    }
  });

  it('rejects physical profiles that AxWise cannot execute before persisting a goal', async () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', CANARY_ORG_ID);
    const scopePolicy = normalizeGoalResearchPolicy({
      mode: 'advanced',
      research_location: 'Estonia',
    });
    const requiredOffer = {
      kind: 'physical_product_offer',
      minimum_verified: 2,
      applicability: 'required',
    };
    const requiredDifference = {
      kind: 'physical_offer_price_difference',
      minimum_verified: 1,
      applicability: 'required',
    };
    const cases = [
      {
        name: 'empty requirements',
        factRequirements: [],
        calculationRequirements: [],
      },
      {
        name: 'optional offers',
        factRequirements: [{ ...requiredOffer, minimum_verified: 0, applicability: 'optional' }],
        calculationRequirements: [],
      },
      {
        name: 'conditional offers',
        factRequirements: [{ ...requiredOffer, applicability: 'required_when_applicable' }],
        calculationRequirements: [],
      },
      {
        name: 'difference without two offers',
        factRequirements: [{ ...requiredOffer, minimum_verified: 1 }],
        calculationRequirements: [requiredDifference],
      },
      {
        name: 'instant research',
        factRequirements: [requiredOffer],
        calculationRequirements: [requiredDifference],
        policy: {
          research_mode: 'instant',
          grounding_required: false,
          research_fail_closed: false,
        },
      },
    ];

    for (const testCase of cases) {
      const evidenceProfile = createBusinessEvidenceProfile(
        {
          intent: 'operational_process',
          economic_model: 'physical_product',
          fact_requirements: testCase.factRequirements,
          calculation_requirements: testCase.calculationRequirements,
          required_role_slots: [],
        },
        { marketScopeHash: scopePolicy.market_scope_hash }
      );
      const admin = smartRequestDraftAdmin();
      const result = await handleCreateSmartRequestDraft(
        admin,
        { id: 'user-1' },
        {
          title: `Blocked physical profile: ${testCase.name}`,
          org_id: 'org-1',
          mode: 'advanced',
          research_mode: 'grounded_deep',
          grounding_required: true,
          research_fail_closed: true,
          research_location: 'Estonia',
          research_intent: 'operational_process',
          business_evidence_profile: evidenceProfile,
          ...testCase.policy,
        }
      );

      expect(result, testCase.name).toMatchObject({ status: 400 });
      expect(admin.insertedGoals, testCase.name).toHaveLength(0);
    }
  });

  it('stops new model admission while the separate execution list remains open for draining', async () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', '');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', CANARY_ORG_ID);
    const scopePolicy = normalizeGoalResearchPolicy({
      mode: 'advanced',
      research_location: 'Estonia',
    });
    const evidenceProfile = createBusinessEvidenceProfile(
      {
        intent: 'operational_process',
        economic_model: 'physical_product',
        fact_requirements: [
          {
            kind: 'physical_product_offer',
            minimum_verified: 1,
            applicability: 'required',
          },
        ],
        calculation_requirements: [],
        required_role_slots: [],
      },
      { marketScopeHash: scopePolicy.market_scope_hash }
    );
    const admin = smartRequestDraftAdmin();

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Evaluate physical offer pricing',
        org_id: 'org-1',
        mode: 'advanced',
        research_location: 'Estonia',
        research_intent: 'operational_process',
        business_evidence_profile: evidenceProfile,
      }
    );

    expect(result).toMatchObject({
      status: 400,
      error: expect.stringMatching(/economic_model physical_product is not enabled/i),
    });
    expect(admin.insertedGoals).toHaveLength(0);
  });

  it('rejects v2 admission outside the resolved server-side org cohort in both create paths', async () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'physical_product');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'physical_product');
    vi.stubEnv(
      'AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS',
      '22222222-2222-4222-8222-222222222222'
    );
    const scopePolicy = normalizeGoalResearchPolicy({
      mode: 'advanced',
      research_location: 'Estonia',
    });
    const evidenceProfile = createBusinessEvidenceProfile(
      {
        intent: 'operational_process',
        economic_model: 'physical_product',
        fact_requirements: [
          {
            kind: 'physical_product_offer',
            minimum_verified: 1,
            applicability: 'required',
          },
        ],
        calculation_requirements: [],
        required_role_slots: [],
      },
      { marketScopeHash: scopePolicy.market_scope_hash }
    );
    const body = {
      title: 'Canary cohort boundary',
      org_id: 'client-supplied-org-id',
      mode: 'advanced',
      research_location: 'Estonia',
      research_intent: 'operational_process',
      business_evidence_profile: evidenceProfile,
    };
    const smartAdmin = smartRequestDraftAdmin();
    const legacyAdmin = smartRequestDraftAdmin();

    const [smart, legacy] = await Promise.all([
      handleCreateSmartRequestDraft(smartAdmin, { id: 'user-1' }, body),
      handleCreate(legacyAdmin, { id: 'user-1' }, body),
    ]);

    for (const result of [smart, legacy]) {
      expect(result).toMatchObject({
        status: 403,
        error: expect.stringMatching(/resolved organization/i),
      });
    }
    expect(smartAdmin.insertedGoals).toHaveLength(0);
    expect(legacyAdmin.insertedGoals).toHaveLength(0);
  });

  it('keeps v2 profile admission disabled by default without changing the v1 intent boundary', async () => {
    const admin = smartRequestDraftAdmin();
    const evidenceProfile = {
      version: BUSINESS_EVIDENCE_PROFILE_VERSION,
      intent: 'software_product',
      economic_model: 'none',
      market_scope_hash: null,
      fact_requirements: [],
      calculation_requirements: [],
      required_role_slots: [],
    };

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Plan a software product',
        org_id: 'org-1',
        mode: 'advanced',
        research_intent: 'software_product',
        business_evidence_profile: evidenceProfile,
      }
    );

    expect(result).toMatchObject({ status: 400 });
    expect(result.error).toMatch(/v2 contract is disabled/i);
    expect(admin.insertedGoals).toHaveLength(0);
  });

  it('rejects a mismatched v2 profile hash and role roster before persistence', async () => {
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED', 'true');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS', 'none');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS', 'none');
    vi.stubEnv('AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS', CANARY_ORG_ID);
    const evidenceProfile = createBusinessEvidenceProfile({
      intent: 'software_product',
      economic_model: 'none',
      market_scope_hash: null,
      fact_requirements: [],
      calculation_requirements: [],
      required_role_slots: ['domain_delivery'],
    });
    for (const patch of [
      { business_evidence_profile_hash: 'f'.repeat(64) },
      { requested_execution_roles: ['Commercial Risk Analyst'] },
    ]) {
      const admin = smartRequestDraftAdmin();
      const result = await handleCreateSmartRequestDraft(
        admin,
        { id: 'user-1' },
        {
          title: 'Plan a software product',
          org_id: 'org-1',
          mode: 'advanced',
          research_intent: 'software_product',
          business_evidence_profile: evidenceProfile,
          ...patch,
        }
      );
      expect(result).toMatchObject({ status: 400 });
      expect(admin.insertedGoals).toHaveLength(0);
    }
  });

  it('keeps ungrounded Smart Requests instant while still requiring AxWise admission', async () => {
    const admin = smartRequestDraftAdmin();

    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Unscoped grounded research',
        org_id: 'org-1',
        mode: 'advanced',
      }
    );

    expect(result).toMatchObject({
      status: 201,
      data: {
        data: {
          research_policy: {
            research_mode: 'instant',
            required: false,
            grounding_required: false,
            research_fail_closed: true,
          },
        },
      },
    });
    expect(admin.insertedGoals).toHaveLength(1);
  });

  it('rejects malformed research policy fields instead of silently defaulting them', async () => {
    for (const [patch, error] of [
      [{ research_mode: 'unsafe' }, /research_mode must be one of/i],
      [{ research_required: 'true' }, /research_required must be a boolean/i],
      [{ grounding_required: 'true' }, /grounding_required must be a boolean/i],
      [{ research_fail_closed: 1 }, /research_fail_closed must be a boolean/i],
      [{ research_location: { city: 'Bremen' } }, /research_location must be a string/i],
      [
        { research_intent: 'software_product' },
        /research_intent must be commercial_market_launch/i,
      ],
      [
        { requested_execution_roles: ['Marketing ICP Specialist'] },
        /canonical five executor roles/i,
      ],
      [
        {
          research_mode: 'grounded_deep',
          grounding_required: true,
          research_fail_closed: true,
          research_location: 'SEA',
        },
        /needs confirmation: SEA/i,
      ],
      [
        {
          research_mode: 'grounded_deep',
          grounding_required: true,
          research_fail_closed: true,
          research_location: 'Tallinn',
        },
        /needs confirmation: Tallinn/i,
      ],
      [
        {
          research_mode: 'grounded_fast',
          grounding_required: false,
          research_fail_closed: true,
          research_location: 'Bremen',
        },
        /grounded research modes require grounding_required/i,
      ],
    ]) {
      const admin = smartRequestDraftAdmin();
      const result = await handleCreateSmartRequestDraft(
        admin,
        { id: 'user-1' },
        { title: 'Invalid research policy', org_id: 'org-1', ...patch }
      );
      expect(result).toMatchObject({ status: 400 });
      expect(result.error).toMatch(error);
      expect(admin.insertedGoals).toHaveLength(0);
    }
  });

  it('admits a user-confirmed dynamic region and persists its exact country snapshot', async () => {
    const admin = smartRequestDraftAdmin();
    const result = await handleCreateSmartRequestDraft(
      admin,
      { id: 'user-1' },
      {
        title: 'Balkan market comparison',
        org_id: 'org-1',
        mode: 'advanced',
        research_mode: 'grounded_deep',
        grounding_required: true,
        research_fail_closed: true,
        research_location: 'Balkans',
        research_market_scope: { confirmation: { confirmed: true } },
      }
    );

    expect(result.status).toBe(201);
    expect(admin.insertedGoals[0].data.research_policy).toMatchObject({
      version: 2,
      market_scope: {
        confirmation: { required: true, confirmed: true },
        resolved_scope: {
          countries: expect.arrayContaining([
            expect.objectContaining({ country_code: 'AL' }),
            expect.objectContaining({ country_code: 'RS' }),
            expect.objectContaining({ country_code: 'XK' }),
          ]),
        },
      },
      market_scope_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('rejects an explicitly selected inactive or foreign organization before goal insertion', async () => {
    const filters = [];
    const admin = {
      from: vi.fn((table) => {
        if (table !== 'organizations') {
          throw new Error(`Unexpected table access: ${table}`);
        }
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((column, value) => {
            filters.push([column, value]);
            return query;
          }),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        };
        return query;
      }),
    };

    const result = await handleCreate(
      admin,
      { id: 'user-1' },
      {
        title: 'Foreign organization goal',
        org_id: 'org-foreign',
      }
    );

    expect(result).toMatchObject({ status: 403 });
    expect(result.error).toMatch(/does not belong to this account/i);
    expect(filters).toEqual([
      ['id', 'org-foreign'],
      ['user_id', 'user-1'],
      ['is_active', true],
    ]);
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('authorizes only active agents owned by the authenticated user and mapped to the org', async () => {
    const admin = catalogueAdmin({
      mappings: [{ agent_id: 'agent-operations' }, { agent_id: 'agent-research' }],
      agents: [{ id: 'agent-operations' }, { id: 'agent-research' }],
    });

    const result = await validateOrganizationAgentCatalogue(admin, 'user-1', 'org-autoparts');

    expect(result).toEqual({
      ok: true,
      status: 200,
      agentIds: ['agent-operations', 'agent-research'],
    });
    expect(admin.filters).toContainEqual(['org_agents', 'eq', 'org_id', 'org-autoparts']);
    expect(admin.filters).toContainEqual(['org_agents', 'eq', 'user_id', 'user-1']);
    expect(admin.filters).toContainEqual(['agents', 'eq', 'user_id', 'user-1']);
    expect(admin.filters).toContainEqual(['agents', 'eq', 'status', 'active']);
    expect(admin.filters).toContainEqual([
      'agents',
      'in',
      'id',
      ['agent-operations', 'agent-research'],
    ]);
  });

  it('does not admit a zero-agent organization into execution', async () => {
    const admin = catalogueAdmin({ mappings: [] });

    const result = await validateOrganizationAgentCatalogue(admin, 'user-1', 'org-empty');

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(result.error).toMatch(/assign at least one active Agent Hub agent/i);
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a mapping exists but no mapped agent is active and owned', async () => {
    const admin = catalogueAdmin({ mappings: [{ agent_id: 'foreign-agent' }], agents: [] });

    const result = await validateOrganizationAgentCatalogue(admin, 'user-1', 'org-1');

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(result.error).toMatch(/no active owned agents/i);
  });

  describe('Smart Request start receipt', () => {
    it('atomically stamps persisted evidence and the started admission before enqueueing', async () => {
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('WORKER_SECRET', '');
      vi.stubEnv('VERCEL_URL', '');
      const admin = smartRequestStartAdmin();

      const result = await handleStartSmartRequest(
        admin,
        { id: 'user-1' },
        { id: 'goal-start-1', attachments: [] }
      );

      expect(result.status).toBe(202);
      expect(admin.state.goalUpdates).toHaveLength(1);
      expect(admin.state.goalUpdates[0].status).toBe('analyzing');
      const startedData = admin.state.goalUpdates[0].data;
      expect(startedData.attachments).toEqual([]);
      expect(startedData.evidence).toMatchObject({
        status: 'persisted',
        attachment_count: 0,
      });
      expect(startedData.smart_request_admission).toMatchObject({
        version: 1,
        status: 'started',
        authorized_agent_ids: ['agent-1'],
      });
      expect(startedData.smart_request_admission.checked_at).toBe(
        startedData.smart_request_admission.started_at
      );
      expect(startedData.evidence.persisted_at).toBe(
        startedData.smart_request_admission.started_at
      );
      expect(admin.state.jobs).toEqual([
        expect.objectContaining({
          id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          status: 'queued',
          payload: expect.objectContaining({
            action: 'scope-admission',
            goalId: 'goal-start-1',
            context: expect.objectContaining({ evidence_attachment_ids: [] }),
          }),
        }),
      ]);
      expect(startedData.scope_admission).toMatchObject({
        version: 1,
        status: 'queued',
        state_key: 'axwise_customer_intelligence',
      });
      expect(triggerProcessNext).toHaveBeenCalledWith({ jobId: admin.state.jobs[0].id });
    });

    it('does not acknowledge a started draft when its exact Preview wake is rejected', async () => {
      const admin = smartRequestStartAdmin();
      const kickProcessing = vi.fn(async () => ({ mode: 'preview-worker', triggered: false }));

      const result = await handleStartSmartRequest(
        admin,
        { id: 'user-1' },
        { id: 'goal-start-1', attachments: [] },
        { kickProcessing }
      );

      expect(result.status).toBe(503);
      expect(result.error).toContain('handed to the Preview worker');
      expect(admin.state.jobs).toHaveLength(1);
      expect(kickProcessing).toHaveBeenCalledWith(admin, 'goal-start-1', {
        jobId: admin.state.jobs[0].id,
      });
    });

    it('does not mutate or enqueue when an attachment fails protected persistence checks', async () => {
      const admin = smartRequestStartAdmin();

      const result = await handleStartSmartRequest(
        admin,
        { id: 'user-1' },
        {
          id: 'goal-start-1',
          attachments: [
            {
              id: 'foreign-1',
              name: 'foreign.md',
              type: 'text/markdown',
              size: 20,
              storage: 'supabase',
              storagePath: 'goal-someone-else/foreign.md',
            },
          ],
        }
      );

      expect(result).toMatchObject({ status: 400 });
      expect(result.error).toMatch(/protected storage path/i);
      expect(admin.state.goalUpdates).toEqual([]);
      expect(admin.state.jobs).toEqual([]);
    });

    it('does not enqueue a second job when the draft compare-and-swap loses', async () => {
      const admin = smartRequestStartAdmin({ casSucceeds: false });

      const result = await handleStartSmartRequest(
        admin,
        { id: 'user-1' },
        { id: 'goal-start-1', attachments: [] }
      );

      expect(result).toMatchObject({ status: 409 });
      expect(result.error).toMatch(/already started/i);
      expect(admin.state.goalUpdates).toHaveLength(1);
      expect(admin.state.jobs).toEqual([]);
    });

    it('terminalizes a failed start only while the exact started admission still owns the row', async () => {
      const admin = smartRequestStartAdmin({
        jobInsertError: { message: 'queue unavailable' },
      });

      const result = await handleStartSmartRequest(
        admin,
        { id: 'user-1' },
        { id: 'goal-start-1', attachments: [] }
      );

      expect(result.status).toBe(503);
      const startedAt = admin.state.goalUpdates[0].data.smart_request_admission.started_at;
      expect(admin.state.goalUpdates[1]).toMatchObject({
        status: 'failed',
        data: { smart_request_admission: { status: 'enqueue_failed', started_at: startedAt } },
      });
      expect(admin.state.goalUpdateFilters[1]).toEqual(
        expect.arrayContaining([
          ['status', 'analyzing'],
          ['updated_at', startedAt],
          ['data->smart_request_admission->>started_at', startedAt],
        ])
      );
    });

    it('does not overwrite a concurrent cancel or correction after start enqueue fails', async () => {
      const admin = smartRequestStartAdmin({
        jobInsertError: { message: 'queue unavailable' },
        rollbackSucceeds: false,
      });

      const result = await handleStartSmartRequest(
        admin,
        { id: 'user-1' },
        { id: 'goal-start-1', attachments: [] }
      );

      expect(result).toEqual({
        status: 409,
        error: 'Goal state changed after its start attempt. Refresh before retrying.',
        data: { code: 'state_changed' },
      });
      expect(admin.state.jobs).toEqual([]);
    });
  });
});

describe('Smart Request start, knowledge base evidence', () => {
  function kbDoc(overrides = {}) {
    return {
      id: 'doc-1',
      title: 'Competitor pricing scan',
      category: 'business',
      content: 'Rival A charges 12 EUR per unit.',
      content_type: 'note',
      file_name: null,
      organization_id: null,
      ...overrides,
    };
  }

  it('merges selected knowledge documents into the persisted evidence set', async () => {
    const admin = smartRequestStartAdmin({ knowledgeDocuments: [kbDoc()] });

    const result = await handleStartSmartRequest(
      admin,
      { id: 'user-1' },
      {
        id: 'goal-start-1',
        attachments: [
          {
            id: 'upload-1',
            name: 'brief.md',
            size: 120,
            type: 'text/markdown',
            ext: 'md',
            storage: 'supabase',
            storagePath: 'goal-goal-start-1/1700000000-brief.md',
            content: 'Launch the new tier.',
          },
        ],
        kb_document_ids: ['doc-1'],
      }
    );

    expect(result.status).toBe(202);
    const [patch] = admin.state.goalUpdates;
    expect(patch.data.attachments).toHaveLength(2);
    expect(patch.data.attachments[1]).toMatchObject({
      id: 'kb-doc-1',
      source_type: 'knowledge_base_document',
      provenance: { trust: 'orqaly_record_unverified_for_current_goal' },
    });
    expect(patch.data.evidence).toMatchObject({
      status: 'persisted',
      attachment_count: 2,
      knowledge_document_count: 1,
    });
    expect(admin.state.jobs[0].payload.context.evidence_attachment_ids).toEqual([
      'upload-1',
      'kb-doc-1',
    ]);
  });

  it('changes nothing for a caller that sends no knowledge documents', async () => {
    // An older browser bundle posts without kb_document_ids. It must behave
    // exactly as before, and must not query the knowledge base at all.
    const admin = smartRequestStartAdmin();

    const result = await handleStartSmartRequest(admin, { id: 'user-1' }, { id: 'goal-start-1' });

    expect(result.status).toBe(202);
    expect(admin.state.goalUpdates[0].data.attachments).toEqual([]);
    expect(admin.state.goalUpdates[0].data.evidence.knowledge_document_count).toBe(0);
    expect(admin.state.kbFilters).toEqual([]);
  });

  it('rejects a knowledge document the user does not own without starting the goal', async () => {
    const admin = smartRequestStartAdmin({ knowledgeDocuments: [] });

    const result = await handleStartSmartRequest(
      admin,
      { id: 'user-1' },
      { id: 'goal-start-1', kb_document_ids: ['someone-elses-doc'] }
    );

    expect(result).toMatchObject({ status: 400 });
    expect(result.error).toContain('not owned by the authenticated user');
    // Resolution runs before the compare-and-swap, so nothing was started.
    expect(admin.state.goalUpdates).toEqual([]);
    expect(admin.state.jobs).toEqual([]);
  });

  it('scopes ownership to the authenticated user rather than trusting RLS', async () => {
    const admin = smartRequestStartAdmin({ knowledgeDocuments: [kbDoc()] });

    await handleStartSmartRequest(
      admin,
      { id: 'user-1' },
      { id: 'goal-start-1', kb_document_ids: ['doc-1'] }
    );

    expect(admin.state.kbFilters).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(admin.state.kbFilters).toContainEqual(['in', 'id', ['doc-1']]);
  });

  it('rejects a knowledge document belonging to another organization', async () => {
    const admin = smartRequestStartAdmin({
      knowledgeDocuments: [kbDoc({ organization_id: OTHER_ORG_ID })],
    });

    const result = await handleStartSmartRequest(
      admin,
      { id: 'user-1' },
      { id: 'goal-start-1', kb_document_ids: ['doc-1'] }
    );

    expect(result).toMatchObject({ status: 400 });
    expect(result.error).toContain('belongs to a different organization');
    expect(admin.state.goalUpdates).toEqual([]);
  });

  it('enforces the evidence cap across uploads and knowledge documents together', async () => {
    const uploads = Array.from({ length: 19 }, (_, index) => ({
      id: `upload-${index}`,
      name: `file-${index}.md`,
      size: 10,
      type: 'text/markdown',
      ext: 'md',
      storage: 'supabase',
      storagePath: `goal-goal-start-1/1700000000-file-${index}.md`,
      content: 'x',
    }));
    const admin = smartRequestStartAdmin({
      knowledgeDocuments: [kbDoc({ id: 'doc-1' }), kbDoc({ id: 'doc-2' })],
    });

    const result = await handleStartSmartRequest(
      admin,
      { id: 'user-1' },
      { id: 'goal-start-1', attachments: uploads, kb_document_ids: ['doc-1', 'doc-2'] }
    );

    expect(result).toMatchObject({ status: 400 });
    expect(result.error).toContain('evidence items in total');
    expect(admin.state.goalUpdates).toEqual([]);
  });
});
