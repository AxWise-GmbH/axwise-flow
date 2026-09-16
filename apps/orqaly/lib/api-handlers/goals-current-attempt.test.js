import { describe, expect, it, vi } from 'vitest';
import { handleGet } from './goals.js';

function terminal(data) {
  return {
    eq: vi.fn(() => terminal(data)),
    contains: vi.fn(() => terminal(data)),
    in: vi.fn(() => terminal(data)),
    order: vi.fn(() => terminal(data)),
    limit: vi.fn(async () => ({ data, error: null })),
    single: vi.fn(async () => ({ data, error: null })),
    then: (resolve) => resolve({ data, error: null }),
  };
}

describe('GET goal current-attempt projection', () => {
  it('excludes cancelled Request Changes history from tasks and live metrics', async () => {
    const goal = {
      id: 'goal-1',
      user_id: 'user-1',
      status: 'active',
      spent_usd: 52,
      plan: { phases: [{ name: 'Current phase', status: 'executing' }] },
      data: {
        axwise_orchestration: { decision_id: 'decision-new' },
        phase_costs: { 0: { total: 50 } },
      },
    };
    const tasks = [
      {
        id: 'task-old',
        title: 'Cancelled old deliverable',
        status: 'cancelled',
        assigned_to: 'Old Agent',
        agent_id: 'agent-old',
        data: {
          goal_id: goal.id,
          phase_index: 0,
          axwise_decision_id: 'decision-old',
          llmCost: 50,
          llmTotalTokens: 5000,
        },
      },
      {
        id: 'task-current',
        title: 'Current deliverable',
        status: 'done',
        assigned_to: 'Current Agent',
        agent_id: 'agent-current',
        data: {
          goal_id: goal.id,
          phase_index: 0,
          axwise_decision_id: 'decision-new',
          llmCost: 2,
          llmTotalTokens: 200,
          llmEstimatedCostUsd: 2,
          quality_score: 90,
        },
      },
    ];

    const admin = {
      from: vi.fn((table) => {
        if (table === 'goals') return { select: () => terminal(goal) };
        if (table === 'agent_jobs') {
          return {
            select: () =>
              terminal([
                {
                  id: 'internal-job-id',
                  status: 'queued',
                  worker_scope: 'production',
                  created_at: '2026-08-12T10:00:00.000Z',
                  updated_at: '2026-08-12T10:00:00.000Z',
                },
              ]),
          };
        }
        if (table === 'jobs') {
          return {
            select: () => terminal([{ id: 'job-current', created_at: '2026-08-12T10:00:00Z' }]),
          };
        }
        if (table === 'goal_log') return { select: () => terminal([]) };
        if (table === 'team_tasks') return { select: () => terminal(tasks) };
        if (table === 'financial_events' || table === 'llm_usage') {
          return { select: () => terminal([]) };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const result = await handleGet(admin, { id: 'user-1' }, { id: goal.id });

    expect(result.data.tasks.map((task) => task.id)).toEqual(['task-current']);
    expect(result.data.worker_pickup).toEqual({
      status: 'queued',
      worker_scope: 'production',
      queued_at: '2026-08-12T10:00:00.000Z',
      updated_at: '2026-08-12T10:00:00.000Z',
      retry_available_at: '2026-08-12T10:01:30.000Z',
    });
    expect(result.data.worker_pickup).not.toHaveProperty('id');
    expect(result.data.agentBudget).toHaveLength(1);
    expect(result.data.agentBudget[0]).toMatchObject({
      name: 'Current Agent',
      tasks: 1,
      completed: 1,
      spent: 2,
      tokens: 200,
    });
    expect(result.data.phaseBudget.find((phase) => phase.phaseIndex === 0)).toMatchObject({
      cost: 2,
      tokens: 200,
    });
  });
});
