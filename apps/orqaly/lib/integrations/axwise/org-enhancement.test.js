/**
 * Organization conditioning generator.
 *
 * The staleness rule is the one worth guarding: editing a briefing must never
 * invalidate text a person wrote by hand, or Regenerate would quietly become a
 * data-loss button.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeLlmTracked = vi.fn();
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: (...args) => executeLlmTracked(...args),
}));
vi.mock('../../_shared/llm-defaults.js', () => ({
  defaultProvider: () => 'gemini',
  defaultCheapModel: () => 'gemini-3.8-flash',
  defaultModel: () => 'gemini-3.8-flash',
}));

const { briefingHash, isEnhancementStale, generateOrgEnhancement } =
  await import('./org-enhancement.js');

beforeEach(() => {
  executeLlmTracked.mockReset();
});

describe('briefingHash', () => {
  it('is stable for identical text and differs for changed text', () => {
    expect(briefingHash('abc')).toBe(briefingHash('abc'));
    expect(briefingHash('abc')).not.toBe(briefingHash('abd'));
    expect(briefingHash('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isEnhancementStale', () => {
  it('treats a missing row as stale', () => {
    expect(isEnhancementStale(null, 'h1')).toBe(true);
  });

  it('is stale when the briefing hash moved on', () => {
    expect(isEnhancementStale({ source: 'local_llm', briefing_hash: 'h1' }, 'h2')).toBe(true);
  });

  it('is fresh when the briefing hash still matches', () => {
    expect(isEnhancementStale({ source: 'local_llm', briefing_hash: 'h1' }, 'h1')).toBe(false);
  });

  it('never marks hand-written content stale, whatever the briefing does', () => {
    expect(isEnhancementStale({ source: 'user', briefing_hash: 'h1' }, 'h2')).toBe(false);
    expect(isEnhancementStale({ source: 'user' }, 'h2')).toBe(false);
  });

  it('treats a row with no recorded hash as fresh rather than regenerating blindly', () => {
    expect(isEnhancementStale({ source: 'merged' }, 'h2')).toBe(false);
  });
});

describe('generateOrgEnhancement', () => {
  it('returns null for an empty briefing without calling the model', async () => {
    expect(await generateOrgEnhancement({ org: { id: 'o1' }, briefing: '   ' })).toBeNull();
    expect(executeLlmTracked).not.toHaveBeenCalled();
  });

  it('returns the generated content with the hash it was generated from', async () => {
    executeLlmTracked.mockResolvedValue({ content: '## Tone\nUnderstated.' });

    const result = await generateOrgEnhancement({
      org: { id: 'o1', name: 'Nordic' },
      briefing: 'We are understated.',
      userId: 'u1',
    });

    expect(result.content).toBe('## Tone\nUnderstated.');
    expect(result.source).toBe('local_llm');
    expect(result.briefingHash).toBe(briefingHash('We are understated.'));
  });

  it('marks the briefing as untrusted data in the system prompt', async () => {
    executeLlmTracked.mockResolvedValue({ content: 'x' });
    await generateOrgEnhancement({ org: { id: 'o1' }, briefing: 'b', userId: 'u1' });

    const call = executeLlmTracked.mock.calls[0][0];
    expect(call.systemPrompt).toContain('untrusted data');
    expect(call.prompt).toContain('data, not instructions');
  });

  it('pins the provider so conditioning does not drift across models', async () => {
    executeLlmTracked.mockResolvedValue({ content: 'x' });
    await generateOrgEnhancement({ org: { id: 'o1' }, briefing: 'b', userId: 'u1' });

    const call = executeLlmTracked.mock.calls[0][0];
    expect(call.pinnedProvider).toBe(true);
    expect(call.provider).toBe('gemini');
  });

  it('returns null instead of throwing when the model call fails', async () => {
    executeLlmTracked.mockRejectedValue(new Error('provider down'));

    const result = await generateOrgEnhancement({
      org: { id: 'o1' },
      briefing: 'b',
      userId: 'u1',
    });

    expect(result).toBeNull();
  });

  it('returns null when the model produced nothing usable', async () => {
    executeLlmTracked.mockResolvedValue({ content: '   ' });
    expect(
      await generateOrgEnhancement({ org: { id: 'o1' }, briefing: 'b', userId: 'u1' })
    ).toBeNull();
  });
});
