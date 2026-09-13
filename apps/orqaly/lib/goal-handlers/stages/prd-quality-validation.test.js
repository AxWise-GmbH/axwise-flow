import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeLlmTracked: vi.fn(),
  enqueueGoalAction: vi.fn(async () => {}),
  logGoalEvent: vi.fn(async () => {}),
  loadGoal: vi.fn(async (_admin, id) => ({
    id,
    status: 'pending_validation',
    data: {},
  })),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: mocks.executeLlmTracked,
}));
vi.mock('../_helpers.js', () => ({
  enqueueGoalAction: mocks.enqueueGoalAction,
  loadGoal: mocks.loadGoal,
  logGoalEvent: mocks.logGoalEvent,
  pickTestModel: () => ({ provider: 'google', model: 'gemini-3.8-flash', pinnedProvider: true }),
}));

import {
  ensureStrictPrdCompletionAttestation,
  loadStrictPrdCandidates,
  postRepairScoreRegression,
} from './prd-quality-validation.js';
import {
  PRD_QUALITY_ATTESTATION_VERSION,
  PRD_QUALITY_RULESET_VERSION,
  prdArtifactHash,
  resolvePrdScopeHash,
} from '../../quality/prd-quality-gate.js';

const ARTIFACT = '# PRD\n\n## Problem\nA draft problem statement.';
const REPAIRED_ARTIFACT =
  '# PRD\n\n## Problem\nA changed problem statement that still needs semantic review.';

const SEMANTIC_CATEGORY_KEYS = [
  'coverage_and_evidence',
  'actionability_and_traceability',
  'architecture_data_api',
  'ux_and_accessibility',
  'privacy_tenancy_side_effects',
  'reliability_observability_rollout',
  'coherence_and_density',
];

function passingSemanticCritic({
  deliverableType = 'product_requirements_document',
  presentation = 'markdown_artifact',
  summary = 'Ready.',
} = {}) {
  return {
    schema_version: 'axwise_semantic_critic_v2',
    semantic_score: 100,
    passed: true,
    category_scores: Object.fromEntries(SEMANTIC_CATEGORY_KEYS.map((key) => [key, 100])),
    category_applicability: Object.fromEntries(SEMANTIC_CATEGORY_KEYS.map((key) => [key, true])),
    scope_assessment: {
      aligned: true,
      objective_covered: true,
      requirements_covered: true,
      constraints_respected: true,
      non_goals_respected: true,
      acceptance_criteria_satisfied: true,
      summary: 'The artifact satisfies the canonical scope.',
    },
    modality_assessment: {
      presentation,
      deliverable_type: deliverableType,
      valid: true,
      summary: 'The artifact matches the canonical modality.',
    },
    blockers: [],
    repairs: [],
    summary,
  };
}

function failingSemanticCritic({
  score = 80,
  code = 'coverage.gap',
  message = 'Incomplete.',
  summary = 'Not ready.',
  instruction = 'Replace the section with observable detail.',
} = {}) {
  return {
    schema_version: 'axwise_semantic_critic_v2',
    semantic_score: score,
    passed: false,
    category_scores: Object.fromEntries(
      SEMANTIC_CATEGORY_KEYS.map((key) => [key, key === 'coverage_and_evidence' ? score : 100])
    ),
    category_applicability: Object.fromEntries(SEMANTIC_CATEGORY_KEYS.map((key) => [key, true])),
    scope_assessment: {
      aligned: false,
      objective_covered: false,
      requirements_covered: true,
      constraints_respected: true,
      non_goals_respected: true,
      acceptance_criteria_satisfied: true,
      summary: 'The objective is not fully covered.',
    },
    modality_assessment: {
      presentation: 'markdown_artifact',
      deliverable_type: 'product_requirements_document',
      valid: true,
      summary: 'The artifact matches the canonical modality.',
    },
    blockers: [{ severity: 'P1', code, section: '## Problem', message }],
    repairs: [
      {
        section_id: '## Problem',
        reason: message,
        instruction,
      },
    ],
    summary,
  };
}

function goal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'Implementation-ready PRD',
    description: 'Return exactly one self-contained Product Requirements Document.',
    status: 'active',
    data: { strict_quality: true },
    ...overrides,
  };
}

function candidate() {
  return {
    id: 'task-1',
    title: 'Final PRD',
    status: 'done',
    output: ARTIFACT,
    deliverable_type: 'markdown',
    task_data: { output: ARTIFACT, llmModel: 'gemini-3.8-flash' },
  };
}

