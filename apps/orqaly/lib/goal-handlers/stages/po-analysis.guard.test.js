import { afterEach, describe, expect, it, vi } from 'vitest';

const executeLlm = vi.fn();
const parseLlmJson = vi.fn();
const loadGoal = vi.fn();
const updateGoal = vi.fn();
const enqueueGoalAction = vi.fn();

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  executeLlm: (...args) => executeLlm(...args),
  parseLlmJson: (...args) => parseLlmJson(...args),
}));

vi.mock('../_helpers.js', () => ({
  logGoalEvent: vi.fn(),
  updateGoal: (...args) => updateGoal(...args),
  loadGoal: (...args) => loadGoal(...args),
  enqueueGoalAction: (...args) => enqueueGoalAction(...args),
  recordStageLlmUsage: vi.fn(),
  findAgentByRole: vi.fn(),
  trackAgentWork: vi.fn(),
  pickTestModel: vi.fn(() => ({ provider: 'gemini', model: 'gemini-3.8-flash' })),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handle, handleContinue } from './po-analysis.js';

const STOPPED_STATUSES = [
  'paused',
  'cancelled',
  'failed',
  'completed',
  'completed_with_warnings',
  'needs_human',
];

describe('po-analysis stage entry guards', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(STOPPED_STATUSES)('does not revive a %s goal in the initial stage', async (status) => {
    loadGoal.mockResolvedValue({ id: 'goal-1', status });

    const result = await handle({}, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      action: 'po-analysis',
      status: 'stage_not_eligible',
      goalStatus: status,
    });
    expect(updateGoal).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it.each(STOPPED_STATUSES)('does not revive a %s goal in the continue stage', async (status) => {
    loadGoal.mockResolvedValue({ id: 'goal-1', status });

    const result = await handleContinue({}, { goalId: 'goal-1' });

    expect(result).toMatchObject({
      action: 'po-analysis-continue',
      status: 'stage_not_eligible',
      goalStatus: status,
    });
    expect(updateGoal).not.toHaveBeenCalled();
    expect(executeLlm).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('asks quick analysis to extract a target audience and preserves it for customer routing', async () => {
    const goal = {
      id: 'goal-quick',
      user_id: 'user-1',
      status: 'feasibility',
      po_depth: 'quick',
      title: 'Reduce dental appointment no-shows',
      description: 'Help clinic operations managers reduce missed appointments.',
      budget_usd: 5,
      spent_usd: 0,
      data: {},
    };
    loadGoal.mockResolvedValue(goal);
    executeLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0 });
    parseLlmJson.mockReturnValue({
      problem_statement: 'Missed appointments waste clinic capacity.',
      target_audience: 'Clinic operations managers',
      success_criteria: ['Reduce no-shows'],
      acceptance_tests: [{ phase: 0, test: 'A reduction plan is delivered', type: 'binary' }],
      required_capabilities: ['clinic operations'],
      tool_requirements: [],
    });

    await handle({}, { goalId: goal.id });

    expect(executeLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('target_audience'),
        systemPrompt: expect.stringContaining('return null instead of inventing one'),
      })
    );
    expect(updateGoal).toHaveBeenCalledWith(
      {},
      goal.id,
      expect.objectContaining({
        tech_doc: expect.objectContaining({ target_audience: 'Clinic operations managers' }),
      })
    );
    expect(enqueueGoalAction).toHaveBeenCalledWith({}, 'customer-intelligence', goal.id);
  });
});
