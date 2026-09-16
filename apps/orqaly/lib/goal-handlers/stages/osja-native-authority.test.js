import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadGoal: vi.fn(),
  updateGoal: vi.fn(async () => {}),
  logGoalEvent: vi.fn(async () => {}),
  notifyGoalEvent: vi.fn(async () => {}),
  enqueueGoalAction: vi.fn(async () => {}),
  enqueueAgentJob: vi.fn(async () => {}),
  executeLlmV2Tracked: vi.fn(),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: mocks.executeLlmV2Tracked,
}));
vi.mock('../../agent-handlers/pulse-handler.js', () => ({
  checkPulseBudget: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('../../../shared/libraryMcpCatalog.js', () => ({
  updateQualityEstimate: vi.fn(),
}));
vi.mock('../goal-stage-llm.js', () => ({
  resolveGoalStageLlm: () => ({ provider: 'google', model: 'gemini-3.8-flash' }),
}));
vi.mock('../_helpers.js', () => ({
  loadGoal: mocks.loadGoal,
  updateGoal: mocks.updateGoal,
  logGoalEvent: mocks.logGoalEvent,
  notifyGoalEvent: mocks.notifyGoalEvent,
  enqueueGoalAction: mocks.enqueueGoalAction,
  enqueueAgentJob: mocks.enqueueAgentJob,
  deterministicAgentJobId: () => 'job-deterministic',
  loadOsjaLessonsForAgent: vi.fn(async () => []),
}));

import {
  acceptedNativeGoalFixture,
  initialNativeScopeAdmissionGoalFixture,
} from '../../_shared/native-goal-authority.test-fixture.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
  hashApprovalSnapshot,
} from '../approval-audit.js';
import { handle as review } from './osja-review.js';
import { handle as regenerate } from './osja-regen.js';

function completedNativeGoal() {
  const plan = {
    phases: [
      {
        name: 'RAW_NATIVE_PLAN_POISON',
        status: 'completed',
        jobs: [
          {
            title: 'RAW_NATIVE_PLAN_JOB_POISON',
            description: 'RAW_NATIVE_PLAN_DESCRIPTION_POISON',
            required_role: 'RAW_NATIVE_PLAN_ROLE_POISON',
            deliverable_type: 'markdown',
            acceptance_criteria: ['RAW_NATIVE_PLAN_ACCEPTANCE_POISON'],
          },
        ],
      },
    ],
  };
  const goal = acceptedNativeGoalFixture({
    id: 'goal-native-osja',
    title: 'RAW_NATIVE_GOAL_TITLE_POISON',
    description: 'RAW_NATIVE_GOAL_DESCRIPTION_POISON',
    status: 'completed',
    plan,
  });
  goal.data.deliverables = [
    {
      id: 'historical-deliverable',
      output: 'RAW_NATIVE_STORED_DELIVERABLE_POISON',
      title: 'RAW_NATIVE_STORED_TITLE_POISON',
    },
  ];
  goal.data.axwise_customer_intelligence.persona_resolution = {
    customer_persona: {
      name: 'Approved owner',
      role: 'Operator',
      profile: { desired_outcome: 'APPROVED_OSJA_PERSONA_CONTEXT' },
    },
    ideal_agent_persona: { role: 'Approved reviewer' },
  };
  goal.data.goal_approvals.context = approvedApproval(
    'context',
    buildContextApprovalSnapshot(goal),
    goal.user_id
  );
  const scopeHash = goal.data.axwise_customer_intelligence.scope_packet.scope_hash;
  const planHash = hashApprovalSnapshot('native-execution-plan', plan);
  const formation = {
    version: 'orqaly_team_formation_attempt_v1',
    status: 'completed',
    attempt_id: 'formation-current',
    scope_hash: scopeHash,
    planning_attempt_id: 'planning-current',
    plan_hash: planHash,
  };
  goal.data.native_planning_attempt = {
    version: 'orqaly_native_planning_attempt_v1',
    status: 'completed',
    attempt_id: 'planning-current',
    scope_hash: scopeHash,
    plan_hash: planHash,
    plan_snapshot: structuredClone(plan),
    completed_at: '2026-08-24T09:00:00.000Z',
  };
  goal.data.team_formation_attempt = formation;
  goal.data.native_team_formation_attempt = structuredClone(formation);
  goal.data.team_work_materialization = {
    version: 'orqaly_team_work_materialization_v1',
    formation_attempt: formation.attempt_id,
    native_scope_hash: scopeHash,
  };
  return goal;
}

function task({ id, output, attempt = 'formation-current', userId = 'user-1' }) {
  return {
    id,
    goal_id: 'goal-native-osja',
    user_id: userId,
    title: 'RAW_NATIVE_TASK_TITLE_POISON',
    status: 'done',
    materialization_attempt: attempt,
    data: {
      output,
      materialization_attempt: attempt,
      axwise_step_id: 'phase-1-job-1',
      description: 'RAW_NATIVE_TASK_DESCRIPTION_POISON',
      acceptance_criteria: ['RAW_NATIVE_TASK_ACCEPTANCE_POISON'],
      deliverable_type: 'markdown',
      toolLog: [{ name: 'RAW_NATIVE_TOOL_POISON' }],
    },
  };
}

function makeAdmin(taskRows = []) {
  const taskQuery = {
    select: () => taskQuery,
    eq: () => taskQuery,
    then: (resolve) => resolve({ data: taskRows, error: null }),
  };
  const knowledgeQuery = {
    eq: () => knowledgeQuery,
    is: () => knowledgeQuery,
    order: () => knowledgeQuery,
    limit: async () => ({ data: [] }),
    gte: async () => ({ count: 0, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    from: vi.fn((table) => {
      if (table === 'team_tasks') return taskQuery;
      if (table === 'knowledge_documents') {
        return {
          insert: vi.fn(async () => ({ error: null })),
          select: () => knowledgeQuery,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.executeLlmV2Tracked.mockResolvedValue({
    content: JSON.stringify({
      score: 85,
      verdict: 'keep',
      reasoning: 'Current artifact is sound.',
    }),
  });
});

describe('native Osja authority', () => {
  it('reviews only the current owned artifact with canonical scope and approved persona', async () => {
    const goal = completedNativeGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    const admin = makeAdmin([
      task({ id: 'current', output: 'CURRENT_NATIVE_OSJA_ARTIFACT' }),
      task({ id: 'stale', output: 'STALE_NATIVE_OSJA_ARTIFACT_POISON', attempt: 'stale' }),
      task({ id: 'foreign', output: 'FOREIGN_NATIVE_OSJA_ARTIFACT_POISON', userId: 'user-2' }),
    ]);

    await expect(
      review(admin, {
        goalId: goal.id,
        scopeHash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      })
    ).resolves.toMatchObject({ qualityStatus: 'accepted' });

    const modelBoundary = JSON.stringify(mocks.executeLlmV2Tracked.mock.calls);
    expect(modelBoundary).toContain(
      'Create an implementation-ready product requirements document.'
    );
    expect(modelBoundary).toContain('APPROVED_OSJA_PERSONA_CONTEXT');
    expect(modelBoundary).toContain('CURRENT_NATIVE_OSJA_ARTIFACT');
    for (const poison of [
      'RAW_NATIVE_GOAL_TITLE_POISON',
      'RAW_NATIVE_GOAL_DESCRIPTION_POISON',
      'RAW_NATIVE_PLAN_POISON',
      'RAW_NATIVE_PLAN_JOB_POISON',
      'RAW_NATIVE_PLAN_DESCRIPTION_POISON',
      'RAW_NATIVE_PLAN_ROLE_POISON',
      'RAW_NATIVE_PLAN_ACCEPTANCE_POISON',
      'RAW_NATIVE_STORED_DELIVERABLE_POISON',
      'RAW_NATIVE_STORED_TITLE_POISON',
      'RAW_NATIVE_TASK_TITLE_POISON',
      'RAW_NATIVE_TASK_DESCRIPTION_POISON',
      'RAW_NATIVE_TASK_ACCEPTANCE_POISON',
      'RAW_NATIVE_TOOL_POISON',
      'STALE_NATIVE_OSJA_ARTIFACT_POISON',
      'FOREIGN_NATIVE_OSJA_ARTIFACT_POISON',
    ]) {
      expect(modelBoundary).not.toContain(poison);
    }
  });

  it('blocks incomplete authority and a missing queued scope hash before model calls', async () => {
    const incomplete = initialNativeScopeAdmissionGoalFixture();
    mocks.loadGoal.mockResolvedValueOnce(incomplete);
    const admin = makeAdmin();
    await expect(review(admin, { goalId: incomplete.id })).resolves.toMatchObject({
      status: 'native_scope_blocked',
    });

    const accepted = completedNativeGoal();
    mocks.loadGoal.mockResolvedValueOnce(accepted);
    await expect(review(admin, { goalId: accepted.id })).resolves.toMatchObject({
      status: 'native_scope_blocked',
      reasons: ['native_osja_scope_hash_mismatch'],
    });
    expect(mocks.executeLlmV2Tracked).not.toHaveBeenCalled();
  });

  it('never routes an accepted native artifact through legacy Osja regeneration', async () => {
    const goal = completedNativeGoal();
    mocks.loadGoal.mockResolvedValue(goal);
    const admin = makeAdmin();

    await expect(
      regenerate(admin, {
        goalId: goal.id,
        deliverableId: 'historical-deliverable',
        _userId: goal.user_id,
        userId: goal.user_id,
        user_id: goal.user_id,
      })
    ).resolves.toMatchObject({
      skipped: true,
      reason: 'native_regen_requires_new_scope_attempt',
    });
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.executeLlmV2Tracked).not.toHaveBeenCalled();
    expect(mocks.enqueueGoalAction).not.toHaveBeenCalled();
  });
});
