import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ executeLlmV2Tracked: vi.fn() }));
vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: mocks.executeLlmV2Tracked,
}));

const { runStructuredTemplate, validateSlots } = await import('./structured-llm.js');

const TEMPLATE = {
  schema: { overview: 'string', points: 'string[]', note: 'string?' },
  systemInstruction: 'Fill the slots.',
  fewShot: [],
  render: (f) => ({ content: f.overview }),
};
const CTX = 'some grounding data';
const reply = (obj) => ({ content: typeof obj === 'string' ? obj : JSON.stringify(obj) });

beforeEach(() => mocks.executeLlmV2Tracked.mockReset());

describe('validateSlots', () => {
  it('passes a fully-filled object', () => {
    expect(validateSlots(TEMPLATE.schema, { overview: 'x', points: ['a'] })).toEqual({
      valid: true,
      missing: [],
    });
  });
  it('flags missing string and empty array, respects optional', () => {
    expect(validateSlots(TEMPLATE.schema, { overview: '  ', points: [] })).toEqual({
      valid: false,
      missing: ['overview', 'points'],
    });
  });
  it('rejects non-objects', () => {
    expect(validateSlots(TEMPLATE.schema, null).valid).toBe(false);
    expect(validateSlots(TEMPLATE.schema, ['a']).valid).toBe(false);
  });
});

describe('runStructuredTemplate', () => {
  it('returns fields on a valid first attempt (single call)', async () => {
    mocks.executeLlmV2Tracked.mockResolvedValueOnce(reply({ overview: 'ok', points: ['a', 'b'] }));
    const { fields, degraded } = await runStructuredTemplate({
      template: TEMPLATE,
      context: CTX,
      userId: 'u',
      provider: 'groq',
      model: 'm',
      usage: {},
    });
    expect(fields).toEqual({ overview: 'ok', points: ['a', 'b'] });
    expect(degraded).toBe(false);
    expect(mocks.executeLlmV2Tracked).toHaveBeenCalledTimes(1);
  });

  it('repairs on the same model after a malformed first reply', async () => {
    mocks.executeLlmV2Tracked
      .mockResolvedValueOnce(reply('not json at all'))
      .mockResolvedValueOnce(reply({ overview: 'fixed', points: ['a'] }));
    const { fields, degraded } = await runStructuredTemplate({
      template: TEMPLATE,
      context: CTX,
      userId: 'u',
      provider: 'groq',
      model: 'm',
      usage: {},
    });
    expect(fields.overview).toBe('fixed');
    expect(degraded).toBe(false);
    expect(mocks.executeLlmV2Tracked).toHaveBeenCalledTimes(2);
    // repair call still targets the primary model
    expect(mocks.executeLlmV2Tracked.mock.calls[1][0].provider).toBe('groq');
  });

  it('escalates to the strong model on the third attempt', async () => {
    mocks.executeLlmV2Tracked
      .mockResolvedValueOnce(reply({ overview: '', points: [] })) // invalid
      .mockResolvedValueOnce(reply({ points: [] })) // still invalid
      .mockResolvedValueOnce(reply({ overview: 'strong', points: ['x'] }));
    const { fields, degraded } = await runStructuredTemplate({
      template: TEMPLATE,
      context: CTX,
      userId: 'u',
      provider: 'groq',
      model: 'm',
      usage: {},
    });
    expect(fields.overview).toBe('strong');
    expect(degraded).toBe(true);
    expect(mocks.executeLlmV2Tracked).toHaveBeenCalledTimes(3);
    expect(mocks.executeLlmV2Tracked.mock.calls[2][0].provider).toBe('gemini');
    expect(mocks.executeLlmV2Tracked.mock.calls[2][0].model).toBe('gemini-3.8-flash');
  });

  it('returns null fields when every attempt fails so the caller can fall back', async () => {
    mocks.executeLlmV2Tracked.mockResolvedValue(reply('garbage'));
    const { fields } = await runStructuredTemplate({
      template: TEMPLATE,
      context: CTX,
      userId: 'u',
      provider: 'groq',
      model: 'm',
      usage: {},
    });
    expect(fields).toBeNull();
    expect(mocks.executeLlmV2Tracked).toHaveBeenCalledTimes(3);
  });
});
