import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeLlmTracked: vi.fn(),
  enqueueGoalAction: vi.fn(async () => {}),
  loadGoal: vi.fn(),
  logGoalEvent: vi.fn(async () => {}),
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
  FULL_PRD_REPAIR_EOF_SENTINEL,
  applyMarkdownSectionRepairs,
  handle,
  prdRepairMode,
  validateFullDocumentRepair,
} from './prd-quality-repair.js';
import { prdArtifactHash, resolvePrdScopeHash } from '../../quality/prd-quality-gate.js';
import { acceptedNativeGoalFixture } from '../../_shared/native-goal-authority.test-fixture.js';
import { hashApprovalSnapshot } from '../approval-audit.js';

const ARTIFACT = `# PRD

## Problem
Old problem text.

## Security
Passing security text.

## Rollout
Passing rollout text.`;

const FULL_REPAIRED_ARTIFACT = `# PRD

## Problem
New observable problem text with an accountable owner and a verifiable outcome.

## Security
Passing security text.

## Rollout
Passing rollout text.`;

const LOGISTICS_ARTIFACT =
  'Sequence partner qualification, storage review, channel selection, and an owner-reviewed launch.';
const REPAIRED_LOGISTICS_ARTIFACT =
  'Sequence partner qualification, storage review, channel selection, and an owner-reviewed staged launch. Keep unverified market sizing explicitly open.';

function strictGoal(overrides = {}) {
  const value = {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'Implementation-ready PRD',
    description: 'Return exactly one self-contained PRD.',
    status: 'pending_validation',
    updated_at: '2026-08-23T10:00:00.000Z',
    data: { strict_quality: true },
    ...overrides,
  };
  const artifactHash = prdArtifactHash(ARTIFACT);
  const scopeHash = resolvePrdScopeHash(value);
  value.data = {
    ...(value.data || {}),
    prd_quality_repair_attempts: 0,
    prd_quality_attestation: {
      status: 'failed',
      artifact_hash: artifactHash,
      scope_hash: scopeHash,
      blockers: [{ code: 'semantic_gap', section: '## Problem', message: 'Make it actionable.' }],
    },
    prd_quality_repair: {
      version: 'prd-targeted-repair-v1',
      action: 'prd-quality-repair',
      strategy: 'targeted_sections',
      requires_full_regeneration: false,
      task_id: 'task-1',
      artifact_hash: artifactHash,
      scope_hash: scopeHash,
      sections: ['## Problem'],
      repairs: [
        {
          section_id: '## Problem',
          reason: 'Make it actionable.',
          instruction: 'Add an observable problem statement.',
        },
      ],
    },
  };
  return value;
}

function acceptedNativeRepairGoal() {
  const value = acceptedNativeGoalFixture({
    id: 'goal-1',
    title: 'Implementation-ready PRD',
    description: 'Return exactly one self-contained PRD.',
    status: 'pending_validation',
  });
  const artifactHash = prdArtifactHash(ARTIFACT);
  const scopeHash = resolvePrdScopeHash(value);
  const formationAttempt = {
    version: 'orqaly_team_formation_attempt_v1',
    status: 'completed',
    attempt_id: 'formation-current',
    scope_hash: scopeHash,
    planning_attempt_id: 'planning-current',
    plan_hash: 'a'.repeat(64),
  };
  value.data = {
    ...value.data,
    native_planning_attempt: {
      version: 'orqaly_native_planning_attempt_v1',
      status: 'completed',
      attempt_id: 'planning-current',
      scope_hash: scopeHash,
      plan_hash: 'a'.repeat(64),
      plan_snapshot: structuredClone(value.plan),
      completed_at: '2026-08-24T08:00:00.000Z',
    },
    team_formation_attempt: formationAttempt,
    native_team_formation_attempt: structuredClone(formationAttempt),
    team_work_materialization: {
      version: 'orqaly_team_work_materialization_v1',
      formation_attempt: formationAttempt.attempt_id,
      native_scope_hash: scopeHash,
    },
    strict_quality: true,
    prd_quality_repair_attempts: 0,
    prd_quality_attestation: {
      status: 'failed',
      artifact_hash: artifactHash,
      scope_hash: scopeHash,
      blockers: [{ code: 'semantic_gap', section: '## Problem', message: 'Make it actionable.' }],
    },
    prd_quality_repair: {
      version: 'prd-targeted-repair-v1',
      action: 'prd-quality-repair',
      strategy: 'targeted_sections',
      requires_full_regeneration: false,
      task_id: 'task-1',
      artifact_hash: artifactHash,
      scope_hash: scopeHash,
      sections: ['## Problem'],
      repairs: [
        {
          section_id: '## Problem',
          reason: 'Make it actionable.',
          instruction: 'Add an observable problem statement.',
        },
      ],
    },
  };
  return value;
}

