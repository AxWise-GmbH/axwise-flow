/**
 * executeLlmV2 — claude-code reroute (M9 / M11 parity with llm-executor.js).
 *
 * v2 previously had no reroute at all: it only reached the claude-code branch
 * when a caller explicitly passed `provider: 'claude-code'`. That meant
 * CLAUDE_CODE_LOCAL was silently ignored by everything routed through v2 —
 * Consilium evaluations (whose provider comes from the consilium_members DB
 * row), tool scouting, the Assistant — so "run everything on the Claude
 * subscription" only ever covered half the platform.
 *
 * The real guard deliberately returns false under VITEST so the suite never
 * touches the Agent SDK. To exercise the executor's branching we re-run the
 * genuine helper logic against an injected localhost-like env, keeping the
 * pinnedProvider / bypass semantics real rather than stubbing them to
 * constants.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  env: { CLAUDE_CODE_LOCAL: 'all' },
  sdkAvailable: true,
  claudeCode: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('../../api/_lib/fetch.js', () => ({ fetchWithRetry: (...a) => h.fetchMock(...a) }));

vi.mock('../agent-handlers/claude-code-provider.js', () => ({
  executeClaudeCode: (...a) => h.claudeCode(...a),
}));

vi.mock('../_shared/claude-code-reroute.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    shouldAttemptReroute: (o = {}) => actual.shouldAttemptReroute({ ...o, env: h.env }),
    maybeRerouteToClaudeCode: (p, o = {}) =>
      actual.maybeRerouteToClaudeCode(p, { ...o, env: h.env, sdkAvailable: h.sdkAvailable }),
    forbidsPaidFallback: () => actual.forbidsPaidFallback(h.env),
    probeClaudeCodeSdk: async () => h.sdkAvailable,
  };
});

import { executeLlmV2 } from './llm-executor-v2.js';

const KEYS = [
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GLM_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_GATEWAY_API_KEY',
  'DEEPSEEK_API_KEY',
  'VERCEL_OIDC_TOKEN',
  'VERCEL',
];
const saved = {};

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

describe('executeLlmV2 claude-code reroute', () => {
  beforeEach(() => {
    h.env = { CLAUDE_CODE_LOCAL: 'all' };
    h.sdkAvailable = true;
    h.claudeCode.mockReset();
    h.fetchMock.mockReset();
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

  it('routes a groq call to the subscription and forces Opus in all-mode', async () => {
    h.claudeCode.mockResolvedValue({
      content: 'from opus',
      usage: { total_tokens: 5 },
      model: 'claude-opus-5',
    });

    const result = await executeLlmV2({ provider: 'groq', prompt: 'hi' });

    expect(h.claudeCode).toHaveBeenCalledTimes(1);
    expect(h.claudeCode.mock.calls[0][0].model).toBe('claude-opus-5');
    expect(result.provider).toBe('claude-code');
    expect(result.content).toBe('from opus');
    // Subscription billing, not API billing.
    expect(result.estimatedCostUsd).toBe(0);
    // No paid provider was contacted.
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the live action guard into claude-code and propagates revocation', async () => {
    const beforeInternalExternalAction = vi.fn(async () => ({
      status: 'authorization_revoked',
    }));
    h.claudeCode.mockImplementation(async (options) => {
      const authorizationResult = await options.beforeExternalAction({ phase: 'hidden-retry' });
      if (authorizationResult) {
        const error = new Error('revoked');
        error.code = 'EXECUTION_AUTHORIZATION_REVOKED';
        throw error;
      }
      return { content: 'unsafe', usage: {}, model: 'claude-opus-5' };
    });

    await expect(
      executeLlmV2({
        provider: 'groq',
        prompt: 'hi',
        beforeInternalExternalAction,
      })
    ).rejects.toMatchObject({ code: 'EXECUTION_AUTHORIZATION_REVOKED' });

    expect(beforeInternalExternalAction).toHaveBeenCalledTimes(1);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('overrides a provider that came from a DB row (consilium member)', async () => {
    h.claudeCode.mockResolvedValue({ content: 'ok', usage: {}, model: 'claude-opus-5' });

    // evaluation-engine.js passes `member.provider` straight through.
    const result = await executeLlmV2({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      prompt: 'evaluate',
    });

    expect(result.provider).toBe('claude-code');
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('leaves non-anthropic providers alone in default mode', async () => {
    h.env = {}; // CLAUDE_CODE_LOCAL unset
    process.env.GROQ_API_KEY = 'groq-key';
    h.fetchMock.mockResolvedValue(okResponse('groq answer'));

    const result = await executeLlmV2({ provider: 'groq', prompt: 'hi' });

    expect(result.provider).toBe('groq');
    expect(h.claudeCode).not.toHaveBeenCalled();
  });

  it('does not reroute when CLAUDE_CODE_LOCAL=off', async () => {
    h.env = { CLAUDE_CODE_LOCAL: 'off' };
    process.env.GROQ_API_KEY = 'groq-key';
    h.fetchMock.mockResolvedValue(okResponse('groq answer'));

    const result = await executeLlmV2({ provider: 'groq', prompt: 'hi' });

    expect(result.provider).toBe('groq');
    expect(h.claudeCode).not.toHaveBeenCalled();
  });

  it('respects a compare-mode pin instead of collapsing every arm onto Opus', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    h.fetchMock.mockResolvedValue(okResponse('groq answer'));

    const result = await executeLlmV2({ provider: 'groq', prompt: 'hi', pinnedProvider: true });

    expect(result.provider).toBe('groq');
    expect(h.claudeCode).not.toHaveBeenCalled();
  });

  it('does not reroute when the Agent SDK is unavailable', async () => {
    h.sdkAvailable = false;
    process.env.GROQ_API_KEY = 'groq-key';
    h.fetchMock.mockResolvedValue(okResponse('groq answer'));

    const result = await executeLlmV2({ provider: 'groq', prompt: 'hi' });

    expect(result.provider).toBe('groq');
    expect(h.claudeCode).not.toHaveBeenCalled();
  });

  it('fails loudly in all-mode instead of silently billing a paid provider', async () => {
    // A key IS available — the point is that we must not quietly use it.
    process.env.GROQ_API_KEY = 'groq-key';
    h.fetchMock.mockResolvedValue(okResponse('groq answer'));
    h.claudeCode.mockRejectedValue(new Error('CLAUDE_CODE_QUOTA_EXHAUSTED: resets 10pm'));

    await expect(executeLlmV2({ provider: 'groq', prompt: 'hi' })).rejects.toThrow(
      /forbids paid-API fallback/
    );
    // The real cause survives in the message.
    await expect(executeLlmV2({ provider: 'groq', prompt: 'hi' })).rejects.toThrow(
      /QUOTA_EXHAUSTED/
    );
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('falls through to a paid provider in default mode when claude-code fails', async () => {
    h.env = {}; // default mode: only anthropic reroutes, fallback is allowed
    process.env.GROQ_API_KEY = 'groq-key';
    h.claudeCode.mockRejectedValue(new Error('OAuth expired'));
    h.fetchMock.mockResolvedValue(okResponse('groq answer'));

    const result = await executeLlmV2({ provider: 'anthropic', prompt: 'hi' });

    // Rerouted to claude-code, failed, then fell through — and did NOT bounce
    // straight back into claude-code (the bypass flag prevents a loop).
    expect(h.claudeCode).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('groq');
  });
});
