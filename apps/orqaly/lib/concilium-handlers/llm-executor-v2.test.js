/**
 * Tests for LLM executor v2.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock the shared fetch helper so we can drive provider success/failure without
// live keys. Hoisted by vitest above the imports below.
const fetchMock = vi.fn();
vi.mock('../../api/_lib/fetch.js', () => ({ fetchWithRetry: (...a) => fetchMock(...a) }));

import {
  parseLlmJson,
  getSupportedProviders,
  getTokenCosts,
  executeLlmV2,
} from './llm-executor-v2.js';

function okResponse(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    text: async () => '',
  };
}
function errResponse(status, body = '') {
  return { ok: false, status, json: async () => ({}), text: async () => body };
}

describe('parseLlmJson', () => {
  it('parses clean JSON object', () => {
    const result = parseLlmJson('{"scores": {"quality": 8}, "approved": true}');
    expect(result.scores.quality).toBe(8);
    expect(result.approved).toBe(true);
  });

  it('extracts JSON from markdown code fence', () => {
    const input = '```json\n{"overall_score": 7}\n```';
    const result = parseLlmJson(input);
    expect(result.overall_score).toBe(7);
  });

  it('extracts JSON embedded in text', () => {
    const input = 'Here is my evaluation:\n{"approved": false, "summary": "needs work"}\nDone.';
    const result = parseLlmJson(input);
    expect(result.approved).toBe(false);
  });

  it('parses JSON array', () => {
    const result = parseLlmJson('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns null for non-JSON', () => {
    expect(parseLlmJson('This is plain text')).toBeNull();
    expect(parseLlmJson('')).toBeNull();
    expect(parseLlmJson(null)).toBeNull();
  });

  it('repairs a token-truncated object (the Gemini feasibility failure)', () => {
    // gemini-2.5-flash hit the maxTokens cap mid-string on complexity_reason.
    const truncated =
      '{\n  "complexity_score": 0.7,\n  "complexity_reason": "This goal requires extensive web search and analytical reasoning';
    const result = parseLlmJson(truncated);
    expect(result?.complexity_score).toBe(0.7);
    expect(typeof result?.complexity_reason).toBe('string');
  });
});

describe('getSupportedProviders', () => {
  it('returns the full provider catalog', () => {
    const providers = getSupportedProviders();
    expect(providers).toContain('groq');
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('deepseek');
    expect(providers).toContain('glm');
    expect(providers).toContain('qwen');
    expect(providers).toContain('gemini');
    expect(providers).toContain('openrouter');
    expect(providers).toContain('gateway');
    expect(providers).toContain('claude-code');
  });
});

describe('getTokenCosts', () => {
  it('returns cost data for known models', () => {
    const costs = getTokenCosts();
    expect(costs['gpt-4o']).toBeDefined();
    expect(costs['gpt-4o'].input).toBeGreaterThan(0);
    expect(costs['claude-sonnet-5']).toBeDefined();
    expect(costs['deepseek-chat']).toBeDefined();
    expect(costs['glm-4']).toBeDefined();
  });

  it('has a cost entry for the default GLM model so tracking works', () => {
    const costs = getTokenCosts();
    expect(costs['glm-4.6']).toBeDefined();
  });
});

describe('executeLlmV2 configured platform default', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.VERCEL;
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_API_KEY = 'gem-key';
  });

  afterEach(() => {
    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.LLM_DEFAULT_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.VERCEL;
  });

  it('inherits the configured provider and exact model when callers omit both', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"ok":true}'));

    const result = await executeLlmV2({ prompt: 'Use the platform default' });

    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(result.provider).toBe('gemini');
  });

  it('pins an explicit Gemini call without a model to gemini-3.8-flash', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('Completed deliverable'));

    const result = await executeLlmV2({
      provider: 'gemini',
      prompt: 'Use the provider default',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(result.provider).toBe('gemini');
  });

  it('uses five minutes for high reasoning without lowering the output ceiling', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"ok":true}'));

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Synthesize the final PRD',
      reasoningEffort: 'high',
      maxTokens: 65_536,
      timeoutMs: 60_000,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(65_536);
    expect(fetchMock.mock.calls[0][2]).toEqual({
      timeoutMs: 300_000,
      retries: 1,
      beforeAttempt: expect.any(Function),
    });
  });

  it('retains the requested deadline for ordinary Gemini reasoning', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('Completed deliverable'));

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Complete a cheap task',
      reasoningEffort: 'medium',
      timeoutMs: 60_000,
    });

    expect(fetchMock.mock.calls[0][2]).toEqual({
      timeoutMs: 60_000,
      retries: 1,
      beforeAttempt: expect.any(Function),
    });
  });

  it('uses one bounded high-reasoning attempt on Vercel', async () => {
    process.env.VERCEL = '1';
    fetchMock.mockResolvedValueOnce(okResponse('{"ok":true}'));

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Synthesize the final PRD',
      reasoningEffort: 'high',
      maxTokens: 65_536,
    });

    expect(fetchMock.mock.calls[0][2]).toEqual({
      timeoutMs: 155_000,
      retries: 0,
      beforeAttempt: expect.any(Function),
    });
  });
});

describe('executeLlmV2 failover on thrown errors', () => {
  const saved = {};
  const KEYS = [
    'GLM_API_KEY',
    'GROQ_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENROUTER_API_KEY',
    'AI_GATEWAY_API_KEY',
    'DEEPSEEK_API_KEY',
    'GEMINI_API_KEY',
    'VERCEL_OIDC_TOKEN',
  ];

  beforeEach(() => {
    fetchMock.mockReset();
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('fails closed on a pinned Gemini 402 without reaching OpenRouter', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    process.env.OPENROUTER_API_KEY = 'openrouter-key';
    fetchMock.mockResolvedValueOnce(errResponse(402, 'insufficient credits'));

    await expect(
      executeLlmV2({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        prompt: 'Complete the goal task',
        pinnedProvider: true,
      })
    ).rejects.toThrow(
      'LLM_PROVIDER_PINNED_FAILED: gemini returned 402 (billing). Cross-provider fallback is disabled'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
  });

  it('fails closed when pinned Gemini has no key even if OpenRouter is configured', async () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-key';

    await expect(
      executeLlmV2({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        prompt: 'Complete the goal task',
        pinnedProvider: true,
      })
    ).rejects.toThrow('API key not configured: GEMINI_API_KEY');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // NOTE: the timeout case marks the GLM provider dead for the session (a
  // module-level cooldown map), so the 404 case runs FIRST to stay meaningful.
  it('falls back on a 404 (unknown model) instead of hard-failing', async () => {
    process.env.GLM_API_KEY = 'glm-key';
    process.env.GROQ_API_KEY = 'groq-key';
    fetchMock.mockImplementation((url) => {
      if (String(url).includes('bigmodel') || String(url).includes('z.ai')) {
        return Promise.resolve(errResponse(404, 'model not found'));
      }
      return Promise.resolve(okResponse('groq answer'));
    });

    const result = await executeLlmV2({
      provider: 'glm',
      model: 'glm-does-not-exist',
      prompt: 'hi',
    });
    expect(result.provider).toBe('groq');
  });

  it('falls back to another keyed provider when the requested provider THROWS (timeout)', async () => {
    process.env.GLM_API_KEY = 'glm-key';
    process.env.GROQ_API_KEY = 'groq-key';
    // GLM (China endpoint) times out; Groq answers.
    fetchMock.mockImplementation((url) => {
      if (String(url).includes('bigmodel') || String(url).includes('z.ai')) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return Promise.resolve(okResponse('groq answer'));
    });

    const result = await executeLlmV2({ provider: 'glm', prompt: 'hi', timeoutMs: 10 });
    expect(result.provider).toBe('groq');
    expect(result.content).toBe('groq answer');
  });

  it('sends response_format json_object to gemini when jsonMode is on', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    let capturedBody = null;
    fetchMock.mockImplementation((url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve(okResponse('{"ok":true}'));
    });

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
      prompt: 'hi',
      jsonMode: true,
    });
    expect(capturedBody?.response_format).toEqual({ type: 'json_object' });
  });

  it('sends an exact strict json_schema to OpenAI-compatible providers', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    fetchMock.mockResolvedValueOnce(okResponse('{"status":"complete"}'));
    const schema = {
      type: 'object',
      properties: { status: { type: 'string', enum: ['complete', 'blocked'] } },
      required: ['status'],
      additionalProperties: false,
    };

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Return the specialist packet',
      jsonMode: true,
      jsonSchema: schema,
      jsonSchemaName: 'orqaly_specialist_packet_v1',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'orqaly_specialist_packet_v1',
        strict: true,
        schema,
      },
    });
  });

  it('preserves json_schema on the bounded same-provider JSON repair', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    fetchMock
      .mockResolvedValueOnce(okResponse('not valid JSON'))
      .mockResolvedValueOnce(okResponse('{"status":"complete"}'));
    const schema = {
      type: 'object',
      properties: { status: { type: 'string' } },
      required: ['status'],
      additionalProperties: false,
    };

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Return the specialist packet',
      jsonMode: true,
      jsonSchema: schema,
      jsonSchemaName: 'specialist_packet',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const responseFormats = fetchMock.mock.calls.map(
      ([, options]) => JSON.parse(options.body).response_format
    );
    expect(responseFormats).toEqual([
      {
        type: 'json_schema',
        json_schema: { name: 'specialist_packet', strict: true, schema },
      },
      {
        type: 'json_schema',
        json_schema: { name: 'specialist_packet', strict: true, schema },
      },
    ]);
  });

  it('does not enable structured output when raw text mode supplies a schema', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    fetchMock.mockResolvedValueOnce(okResponse('# Raw Markdown'));

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Return raw Markdown',
      jsonMode: false,
      jsonSchema: { type: 'object' },
      jsonSchemaName: 'ignored_in_text_mode',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toBeUndefined();
  });

  it('uses Gemini 3.8 structured-output compatibility settings', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    fetchMock.mockResolvedValueOnce(okResponse('{"ok":true}'));

    await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'hi',
      temperature: 0.9,
      maxTokens: 800,
      jsonMode: true,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      max_tokens: 4096,
      reasoning_effort: 'medium',
      response_format: { type: 'json_object' },
    });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
  });

  it('uses high reasoning when requested and omits unsupported sampling controls', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    fetchMock.mockResolvedValueOnce(okResponse('Completed deliverable'));

    const result = await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Complete the task',
      temperature: 0.9,
      maxTokens: 2000,
      reasoningEffort: 'high',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gemini-3.8-flash',
      max_tokens: 2000,
      reasoning_effort: 'high',
    });
    expect(body.response_format).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
    expect(result.content).toBe('Completed deliverable');
  });

  it('repairs invalid JSON once on the same provider and aggregates accounting', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    fetchMock
      .mockResolvedValueOnce(okResponse('plain prose instead of JSON'))
      .mockResolvedValueOnce(okResponse('{"stakeholder":"buyer","confidence":0.9}'));

    const result = await executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'resolve stakeholder',
      maxTokens: 800,
      jsonMode: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).includes('generativelanguage.googleapis.com')
      )
    ).toBe(true);
    expect(result.content).toContain('"stakeholder":"buyer"');
    expect(result.provider).toBe('gemini');
    expect(result.usage).toEqual({ prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 });
    expect(result.estimatedCostUsd).toBeCloseTo(0.000009, 8);
    expect(result.jsonRepairAttempted).toBe(true);
  });

  it('fails closed instead of clipping an over-limit JSON repair source', async () => {
    process.env.GEMINI_API_KEY = 'gem-key';
    fetchMock.mockResolvedValueOnce(okResponse('x'.repeat(20_001)));

    const execution = executeLlmV2({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      prompt: 'Return the complete document as JSON',
      jsonMode: true,
    });

    await expect(execution).rejects.toMatchObject({
      name: 'LlmJsonRepairSourceTooLargeError',
      code: 'LLM_JSON_REPAIR_SOURCE_TOO_LARGE',
      sourceChars: 20_001,
      maxSourceChars: 20_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports current and replay-compatible Gemini Flash pricing', () => {
    expect(getTokenCosts()['gemini-3.7-flash']).toEqual({ input: 0.00075, output: 0.00375 });
    expect(getTokenCosts()['gemini-3.8-flash']).toEqual({ input: 0.00075, output: 0.00375 });
  });
});
