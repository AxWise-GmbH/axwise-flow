/**
 * Tests for llm-executor fallback chain.
 *
 * Focus: the two-way auto-fallback between Groq and Anthropic so that a
 * Groq 429 / 5xx never reaches the caller as a hard failure when
 * ANTHROPIC_API_KEY is configured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockFetchWithRetry = vi.fn();
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (...args) => mockFetchWithRetry(...args),
}));

import { executeLlm } from './llm-executor.js';

// Helpers to build fake Response objects
function makeOkResponse(content, provider = 'groq') {
  const body =
    provider === 'anthropic'
      ? {
          content: [{ text: content }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }
      : {
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeErrorResponse(status, errText = '') {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => errText,
  };
}

const FALLBACK_PROVIDER_ENV_KEYS = [
  'GLM_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'ANTHROPIC_API_KEY',
];

function isolateEnvironment(keys) {
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  return () => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe('executeLlm: Groq → Anthropic fallback', () => {
  let restoreProviderEnvironment;

  beforeEach(() => {
    restoreProviderEnvironment = isolateEnvironment(FALLBACK_PROVIDER_ENV_KEYS);
    mockFetchWithRetry.mockReset();
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  afterEach(() => {
    restoreProviderEnvironment();
  });

  it('retries on Anthropic when Groq returns 429', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(makeErrorResponse(429, 'rate limit exceeded'))
      .mockResolvedValueOnce(makeOkResponse('{"title":"Test"}', 'anthropic'));

    const result = await executeLlm({
      prompt: 'Test prompt',
      provider: 'groq',
      jsonMode: true,
    });

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    // Second call must target Anthropic
    expect(mockFetchWithRetry.mock.calls[1][0]).toContain('anthropic');
    expect(result.content).toBe('{"title":"Test"}');
    expect(result.provider).toBe('anthropic');
  });

  it('retries on Anthropic when Groq returns 500', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(makeErrorResponse(500, 'internal server error'))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'anthropic'));

    const result = await executeLlm({ prompt: 'Test', provider: 'groq' });
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('anthropic');
  });

  it('retries on Anthropic when Groq returns 503 (overload)', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(makeErrorResponse(503, 'service unavailable'))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'anthropic'));

    const result = await executeLlm({ prompt: 'Test', provider: 'groq' });
    expect(result.provider).toBe('anthropic');
  });

  it('throws when Groq 429 AND Anthropic key is missing (no infinite loop)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockFetchWithRetry.mockResolvedValueOnce(makeErrorResponse(429, 'rate limit'));

    await expect(executeLlm({ prompt: 'Test', provider: 'groq' })).rejects.toThrow(/groq 429/);

    // Only the original Groq call — no retry
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall back on Groq 400 (client error, not transient)', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeErrorResponse(400, 'bad request'));

    await expect(executeLlm({ prompt: 'Test', provider: 'groq' })).rejects.toThrow(/groq 400/);

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it('still falls back from Anthropic → Groq on billing error (existing behaviour)', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(makeErrorResponse(400, 'Your credit balance is too low'))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'groq'));

    const result = await executeLlm({ prompt: 'Test', provider: 'anthropic' });
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(mockFetchWithRetry.mock.calls[1][0]).toContain('groq');
    expect(result.provider).toBe('groq');
  });

  it('fails closed on a pinned Gemini 402 without reaching another provider', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    mockFetchWithRetry.mockResolvedValueOnce(makeErrorResponse(402, 'insufficient credits'));

    await expect(
      executeLlm({
        prompt: 'Complete the goal stage',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
      })
    ).rejects.toThrow(
      'LLM_PROVIDER_PINNED_FAILED: gemini returned 402 (billing). Cross-provider fallback is disabled'
    );

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
    expect(String(mockFetchWithRetry.mock.calls[0][0])).toContain(
      'generativelanguage.googleapis.com'
    );
  });

  it('still falls back from OpenAI → Groq on 429 (existing behaviour)', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    mockFetchWithRetry
      .mockResolvedValueOnce(makeErrorResponse(429, 'rate limit'))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'groq'));

    const result = await executeLlm({ prompt: 'Test', provider: 'openai' });
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('groq');
    delete process.env.OPENAI_API_KEY;
  });
});

describe('executeLlm: slow-response soft timeout fallback (Phase 1.0b)', () => {
  let restoreProviderEnvironment;

  beforeEach(() => {
    restoreProviderEnvironment = isolateEnvironment(FALLBACK_PROVIDER_ENV_KEYS);
    mockFetchWithRetry.mockReset();
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  afterEach(() => {
    restoreProviderEnvironment();
  });

  // Simulate a slow timeout by throwing the marker error directly.
  // This tests the catch branch logic without leaking never-resolving
  // promises through Vitest's unhandled-rejection detection.
  const slowTimeoutError = (provider) =>
    new Error(`LLM_SLOW_TIMEOUT: ${provider} did not respond in 25000ms`);

  it('falls back from slow Anthropic to Groq', async () => {
    mockFetchWithRetry
      .mockRejectedValueOnce(slowTimeoutError('anthropic'))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'groq'));

    const result = await executeLlm({ prompt: 'Test', provider: 'anthropic' });
    expect(result.provider).toBe('groq');
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('falls back from slow OpenAI to Groq', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    mockFetchWithRetry
      .mockRejectedValueOnce(slowTimeoutError('openai'))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'groq'));

    const result = await executeLlm({ prompt: 'Test', provider: 'openai' });
    expect(result.provider).toBe('groq');
    delete process.env.OPENAI_API_KEY;
  });

  it('falls back from slow Groq to Anthropic (last resort)', async () => {
    mockFetchWithRetry
      .mockRejectedValueOnce(slowTimeoutError('groq'))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'anthropic'));

    const result = await executeLlm({ prompt: 'Test', provider: 'groq' });
    expect(result.provider).toBe('anthropic');
  });

  it('throws LLM_SLOW_TIMEOUT when no fallback key available', async () => {
    delete process.env.GROQ_API_KEY; // anthropic slow + no groq → must throw
    mockFetchWithRetry.mockRejectedValueOnce(slowTimeoutError('anthropic'));

    await expect(executeLlm({ prompt: 'Test', provider: 'anthropic' })).rejects.toThrow(
      /LLM_SLOW_TIMEOUT/
    );
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall back when fetch returns successfully', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{"ok":true}', 'anthropic'));

    const result = await executeLlm({ prompt: 'Test', provider: 'anthropic' });
    expect(result.provider).toBe('anthropic');
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-slow errors without fallback', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error('network unreachable'));

    await expect(executeLlm({ prompt: 'Test', provider: 'anthropic' })).rejects.toThrow(
      /network unreachable/
    );
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
  });
});

describe('executeLlm: modelOverride (Fix 3)', () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    process.env.GROQ_API_KEY = 'test-groq-key';
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  it('uses modelOverride when provided', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{}', 'groq'));

    await executeLlm({
      prompt: 'Test',
      provider: 'groq',
      model: 'llama-3.1-8b-instant', // override
    });

    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body.model).toBe('llama-3.1-8b-instant');
  });

  it('falls back to provider defaultModel when override is unset', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{}', 'groq'));

    await executeLlm({ prompt: 'Test', provider: 'groq' });

    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body.model).toBe('llama-3.3-70b-versatile');
  });
});

describe('executeLlm: configured platform default', () => {
  let restoreConfiguredEnvironment;

  beforeEach(() => {
    restoreConfiguredEnvironment = isolateEnvironment([
      'LLM_DEFAULT_PROVIDER',
      'LLM_DEFAULT_MODEL',
      'GEMINI_API_KEY',
    ]);
    mockFetchWithRetry.mockReset();
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    restoreConfiguredEnvironment();
  });

  it('inherits the configured provider and exact model when callers omit both', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{"ok":true}'));

    const result = await executeLlm({ prompt: 'Use the platform default' });

    expect(mockFetchWithRetry.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(result.provider).toBe('gemini');
  });
});

describe('executeLlm: Gemini 3.8 structured output', () => {
  let restoreGeminiEnvironment;

  beforeEach(() => {
    restoreGeminiEnvironment = isolateEnvironment(['GEMINI_API_KEY', 'OPENAI_API_KEY', 'VERCEL']);
    mockFetchWithRetry.mockReset();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    restoreGeminiEnvironment();
  });

  it('pins an explicit Gemini call without a model to gemini-3.8-flash', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('Completed deliverable'));

    const result = await executeLlm({
      prompt: 'Use the provider default',
      provider: 'gemini',
    });

    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(result.provider).toBe('gemini');
  });

  it('uses medium reasoning and omits unsupported sampling controls for plain-text calls', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('Completed deliverable'));

    const result = await executeLlm({
      prompt: 'Complete the task',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      temperature: 0.8,
      maxTokens: 2000,
    });

    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gemini-3.8-flash',
      max_tokens: 2000,
      reasoning_effort: 'medium',
    });
    expect(body.response_format).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
    expect(result.content).toBe('Completed deliverable');
  });

  it('uses high reasoning when requested and raises a small JSON budget', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{"ok":true}'));

    await executeLlm({
      prompt: 'Return an object',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      temperature: 0.8,
      maxTokens: 800,
      jsonMode: true,
      reasoningEffort: 'high',
    });

    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gemini-3.8-flash',
      max_tokens: 4096,
      reasoning_effort: 'high',
      response_format: { type: 'json_object' },
    });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
    expect(mockFetchWithRetry.mock.calls[0][2]).toEqual({ timeoutMs: 305_000, retries: 1 });
  });

  it('fits one high-reasoning attempt beneath the Vercel job ceiling', async () => {
    process.env.VERCEL = '1';
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{"ok":true}'));

    await executeLlm({
      prompt: 'Return an object',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      jsonMode: true,
      reasoningEffort: 'high',
    });

    expect(mockFetchWithRetry.mock.calls[0][2]).toEqual({ timeoutMs: 160_000, retries: 0 });
  });

  it('retains the existing Gemini deadline for medium reasoning', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('Completed deliverable'));

    await executeLlm({
      prompt: 'Complete the task',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      reasoningEffort: 'medium',
    });

    expect(mockFetchWithRetry.mock.calls[0][2]).toEqual({ timeoutMs: 65_000, retries: 1 });
  });

  it('repairs unparseable JSON once on Gemini and aggregates usage and cost', async () => {
    mockFetchWithRetry
      .mockResolvedValueOnce(makeOkResponse('I could not format the requested object.'))
      .mockResolvedValueOnce(makeOkResponse('{"customer":"fleet manager","confidence":0.8}'));

    const result = await executeLlm({
      prompt: 'Resolve the customer',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      maxTokens: 800,
      jsonMode: true,
    });

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(
      mockFetchWithRetry.mock.calls.every(([url]) =>
        String(url).includes('generativelanguage.googleapis.com')
      )
    ).toBe(true);
    const repairBody = JSON.parse(mockFetchWithRetry.mock.calls[1][1].body);
    expect(repairBody.messages.at(-1).content).toContain('<invalid_json_response>');
    expect(repairBody.messages.at(-1).content).toContain('I could not format');
    expect(result.content).toBe('{"customer":"fleet manager","confidence":0.8}');
    expect(result.provider).toBe('gemini');
    expect(result.usage).toEqual({ prompt_tokens: 20, completion_tokens: 40, total_tokens: 60 });
    expect(result.estimatedCostUsd).toBeCloseTo(0.000165, 8);
    expect(result.jsonRepairAttempted).toBe(true);
  });

  it('fails closed instead of clipping an over-limit JSON repair source', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('x'.repeat(20_001)));

    const execution = executeLlm({
      prompt: 'Return the complete document as JSON',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      jsonMode: true,
    });

    await expect(execution).rejects.toMatchObject({
      name: 'LlmJsonRepairSourceTooLargeError',
      code: 'LLM_JSON_REPAIR_SOURCE_TOO_LARGE',
      sourceChars: 20_001,
      maxSourceChars: 20_000,
    });
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
  });

  it('does not cross providers when the same-provider repair fails', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    mockFetchWithRetry
      .mockResolvedValueOnce(makeOkResponse('not json'))
      .mockResolvedValueOnce(makeErrorResponse(500, 'repair unavailable'));

    await expect(
      executeLlm({
        prompt: 'Return JSON',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        jsonMode: true,
      })
    ).rejects.toThrow(/Cross-provider fallback is disabled/);

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(
      mockFetchWithRetry.mock.calls.every(([url]) =>
        String(url).includes('generativelanguage.googleapis.com')
      )
    ).toBe(true);
  });
});

describe('executeLlm: openrouter provider', () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it('routes through the generic OpenAI-compatible branch (Bearer auth, chat/completions body) — not the Anthropic branch', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{}', 'groq'));

    await executeLlm({
      prompt: 'Test',
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.6',
    });

    const [url, init] = mockFetchWithRetry.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-openrouter-key');
    expect(init.headers['x-api-key']).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.model).toBe('anthropic/claude-sonnet-4.6');
    expect(body.messages).toEqual([{ role: 'user', content: 'Test' }]);
  });

  it('falls back to its own defaultModel when no override is given', async () => {
    mockFetchWithRetry.mockResolvedValueOnce(makeOkResponse('{}', 'groq'));

    await executeLlm({ prompt: 'Test', provider: 'openrouter' });

    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body.model).toBe('anthropic/claude-sonnet-4.6');
  });
});
