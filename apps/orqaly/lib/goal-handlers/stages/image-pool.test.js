/**
 * Tier 5 — image-pool LLM-curator tests.
 *
 * Covers the curator function in isolation (mocked LLM): valid JSON,
 * malformed JSON, empty queries, slot validation, word-count filter.
 * Doesn't exercise the full handle() pipeline — the deterministic
 * buildKeywords() fallback path is exercised in production logs and is
 * intentionally unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the LLM module BEFORE importing the unit under test, otherwise the
// real executeLlmTracked tries to dial out and the tests hang.
vi.mock('../../agent-handlers/llm-executor.js', () => ({
  parseLlmJson: vi.fn(),
}));

vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: vi.fn(),
}));

// Mock logger so the curate function doesn't blow up on log.warn calls.
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));

vi.mock('./_system-enrichment-authorization.js', () => ({
  requireSystemEnrichmentAuthorization: vi.fn(),
  recheckSystemEnrichmentAuthorization: vi.fn(),
  enqueueAuthorizedSystemEnrichmentNext: vi.fn(),
}));

vi.mock('../_helpers.js', () => ({
  logGoalEvent: vi.fn(),
  updateGoal: vi.fn(),
  updateGoalIfExecutionAuthorized: vi.fn(async () => true),
  loadGoal: vi.fn(),
  enqueueGoalAction: vi.fn(),
  pickTestModel: (goal) => ({
    provider: goal?.data?.test_model?.provider || 'gemini',
    model: goal?.data?.test_model?.model || 'gemini-3.8-flash',
    pinnedProvider: true,
  }),
}));

import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { loadGoal, updateGoalIfExecutionAuthorized } from '../_helpers.js';
import { acceptedNativeLandingEnrichmentGoal } from '../native-enrichment-context.test-fixture.js';
import {
  enqueueAuthorizedSystemEnrichmentNext,
  recheckSystemEnrichmentAuthorization,
  requireSystemEnrichmentAuthorization,
} from './_system-enrichment-authorization.js';
import { curateQueriesViaLlm, handle } from './image-pool.js';

function makeGoal(overrides = {}) {
  return {
    id: 'goal-1',
    title: 'Landing page for Latvian wool socks for outdoor hikers',
    description:
      'Premium merino wool socks handmade in Latvia. Audience: men and women, 25-55, who hike Baltic forests in autumn and winter.',
    data: {
      brand_seed: {
        vibe: 'rugged minimalist nordic',
        mood_words: ['warm', 'durable', 'handcrafted', 'natural'],
        target_audience: 'outdoor enthusiasts in northern Europe',
      },
    },
    ...overrides,
  };
}

describe('curateQueriesViaLlm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LLM_DEFAULT_PROVIDER', '');
    vi.stubEnv('LLM_DEFAULT_MODEL', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('returns parsed, cleaned queries on valid LLM JSON', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: 'irrelevant' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        {
          slot: 'hero',
          query: 'hiker wearing wool socks Latvian forest trail',
          why: 'wide outdoor',
        },
        {
          slot: 'feature_1',
          query: 'knit wool sock detail macro stitching',
          why: 'product close-up',
        },
        { slot: 'feature_2', query: 'merino wool yarn natural texture', why: 'material' },
        { slot: 'feature_3', query: 'hiking boots Baltic forest moss path', why: 'use-case' },
        { slot: 'testimonial_1', query: 'outdoor enthusiast smiling portrait nordic', why: 'face' },
        { slot: 'testimonial_2', query: 'woman hiker autumn forest happy', why: 'face 2' },
        { slot: 'testimonial_3', query: 'man hiker winter Baltic snow happy', why: 'face 3' },
        { slot: 'misc', query: 'handmade wool textile workshop Baltic', why: 'brand story' },
      ],
    });

    const result = await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);

    expect(result).toHaveLength(8);
    expect(result[0]).toMatchObject({ slot: 'hero', query: expect.stringContaining('hiker') });
    expect(result[7]).toMatchObject({ slot: 'misc' });
    expect(executeLlmTracked).toHaveBeenCalledOnce();
  });

  it('passes the goal context into the user prompt', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        { slot: 'hero', query: 'hiker boots forest', why: '' },
        { slot: 'feature_1', query: 'wool socks macro detail', why: '' },
        { slot: 'misc', query: 'baltic forest moss', why: '' },
      ],
    });
    await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);

    const callArgs = executeLlmTracked.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Latvian wool socks');
    expect(callArgs.prompt).toContain('rugged minimalist nordic'); // vibe
    expect(callArgs.prompt).toContain('warm'); // first mood word
    expect(callArgs.prompt).toContain('outdoor enthusiasts'); // audience
    expect(callArgs.jsonMode).toBe(true);
    expect(callArgs).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
    });
  });

  it('uses the exact gate-2 model grant without cross-provider fallback', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        { slot: 'hero', query: 'hiker boots forest', why: '' },
        { slot: 'feature_1', query: 'wool socks macro detail', why: '' },
        { slot: 'misc', query: 'baltic forest moss', why: '' },
      ],
    });

    await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null, null, {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });

    expect(executeLlmTracked).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
      })
    );
  });

  it('returns null when the LLM call throws (caller falls back to keywords)', async () => {
    executeLlmTracked.mockRejectedValueOnce(new Error('timeout'));
    const result = await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);
    expect(result).toBeNull();
  });

  it('returns null when parseLlmJson fails to parse', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: 'not json' });
    parseLlmJson.mockReturnValueOnce(null);
    const result = await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);
    expect(result).toBeNull();
  });

  it('returns null when the parsed payload has an empty queries array', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({ queries: [] });
    const result = await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);
    expect(result).toBeNull();
  });

  it('drops entries with invalid slot names', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        { slot: 'hero', query: 'real query one here', why: '' }, // kept
        { slot: 'unknown', query: 'this slot is wrong here', why: '' }, // dropped
        { slot: 'feature_1', query: 'another real query here', why: '' }, // kept
        { slot: 'misc', query: 'final valid query here', why: '' }, // kept
      ],
    });
    const result = await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);
    expect(result).toHaveLength(3);
    expect(result.every((r) => ['hero', 'feature_1', 'misc'].includes(r.slot))).toBe(true);
  });

  it('drops queries that are too short or too long', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        { slot: 'hero', query: 'wool', why: '' }, // 1 word — dropped
        { slot: 'feature_1', query: 'two words', why: '' }, // 2 words — dropped
        { slot: 'feature_2', query: 'three real words here', why: '' }, // 4 words after trim — kept
        { slot: 'feature_3', query: 'a b c d e f g h i j k l m', why: '' }, // 13 words — dropped
        { slot: 'misc', query: 'baltic forest moss path detail', why: '' }, // 5 words — kept
        { slot: 'testimonial_1', query: 'outdoor enthusiast portrait', why: '' }, // 3 words — kept
      ],
    });
    const result = await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.slot)).toEqual(['feature_2', 'misc', 'testimonial_1']);
  });

  it('returns null when fewer than 3 entries survive cleaning', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        { slot: 'hero', query: 'valid query here please', why: '' },
        { slot: 'unknown', query: 'will be dropped slot bad', why: '' },
        { slot: 'feature_1', query: 'a', why: '' }, // too short
      ],
    });
    const result = await curateQueriesViaLlm(makeGoal(), makeGoal().data.brand_seed, null);
    expect(result).toBeNull();
  });

  it('returns null when goal has neither title nor description', async () => {
    const result = await curateQueriesViaLlm({ id: 'x', title: '', description: '' }, null, null);
    expect(result).toBeNull();
    expect(executeLlmTracked).not.toHaveBeenCalled();
  });

  it('handles missing brand_seed gracefully (uses "(unspecified)" placeholders)', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        { slot: 'hero', query: 'product hero shot', why: '' },
        { slot: 'feature_1', query: 'feature one detail', why: '' },
        { slot: 'misc', query: 'brand story shot', why: '' },
      ],
    });
    const result = await curateQueriesViaLlm(
      { id: 'y', title: 'Pet food landing page', description: '' },
      null,
      null
    );
    expect(result).toHaveLength(3);
    const callArgs = executeLlmTracked.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Pet food landing page');
    expect(callArgs.prompt).toContain('(unspecified)');
  });

  it('honours test_model from goal.data (compare-mode)', async () => {
    executeLlmTracked.mockResolvedValueOnce({ content: '{}' });
    parseLlmJson.mockReturnValueOnce({
      queries: [
        { slot: 'hero', query: 'product hero shot', why: '' },
        { slot: 'feature_1', query: 'feature one detail', why: '' },
        { slot: 'misc', query: 'brand story shot', why: '' },
      ],
    });
    const goal = makeGoal({
      data: { ...makeGoal().data, test_model: { provider: 'glm', model: 'glm-5.1' } },
    });
    await curateQueriesViaLlm(goal, goal.data.brand_seed, null);

    const callArgs = executeLlmTracked.mock.calls[0][0];
    expect(callArgs.provider).toBe('glm');
    expect(callArgs.model).toBe('glm-5.1');
    expect(callArgs.pinnedProvider).toBe(true);
  });

  it('uses only the accepted native packet in the curator prompt and binds the image pool', async () => {
    const goal = acceptedNativeLandingEnrichmentGoal();
    goal.data.brand_seed = makeGoal().data.brand_seed;
    goal.data.brand_seed_scope_hash =
      goal.data.axwise_customer_intelligence.scope_packet.scope_hash;
    loadGoal.mockResolvedValue(goal);
    requireSystemEnrichmentAuthorization.mockResolvedValue({
      ok: true,
      enrichment: { llm: { provider: 'gemini', model: 'gemini-3.8-flash' } },
    });
    recheckSystemEnrichmentAuthorization.mockResolvedValue({
      ok: true,
      snapshot_hash: 'approved-hash',
      goal,
    });
    enqueueAuthorizedSystemEnrichmentNext.mockResolvedValue({ ok: true });
    executeLlmTracked.mockResolvedValue({ content: '{}' });
    parseLlmJson.mockReturnValue({
      queries: [
        { slot: 'hero', query: 'premium cat food estonia retail', why: '' },
        { slot: 'feature_1', query: 'cat food package shelf detail', why: '' },
        { slot: 'feature_2', query: 'pet shop owner product display', why: '' },
        { slot: 'misc', query: 'urban cat owner tallinn home', why: '' },
      ],
    });
    let photoId = 0;
    fetchWithRetry.mockImplementation(async () => {
      photoId += 1;
      return {
        ok: true,
        json: async () => ({
          photos: [
            {
              id: photoId,
              alt: 'canonical cat-food image',
              photographer: 'Test',
              src: { large: `https://images.example/${photoId}.jpg` },
            },
          ],
        }),
      };
    });
    vi.stubEnv('PEXELS_API_KEY', 'test-key');

    const result = await handle({}, { goalId: goal.id }, {});

    expect(result).toMatchObject({ status: 'created', source: 'llm' });
    const call = executeLlmTracked.mock.calls[0][0];
    expect(call.prompt).toContain('Estonia Premium Cat Food');
    expect(call.prompt).toContain('premium cat-food retail-pilot landing page');
    expect(call.prompt).not.toContain('STALE RAW');
    expect(call.prompt).not.toContain('unapproved.example');
    expect(call.usage.description).toBe('Image curator: Estonia Premium Cat Food');
    expect(updateGoalIfExecutionAuthorized).toHaveBeenCalledWith(
      {},
      goal.id,
      'approved-hash',
      expect.objectContaining({
        data: expect.objectContaining({
          image_pool_scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
        }),
      })
    );
  });

  it('fails closed before image curation when native authority is corrupt', async () => {
    const goal = acceptedNativeLandingEnrichmentGoal();
    delete goal.data.axwise_customer_intelligence.scope_packet;
    loadGoal.mockResolvedValue(goal);
    requireSystemEnrichmentAuthorization.mockResolvedValue({ ok: true });

    const result = await handle({}, { goalId: goal.id }, {});

    expect(result.status).toBe('native_scope_authority_invalid');
    expect(executeLlmTracked).not.toHaveBeenCalled();
    expect(fetchWithRetry).not.toHaveBeenCalled();
    expect(updateGoalIfExecutionAuthorized).not.toHaveBeenCalled();
  });
});
