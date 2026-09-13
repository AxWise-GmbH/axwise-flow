import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: vi.fn(async () => ({
    content: 'Canonical progress only',
    usage: { total_tokens: 12 },
    estimatedCostUsd: 0.001,
  })),
}));
vi.mock('../goal-handlers/_helpers.js', () => ({
  loadOsjaLessonsForAgent: vi.fn(async () => ['HISTORICAL_OSJA_POISON']),
}));

import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { handlePulseCycle, resolvePulseExecutionAuthority } from './pulse-handler.js';
import {
  acceptedNativeGoalFixture,
  initialNativeScopeAdmissionGoalFixture,
} from '../_shared/native-goal-authority.test-fixture.js';

function selectQuery(row) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    single: vi.fn(async () => ({ data: row, error: null })),
  };
}

function nativePulseAdmin(goal, agent) {
  const inserts = { goal_log: [], pulse_cycles: [] };
  const updates = [];
  return {
    from(table) {
      if (table === 'goals') return selectQuery(goal);
      if (table === 'concilium_agents') {
        return {
          ...selectQuery(agent),
          update(patch) {
            updates.push(patch);
            return {
              eq() {
                return this;
              },
            };
          },
        };
      }
      if (table === 'goal_log' || table === 'pulse_cycles') {
        return {
          insert: vi.fn(async (row) => {
            inserts[table].push(row);
            return { error: null };
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    __debug: { inserts, updates },
  };
}

describe('Pulse native authority and tenant boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never exposes poisoned raw native goal prose to the Pulse model', async () => {
    const goal = acceptedNativeGoalFixture({
      status: 'active',
      org_id: 'org-1',
      title: 'RAW_NATIVE_TITLE_POISON',
      description: 'RAW_NATIVE_DESCRIPTION_POISON',
    });
    const agent = {
      id: 'agent-1',
      user_id: 'user-1',
      name: 'Pulse Agent',
      pulse_goal_id: goal.id,
      metadata: {
        prompt_improvements: [{ improvement: 'HISTORICAL_PROMPT_IMPROVEMENT_POISON' }],
      },
      check_in_interval_ms: 60_000,
    };
    const admin = nativePulseAdmin(goal, agent);

    const result = await handlePulseCycle(
      admin,
      {
        agentId: agent.id,
        goalId: goal.id,
        userId: agent.user_id,
        taskFocus: 'STALE_TASK_FOCUS_POISON',
        mode: 'lite',
        cycleNumber: 1,
      },
      null
    );

    expect(result.status).toBe('keep');
    expect(executeLlmTracked).toHaveBeenCalledTimes(1);
    const request = executeLlmTracked.mock.calls[0][0];
    const providerText = `${request.systemPrompt}\n${request.prompt}`;
    expect(providerText).toContain(
      goal.data.axwise_customer_intelligence.scope_packet.intent.objective
    );
    expect(providerText).not.toContain('RAW_NATIVE_TITLE_POISON');
    expect(providerText).not.toContain('RAW_NATIVE_DESCRIPTION_POISON');
    expect(providerText).not.toContain('STALE_TASK_FOCUS_POISON');
    expect(providerText).not.toContain('HISTORICAL_PROMPT_IMPROVEMENT_POISON');
    expect(providerText).not.toContain('HISTORICAL_OSJA_POISON');
    expect(request.usage).toMatchObject({ userId: 'user-1', organizationId: 'org-1' });
    expect(admin.__debug.inserts.pulse_cycles[0].user_id).toBe('user-1');
  });

  it('fails closed before any model call when native authority is incomplete', async () => {
    const goal = initialNativeScopeAdmissionGoalFixture({
      status: 'active',
      title: 'RAW_INCOMPLETE_NATIVE_POISON',
    });
    const agent = {
      id: 'agent-1',
      user_id: 'user-1',
      name: 'Pulse Agent',
      pulse_goal_id: goal.id,
      metadata: {},
    };
    const result = await handlePulseCycle(
      nativePulseAdmin(goal, agent),
      { agentId: agent.id, goalId: goal.id, userId: 'user-1', cycleNumber: 1 },
      null
    );

    expect(result.status).toBe('native_scope_blocked');
    expect(executeLlmTracked).not.toHaveBeenCalled();
  });

  it('rejects a queued owner that does not own the Pulse agent', async () => {
    const foreignAgent = {
      id: 'agent-1',
      user_id: 'user-2',
      pulse_goal_id: 'goal-1',
      metadata: {},
    };
    const admin = {
      from(table) {
        if (table !== 'concilium_agents') throw new Error('Goal must not be loaded');
        return selectQuery(foreignAgent);
      },
    };

    await expect(
      handlePulseCycle(
        admin,
        { agentId: 'agent-1', goalId: 'goal-1', userId: 'user-1', cycleNumber: 1 },
        null
      )
    ).rejects.toThrow('owner does not match');
    expect(executeLlmTracked).not.toHaveBeenCalled();
  });

  it('the pure authority view also excludes legacy fields', () => {
    const goal = acceptedNativeGoalFixture({
      title: 'RAW_TITLE_POISON',
      description: 'RAW_DESCRIPTION_POISON',
    });
    const view = resolvePulseExecutionAuthority(goal);
    expect(view).toMatchObject({ ready: true, native: true });
    expect(view.stateText).not.toContain('RAW_TITLE_POISON');
    expect(view.stateText).not.toContain('RAW_DESCRIPTION_POISON');
  });
});
