import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const artifact = '# Final distribution plan\n\nExact attested handoff.';
  const artifactHash = 'a'.repeat(64);
  const scopeHash = 'b'.repeat(64);
  const attestation = {
    version: 'prd-quality-attestation-v2',
    ruleset_version: 'prd-quality-ruleset-v2',
    deliverable_profile: 'axwise_workflow',
    status: 'passed',
    score: 98,
    semantic_score: 98,
    structural_score: 100,
    threshold: 95,
    requirement_count: 0,
    linked_test_count: 0,
    section_count: 0,
    open_decision_count: 0,
    artifact_hash: artifactHash,
    scope_hash: scopeHash,
    generated_at: '2026-08-23T17:00:00.000Z',
    repair: { task_id: 'task-final-typed', status: 'not_needed' },
  };
  const candidate = {
    id: 'task-final-typed',
    title: 'Final distribution plan',
    status: 'done',
    output: artifact,
    deliverable_type: 'markdown',
    phase_index: 0,
    quality_score: 98,
    quality_score_kind: 'semantic_attested',
    task_data: {
      output: artifact,
      deliverable_type: 'markdown',
      phase_index: 0,
      description: 'Prepare the final distribution handoff.',
      required_role: 'Distribution strategist',
      acceptance_criteria: ['Names the approved channel sequence'],
    },
    updated_at: '2026-08-23T17:00:00.000Z',
  };
  const goal = {
    id: 'goal-quality-handoff',
    user_id: 'user-quality-owner',
    status: 'pending_validation',
    row_version: 7,
    updated_at: '2026-08-23T17:00:00.000Z',
    created_at: '2026-08-23T16:00:00.000Z',
    title: 'Prepare an Estonia distribution plan',
    description: 'Produce one exact Markdown distribution handoff.',
    iteration: 0,
    spent_usd: 0.02,
    budget_usd: 1,
    project_id: null,
    team_id: null,
    plan: {
      strategy: 'Prepare and validate one operational handoff.',
      phases: [{ name: 'Synthesis', status: 'completed', jobs: [{ id: 'job-1' }] }],
    },
    data: {
      scope_packet: {
        version: 'orqaly_scope_packet_v2',
        scope_hash: scopeHash,
        deliverable: {
          type: 'distribution_plan',
          count: 1,
          presentation: 'markdown_artifact',
          required_sections: [],
        },
      },
      prd_quality_attestation: attestation,
      prd_quality_validation: {
        status: 'passed',
        candidate_id: candidate.id,
        artifact_hash: artifactHash,
        scope_hash: scopeHash,
      },
    },
  };

  return {
    artifact,
    artifactHash,
    scopeHash,
    attestation,
    candidate,
    goal,
    loadGoal: vi.fn(),
    updateGoal: vi.fn(async () => {}),
    logGoalEvent: vi.fn(async () => {}),
    notifyGoalEvent: vi.fn(async () => {}),
    enqueueGoalAction: vi.fn(async () => {}),
    loadStrictPrdCandidates: vi.fn(),
    ensureStrictPrdCompletionAttestation: vi.fn(),
    reportOutcome: vi.fn(async () => ({ status: 'delivered' })),
  };
});

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  parseLlmJson: vi.fn((value) => value),
}));
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: vi.fn(async () => ({ content: '{}' })),
}));
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../_shared/kb-scope.js', () => ({ orgScopeFromGoal: vi.fn(() => ({})) }));
vi.mock('../_helpers.js', () => ({
  loadGoal: mocks.loadGoal,
  updateGoal: mocks.updateGoal,
  logGoalEvent: mocks.logGoalEvent,
  notifyGoalEvent: mocks.notifyGoalEvent,
  enqueueGoalAction: mocks.enqueueGoalAction,
}));
vi.mock('../goal-messaging.js', () => ({
  archiveGoalMessages: vi.fn(async () => {}),
  systemAlert: vi.fn(async () => {}),
}));
vi.mock('../loop-continuation.js', () => ({
  maybeSpawnContinuation: vi.fn(async () => null),
}));
vi.mock('../../memory/index-goal.js', () => ({
  indexCompletedGoal: vi.fn(async () => {}),
}));
vi.mock('../../integrations/axwise/outcome-delivery.js', () => ({
  reportOrEnqueueGoalOutcome: mocks.reportOutcome,
}));
vi.mock('../goal-stage-llm.js', () => ({ resolveGoalStageLlm: vi.fn(() => ({})) }));
vi.mock('../current-goal-task-attempt.js', () => ({
  currentGoalTaskAttempt: vi.fn((_goal, tasks) => tasks),
}));
vi.mock('../../_shared/goal-document-attempt.js', () => ({
  currentGoalDocuments: vi.fn((_goal, documents) => documents),
  goalDocumentAttemptMetadata: vi.fn(() => ({})),
}));
vi.mock('../../quality/prd-quality-gate.js', () => ({
  QUALITY_DELIVERABLE_PROFILES: {
    GENERIC_PRD: 'generic_prd',
    AXWISE_WORKFLOW: 'axwise_workflow',
  },
  isPrdDeliverableProfile: vi.fn(() => false),
  isQualityGateApplicableGoal: vi.fn(() => true),
  isStrictPrdQualityGoal: vi.fn(() => false),
  prdArtifactHash: vi.fn((value) =>
    String(value) === mocks.artifact ? mocks.artifactHash : 'f'.repeat(64)
  ),
  prdCompletionAttestationDecision: vi.fn(({ artifact }) => ({
    allowed: artifact === mocks.artifact,
    applicable: true,
    reasons: artifact === mocks.artifact ? [] : ['artifact_hash_mismatch'],
    artifact_hash: artifact === mocks.artifact ? mocks.artifactHash : 'f'.repeat(64),
    scope_hash: mocks.scopeHash,
    score: 98,
    threshold: 95,
  })),
  resolveCanonicalPrdQualityContext: vi.fn(() => ({
    scope_packet: {
      deliverable: {
        type: 'distribution_plan',
        count: 1,
        presentation: 'markdown_artifact',
      },
    },
  })),
  resolveDeliverableProfile: vi.fn(() => 'axwise_workflow'),
}));
vi.mock('./prd-quality-validation.js', () => ({
  loadStrictPrdCandidates: mocks.loadStrictPrdCandidates,
  ensureStrictPrdCompletionAttestation: mocks.ensureStrictPrdCompletionAttestation,
}));