function governedCampaignGoal() {
  return {
    id: 'goal-campaign',
    user_id: 'user-1',
    title: 'Weekend retention campaign',
    description: 'Prepare the approved retention campaign brief.',
    status: 'active',
    data: {
      scope_packet: {
        version: 'orqaly_scope_packet_v2',
        scope_ref: 'axwise:goal-campaign:decision-1',
        scope_hash: 'd'.repeat(64),
        intent: {
          objective: 'Prepare a retention campaign brief',
          problem: 'The approved campaign needs a clear handoff',
          desired_outcome: 'A final campaign brief',
          audiences: [],
          non_goals: [],
        },
        deliverable: {
          type: 'campaign_brief',
          count: 1,
          required_sections: [],
          presentation: 'markdown_artifact',
        },
        admission: {
          version: 'axwise_scope_admission_v1',
          work_types: ['outreach_campaign'],
          geographies: [],
          channels: ['owned_email'],
          success_criteria: ['The approved brief is ready for owner review'],
          required_capabilities: ['campaign planning'],
          requested_actions: [
            {
              action: 'prepare campaign brief',
              mode: 'prepare',
              side_effect: 'none',
              requires_authorization: false,
            },
          ],
        },
        ledger: {
          requirements: [],
          facts: [],
          assumptions: [],
          decisions: [],
          constraints: [],
        },
        acceptance: [],
      },
    },
  };
}

function campaignCandidate() {
  const output = `# Weekend retention campaign

Prepare the approved audience, message, owner review, and launch checklist. [PROPOSED] Validate the incentive against the approved margin policy.`;
  return {
    id: 'task-campaign',
    title: 'Final campaign brief',
    status: 'done',
    output,
    deliverable_type: 'markdown',
    task_data: { output, deliverable_type: 'markdown', llmModel: 'gemini-3.8-flash' },
  };
}