function fullRepairGoal({ structuralScore = null } = {}) {
  const goal = strictGoal();
  goal.data.prd_quality_repair = {
    ...goal.data.prd_quality_repair,
    strategy: 'full_document',
    requires_full_regeneration: true,
    sections: ['## Problem', '## Security', '## Rollout', '## Missing contract'],
  };
  goal.data.prd_quality_attestation = {
    ...goal.data.prd_quality_attestation,
    score: 71,
    semantic_score: 71,
    structural_score: structuralScore,
  };
  return goal;
}

function governedLogisticsRepairGoal() {
  const value = strictGoal({
    title: 'Estonia cat-food distribution',
    description: 'Prepare the approved distribution handoff.',
    data: {
      scope_packet: {
        version: 'orqaly_scope_packet_v2',
        scope_ref: 'axwise:goal-1:decision-logistics',
        scope_hash: 'e'.repeat(64),
        intent: {
          objective: 'Prepare an Estonia distribution plan',
          problem: 'The approved channel sequence needs a handoff',
          desired_outcome: 'A final distribution plan',
          audiences: [],
          non_goals: [],
        },
        deliverable: {
          type: 'distribution_plan',
          count: 1,
          required_sections: [],
          presentation: 'markdown_artifact',
        },
        admission: {
          version: 'axwise_scope_admission_v1',
          work_types: ['procurement_logistics'],
          geographies: ['EE'],
          channels: ['retail'],
          success_criteria: ['A reviewable final distribution plan'],
          required_capabilities: ['logistics planning'],
          requested_actions: [
            {
              action: 'prepare distribution plan',
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
  });
  const artifactHash = prdArtifactHash(LOGISTICS_ARTIFACT);
  const scopeHash = resolvePrdScopeHash(value);
  value.data.prd_quality_attestation = {
    ...value.data.prd_quality_attestation,
    deliverable_profile: 'axwise_workflow',
    score: 80,
    semantic_score: 80,
    structural_score: 80,
    artifact_hash: artifactHash,
    scope_hash: scopeHash,
  };
  value.data.prd_quality_repair = {
    ...value.data.prd_quality_repair,
    deliverable_profile: 'axwise_workflow',
    strategy: 'full_document',
    requires_full_regeneration: true,
    artifact_hash: artifactHash,
    scope_hash: scopeHash,
    sections: [],
    repairs: [
      {
        section_id: 'document',
        reason: 'Clarify the staged launch.',
        instruction: 'Add the owner review and fact-status guard.',
      },
    ],
  };
  return value;
}

function doneTask() {
  return {
    id: 'task-1',
    goal_id: 'goal-1',
    user_id: 'user-1',
    title: 'Final PRD',
    status: 'done',
    materialization_attempt: 'formation-current',
    updated_at: '2026-08-23T09:59:00.000Z',
    data: {
      output: ARTIFACT,
      llmModel: 'gemini-3.8-flash',
      quality_score: 91,
      materialization_attempt: 'formation-current',
    },
  };
}

function fullRepairContent(artifact = FULL_REPAIRED_ARTIFACT) {
  return `${artifact}\n\n${FULL_PRD_REPAIR_EOF_SENTINEL}`;
}

function makeAdmin(task, { goalUpdateResults = [], taskUpdateResults = [] } = {}) {
  const taskUpdates = [];
  const reservationUpdates = [];
  const goalUpdateFilters = [];
  const taskUpdateFilters = [];
  const chain = (result, filters = []) => {
    const value = {
      eq: (field, expected) => {
        filters.push(['eq', field, expected]);
        return value;
      },
      is: (field, expected) => {
        filters.push(['is', field, expected]);
        return value;
      },
      select: () => value,
      maybeSingle: async () =>
        result && Object.prototype.hasOwnProperty.call(result, 'error')
          ? result
          : { data: result, error: null },
    };
    return value;
  };
  return {
    taskUpdates,
    reservationUpdates,
    admin: {
      from: vi.fn((table) => {
        if (table === 'team_tasks') {
          return {
            select: () => chain(task),
            update: (patch) => {
              taskUpdates.push(patch);
              const filters = [];
              taskUpdateFilters.push(filters);
              const result = taskUpdateResults.length ? taskUpdateResults.shift() : { id: task.id };
              return chain(result, filters);
            },
          };
        }
        if (table === 'goals') {
          return {
            update: (patch) => {
              reservationUpdates.push(patch);
              const filters = [];
              goalUpdateFilters.push(filters);
              const result = goalUpdateResults.length
                ? goalUpdateResults.shift()
                : { id: 'goal-1' };
              return chain(result, filters);
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    },
    goalUpdateFilters,
    taskUpdateFilters,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('targeted Markdown repair', () => {
  it('replaces only exact requested H2 ranges', () => {
    const repaired = applyMarkdownSectionRepairs(
      ARTIFACT,
      [
        {
          section_id: '## Problem',
          replacement_markdown: '## Problem\nNew observable problem text.',
        },
      ],
      ['## Problem']
    );
    expect(repaired).toContain('## Problem\nNew observable problem text.');
    expect(repaired).toContain('## Security\nPassing security text.');
    expect(repaired).toContain('## Rollout\nPassing rollout text.');
    expect(repaired).not.toContain('Old problem text.');
  });

  it('rejects extra, missing, duplicate, or broad section replacement', () => {
    expect(() =>
      applyMarkdownSectionRepairs(
        ARTIFACT,
        [{ section_id: '## Security', replacement_markdown: '## Security\nChanged.' }],
        ['## Problem']
      )
    ).toThrow(/unrequested/);
    expect(prdRepairMode({ sections: [] })).toBe('none');
    expect(prdRepairMode({ sections: ['## A', '## B', '## C'] })).toBe('targeted_sections');
    expect(prdRepairMode({ sections: ['## A', '## B', '## C', '## D'] })).toBe('full_document');
  });
});

describe('full-document Markdown promotion', () => {
  it('rejects a changed first H1 before promotion', () => {
    expect(() =>
      validateFullDocumentRepair({
        originalArtifact: ARTIFACT,
        result: {
          content: fullRepairContent(FULL_REPAIRED_ARTIFACT.replace('# PRD', '# Changed PRD')),
          finishReason: 'stop',
        },
        goal: fullRepairGoal(),
        task: doneTask(),
        expectedRuntimeModel: 'gemini-3.8-flash',
      })
    ).toThrow(/preserve the exact first H1/i);
  });

  it('rejects a sentinel-terminated document that is suspiciously short', () => {
    const shortened = `# PRD

## Problem
x

## Security
y

## Rollout
z`;
    expect(() =>
      validateFullDocumentRepair({
        originalArtifact: ARTIFACT,
        result: { content: fullRepairContent(shortened), finishReason: 'stop' },
        goal: fullRepairGoal(),
        task: doneTask(),
        expectedRuntimeModel: 'gemini-3.8-flash',
      })
    ).toThrow(/suspiciously short/i);
  });
});

describe('PRD repair lifecycle', () => {
  it('preserves the unrelated legacy bypass', async () => {
    mocks.loadGoal.mockResolvedValue({
      id: 'legacy-goal',
      title: 'Fix CSS',
      description: '',
      status: 'pending_validation',
      data: {},
    });

    await expect(handle({}, { goalId: 'legacy-goal' }, null)).resolves.toEqual({
      status: 'skipped',
      reason: 'quality_gate_not_applicable',
      goalId: 'legacy-goal',
    });
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
  });

  it('repairs a governed logistics document without imposing PRD headings', async () => {
    const goal = governedLogisticsRepairGoal();
    const task = {
      id: 'task-1',
      title: 'Final distribution plan',
      status: 'done',
      updated_at: '2026-08-23T09:59:00.000Z',
      data: {
        output: LOGISTICS_ARTIFACT,
        deliverable_type: 'markdown',
        llmModel: 'gemini-3.8-flash',
        quality_score: 80,
      },
    };
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: fullRepairContent(REPAIRED_LOGISTICS_ARTIFACT),
      finishReason: 'stop',
    });
    const { admin, taskUpdates } = makeAdmin(task);

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'pending_validation', strategy: 'full_document' });
    expect(taskUpdates[0].data.output).toBe(REPAIRED_LOGISTICS_ARTIFACT);
    expect(taskUpdates[0].data.prd_quality_repair.deliverable_profile).toBe('axwise_workflow');
    const repairCall = mocks.executeLlmTracked.mock.calls[0][0];
    expect(repairCall.prompt).toContain('failed deliverable quality attestation');
    expect(repairCall.prompt).not.toContain('failed PRD quality attestation');
    expect(repairCall.systemPrompt).toContain('deliverable repair editor');
  });

  it('reserves one attempt, updates only the bound task artifact, and queues revalidation', async () => {
    const goal = strictGoal();
    const task = doneTask();
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify({
        sections: [
          {
            section_id: '## Problem',
            replacement_markdown: '## Problem\nNew observable problem text.',
          },
        ],
      }),
    });
    const { admin, taskUpdates, reservationUpdates } = makeAdmin(task);

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'pending_validation', strategy: 'targeted_sections' });
    expect(reservationUpdates[0].data.prd_quality_repair_attempts).toBe(1);
    expect(taskUpdates).toHaveLength(1);
    expect(taskUpdates[0].data.output).toContain('New observable problem text.');
    expect(taskUpdates[0].data.output).toContain('Passing security text.');
    expect(taskUpdates[0].data.quality_score_kind).toBe('pending_semantic_attestation');
    expect(taskUpdates[0].data).not.toHaveProperty('quality_score');
    expect(taskUpdates[0].data.prd_quality_repair).toMatchObject({
      prior_artifact: ARTIFACT,
      prior_artifact_hash: prdArtifactHash(ARTIFACT),
      prior_scope_hash: goal.data.prd_quality_repair.scope_hash,
      prior_attestation: goal.data.prd_quality_attestation,
    });
    expect(mocks.executeLlmTracked).toHaveBeenCalledWith(
      expect.objectContaining({ jsonMode: true, reasoningEffort: 'high' })
    );
    expect(reservationUpdates[2]).toEqual(
      expect.objectContaining({
        status: 'pending_validation',
        data: expect.objectContaining({
          prd_quality_repair_attempts: 1,
          prd_quality_attestation: null,
        }),
      })
    );
    expect(mocks.enqueueGoalAction).toHaveBeenCalledWith(admin, 'complete', goal.id);
    expect(mocks.logGoalEvent).toHaveBeenCalledWith(
      admin,
      goal.id,
      'prd_quality_repair_completed',
      expect.any(Object)
    );
  });

  it('treats a stale queued repair hash as superseded without mutation or side effects', async () => {
    const goal = acceptedNativeRepairGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    const { admin, reservationUpdates, taskUpdates } = makeAdmin(doneTask());

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: 'stale-artifact-hash',
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'superseded', reason: 'queued_repair_hash_mismatch' });
    expect(reservationUpdates).toHaveLength(0);
    expect(taskUpdates).toHaveLength(0);
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
    expect(mocks.logGoalEvent).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('repairs a current native artifact using canonical scope rather than poisoned raw history', async () => {
    const goal = acceptedNativeRepairGoal();
    goal.title = 'RAW_NATIVE_REPAIR_TITLE_POISON';
    goal.description = 'RAW_NATIVE_REPAIR_DESCRIPTION_POISON';
    goal.plan = { phases: [{ name: 'RAW_NATIVE_REPAIR_PLAN_POISON' }] };
    const planHash = hashApprovalSnapshot('native-execution-plan', goal.plan);
    goal.data.native_planning_attempt.plan_hash = planHash;
    goal.data.native_planning_attempt.plan_snapshot = structuredClone(goal.plan);
    goal.data.team_formation_attempt.plan_hash = planHash;
    goal.data.native_team_formation_attempt = structuredClone(goal.data.team_formation_attempt);
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify({
        sections: [
          {
            section_id: '## Problem',
            replacement_markdown: '## Problem\nNew observable problem text.',
          },
        ],
      }),
    });
    const { admin } = makeAdmin(doneTask());

    await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    const call = mocks.executeLlmTracked.mock.calls[0][0];
    expect(call.prompt).toContain('ACCEPTED CANONICAL SCOPE');
    expect(call.prompt).toContain('Create an implementation-ready product requirements document.');
    expect(call.prompt).toContain(ARTIFACT);
    expect(`${call.prompt}\n${call.usage.description}`).not.toContain(
      'RAW_NATIVE_REPAIR_TITLE_POISON'
    );
    expect(call.prompt).not.toContain('RAW_NATIVE_REPAIR_DESCRIPTION_POISON');
    expect(call.prompt).not.toContain('RAW_NATIVE_REPAIR_PLAN_POISON');
  });

  it('does not call the repair model for a stale native materialization row', async () => {
    const goal = acceptedNativeRepairGoal();
    const staleTask = doneTask();
    staleTask.materialization_attempt = 'formation-stale';
    staleTask.data.materialization_attempt = 'formation-stale';
    mocks.loadGoal.mockResolvedValue(goal);
    const { admin, reservationUpdates, taskUpdates } = makeAdmin(staleTask);

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({
      status: 'superseded',
      reason: 'native_current_artifact_missing',
    });
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
    expect(reservationUpdates).toHaveLength(0);
    expect(taskUpdates).toHaveLength(0);
  });

  it('reserves the first historical repair when the attempt counter is absent', async () => {
    const goal = strictGoal();
    delete goal.data.prd_quality_repair_attempts;
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify({
        sections: [
          {
            section_id: '## Problem',
            replacement_markdown: '## Problem\nNew observable problem text.',
          },
        ],
      }),
    });
    const { admin, goalUpdateFilters } = makeAdmin(doneTask());

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'pending_validation' });
    expect(goalUpdateFilters[0]).toContainEqual(['is', 'data->>prd_quality_repair_attempts', null]);
  });

  it('does not mutate the task when cancellation wins the pre-mutation repair CAS', async () => {
    const goal = strictGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify({
        sections: [
          {
            section_id: '## Problem',
            replacement_markdown: '## Problem\nNew observable problem text.',
          },
        ],
      }),
    });
    const { admin, reservationUpdates, taskUpdates, goalUpdateFilters } = makeAdmin(doneTask(), {
      goalUpdateResults: [{ id: goal.id }, null],
    });

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    const attemptToken = reservationUpdates[0].data.prd_quality_repair.attempt_token;
    expect(result).toMatchObject({ status: 'superseded', reason: 'repair_authority_changed' });
    expect(goalUpdateFilters[1]).toContainEqual([
      'eq',
      'data->prd_quality_repair->>attempt_token',
      attemptToken,
    ]);
    expect(goalUpdateFilters[1]).toContainEqual(['eq', 'status', 'pending_validation']);
    expect(taskUpdates).toHaveLength(0);
    expect(mocks.logGoalEvent).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('binds every native repair CAS to the accepted scope and stops a revised scope before task mutation', async () => {
    const goal = acceptedNativeRepairGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify({
        sections: [
          {
            section_id: '## Problem',
            replacement_markdown: '## Problem\nNew observable problem text.',
          },
        ],
      }),
    });
    const { admin, reservationUpdates, taskUpdates, goalUpdateFilters } = makeAdmin(doneTask(), {
      goalUpdateResults: [{ id: goal.id }, null],
    });

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    const attemptToken = reservationUpdates[0].data.prd_quality_repair.attempt_token;
    expect(result).toMatchObject({ status: 'superseded', reason: 'repair_authority_changed' });
    for (const filters of goalUpdateFilters) {
      expect(filters).toContainEqual([
        'eq',
        'data->axwise_customer_intelligence->scope_packet->>scope_hash',
        goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      ]);
      expect(filters).toContainEqual([
        'eq',
        'data->goal_approvals->context->>snapshot_hash',
        goal.data.goal_approvals.context.snapshot_hash,
      ]);
    }
    expect(goalUpdateFilters[1]).toContainEqual([
      'eq',
      'data->prd_quality_repair->>attempt_token',
      attemptToken,
    ]);
    expect(taskUpdates).toHaveLength(0);
    expect(mocks.logGoalEvent).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('restores the prior task artifact when the exact terminal repair CAS loses authority', async () => {
    const goal = acceptedNativeRepairGoal();
    const task = doneTask();
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: JSON.stringify({
        sections: [
          {
            section_id: '## Problem',
            replacement_markdown: '## Problem\nNew observable problem text.',
          },
        ],
      }),
    });
    const { admin, reservationUpdates, taskUpdates, goalUpdateFilters, taskUpdateFilters } =
      makeAdmin(task, {
        goalUpdateResults: [{ id: goal.id }, { id: goal.id }, null],
      });

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'superseded', reason: 'repair_authority_changed' });
    expect(taskUpdates).toHaveLength(2);
    expect(taskUpdates[0].data.output).toContain('New observable problem text.');
    expect(taskUpdates[1].data).toEqual(task.data);
    expect(goalUpdateFilters[2]).toContainEqual([
      'eq',
      'data->prd_quality_repair->>attempt_token',
      reservationUpdates[0].data.prd_quality_repair.attempt_token,
    ]);
    expect(goalUpdateFilters[2]).toContainEqual([
      'eq',
      'updated_at',
      reservationUpdates[1].updated_at,
    ]);
    expect(taskUpdateFilters[1]).toContainEqual([
      'eq',
      'data->prd_quality_repair->>attempt_token',
      reservationUpdates[0].data.prd_quality_repair.attempt_token,
    ]);
    expect(mocks.logGoalEvent).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('accepts complete raw Markdown only after the full-document promotion checks pass', async () => {
    const goal = fullRepairGoal();
    const task = doneTask();
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: fullRepairContent(),
      finishReason: 'stop',
    });
    const { admin, taskUpdates } = makeAdmin(task);

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'pending_validation', strategy: 'full_document' });
    expect(mocks.executeLlmTracked).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: false,
        reasoningEffort: 'high',
        maxTokens: 65_536,
      })
    );
    expect(taskUpdates).toHaveLength(1);
    expect(taskUpdates[0].data.output).toBe(FULL_REPAIRED_ARTIFACT);
    expect(taskUpdates[0].data.output).not.toContain(FULL_PRD_REPAIR_EOF_SENTINEL);
    expect(taskUpdates[0].data.prd_quality_repair).toMatchObject({
      strategy: 'full_document',
      prior_artifact: ARTIFACT,
      prior_artifact_hash: prdArtifactHash(ARTIFACT),
      prior_attestation: goal.data.prd_quality_attestation,
      prior_scores: {
        score: 71,
        semantic_score: 71,
        structural_score: null,
      },
    });
    expect(taskUpdates[0].data.prd_quality_repair.repaired_structural_score).toEqual(
      expect.any(Number)
    );
  });

  it('fails closed when a full-document repair omits the EOF sentinel', async () => {
    const goal = fullRepairGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: FULL_REPAIRED_ARTIFACT,
      finishReason: 'stop',
    });
    const { admin, taskUpdates } = makeAdmin(doneTask());

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'needs_human' });
    expect(result.reason).toMatch(/EOF sentinel is missing/i);
    expect(taskUpdates).toHaveLength(0);
  });

  it('fails closed when the provider reports a capped full-document response', async () => {
    const goal = fullRepairGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: fullRepairContent(),
      finish_reason: 'MAX_TOKENS',
    });
    const { admin, taskUpdates } = makeAdmin(doneTask());

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'needs_human' });
    expect(result.reason).toMatch(/provider output limit/i);
    expect(taskUpdates).toHaveLength(0);
  });

  it('fails closed when a full-document repair drops an original H2 section', async () => {
    const goal = fullRepairGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    const missingSecurity = FULL_REPAIRED_ARTIFACT.replace(
      '## Security\nPassing security text.\n\n',
      'Passing security text without its required heading.\n\n'
    );
    mocks.executeLlmTracked.mockResolvedValue({
      content: fullRepairContent(missingSecurity),
      finishReason: 'stop',
    });
    const { admin, taskUpdates } = makeAdmin(doneTask());

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'needs_human' });
    expect(result.reason).toMatch(/preserve section ## Security exactly once/i);
    expect(taskUpdates).toHaveLength(0);
  });

  it('fails closed when a full-document repair regresses deterministic structural quality', async () => {
    const goal = fullRepairGoal({ structuralScore: 100 });
    mocks.loadGoal.mockResolvedValue(goal);
    mocks.executeLlmTracked.mockResolvedValue({
      content: fullRepairContent(),
      finishReason: 'stop',
    });
    const { admin, taskUpdates } = makeAdmin(doneTask());

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result).toMatchObject({ status: 'needs_human' });
    expect(result.reason).toMatch(/regressed deterministic structural quality/i);
    expect(taskUpdates).toHaveLength(0);
  });

  it('moves the goal to existing needs_human after the sole attempt is exhausted', async () => {
    const goal = strictGoal();
    goal.data.prd_quality_repair_attempts = 1;
    mocks.loadGoal.mockResolvedValue(goal);
    const { admin, reservationUpdates } = makeAdmin({ id: 'task-1' });

    const result = await handle(
      admin,
      {
        goalId: goal.id,
        artifactHash: goal.data.prd_quality_repair.artifact_hash,
        scopeHash: goal.data.prd_quality_repair.scope_hash,
      },
      null
    );

    expect(result.status).toBe('needs_human');
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
    expect(reservationUpdates[0]).toEqual(expect.objectContaining({ status: 'needs_human' }));
  });
});