import { handle } from './complete.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildAdmin({ failDeliverableRead = false } = {}) {
  const state = { teamQueries: [], rpcCalls: [], deliverableReadCount: 0 };

  function builder(table) {
    const query = {
      table,
      filters: [],
      selected: null,
      operation: 'select',
      select(fields) {
        this.selected = fields;
        return this;
      },
      insert(value) {
        this.operation = 'insert';
        this.value = value;
        return this;
      },
      update(value) {
        this.operation = 'update';
        this.value = value;
        return this;
      },
      eq(column, value) {
        this.filters.push([column, value]);
        return this;
      },
      filter(column, operator, value) {
        this.filters.push([column, operator, value]);
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      async maybeSingle() {
        return { data: null, error: null };
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => {
            if (this.operation !== 'select') return { data: null, error: null };
            if (table !== 'team_tasks') return { data: [], error: null };

            const record = { selected: this.selected, filters: [...this.filters] };
            state.teamQueries.push(record);
            const typedGoal = this.filters.some(
              ([column, value]) => column === 'goal_id' && value === mocks.goal.id
            );
            const typedUser = this.filters.some(
              ([column, value]) => column === 'user_id' && value === mocks.goal.user_id
            );
            const legacyJson = this.filters.some(([column]) => column === 'data->>goal_id');
            if (!typedGoal || !typedUser || legacyJson) return { data: [], error: null };

            const failedOnly = this.filters.some(
              ([column, value]) => column === 'status' && value === 'failed'
            );
            if (failedOnly) return { data: [], error: null };

            const isDeliverableRead = String(this.selected).includes('updated_at');
            if (isDeliverableRead) {
              state.deliverableReadCount += 1;
              if (failDeliverableRead) throw new Error('transient team_tasks read failure');
            }
            return {
              data: [
                {
                  id: mocks.candidate.id,
                  title: mocks.candidate.title,
                  status: 'done',
                  assigned_to: 'Planner',
                  agent_id: 'agent-1',
                  // Deliberately no data.goal_id: typed goal_id is canonical.
                  data: clone(mocks.candidate.task_data),
                  updated_at: mocks.candidate.updated_at,
                },
              ],
              error: null,
            };
          })
          .then(resolve, reject);
      },
    };
    return query;
  }

  const admin = {
    from: vi.fn((table) => builder(table)),
    rpc: vi.fn(async (name, params) => {
      state.rpcCalls.push({ name, params });
      return {
        data: {
          status: 'completed',
          goal: {
            id: mocks.goal.id,
            status: 'completed',
            row_version: mocks.goal.row_version + 1,
            data: params.p_completion_data,
            retrospective: params.p_completion_retrospective,
          },
        },
        error: null,
      };
    }),
    auth: {
      admin: { getUserById: vi.fn(async () => ({ data: { user: { email: 'owner@test' } } })) },
    },
  };
  return { admin, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadGoal.mockImplementation(async () => clone(mocks.goal));
  mocks.loadStrictPrdCandidates.mockImplementation(async (_admin, goal, selector) =>
    selector(goal, [clone(mocks.candidate)])
  );
  mocks.ensureStrictPrdCompletionAttestation.mockResolvedValue({
    applicable: true,
    allowed: true,
    reused: true,
    candidate: clone(mocks.candidate),
    artifact: mocks.artifact,
    attestation: clone(mocks.attestation),
    decision: { allowed: true, applicable: true, reasons: [] },
    goalStatus: 'pending_validation',
    deliverableProfile: 'axwise_workflow',
  });
});

