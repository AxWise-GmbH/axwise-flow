/**
 * Tests for osja-regen stage — auto-regeneration of a single deliverable
 * using Osja's critique.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PRD_QUALITY_ATTESTATION_VERSION,
  PRD_QUALITY_RULESET_VERSION,
  prdArtifactHash,
  resolvePrdScopeHash,
} from '../../quality/prd-quality-gate.js';

const mocks = vi.hoisted(() => ({
  executeLlmV2Mock: vi.fn(),
  checkPulseBudgetMock: vi.fn(),
  enqueueGoalActionMock: vi.fn(),
  logGoalEventMock: vi.fn(),
  notifyGoalEventMock: vi.fn(),
  loadOsjaLessonsForAgentMock: vi.fn(),
  loadGoalMock: vi.fn(async (_admin, id) => ({
    id,
    title: 'Test goal',
    description: 'Test description',
    user_id: 'user-1',
    status: 'completed',
    data: {
      deliverables: [
        {
          id: 'deliv-1',
          title: 'A',
          output: 'old output',
          deliverable_type: 'markdown',
          agent_id: 'agent-1',
        },
        {
          id: 'deliv-2',
          title: 'B',
          output: 'old2',
          deliverable_type: 'code',
          agent_id: 'agent-2',
        },
      ],
    },
  })),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../concilium-handlers/llm-executor-v2.js', () => ({
  executeLlmV2: mocks.executeLlmV2Mock,
}));

// osja-regen now calls executeLlmV2Tracked (usage-recording wrapper). Route it
// to the same underlying mock and strip the `usage` context so assertions on
// the executor's call args stay identical to the bare-executor behavior.
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: (opts = {}) => {
    const { usage: _usage, ...execOpts } = opts;
    return mocks.executeLlmV2Mock(execOpts);
  },
}));

vi.mock('../../agent-handlers/pulse-handler.js', () => ({
  checkPulseBudget: mocks.checkPulseBudgetMock,
}));

vi.mock('../_helpers.js', () => ({
  loadGoal: mocks.loadGoalMock,
  logGoalEvent: mocks.logGoalEventMock,
  notifyGoalEvent: mocks.notifyGoalEventMock,
  enqueueGoalAction: mocks.enqueueGoalActionMock,
  loadOsjaLessonsForAgent: mocks.loadOsjaLessonsForAgentMock,
}));

const {
  executeLlmV2Mock,
  checkPulseBudgetMock,
  enqueueGoalActionMock,
  logGoalEventMock,
  notifyGoalEventMock,
  loadOsjaLessonsForAgentMock,
} = mocks;

import { handle as handleImpl } from './osja-regen.js';

function handle(admin, payload, req) {
  return handleImpl(
    admin,
    { _userId: 'user-1', userId: 'user-1', user_id: 'user-1', ...payload },
    req
  );
}

function makeAdmin({ agent, taskRow, fallbackTaskRows = [], updateCapture } = {}) {
  const calls = {
    goalsUpdate: [],
    teamTasksUpdate: [],
    agentReadFilters: [],
    anchorReadFilters: [],
  };
  const normalizedAgent = agent ? { user_id: 'user-1', status: 'active', ...agent } : null;
  const admin = {
    from: vi.fn((table) => {
      if (table === 'team_tasks') {
        const taskRead = {
          eq: () => taskRead,
          ilike: () => taskRead,
          order: () => taskRead,
          limit: async () => ({ data: fallbackTaskRows }),
          maybeSingle: async () => ({ data: taskRow || null }),
        };
        return {
          // First lookup uses the id; fallback uses owned goal rows matching
          // the title before the shared current-attempt projection.
          select: () => taskRead,
          update: (patch) => {
            const query = {
              eq: () => query,
              then: (resolve) => {
                calls.teamTasksUpdate.push(patch);
                return Promise.resolve({ data: null, error: null }).then(resolve);
              },
            };
            return query;
          },
        };
      }
      if (table === 'agents') {
        const agentRead = {
          eq: (column, value) => {
            calls.agentReadFilters.push([column, value]);
            return agentRead;
          },
          maybeSingle: async () => ({ data: normalizedAgent }),
        };
        return {
          select: () => agentRead,
        };
      }
      if (table === 'knowledge_documents') {
        const query = {
          select: () => query,
          eq: (column, value) => {
            calls.anchorReadFilters.push(['eq', column, value]);
            return query;
          },
          is: (column, value) => {
            calls.anchorReadFilters.push(['is', column, value]);
            return query;
          },
          order: () => query,
          limit: async () => ({ data: [], error: null }),
        };
        return query;
      }
      if (table === 'goals') {
        return {
          update: (patch) => {
            const query = {
              eq: () => query,
              then: (resolve) => {
                calls.goalsUpdate.push(patch);
                if (updateCapture) updateCapture(patch);
                return Promise.resolve({ data: null, error: null }).then(resolve);
              },
            };
            return query;
          },
        };
      }
      return {};
    }),
  };
  return { admin, calls };
}

beforeEach(() => {
  delete process.env.LLM_DEFAULT_PROVIDER;
  delete process.env.LLM_DEFAULT_MODEL;
  executeLlmV2Mock.mockReset();
  checkPulseBudgetMock.mockReset();
  enqueueGoalActionMock.mockReset();
  logGoalEventMock.mockReset();
  notifyGoalEventMock.mockReset();
  loadOsjaLessonsForAgentMock.mockReset();
  loadOsjaLessonsForAgentMock.mockResolvedValue([]);
  checkPulseBudgetMock.mockResolvedValue({ allowed: true });
});

afterEach(() => {
  delete process.env.LLM_DEFAULT_PROVIDER;
  delete process.env.LLM_DEFAULT_MODEL;
});

describe('osja-regen', () => {
  it('rejects disagreeing queued owner aliases before reading the goal', async () => {
    const { admin } = makeAdmin();

    await expect(
      handleImpl(
        admin,
        {
          goalId: 'g1',
          deliverableId: 'deliv-1',
          _userId: 'user-1',
          userId: 'victim-user',
          user_id: 'user-1',
        },
        null
      )
    ).rejects.toMatchObject({ code: 'OSJA_REGEN_OWNER_VALIDATION_ERROR' });

    expect(mocks.loadGoalMock).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('skips when the deliverable cannot be found on the goal', async () => {
    const { admin } = makeAdmin();
    const result = await handle(admin, { goalId: 'g1', deliverableId: 'missing' }, null);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('deliverable-not-found');
    expect(executeLlmV2Mock).not.toHaveBeenCalled();
  });

  it('fails closed before any write when a completed deliverable has a current quality attestation', async () => {
    const artifact = '# PRD: Immutable\n\nCanonical output';
    const goal = {
      id: 'g1',
      title: 'Create exactly one implementation-ready PRD',
      description: 'Produce exactly one self-contained Markdown file.',
      user_id: 'user-1',
      status: 'completed',
      data: {
        deliverables: [
          {
            id: 'deliv-1',
            title: 'Final PRD',
            output: artifact,
            deliverable_type: 'markdown',
            agent_id: 'agent-1',
          },
        ],
      },
    };
    goal.data.prd_quality_attestation = {
      version: PRD_QUALITY_ATTESTATION_VERSION,
      ruleset_version: PRD_QUALITY_RULESET_VERSION,
      deliverable_profile: 'generic_prd',
      status: 'passed',
      score: 99,
      threshold: 95,
      artifact_hash: prdArtifactHash(artifact),
      scope_hash: resolvePrdScopeHash(goal),
    };
    mocks.loadGoalMock.mockResolvedValueOnce(goal);
    const { admin, calls } = makeAdmin();

    const result = await handle(
      admin,
      { goalId: 'g1', deliverableId: 'deliv-1', verdict: { score: 40 } },
      null
    );

    expect(result).toMatchObject({
      skipped: true,
      reason: 'immutable-quality-attestation',
    });
    expect(admin.from).not.toHaveBeenCalled();
    expect(executeLlmV2Mock).not.toHaveBeenCalled();
    expect(calls.goalsUpdate).toHaveLength(0);
    expect(calls.teamTasksUpdate).toHaveLength(0);
    expect(enqueueGoalActionMock).not.toHaveBeenCalled();
  });

  it('skips when the producing agent cannot be resolved', async () => {
    const { admin } = makeAdmin({ agent: null, taskRow: null });
    const result = await handle(admin, { goalId: 'g1', deliverableId: 'deliv-1' }, null);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('agent-not-found');
    expect(executeLlmV2Mock).not.toHaveBeenCalled();
  });

  it('skips when pulse budget is exhausted', async () => {
    checkPulseBudgetMock.mockResolvedValue({ allowed: false, todayCost: 10 });
    const { admin } = makeAdmin({
      agent: { id: 'agent-1', name: 'Alpha', provider: 'glm' },
      taskRow: { id: 'task-1', agent_id: 'agent-1', data: { output: 'old output' } },
    });
    const result = await handle(
      admin,
      { goalId: 'g1', deliverableId: 'deliv-1', verdict: { score: 40 } },
      null
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('budget-exhausted');
    expect(executeLlmV2Mock).not.toHaveBeenCalled();
  });

  it('regenerates output, archives the original, increments count, and re-enqueues review', async () => {
    executeLlmV2Mock.mockResolvedValue({
      content: 'BRAND NEW improved output',
      estimatedCostUsd: 0.01,
    });
    const { admin, calls } = makeAdmin({
      agent: {
        id: 'agent-1',
        name: 'Alpha',
        provider: 'glm',
        model: 'glm-5.1',
        system_prompt: 'You are Alpha.',
      },
      taskRow: { id: 'task-1', agent_id: 'agent-1', data: { output: 'old output' } },
    });

    const result = await handle(
      admin,
      {
        goalId: 'g1',
        deliverableId: 'deliv-1',
        verdict: {
          score: 40,
          reasoning: 'Too short',
          what_to_change: ['Add examples'],
          recreate_prompt: 'Rewrite as a full guide',
        },
      },
      null
    );

    expect(result.skipped).toBeUndefined();
    expect(result.regenCount).toBe(1);
    expect(executeLlmV2Mock).toHaveBeenCalledTimes(1);
    expect(calls.agentReadFilters).toEqual(
      expect.arrayContaining([
        ['id', 'agent-1'],
        ['user_id', 'user-1'],
      ])
    );
    expect(loadOsjaLessonsForAgentMock).toHaveBeenCalledWith(admin, 'agent-1', 'user-1', 5);
    expect(checkPulseBudgetMock).toHaveBeenCalledWith(admin, 'agent-1', 'user-1');
    expect(mocks.loadGoalMock).toHaveBeenCalledWith(admin, 'g1', 'user-1');
    expect(calls.anchorReadFilters).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'user-1'],
        ['eq', 'metadata->>source', 'curated'],
        ['is', 'user_id', null],
      ])
    );

    // goals.data.deliverables updated with archived previous + new output
    expect(calls.goalsUpdate.length).toBe(1);
    const patched = calls.goalsUpdate[0].data.deliverables[0];
    expect(patched.output).toBe('BRAND NEW improved output');
    expect(patched.osja_regen_count).toBe(1);
    expect(patched.previous_versions).toHaveLength(1);
    expect(patched.previous_versions[0].output).toBe('old output');
    expect(patched.previous_versions[0].score).toBe(40);

    // team_tasks row kept in sync (source of truth for execute-phase)
    expect(calls.teamTasksUpdate.length).toBe(1);
    expect(calls.teamTasksUpdate[0].data.output).toBe('BRAND NEW improved output');

    // Re-review enqueued for the regenerated deliverable only
    expect(enqueueGoalActionMock).toHaveBeenCalledWith(
      admin,
      'osja-review',
      'g1',
      expect.objectContaining({ singleDeliverableId: 'deliv-1' })
    );
  });

  it('uses the current-attempt row when title fallback finds multiple revisions', async () => {
    const currentGoal = {
      id: 'g1',
      title: 'Test goal',
      description: 'Test description',
      user_id: 'user-1',
      data: {
        axwise_orchestration: { decision_id: 'decision-current' },
        deliverables: [
          {
            id: 'missing-direct-row',
            title: 'A',
            output: 'old output',
            deliverable_type: 'markdown',
          },
        ],
      },
    };
    mocks.loadGoalMock
      .mockResolvedValueOnce(currentGoal)
      .mockResolvedValueOnce(currentGoal)
      .mockResolvedValueOnce(currentGoal);
    executeLlmV2Mock.mockResolvedValue({ content: 'Improved current output' });
    const { admin, calls } = makeAdmin({
      agent: { id: 'agent-current', name: 'Current Agent', provider: 'gemini' },
      taskRow: null,
      fallbackTaskRows: [
        {
          id: 'task-old',
          status: 'done',
          agent_id: 'agent-old',
          data: { axwise_decision_id: 'decision-old', output: 'old attempt' },
        },
        {
          id: 'task-current',
          status: 'done',
          agent_id: 'agent-current',
          data: { axwise_decision_id: 'decision-current', output: 'current attempt' },
        },
      ],
    });

    await handle(
      admin,
      { goalId: 'g1', deliverableId: 'missing-direct-row', verdict: { score: 40 } },
      null
    );

    expect(calls.teamTasksUpdate).toHaveLength(1);
    expect(calls.teamTasksUpdate[0].data.previous_outputs[0].output).toBe('current attempt');
  });

  it('uses the operator-configured model instead of the producing agent model', async () => {
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';
    executeLlmV2Mock.mockResolvedValue({
      content: 'Improved with the configured model',
      estimatedCostUsd: 0.01,
    });
    const { admin } = makeAdmin({
      agent: {
        id: 'agent-1',
        name: 'Alpha',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
      },
      taskRow: { id: 'task-1', agent_id: 'agent-1', data: { output: 'old output' } },
    });

    await handle(
      admin,
      {
        goalId: 'g1',
        deliverableId: 'deliv-1',
        verdict: { score: 40, reasoning: 'Needs more detail' },
      },
      null
    );

    expect(executeLlmV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', model: 'gemini-3.8-flash' })
    );
  });

  it('skips when the LLM returns an empty output (no mutation, no re-review)', async () => {
    executeLlmV2Mock.mockResolvedValue({ content: '   ' });
    const { admin, calls } = makeAdmin({
      agent: { id: 'agent-1', provider: 'glm' },
      taskRow: { id: 'task-1', agent_id: 'agent-1', data: { output: 'old' } },
    });
    const result = await handle(
      admin,
      {
        goalId: 'g1',
        deliverableId: 'deliv-1',
        verdict: { score: 30 },
      },
      null
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('empty-output');
    expect(calls.goalsUpdate.length).toBe(0);
    expect(enqueueGoalActionMock).not.toHaveBeenCalled();
  });

  it('requires both goalId and deliverableId', async () => {
    const { admin } = makeAdmin();
    await expect(handle(admin, { goalId: 'g1' }, null)).rejects.toThrow(/goalId and deliverableId/);
    await expect(handle(admin, { deliverableId: 'd1' }, null)).rejects.toThrow(
      /goalId and deliverableId/
    );
  });
});
