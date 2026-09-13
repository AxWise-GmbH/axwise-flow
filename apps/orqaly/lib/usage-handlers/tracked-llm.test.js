import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the underlying executors and the recorder so the wrapper is tested in
// isolation (no network, no Supabase).
const executeLlm = vi.fn();
const executeLlmV2 = vi.fn();
const recordLlmUsage = vi.fn(async () => ({ recorded: true }));

vi.mock('../agent-handlers/llm-executor.js', () => ({ executeLlm: (...a) => executeLlm(...a) }));
vi.mock('../concilium-handlers/llm-executor-v2.js', () => ({
  executeLlmV2: (...a) => executeLlmV2(...a),
}));
vi.mock('../goal-handlers/_helpers.js', () => ({
  recordLlmUsage: (...a) => recordLlmUsage(...a),
  extractTokenUsage: (result = {}) => ({
    promptTokens: result.usage?.prompt_tokens || 0,
    completionTokens: result.usage?.completion_tokens || 0,
    totalTokens: result.usage?.total_tokens || 0,
    cachedTokens:
      result.usage?.prompt_tokens_details?.cached_tokens ||
      result.usage?.cache_read_input_tokens ||
      0,
  }),
}));

const { executeLlmV2Tracked, executeLlmTracked, classifyLlmError } =
  await import('./tracked-llm.js');

const admin = { __isAdmin: true };
const okResult = {
  content: 'hi',
  provider: 'openai',
  model: 'gpt-4o-mini',
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  estimatedCostUsd: 0.001,
  durationMs: 420,
  finishReason: 'stop',
};

beforeEach(() => {
  executeLlm.mockReset();
  executeLlmV2.mockReset();
  recordLlmUsage.mockReset().mockResolvedValue({ recorded: true });
});