describe('complete: strict quality UI handoff', () => {
  it('loads a typed-only task through goal_id and user_id and persists its exact artifact', async () => {
    const { admin, state } = buildAdmin();

    await expect(handle(admin, { goalId: mocks.goal.id }, {})).resolves.toMatchObject({
      action: 'complete',
      goalId: mocks.goal.id,
    });

    expect(state.teamQueries).toHaveLength(3);
    for (const query of state.teamQueries) {
      expect(query.filters).toContainEqual(['goal_id', mocks.goal.id]);
      expect(query.filters).toContainEqual(['user_id', mocks.goal.user_id]);
      expect(query.filters.some(([column]) => column === 'data->>goal_id')).toBe(false);
    }
    const completion = state.rpcCalls.find(({ name }) => name === 'complete_quality_goal_revision');
    expect(completion.params.p_completion_data.deliverables).toEqual([
      expect.objectContaining({
        id: mocks.candidate.id,
        output: mocks.artifact,
        artifact_hash: mocks.artifactHash,
      }),
    ]);
    expect(completion.params.p_completion_data.project_overview.deliverables).toEqual([
      expect.objectContaining({ title: mocks.candidate.title }),
    ]);
  });

  it('rebuilds the exact UI deliverable after an earlier task read fails and stale data exists', async () => {
    mocks.loadGoal.mockImplementation(async () => {
      const value = clone(mocks.goal);
      value.data.deliverables = [{ id: mocks.candidate.id, output: 'stale artifact' }];
      return value;
    });
    const { admin, state } = buildAdmin({ failDeliverableRead: true });

    await expect(handle(admin, { goalId: mocks.goal.id }, {})).resolves.toMatchObject({
      action: 'complete',
    });

    expect(state.deliverableReadCount).toBe(1);
    const completion = state.rpcCalls.find(({ name }) => name === 'complete_quality_goal_revision');
    expect(completion.params.p_completion_data.deliverables).toHaveLength(1);
    expect(completion.params.p_completion_data.deliverables[0]).toMatchObject({
      id: mocks.candidate.id,
      output: mocks.artifact,
      artifact_hash: mocks.artifactHash,
    });
    expect(completion.params.p_completion_data.deliverables[0].output).not.toBe('stale artifact');
  });
});