function adminForTaskUpdate({ goalResults = [], taskResult = { id: 'task-1' } } = {}) {
  const goalUpdates = [];
  const taskUpdates = [];
  let goalUpdateIndex = 0;
  const chain = (result) => {
    const query = {
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({ data: result, error: null }),
      then: (resolve) => resolve({ data: result, error: null }),
    };
    return query;
  };
  const admin = {
    from: vi.fn((table) => {
      if (table === 'team_tasks') {
        return {
          update: (patch) => {
            taskUpdates.push(patch);
            return chain(taskResult);
          },
        };
      }
      if (table === 'goals') {
        return {
          update: (patch) => {
            goalUpdates.push(patch);
            const fallback = {
              id: 'goal-1',
              status: patch.status,
              data: patch.data,
              updated_at: patch.updated_at,
            };
            const configured = goalResults[goalUpdateIndex];
            goalUpdateIndex += 1;
            return chain(configured === undefined ? fallback : configured);
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  admin.goalUpdates = goalUpdates;
  admin.taskUpdates = taskUpdates;
  return admin;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadGoal.mockImplementation(async (_admin, id) => ({
    id,
    status: 'pending_validation',
    data: {},
  }));
});

describe('strict PRD validation lifecycle', () => {
  it('loads candidate rows by the typed parent instead of owner-mutable JSON', async () => {
    const filters = [];
    const rows = [
      {
        id: 'task-typed-parent',
        title: 'Final PRD',
        status: 'done',
        goal_id: 'goal-1',
        data: { goal_id: 'foreign-goal', output: ARTIFACT },
      },
    ];
    const query = {
      select: () => query,
      eq: (column, value) => {
        filters.push([column, value]);
        return query;
      },
      then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    const admin = { from: vi.fn(() => query) };

    await loadStrictPrdCandidates(admin, goal(), (_goal, candidates) => candidates);

    expect(filters).toEqual([
      ['goal_id', 'goal-1'],
      ['user_id', 'user-1'],
    ]);
  });

  it('preserves backward compatibility for unrelated workflows', async () => {
    const result = await ensureStrictPrdCompletionAttestation(
      {},
      { id: 'goal-legacy', title: 'Fix CSS', description: '', data: {} },
      {}
    );
    expect(result).toEqual({ applicable: false, allowed: true });
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
  });

  it('does not opt a title-only AxWise legacy request into the gate', async () => {
    const result = await ensureStrictPrdCompletionAttestation(
      {},
      {
        id: 'goal-title-only',
        title: 'Summarize AxWise positioning',
        description: 'Legacy request without a canonical scope packet.',
        data: {},
      },
      {}
    );
    expect(result).toEqual({ applicable: false, allowed: true });
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
  });

  it('revalidates a hash-matching v1 attestation instead of reusing stale evaluator rules', async () => {
    const staleGoal = goal();
    staleGoal.data.prd_quality_attestation = {
      version: 'prd-quality-attestation-v1',
      ruleset_version: 'prd-quality-ruleset-v1',
      deliverable_profile: 'generic_prd',
      status: 'passed',
      score: 100,
      threshold: 95,
      artifact_hash: prdArtifactHash(ARTIFACT),
      scope_hash: resolvePrdScopeHash(staleGoal),
    };
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify(passingSemanticCritic()),
    });
    const admin = adminForTaskUpdate();

    const result = await ensureStrictPrdCompletionAttestation(admin, staleGoal, {
      candidates: [candidate()],
      req: null,
    });

    expect(result.reused).toBe(false);
    expect(result.attestation).toMatchObject({
      version: PRD_QUALITY_ATTESTATION_VERSION,
      ruleset_version: PRD_QUALITY_RULESET_VERSION,
    });
    expect(mocks.executeLlmTracked).toHaveBeenCalledTimes(1);
  });

  it('attests a canonical campaign without requiring the legacy strict-PRD flag', async () => {
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify(
        passingSemanticCritic({
          deliverableType: 'campaign_brief',
          summary: 'The campaign brief is ready.',
        })
      ),
    });
    const admin = adminForTaskUpdate({ taskResult: { id: 'task-campaign' } });
    const result = await ensureStrictPrdCompletionAttestation(admin, governedCampaignGoal(), {
      candidates: [campaignCandidate()],
      req: null,
    });

    expect(result).toMatchObject({
      applicable: true,
      allowed: true,
      deliverableProfile: 'axwise_workflow',
      attestation: {
        status: 'passed',
        deliverable_profile: 'axwise_workflow',
      },
    });
    expect(admin.taskUpdates.at(-1).data.prd_quality_attestation).toMatchObject({
      status: 'passed',
      deliverable_profile: 'axwise_workflow',
    });
    expect(admin.goalUpdates.at(-1).data.prd_quality_validation).toMatchObject({
      status: 'passed',
      deliverable_profile: 'axwise_workflow',
    });
  });

  it('fails multi-artifact contracts before a critic call or single-task repair', async () => {
    const multiGoal = governedCampaignGoal();
    multiGoal.data.scope_packet.deliverable.count = 2;
    const second = {
      ...campaignCandidate(),
      id: 'task-campaign-2',
      title: 'Second campaign asset',
      output: '# Second campaign asset\n\nApproved audience and owner review.',
    };
    second.task_data = { ...second.task_data, output: second.output };
    const admin = adminForTaskUpdate({ taskResult: { id: 'task-campaign' } });

    const result = await ensureStrictPrdCompletionAttestation(admin, multiGoal, {
      candidates: [campaignCandidate(), second],
      req: null,
    });

    expect(result).toMatchObject({
      applicable: true,
      allowed: false,
      goalStatus: 'needs_human',
      attestation: {
        status: 'failed',
        repair: { status: 'needs_human' },
      },
    });
    expect(result.attestation.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_multi_artifact_attestation' }),
      ])
    );
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
    expect(admin.taskUpdates).toHaveLength(0);
  });

  it('reuses an exact current attestation without another critic call', async () => {
    const currentGoal = goal();
    currentGoal.data.prd_quality_attestation = {
      version: PRD_QUALITY_ATTESTATION_VERSION,
      ruleset_version: PRD_QUALITY_RULESET_VERSION,
      status: 'failed',
      score: 70,
      threshold: 95,
      artifact_hash: prdArtifactHash(ARTIFACT),
      scope_hash: resolvePrdScopeHash(currentGoal),
    };
    const result = await ensureStrictPrdCompletionAttestation({}, currentGoal, {
      candidates: [candidate()],
    });
    expect(result).toMatchObject({ applicable: true, reused: true, allowed: false });
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
  });

  it('fails closed to needs_human when the structured critic fails', async () => {
    mocks.executeLlmTracked.mockRejectedValue(new Error('provider unavailable'));
    const admin = adminForTaskUpdate();
    const result = await ensureStrictPrdCompletionAttestation(admin, goal(), {
      candidates: [candidate()],
      req: null,
    });
    expect(result).toMatchObject({ applicable: true, allowed: false, goalStatus: 'needs_human' });
    expect(result.attestation).toMatchObject({ status: 'failed', score: 0 });
    expect(result.attestation.semantic).toMatchObject({ status: 'invalid', passed: false });
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
    expect(admin.goalUpdates.at(-1)).toMatchObject({ status: 'needs_human' });
  });

  it('queues exactly one bounded repair and leaves the goal pending validation', async () => {
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify(failingSemanticCritic()),
    });
    const admin = adminForTaskUpdate();
    const result = await ensureStrictPrdCompletionAttestation(admin, goal(), {
      candidates: [candidate()],
      req: null,
    });
    expect(result).toMatchObject({
      applicable: true,
      allowed: false,
      goalStatus: 'pending_validation',
    });
    expect(result.attestation.repair).toMatchObject({
      action: 'prd-quality-repair',
      status: 'queued',
      attempt: 1,
      max_attempts: 1,
    });
    expect(mocks.enqueueGoalAction).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueGoalAction).toHaveBeenCalledWith(
      admin,
      'prd-quality-repair',
      'goal-1',
      expect.objectContaining({
        artifactHash: prdArtifactHash(ARTIFACT),
        scopeHash: resolvePrdScopeHash(goal()),
      })
    );
    expect(mocks.executeLlmTracked).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.8-flash',
        maxTokens: 65_536,
        jsonMode: true,
        reasoningEffort: 'high',
      })
    );
  });

  it('preserves token rollups written by the tracked critic before finalizing', async () => {
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify(failingSemanticCritic()),
    });
    mocks.loadGoal.mockResolvedValue({
      ...goal(),
      status: 'pending_validation',
      updated_at: '2026-08-23T11:49:45.300Z',
      data: {
        strict_quality: true,
        token_totals: { total_tokens: 20574, cost_usd: 0.018014 },
        prd_quality_validation: { reservation_id: 'current-reservation' },
      },
    });
    const admin = adminForTaskUpdate();

    await ensureStrictPrdCompletionAttestation(admin, goal(), {
      candidates: [candidate()],
      req: null,
    });

    expect(admin.goalUpdates.at(-1).data.token_totals).toEqual({
      total_tokens: 20574,
      cost_usd: 0.018014,
    });
  });

  it('CAS-restores the exact prior artifact and attestation when repair quality regresses', async () => {
    const currentGoal = goal({
      data: {
        strict_quality: true,
        prd_quality_repair_attempts: 1,
        prd_quality_repair: { status: 'completed', attempt: 1, max_attempts: 1 },
      },
    });
    const priorAttestation = {
      version: PRD_QUALITY_ATTESTATION_VERSION,
      status: 'failed',
      score: 90,
      semantic_score: 90,
      structural_score: 90,
      threshold: 95,
      artifact_hash: prdArtifactHash(ARTIFACT),
      scope_hash: resolvePrdScopeHash(currentGoal),
      generated_at: '2026-08-23T09:00:00.000Z',
      blockers: [{ code: 'prior.blocker', message: 'Prior blocker.' }],
      repair: { status: 'queued', attempt: 1, max_attempts: 1 },
    };
    const repairedCandidate = {
      id: 'task-1',
      title: 'Final PRD',
      status: 'done',
      output: REPAIRED_ARTIFACT,
      deliverable_type: 'markdown',
      updated_at: '2026-08-23T10:05:00.000Z',
      task_data: {
        output: REPAIRED_ARTIFACT,
        llmModel: 'gemini-3.8-flash',
        quality_score_kind: 'pending_semantic_attestation',
        prd_quality_attestation: null,
        prd_quality_repair: {
          prior_artifact: ARTIFACT,
          prior_artifact_hash: prdArtifactHash(ARTIFACT),
          prior_scores: { score: 90, semantic_score: 90, structural_score: 90 },
          prior_attestation: priorAttestation,
          artifact_hash: prdArtifactHash(REPAIRED_ARTIFACT),
        },
      },
    };
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify(
        failingSemanticCritic({
          code: 'repair.regressed',
          message: 'Worse.',
          summary: 'The repair regressed.',
          instruction: 'Restore the prior passing content and repair only the regression.',
        })
      ),
    });
    mocks.loadGoal.mockResolvedValue({
      ...currentGoal,
      status: 'pending_validation',
      updated_at: '2026-08-23T10:06:00.000Z',
      data: {
        ...currentGoal.data,
        token_totals: { total_tokens: 1000 },
        prd_quality_validation: { status: 'running' },
      },
    });
    const admin = adminForTaskUpdate();

    const result = await ensureStrictPrdCompletionAttestation(admin, currentGoal, {
      candidates: [repairedCandidate],
      req: null,
    });

    expect(result).toMatchObject({
      applicable: true,
      allowed: false,
      regressed: true,
      artifact: ARTIFACT,
      attestation: priorAttestation,
      goalStatus: 'needs_human',
    });
    expect(result.attemptedAttestation.artifact_hash).toBe(prdArtifactHash(REPAIRED_ARTIFACT));
    expect(admin.taskUpdates).toHaveLength(1);
    expect(admin.taskUpdates[0].data).toMatchObject({
      output: ARTIFACT,
      quality_score: 90,
      quality_score_kind: 'semantic_attested',
      prd_quality_attestation: priorAttestation,
      prd_quality_repair: {
        status: 'needs_human',
        outcome: 'regressed',
        restored_artifact_hash: prdArtifactHash(ARTIFACT),
        attempted_artifact_hash: prdArtifactHash(REPAIRED_ARTIFACT),
      },
    });
    expect(admin.goalUpdates.at(-1)).toMatchObject({
      status: 'needs_human',
      data: {
        prd_quality_attestation: priorAttestation,
        prd_quality_validation: {
          status: 'repair_regressed',
          artifact_hash: prdArtifactHash(ARTIFACT),
          attempted_artifact_hash: prdArtifactHash(REPAIRED_ARTIFACT),
        },
        prd_quality_repair: {
          status: 'needs_human',
          outcome: 'regressed',
          restored_artifact_hash: prdArtifactHash(ARTIFACT),
          attempted_artifact_hash: prdArtifactHash(REPAIRED_ARTIFACT),
        },
      },
    });
    expect(mocks.logGoalEvent).toHaveBeenCalledWith(
      admin,
      'goal-1',
      'prd_quality_repair_regressed',
      expect.objectContaining({
        attempted_artifact_hash: prdArtifactHash(REPAIRED_ARTIFACT),
        restored_artifact_hash: prdArtifactHash(ARTIFACT),
        attempted_attestation: expect.objectContaining({ semantic_score: 80 }),
      })
    );
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('does not classify a repair with nondecreasing scores as a regression', () => {
    const priorAttestation = {
      score: 70,
      semantic_score: 75,
      structural_score: 80,
      artifact_hash: prdArtifactHash(ARTIFACT),
    };
    const repairedCandidate = {
      ...candidate(),
      output: REPAIRED_ARTIFACT,
      task_data: {
        output: REPAIRED_ARTIFACT,
        prd_quality_repair: {
          prior_artifact: ARTIFACT,
          prior_artifact_hash: prdArtifactHash(ARTIFACT),
          prior_scores: { score: 70, semantic_score: 75, structural_score: 80 },
          prior_attestation: priorAttestation,
        },
      },
    };

    expect(
      postRepairScoreRegression(
        repairedCandidate,
        { score: 70, semantic_score: 76, structural_score: 81 },
        1
      )
    ).toBeNull();
  });

  it('does not run the critic when another writer wins the validation reservation', async () => {
    const current = goal({ status: 'cancelled' });
    mocks.loadGoal.mockResolvedValue(current);
    const admin = adminForTaskUpdate({ goalResults: [null] });

    const result = await ensureStrictPrdCompletionAttestation(admin, goal(), {
      candidates: [candidate()],
      req: null,
    });

    expect(result).toMatchObject({
      applicable: true,
      allowed: false,
      superseded: true,
      goalStatus: 'cancelled',
    });
    expect(result.decision.reasons).toContain('validation_reservation_lost');
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
    expect(admin.taskUpdates).toHaveLength(0);
  });

  it('discards a long critic result when the final task changed during validation', async () => {
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify(passingSemanticCritic()),
    });
    const admin = adminForTaskUpdate({ taskResult: null });

    const result = await ensureStrictPrdCompletionAttestation(admin, goal(), {
      candidates: [candidate()],
      req: null,
    });

    expect(result).toMatchObject({ applicable: true, allowed: false, superseded: true });
    expect(result.decision.reasons).toContain('final_task_changed_during_validation');
    expect(admin.goalUpdates).toHaveLength(2);
    expect(admin.goalUpdates.at(-1).data.prd_quality_validation.status).toBe('superseded');
    expect(mocks.enqueueGoalAction).toHaveBeenCalledWith(admin, 'complete', 'goal-1');
  });

  it('does not publish an attestation when the reserved goal changes during the critic', async () => {
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify(passingSemanticCritic()),
    });
    const admin = adminForTaskUpdate({
      goalResults: [undefined, null],
    });

    const result = await ensureStrictPrdCompletionAttestation(admin, goal(), {
      candidates: [candidate()],
      req: null,
    });

    expect(result).toMatchObject({ applicable: true, allowed: false, superseded: true });
    expect(result.decision.reasons).toContain('goal_changed_during_validation');
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });
});