describe('executeLlmV2Tracked', () => {
  it('is a transparent passthrough when no usage context is given', async () => {
    executeLlmV2.mockResolvedValue(okResult);
    const out = await executeLlmV2Tracked({ prompt: 'x', provider: 'openai' });
    expect(out).toBe(okResult);
    expect(recordLlmUsage).not.toHaveBeenCalled();
    // The executor must not receive the `usage` key.
    expect(executeLlmV2).toHaveBeenCalledWith({ prompt: 'x', provider: 'openai' });
  });

  it('does not record when usage context lacks an admin client', async () => {
    executeLlmV2.mockResolvedValue(okResult);
    await executeLlmV2Tracked({ prompt: 'x', usage: { userId: 'u1', source: 'test' } });
    expect(recordLlmUsage).not.toHaveBeenCalled();
    expect(executeLlmV2).toHaveBeenCalledWith({ prompt: 'x', userId: 'u1' });
  });

  it('records one success row and returns the executor result unchanged', async () => {
    executeLlmV2.mockResolvedValue(okResult);
    const out = await executeLlmV2Tracked({
      prompt: 'x',
      provider: 'openai',
      usage: {
        admin,
        userId: 'u1',
        source: 'assistant-chat',
        operation: 'chat',
        consiliumId: 'c1',
      },
    });
    expect(out).toBe(okResult);
    expect(executeLlmV2).toHaveBeenCalledWith({
      prompt: 'x',
      provider: 'openai',
      userId: 'u1',
    });
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    const [passedAdmin, row] = recordLlmUsage.mock.calls[0];
    expect(passedAdmin).toBe(admin);
    expect(row).toMatchObject({
      userId: 'u1',
      source: 'assistant-chat',
      operation: 'chat',
      consiliumId: 'c1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      finishReason: 'stop',
      status: 'ok',
    });
  });

  it('records a failure row then re-throws the original error', async () => {
    const err = new Error('LLM openai 500: boom');
    executeLlmV2.mockRejectedValue(err);
    await expect(
      executeLlmV2Tracked({
        prompt: 'x',
        provider: 'openai',
        model: 'gpt-4o-mini',
        usage: { admin, userId: 'u1', source: 'chat' },
      })
    ).rejects.toThrow('LLM openai 500: boom');
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    const [, row] = recordLlmUsage.mock.calls[0];
    expect(row).toMatchObject({
      status: 'error',
      errorType: 'server_error',
      provider: 'openai',
      model: 'gpt-4o-mini',
      source: 'chat',
    });
    expect(row.totalTokens).toBe(0);
  });

  it('classifies a slow-timeout failure as status=timeout', async () => {
    executeLlmV2.mockRejectedValue(new Error('LLM_SLOW_TIMEOUT: groq did not respond in 15000ms'));
    await expect(
      executeLlmV2Tracked({ prompt: 'x', provider: 'groq', usage: { admin, source: 'chat' } })
    ).rejects.toThrow();
    const [, row] = recordLlmUsage.mock.calls[0];
    expect(row.status).toBe('timeout');
    expect(row.errorType).toBe('timeout');
  });

  it('defaults the row userId from the executor opts when not in the usage context', async () => {
    executeLlmV2.mockResolvedValue(okResult);
    await executeLlmV2Tracked({
      prompt: 'x',
      userId: 'byok-user',
      usage: { admin, source: 'chat' },
    });
    const [, row] = recordLlmUsage.mock.calls[0];
    expect(row.userId).toBe('byok-user');
  });

  it('keeps an explicit executor userId authoritative over usage attribution', async () => {
    executeLlmV2.mockResolvedValue(okResult);
    await executeLlmV2Tracked({
      prompt: 'x',
      userId: 'executor-owner',
      usage: { admin, userId: 'usage-owner', source: 'chat' },
    });

    expect(executeLlmV2).toHaveBeenCalledWith({ prompt: 'x', userId: 'executor-owner' });
    const [, row] = recordLlmUsage.mock.calls[0];
    expect(row.userId).toBe('executor-owner');
  });

  it('never breaks the call when recording itself throws', async () => {
    executeLlmV2.mockResolvedValue(okResult);
    recordLlmUsage.mockRejectedValue(new Error('db down'));
    const out = await executeLlmV2Tracked({ prompt: 'x', usage: { admin, source: 'chat' } });
    expect(out).toBe(okResult);
  });
});

describe('executeLlmTracked', () => {
  it('wraps the v1 executor and records success', async () => {
    executeLlm.mockResolvedValue(okResult);
    const out = await executeLlmTracked({ prompt: 'x', usage: { admin, source: 'goal-stage' } });
    expect(out).toBe(okResult);
    expect(executeLlm).toHaveBeenCalledTimes(1);
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
  });

  it('forwards a goal owner from usage to the v1 executor without forwarding admin', async () => {
    executeLlm.mockResolvedValue(okResult);

    await executeLlmTracked({
      prompt: 'retry feasibility',
      provider: 'gemini',
      usage: {
        admin,
        userId: 'goal-owner',
        goalId: 'goal-1',
        source: 'feasibility-analysis',
      },
    });

    expect(executeLlm).toHaveBeenCalledWith({
      prompt: 'retry feasibility',
      provider: 'gemini',
      userId: 'goal-owner',
    });
  });
});

describe('classifyLlmError', () => {
  it.each([
    ['LLM_SLOW_TIMEOUT: did not respond', 'timeout', 'timeout'],
    ['BYOK_REQUIRED: no key', 'error', 'no_api_key'],
    ['LLM anthropic 400: credit balance too low', 'error', 'billing'],
    ['LLM groq 429: rate limit reached', 'error', 'rate_limit'],
    ['LLM groq 403: access denied', 'error', 'access_denied'],
    ['LLM openai 503: server error', 'error', 'server_error'],
    ['something weird happened', 'error', 'llm_error'],
  ])('classifies %s', (msg, status, errorType) => {
    expect(classifyLlmError(new Error(msg))).toEqual({ status, errorType });
  });
});
