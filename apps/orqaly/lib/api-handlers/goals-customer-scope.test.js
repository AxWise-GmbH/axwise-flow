import { describe, expect, it, vi } from 'vitest';
import { handleAcceptCustomerScope, handleReviseCustomerScope } from './goals.js';
import {
  customerScopeHash,
  LEGACY_AXWISE_CLARIFICATION_QUESTIONS,
} from '../goal-handlers/scope-confirmation.js';
import { nativeDecisionContractsFixture } from '../agent-handlers/native-axwise-contract.test-fixture.js';

function createAdmin(
  initialGoal,
  { enqueueError = null, beforeEnqueueFailure = null, transitionResponseError = null } = {}
) {
  let goal = structuredClone(initialGoal);
  let transitionResponseUsed = false;
  const jobs = [];
  const logs = [];

  function fieldValue(field) {
    if (field === 'id') return goal.id;
    if (field === 'user_id') return goal.user_id;
    if (field === 'status') return goal.status;
    if (field === 'updated_at') return goal.updated_at;
    if (field === 'data->axwise_customer_intelligence->>decision_id') {
      return goal.data?.axwise_customer_intelligence?.decision_id ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->>status') {
      return goal.data?.axwise_customer_intelligence?.status ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->>generation') {
      return goal.data?.axwise_customer_intelligence?.generation ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->>job_id') {
      return goal.data?.axwise_customer_intelligence?.job_id ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->>request_id') {
      return goal.data?.axwise_customer_intelligence?.request_id ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->>request_hash') {
      return goal.data?.axwise_customer_intelligence?.request_hash ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->clarification_scope->>scope_hash') {
      return goal.data?.axwise_customer_intelligence?.clarification_scope?.scope_hash ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->scope_packet->>scope_hash') {
      return goal.data?.axwise_customer_intelligence?.scope_packet?.scope_hash ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->scope_confirmation->>source_scope_hash') {
      return goal.data?.axwise_customer_intelligence?.scope_confirmation?.source_scope_hash ?? null;
    }
    if (field === 'data->scope_revision->>source_scope_hash') {
      return goal.data?.scope_revision?.source_scope_hash ?? null;
    }
    if (field === 'data->scope_revision->>replacement_scope_hash') {
      return goal.data?.scope_revision?.replacement_scope_hash ?? null;
    }
    if (field === 'data->scope_revision->>revision_token') {
      return goal.data?.scope_revision?.revision_token ?? null;
    }
    if (field === 'data->axwise_customer_intelligence->scope_confirmation->>source_decision_id') {
      return (
        goal.data?.axwise_customer_intelligence?.scope_confirmation?.source_decision_id ?? null
      );
    }
    if (field === 'data->axwise_customer_intelligence->scope_confirmation->>accepted_at') {
      return goal.data?.axwise_customer_intelligence?.scope_confirmation?.accepted_at ?? null;
    }
    return undefined;
  }

  function matches(filters) {
    return filters.every(([field, value, operator]) => {
      const current = fieldValue(field);
      return operator === 'is'
        ? current == null && value == null
        : String(current) === String(value);
    });
  }

  return {
    get goal() {
      return goal;
    },
    jobs,
    logs,
    from(table) {
      if (table === 'goals') {
        return {
          select: () => {
            const query = {
              eq: () => query,
              single: async () => ({ data: structuredClone(goal), error: null }),
              maybeSingle: async () => ({ data: structuredClone(goal), error: null }),
            };
            return query;
          },
          update: (patch) => {
            const filters = [];
            const apply = () => {
              if (!matches(filters)) return null;
              goal = { ...goal, ...structuredClone(patch) };
              return { id: goal.id };
            };
            const query = {
              eq: (field, value) => {
                filters.push([field, value, 'eq']);
                return query;
              },
              is: (field, value) => {
                filters.push([field, value, 'is']);
                return query;
              },
              select: () => query,
              maybeSingle: async () => {
                const data = apply();
                if (
                  transitionResponseError &&
                  !transitionResponseUsed &&
                  patch.data?.scope_revision?.status === 'pending_rebuild'
                ) {
                  transitionResponseUsed = true;
                  return { data: null, error: transitionResponseError };
                }
                return { data, error: null };
              },
              then: (resolve) => resolve({ data: apply(), error: null }),
            };
            return query;
          },
        };
      }
      if (table === 'agent_jobs') {
        return {
          insert: async (row) => {
            if (enqueueError && beforeEnqueueFailure) beforeEnqueueFailure(goal);
            if (!enqueueError) jobs.push(structuredClone(row));
            return { error: enqueueError };
          },
          select: () => {
            const query = {
              eq: () => query,
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return query;
          },
        };
      }
      if (table === 'goal_log') {
        return {
          insert: async (row) => {
            logs.push(structuredClone(row));
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function goalWithScope() {
  const decisionId = 'decision-scope-1';
  const scope = {
    version: 'orqaly_axwise_scope_confirmation_v1',
    business_idea: 'reduce missed appointments',
    target_customer: 'Clinic operations managers',
    problem: 'unused appointment capacity',
    desired_outcome: 'Reduce no-shows by 20%',
    constraints: ['Protect patient privacy'],
    evidence: [],
    trust: { status: 'declared_inferred_unverified', verified: false },
  };
  scope.scope_hash = customerScopeHash(decisionId, scope);
  return {
    id: 'goal-1',
    user_id: 'user-1',
    status: 'awaiting_po_input',
    title: 'Reduce missed appointments',
    description: 'Help our clinics reduce no-shows.',
    tech_doc: { problem_statement: 'Missed appointments waste capacity.' },
    data: {
      axwise_customer_intelligence: {
        status: 'human_clarification',
        decision_id: decisionId,
        clarification_scope: scope,
      },
    },
  };
}

describe('accept AxWise customer scope', () => {
  it('CAS-binds the owner acceptance, queues customer intelligence, and keeps it unverified', async () => {
    const initial = goalWithScope();
    const nativeContracts = nativeDecisionContractsFixture();
    Object.assign(initial.data.axwise_customer_intelligence, {
      job_id: 'completed-research-job',
      request_id: 'old-request',
      request_hash: 'old-request-hash',
      requested_at: '2026-08-22T10:00:00.000Z',
      generation: 4,
      retry_count: 1,
      scope_packet: nativeContracts.scope_packet,
      scope_validation: nativeContracts.scope_validation,
      quality_contract: nativeContracts.scope_packet.quality_contract,
      axwise_scope_confirmation: nativeContracts.scope_confirmation,
    });
    const admin = createAdmin(initial);
    const kickProcessing = vi.fn(async () => ({ triggered: true }));

    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
        scope: {
          target_customer: 'Dental clinic owners',
          problem: 'unused appointment capacity',
          desired_outcome: 'Reduce no-shows by 25%',
          optional_details: 'Start in Berlin.',
        },
      },
      { kickProcessing }
    );

    expect(result.status).toBe(202);
    expect(admin.goal.status).toBe('researching_customer');
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      status: 'scope_confirmed',
      decision_id: 'decision-scope-1',
      job_id: null,
      request_id: null,
      request_hash: null,
      generation: null,
      clarification_source_research_run: {
        decision_id: 'decision-scope-1',
        job_id: 'completed-research-job',
        request_id: 'old-request',
        request_hash: 'old-request-hash',
        generation: 4,
      },
    });
    expect(admin.goal.data.axwise_customer_intelligence.scope_confirmation).toMatchObject({
      status: 'accepted',
      source_decision_id: 'decision-scope-1',
      source_scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
      provenance: 'user_confirmed_assumption',
      target_customer: 'Dental clinic owners',
      desired_outcome: 'Reduce no-shows by 25%',
      trust: { verified: false, underlying_facts_verified: false },
    });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      scope_packet: { scope_hash: nativeContracts.scope_packet.scope_hash },
      scope_validation: { scope_hash: nativeContracts.scope_packet.scope_hash },
      quality_contract: { version: 'axwise_quality_contract_v1' },
      axwise_scope_confirmation: {
        status: 'proceed_or_edit',
        scope_hash: nativeContracts.scope_packet.scope_hash,
      },
    });
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0].payload).toEqual({
      type: 'orchestrate-goal',
      action: 'customer-intelligence',
      goalId: initial.id,
      _userId: initial.user_id,
      userId: initial.user_id,
      user_id: initial.user_id,
    });
    expect(admin.logs[0]).toMatchObject({
      event_type: 'axwise_customer_scope_accepted',
      details: { underlying_facts_verified: false },
    });
    expect(kickProcessing).toHaveBeenCalledWith(admin, initial.id, {
      jobId: expect.any(String),
    });
  });

  it('fails closed when the customer-intelligence Preview wake is rejected', async () => {
    const initial = goalWithScope();
    const admin = createAdmin(initial);
    const kickProcessing = vi.fn(async () => ({
      mode: 'preview-worker',
      triggered: false,
      terminalized: true,
    }));

    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
        scope: {
          target_customer: 'Dental clinic owners',
          problem: 'unused appointment capacity',
          desired_outcome: 'Reduce no-shows by 25%',
        },
      },
      { kickProcessing }
    );

    expect(result).toMatchObject({
      status: 503,
      error:
        'Goal processing could not be handed to the Preview worker. Reconciliation is required; refresh and do not create replacement work.',
      data: {
        goal_id: initial.id,
        job_id: expect.any(String),
        retry_safe: false,
      },
    });
    expect(admin.jobs).toHaveLength(1);
  });

  it('treats only an exact retry as idempotent and never queues a duplicate job', async () => {
    const initial = goalWithScope();
    const admin = createAdmin(initial);
    const request = {
      id: initial.id,
      decision_id: 'decision-scope-1',
      scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
      scope: {
        target_customer: 'Dental clinic owners',
        problem: 'unused appointment capacity',
        desired_outcome: 'Reduce no-shows by 25%',
        optional_details: 'Start in Berlin.',
      },
    };

    expect((await handleAcceptCustomerScope(admin, { id: 'user-1' }, request)).status).toBe(202);
    admin.goal.status = 'awaiting_context_approval';
    admin.goal.data.axwise_customer_intelligence.status = 'completed';
    admin.goal.data.axwise_customer_intelligence.decision_id = 'decision-after-confirmation';
    const retry = await handleAcceptCustomerScope(admin, { id: 'user-1' }, request);

    expect(retry).toMatchObject({
      status: 202,
      data: { status: 'awaiting_context_approval', idempotent: true },
    });
    expect(admin.jobs).toHaveLength(1);

    const changedContent = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        ...request,
        scope: { ...request.scope, desired_outcome: 'A different outcome' },
      }
    );
    const changedHash = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        ...request,
        scope_hash: '0'.repeat(64),
      }
    );
    expect(changedContent.status).toBe(409);
    expect(changedHash.status).toBe(409);
    expect(admin.jobs).toHaveLength(1);
  });

  it('does not let an older accepted confirmation bypass a newer human gate', async () => {
    const initial = goalWithScope();
    const admin = createAdmin(initial);
    const request = {
      id: initial.id,
      decision_id: 'decision-scope-1',
      scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
      scope: {},
    };
    expect((await handleAcceptCustomerScope(admin, { id: 'user-1' }, request)).status).toBe(202);

    admin.goal.status = 'awaiting_po_input';
    admin.goal.data.axwise_customer_intelligence.status = 'human_clarification';
    admin.goal.data.axwise_customer_intelligence.decision_id = 'decision-scope-2';
    const retry = await handleAcceptCustomerScope(admin, { id: 'user-1' }, request);

    expect(retry.status).toBe(409);
    expect(admin.jobs).toHaveLength(1);
  });

  it.each([
    ['a stale decision', { decision_id: 'decision-old' }],
    ['a stale scope', { scope_hash: '0'.repeat(64) }],
  ])('rejects %s without mutating or enqueueing', async (_, override) => {
    const initial = goalWithScope();
    const admin = createAdmin(initial);
    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
        scope: {},
        ...override,
      }
    );

    expect(result.status).toBe(409);
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
  });

  it('restores the confirmation gate when the exact worker job cannot be queued', async () => {
    const initial = goalWithScope();
    const admin = createAdmin(initial, { enqueueError: new Error('queue unavailable') });
    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
        scope: {},
      }
    );

    expect(result.status).toBe(503);
    expect(admin.goal.status).toBe('awaiting_po_input');
    expect(admin.goal.data.axwise_customer_intelligence.scope_confirmation).toBeUndefined();
    expect(admin.jobs).toEqual([]);
  });

  it('does not roll back a newer provider generation when enqueue failure arrives late', async () => {
    const initial = goalWithScope();
    const admin = createAdmin(initial, {
      enqueueError: new Error('queue unavailable'),
      beforeEnqueueFailure: (currentGoal) => {
        const intelligence = currentGoal.data.axwise_customer_intelligence;
        intelligence.status = 'queued';
        intelligence.decision_id = 'decision-scope-2';
        intelligence.generation = 1;
        intelligence.job_id = 'provider-job-2';
        intelligence.request_id = 'provider-request-2';
        intelligence.request_hash = 'provider-request-hash-2';
      },
    });

    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: initial.data.axwise_customer_intelligence.clarification_scope.scope_hash,
        scope: {},
      }
    );

    expect(result).toMatchObject({
      status: 503,
      error: expect.stringContaining('confirmation gate could not be restored'),
    });
    expect(admin.goal).toMatchObject({
      status: 'researching_customer',
      data: {
        axwise_customer_intelligence: {
          status: 'queued',
          decision_id: 'decision-scope-2',
          generation: 1,
          job_id: 'provider-job-2',
          request_id: 'provider-request-2',
          request_hash: 'provider-request-hash-2',
          scope_confirmation: { status: 'accepted' },
        },
      },
    });
    expect(admin.jobs).toEqual([]);
  });

  it('upgrades the exact legacy three-answer gate and creates a server-owned scope hash', async () => {
    const legacy = goalWithScope();
    delete legacy.data.axwise_customer_intelligence.clarification_scope;
    legacy.data.axwise_customer_intelligence.clarification_questions = [
      ...LEGACY_AXWISE_CLARIFICATION_QUESTIONS,
    ];
    legacy.data.po_questions = [
      ...legacy.data.axwise_customer_intelligence.clarification_questions,
    ];
    legacy.data.po_answers = [
      { question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[0], answer: 'Clinic owners' },
      { question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[1], answer: 'Reduce no-shows' },
      {
        question: LEGACY_AXWISE_CLARIFICATION_QUESTIONS[2],
        answer: 'Use our appointment data only',
      },
    ];
    const admin = createAdmin(legacy);

    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: legacy.id,
        decision_id: 'decision-scope-1',
        scope_hash: null,
        scope: {},
      }
    );

    expect(result.status).toBe(202);
    expect(result.data.scope_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(admin.goal.data.axwise_customer_intelligence.clarification_scope).toMatchObject({
      target_customer: 'Clinic owners',
      desired_outcome: 'Reduce no-shows',
      scope_hash: result.data.scope_hash,
    });
  });

  it('upgrades a live legacy gate whose old answers were cleared using a decision-bound fallback', async () => {
    const legacy = goalWithScope();
    delete legacy.data.axwise_customer_intelligence.clarification_scope;
    legacy.data.axwise_customer_intelligence.clarification_questions = [];
    legacy.data.po_questions = [];
    legacy.data.po_answers = [];
    const admin = createAdmin(legacy);

    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: legacy.id,
        decision_id: 'decision-scope-1',
        scope_hash: null,
        scope: {
          target_customer: 'Clinic operations managers',
          problem: 'unused appointment capacity',
          desired_outcome: 'Reduce no-shows by 20%',
        },
      }
    );

    expect(result.status).toBe(202);
    expect(admin.goal.data.axwise_customer_intelligence.scope_confirmation).toMatchObject({
      source_decision_id: 'decision-scope-1',
      target_customer: 'Clinic operations managers',
      trust: { verified: false, underlying_facts_verified: false },
    });
    expect(admin.jobs).toHaveLength(1);
  });

  it('does not upgrade legacy answers attached to different questions', async () => {
    const legacy = goalWithScope();
    delete legacy.data.axwise_customer_intelligence.clarification_scope;
    legacy.data.axwise_customer_intelligence.clarification_questions = ['Who benefits?'];
    legacy.data.po_answers = [{ question: 'What is the budget?', answer: 'Clinic owners' }];
    const admin = createAdmin(legacy);

    const result = await handleAcceptCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: legacy.id,
        decision_id: 'decision-scope-1',
        scope_hash: null,
        scope: {},
      }
    );

    expect(result.status).toBe(409);
    expect(admin.jobs).toEqual([]);
  });
});

