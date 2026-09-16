import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeLlmTracked: vi.fn(),
  logGoalEvent: vi.fn(async () => {}),
  updateGoal: vi.fn(async () => {}),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: mocks.executeLlmTracked,
}));
vi.mock('../_helpers.js', () => ({
  logGoalEvent: mocks.logGoalEvent,
  updateGoal: mocks.updateGoal,
}));
vi.mock('../goal-stage-llm.js', () => ({
  resolveGoalStageLlm: () => ({ provider: 'google', model: 'gemini-3.8-flash' }),
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
import { generateDetailedProjection, generateQuickPreview } from './theory-projection.js';

function nativeCompletedGoal() {
  const plan = {
    phases: [{ name: 'RAW_NATIVE_PLAN_POISON', description: 'Do not send this to Theory' }],
  };
  const goal = acceptedNativeGoalFixture({
    id: 'goal-native-theory',
    title: 'RAW_NATIVE_TITLE_POISON',
    description: 'RAW_NATIVE_DESCRIPTION_POISON',
    status: 'completed',
    plan,
  });
  goal.parsed_category = 'RAW_NATIVE_CATEGORY_POISON';
  goal.industry = 'RAW_NATIVE_INDUSTRY_POISON';
  goal.feasibility_report = { summary: 'RAW_NATIVE_FEASIBILITY_POISON' };
  goal.retrospective = { what_worked: 'RAW_NATIVE_RETROSPECTIVE_POISON' };
  goal.data.deploymentUrl = 'RAW_NATIVE_DEPLOYMENT_POISON';
  goal.data.githubUrl = 'RAW_NATIVE_GITHUB_POISON';
  goal.data.axwise_customer_intelligence.persona_resolution = {
    source_type: 'scope_bound',
    customer_persona: {
      name: 'Approved operator',
      role: 'Owner',
      profile: { desired_outcome: 'APPROVED_PERSONA_CONTEXT' },
    },
    ideal_agent_persona: {
      role: 'Analyst',
      required_capabilities: ['business analysis'],
    },
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
    plan_hash: formation.plan_hash,
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

function task({
  id,
  output,
  attempt = 'formation-current',
  goalId = 'goal-native-theory',
  userId = 'user-1',
}) {
  return {
    id,
    goal_id: goalId,
    user_id: userId,
    title: `Artifact ${id}`,
    status: 'done',
    materialization_attempt: attempt,
    data: { output, deliverable_type: 'markdown', materialization_attempt: attempt },
  };
}

function makeAdmin(taskRows = []) {
  const taskChain = {
    select: () => taskChain,
    eq: () => taskChain,
    then: (resolve) => resolve({ data: taskRows, error: null }),
  };
  return {
    from: vi.fn((table) => {
      if (table === 'team_tasks') return taskChain;
      if (table === 'goal_projections' || table === 'financial_events') {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.executeLlmTracked.mockImplementation(async ({ usage }) => {
    if (usage.operation === 'business-analysis') {
      return { content: JSON.stringify({ horizons: [], scenarios: {} }), estimatedCostUsd: 0 };
    }
    if (usage.operation === 'competitor-research') {
      return { content: JSON.stringify({ competitors: [] }), estimatedCostUsd: 0 };
    }
    return { content: JSON.stringify({ horizon_plans: [] }), estimatedCostUsd: 0 };
  });
});

describe('native Theory projection authority', () => {
  it('uses canonical scope, approved persona, and only current owned artifacts', async () => {
    const goal = nativeCompletedGoal();
    const admin = makeAdmin([
      task({ id: 'current', output: 'CURRENT_NATIVE_ARTIFACT' }),
      task({ id: 'stale', output: 'STALE_NATIVE_ARTIFACT_POISON', attempt: 'formation-stale' }),
      task({ id: 'foreign', output: 'FOREIGN_NATIVE_ARTIFACT_POISON', userId: 'user-2' }),
    ]);

    await expect(generateDetailedProjection(admin, goal, null)).resolves.toMatchObject({
      success: true,
    });

    const modelBoundary = mocks.executeLlmTracked.mock.calls
      .map(([call]) => `${call.systemPrompt}\n${call.prompt}\n${call.usage.description}`)
      .join('\n');
    expect(modelBoundary).toContain(
      'Create an implementation-ready product requirements document.'
    );
    expect(modelBoundary).toContain('APPROVED_PERSONA_CONTEXT');
    expect(modelBoundary).toContain('CURRENT_NATIVE_ARTIFACT');
    for (const poison of [
      'RAW_NATIVE_TITLE_POISON',
      'RAW_NATIVE_DESCRIPTION_POISON',
      'RAW_NATIVE_PLAN_POISON',
      'RAW_NATIVE_CATEGORY_POISON',
      'RAW_NATIVE_INDUSTRY_POISON',
      'RAW_NATIVE_FEASIBILITY_POISON',
      'RAW_NATIVE_RETROSPECTIVE_POISON',
      'RAW_NATIVE_DEPLOYMENT_POISON',
      'RAW_NATIVE_GITHUB_POISON',
      'STALE_NATIVE_ARTIFACT_POISON',
      'FOREIGN_NATIVE_ARTIFACT_POISON',
    ]) {
      expect(modelBoundary).not.toContain(poison);
    }
  });

  it('fails closed before every model call when native authority is incomplete', async () => {
    const goal = initialNativeScopeAdmissionGoalFixture();
    const admin = makeAdmin();

    await expect(generateQuickPreview(admin, goal, null)).resolves.toMatchObject({
      success: false,
      error: 'native_scope_authority_invalid',
    });
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
  });

  it('fails closed before model calls when the native current attempt has no artifacts', async () => {
    const goal = nativeCompletedGoal();
    const admin = makeAdmin([
      task({ id: 'stale', output: 'STALE_NATIVE_ARTIFACT_POISON', attempt: 'formation-stale' }),
    ]);

    await expect(generateDetailedProjection(admin, goal, null)).resolves.toMatchObject({
      success: false,
      error: 'native_current_artifacts_missing',
    });
    expect(mocks.executeLlmTracked).not.toHaveBeenCalled();
  });
});
