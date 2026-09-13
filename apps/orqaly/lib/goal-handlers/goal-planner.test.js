import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExecuteLlmTracked = vi.fn();

vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: (...args) => mockExecuteLlmTracked(...args),
}));

vi.mock('../agent-handlers/llm-executor.js', () => ({
  parseLlmJson: (content) => JSON.parse(content),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('./team-assigner.js', () => ({
  goalNeedsBrandResearch: () => false,
}));

import { generateGoalPlan } from './goal-planner.js';

afterEach(() => {
  delete process.env.LLM_DEFAULT_PROVIDER;
  delete process.env.LLM_DEFAULT_MODEL;
  mockExecuteLlmTracked.mockReset();
});

describe('generateGoalPlan model inheritance', () => {
  it('uses the configured Gemini pair for the legacy planner fallback', async () => {
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';
    mockExecuteLlmTracked.mockResolvedValue({
      content: JSON.stringify({
        strategy: 'Resolve context, then execute.',
        confidence_score: 85,
        estimated_total_hours: 1,
        phases: [
          {
            name: 'Execute',
            jobs: [{ title: 'Complete task', estimate_hours: 1 }],
          },
        ],
      }),
      estimatedCostUsd: 0.01,
    });

    await generateGoalPlan('Improve retention', 'For an animal-food shop', 10, null);

    expect(mockExecuteLlmTracked).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', model: 'gemini-3.8-flash' })
    );
  });
});