describe('revise AxWise customer scope', () => {
  it('replaces an exact preliminary scope without accepting its stale hash', async () => {
    const initial = goalWithScope();
    initial.updated_at = '2026-08-24T10:00:00.000Z';
    const originalHash = initial.data.axwise_customer_intelligence.clarification_scope.scope_hash;
    const admin = createAdmin(initial);
    const kickProcessing = vi.fn(async () => ({ triggered: true }));

    const result = await handleReviseCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: originalHash,
        generation: null,
        job_id: null,
        revision_token: null,
        feedback: 'Not software. Make this a 90-day clinic outreach campaign.',
      },
      { kickProcessing }
    );

    expect(result).toMatchObject({
      status: 202,
      data: { status: 'analyzing', source_scope_hash: originalHash },
    });
    expect(admin.goal).toMatchObject({
      status: 'analyzing',
      data: {
        context_revision_feedback: 'Not software. Make this a 90-day clinic outreach campaign.',
        scope_revision: {
          status: 'pending_rebuild',
          desired_outcome: 'Not software. Make this a 90-day clinic outreach campaign.',
          source_decision_id: 'decision-scope-1',
          source_scope_hash: originalHash,
          revision_token: expect.any(String),
        },
        axwise_customer_intelligence: {
          status: 'revision_requested',
          decision_id: null,
          generation: null,
          job_id: null,
          clarification_scope: null,
          scope_confirmation: null,
          scope_packet: null,
        },
        scope_admission: { status: 'revision_requested', scope_hash: null },
      },
    });
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0].payload).toMatchObject({
      type: 'orchestrate-goal',
      action: 'scope-admission',
      goalId: initial.id,
      scope_revision_token: result.data.revision_token,
    });
    expect(kickProcessing).toHaveBeenCalledWith(admin, initial.id, {
      jobId: expect.any(String),
    });
  });

  it('rotates an active provider generation once and rejects the duplicate stale correction', async () => {
    const initial = goalWithScope();
    const sourceHash = initial.data.axwise_customer_intelligence.clarification_scope.scope_hash;
    initial.status = 'researching_customer';
    initial.updated_at = '2026-08-24T10:01:00.000Z';
    initial.data.axwise_customer_intelligence = {
      ...initial.data.axwise_customer_intelligence,
      status: 'running',
      decision_id: 'decision-running',
      generation: 7,
      job_id: 'provider-job-7',
      request_id: 'request-7',
      request_hash: 'request-hash-7',
      scope_confirmation: {
        status: 'accepted',
        source_scope_hash: sourceHash,
      },
    };
    const admin = createAdmin(initial);
    const request = {
      id: initial.id,
      decision_id: 'decision-running',
      scope_hash: sourceHash,
      generation: 7,
      job_id: 'provider-job-7',
      revision_token: null,
      feedback: 'Use physical retail distribution in Estonia instead.',
    };

    const first = await handleReviseCustomerScope(admin, { id: 'user-1' }, request, {
      kickProcessing: vi.fn(async () => ({ triggered: true })),
    });
    const duplicate = await handleReviseCustomerScope(admin, { id: 'user-1' }, request, {
      kickProcessing: vi.fn(async () => ({ triggered: true })),
    });

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(409);
    expect(admin.goal.data.scope_revision).toMatchObject({
      source_decision_id: 'decision-running',
      source_generation: '7',
      source_job_id: 'provider-job-7',
    });
    expect(admin.goal.data.axwise_customer_intelligence).toMatchObject({
      decision_id: null,
      generation: null,
      job_id: null,
      request_id: null,
      request_hash: null,
    });
    expect(admin.jobs).toHaveLength(1);
  });

  it('allows a newer correction to supersede a pending rebuild with a rotated token', async () => {
    const initial = goalWithScope();
    const sourceHash = initial.data.axwise_customer_intelligence.clarification_scope.scope_hash;
    initial.status = 'researching_customer';
    initial.updated_at = '2026-08-24T10:01:30.000Z';
    initial.data.axwise_customer_intelligence = {
      ...initial.data.axwise_customer_intelligence,
      status: 'running',
      decision_id: 'decision-running',
      generation: 8,
      job_id: 'provider-job-8',
      request_id: 'request-8',
      request_hash: 'request-hash-8',
      scope_confirmation: { status: 'accepted', source_scope_hash: sourceHash },
    };
    const admin = createAdmin(initial);
    const kickProcessing = vi.fn(async () => ({ triggered: true }));

    const first = await handleReviseCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-running',
        scope_hash: sourceHash,
        generation: 8,
        job_id: 'provider-job-8',
        revision_token: null,
        feedback: 'Use a campaign instead.',
      },
      { kickProcessing }
    );
    const firstToken = first.data.revision_token;

    const second = await handleReviseCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-running',
        scope_hash: sourceHash,
        generation: null,
        job_id: null,
        revision_token: firstToken,
        feedback: 'Make that an Estonia retail distribution campaign.',
      },
      { kickProcessing }
    );

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.data.revision_token).not.toBe(firstToken);
    expect(admin.goal.data.scope_revision).toMatchObject({
      status: 'pending_rebuild',
      revision_token: second.data.revision_token,
      source_decision_id: 'decision-running',
      source_scope_hash: sourceHash,
    });
    expect(admin.goal.data.axwise_customer_intelligence.decision_id).toBeNull();
    expect(admin.jobs).toHaveLength(2);
    expect(admin.jobs[1].payload.scope_revision_token).toBe(second.data.revision_token);
  });

  it('can supersede the initial analyzing job before AxWise writes a generation', async () => {
    const initial = goalWithScope();
    initial.status = 'analyzing';
    initial.updated_at = '2026-08-24T10:02:00.000Z';
    initial.data.axwise_customer_intelligence = {};
    initial.data.scope_admission = {
      version: 1,
      native_scope: true,
      state_key: 'axwise_customer_intelligence',
      status: 'queued',
    };
    initial.data.smart_request_admission = {
      status: 'started',
      started_at: '2026-08-24T10:01:00.000Z',
    };
    const admin = createAdmin(initial);

    const result = await handleReviseCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: null,
        scope_hash: null,
        generation: null,
        job_id: null,
        revision_token: null,
        feedback: 'Distribute cat food through independent Estonian pet shops.',
      },
      { kickProcessing: vi.fn(async () => ({ triggered: true })) }
    );

    expect(result.status).toBe(202);
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0].payload.scope_revision_token).toBe(result.data.revision_token);
  });

  it('reconciles a lost transition response without writing a duplicate revision', async () => {
    const initial = goalWithScope();
    initial.updated_at = '2026-08-24T10:03:00.000Z';
    const sourceHash = initial.data.axwise_customer_intelligence.clarification_scope.scope_hash;
    const admin = createAdmin(initial, {
      transitionResponseError: new Error('response lost after commit'),
    });

    const result = await handleReviseCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: sourceHash,
        generation: null,
        job_id: null,
        revision_token: null,
        feedback: 'Use Estonia as the market.',
      },
      { kickProcessing: vi.fn(async () => ({ triggered: true })) }
    );

    expect(result.status).toBe(202);
    expect(admin.jobs).toHaveLength(1);
    expect(admin.goal.data.scope_revision.revision_token).toBe(result.data.revision_token);
  });

  it('rejects a stale preliminary hash without mutation or queueing', async () => {
    const initial = goalWithScope();
    const admin = createAdmin(initial);
    const result = await handleReviseCustomerScope(
      admin,
      { id: 'user-1' },
      {
        id: initial.id,
        decision_id: 'decision-scope-1',
        scope_hash: '0'.repeat(64),
        generation: null,
        job_id: null,
        revision_token: null,
        feedback: 'Change the audience.',
      }
    );

    expect(result.status).toBe(409);
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
  });
});
