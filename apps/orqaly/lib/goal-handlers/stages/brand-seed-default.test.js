import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_helpers.js', async () => {
  const actual = await vi.importActual('../_helpers.js');
  return {
    ...actual,
    enqueueGoalAction: vi.fn(async () => {}),
    loadGoal: vi.fn(),
    logGoalEvent: vi.fn(async () => {}),
    updateGoal: vi.fn(async () => {}),
    updateGoalIfExecutionAuthorized: vi.fn(async () => true),
  };
});

vi.mock('./_system-enrichment-authorization.js', () => ({
  requireSystemEnrichmentAuthorization: vi.fn(async () => ({ ok: true })),
  recheckSystemEnrichmentAuthorization: vi.fn(),
  enqueueAuthorizedSystemEnrichmentNext: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: vi.fn(),
}));

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  parseLlmJson: vi.fn(),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { loadGoal, updateGoalIfExecutionAuthorized } from '../_helpers.js';
import { acceptedNativeLandingEnrichmentGoal } from '../native-enrichment-context.test-fixture.js';
import { recheckSystemEnrichmentAuthorization } from './_system-enrichment-authorization.js';
import { handle } from './brand-seed.js';

const BRAND = {
  palette: ['#111111', '#222222', '#333333'],
  fonts: ['Inter', 'Lora'],
  vibe: 'quiet modern',
  mood_words: ['clean', 'warm'],
  target_audience: 'Independent teams',
  tone: 'friendly',
};

function goal(testModel) {
  return {
    id: 'goal-1',
    user_id: null,
    title: 'Build a product landing page',
    description: 'A clear marketing website for independent teams.',
    data: testModel ? { test_model: testModel } : {},
  };
}

describe('brand-seed LLM selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LLM_DEFAULT_PROVIDER', '');
    vi.stubEnv('LLM_DEFAULT_MODEL', '');
    executeLlmTracked.mockResolvedValue({ content: '{}' });
    parseLlmJson.mockReturnValue(BRAND);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses the exact platform Gemini pair when the goal has no explicit model', async () => {
    const currentGoal = goal();
    loadGoal.mockResolvedValue(currentGoal);
    recheckSystemEnrichmentAuthorization.mockResolvedValue({
      ok: true,
      snapshot_hash: 'approved-hash',
      goal: currentGoal,
    });

    await handle({}, { goalId: 'goal-1' }, {});

    expect(executeLlmTracked).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
      })
    );
  });

  it('preserves an explicit per-goal model pin', async () => {
    const currentGoal = goal({ provider: 'openai', model: 'gpt-4.1-mini' });
    loadGoal.mockResolvedValue(currentGoal);
    recheckSystemEnrichmentAuthorization.mockResolvedValue({
      ok: true,
      snapshot_hash: 'approved-hash',
      goal: currentGoal,
    });

    await handle({}, { goalId: 'goal-1' }, {});

    expect(executeLlmTracked).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        pinnedProvider: true,
      })
    );
  });

  it('uses only the accepted native packet in the brand prompt and binds the saved seed', async () => {
    const currentGoal = acceptedNativeLandingEnrichmentGoal();
    loadGoal.mockResolvedValue(currentGoal);
    recheckSystemEnrichmentAuthorization.mockResolvedValue({
      ok: true,
      snapshot_hash: 'approved-hash',
      goal: currentGoal,
    });

    await handle({}, { goalId: currentGoal.id }, {});

    const call = executeLlmTracked.mock.calls[0][0];
    expect(call.prompt).toContain('Estonia Premium Cat Food');
    expect(call.prompt).toContain('premium cat-food retail-pilot landing page');
    expect(call.prompt).not.toContain('STALE RAW');
    expect(call.prompt).not.toContain('unapproved.example');
    expect(call.usage.description).toBe('Brand seed: Estonia Premium Cat Food');
    expect(updateGoalIfExecutionAuthorized).toHaveBeenCalledWith(
      {},
      currentGoal.id,
      'approved-hash',
      expect.objectContaining({
        data: expect.objectContaining({
          brand_seed_scope_hash:
            currentGoal.data.axwise_customer_intelligence.scope_packet.scope_hash,
        }),
      })
    );
  });

  it('fails closed before the brand LLM when native authority is corrupt', async () => {
    const currentGoal = acceptedNativeLandingEnrichmentGoal();
    delete currentGoal.data.axwise_customer_intelligence.scope_packet;
    loadGoal.mockResolvedValue(currentGoal);

    const result = await handle({}, { goalId: currentGoal.id }, {});

    expect(result.status).toBe('native_scope_authority_invalid');
    expect(executeLlmTracked).not.toHaveBeenCalled();
    expect(updateGoalIfExecutionAuthorized).not.toHaveBeenCalled();
  });
});
