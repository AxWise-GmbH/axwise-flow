/**
 * Tests for the BYOK enforcement contract added to llm-executor.
 *
 * Critical Fix #1 from the plan: when a user is authenticated (opts.userId
 * is set) but has no API key configured, the executor MUST throw, NOT
 * silently fall back to the platform's process.env keys. Otherwise a single
 * tester can drain the platform's LLM budget.
 *
 * System jobs (no opts.userId) keep the platform-env fallback so cron-driven
 * prompt optimization and internal health checks still work.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockResolve = vi.fn();
vi.mock('../security/resolve-user-key.js', () => ({
  resolveUserKey: (...args) => mockResolve(...args),
}));

const mockFetch = vi.fn();
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (...args) => mockFetch(...args),
}));

import { executeLlm } from './llm-executor.js';
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';

beforeEach(() => {
  mockResolve.mockReset();
  mockFetch.mockReset();
  // Set platform keys so we can prove they're NOT used in user-context paths.
  process.env.GROQ_API_KEY = 'platform-groq-key';
  process.env.OPENAI_API_KEY = 'platform-openai-key';
  process.env.GLM_API_KEY = 'platform-glm-key';
  delete process.env.ANTHROPIC_API_KEY; // intentionally absent
  // Block claude-code reroute so tests don't bounce into the SDK probe.
  process.env.CLAUDE_CODE_LOCAL = 'off';
  process.env.NODE_ENV = 'test';
});

function makeOk(content) {
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

describe('BYOK enforcement', () => {
  it('selects a saved Gemini key for a feasibility retry whose owner is in usage context', async () => {
    mockResolve.mockResolvedValueOnce({ source: 'user', key: 'saved-gemini-key' });
    mockFetch.mockResolvedValueOnce(makeOk('feasibility-complete'));

    const result = await executeLlmTracked({
      prompt: 'Retry feasibility analysis',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      pinnedProvider: true,
      usage: {
        userId: 'goal-owner-1',
        goalId: 'goal-1',
        source: 'feasibility-analysis',
      },
    });

    expect(result.content).toBe('feasibility-complete');
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'goal-owner-1',
        provider: 'llm:gemini',
        requireUser: true,
      })
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer saved-gemini-key' }),
      }),
      expect.anything()
    );
  });

  it('uses the user key when opts.userId resolves a valid key', async () => {
    mockResolve.mockResolvedValueOnce({ source: 'user', key: 'user-groq-key' });
    mockFetch.mockResolvedValueOnce(makeOk('hello'));

    const r = await executeLlm({ prompt: 'hi', provider: 'groq', userId: 'user-1' });
    expect(r.content).toBe('hello');
    // The Authorization header should contain the user's key, not the platform's.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer user-groq-key' }),
      }),
      expect.anything()
    );
  });

  it('throws BYOK_REQUIRED when user has no key for any provider', async () => {
    // Every resolveUserKey call throws USER_KEY_REQUIRED (requireUser: true).
    mockResolve.mockRejectedValue(new Error('USER_KEY_REQUIRED'));

    await expect(
      executeLlm({ prompt: 'hi', provider: 'groq', userId: 'user-without-keys' })
    ).rejects.toThrow(/BYOK_REQUIRED/);

    // CRITICAL: fetch must NEVER be called — we never want to spend platform
    // dollars on behalf of a user who hasn't added their own key.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('walks BYOK fallback chain to a different user-provided key', async () => {
    // User has no Groq key but has an OpenAI key. Fallback chain order is
    // [glm, gemini, groq, openai, anthropic], so glm + gemini must reject
    // before the openai resolve is reached.
    mockResolve
      .mockRejectedValueOnce(new Error('USER_KEY_REQUIRED')) // groq (initial)
      .mockRejectedValueOnce(new Error('USER_KEY_REQUIRED')) // glm
      .mockRejectedValueOnce(new Error('USER_KEY_REQUIRED')) // gemini
      .mockResolvedValueOnce({ source: 'user', key: 'user-openai-key' }); // openai
    mockFetch.mockResolvedValueOnce(makeOk('fallback-worked'));

    const r = await executeLlm({ prompt: 'hi', provider: 'groq', userId: 'user-with-openai-only' });
    expect(r.content).toBe('fallback-worked');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('openai.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer user-openai-key' }),
      }),
      expect.anything()
    );
  });

  it('uses platform key for system jobs (no opts.userId)', async () => {
    mockFetch.mockResolvedValueOnce(makeOk('system-job-ran'));

    const r = await executeLlm({ prompt: 'hi', provider: 'groq' /* no userId */ });
    expect(r.content).toBe('system-job-ran');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer platform-groq-key' }),
      }),
      expect.anything()
    );
    // resolveUserKey should NOT have been called for system jobs.
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('throws SYSTEM_API_KEY_MISSING when system job has no platform key for any provider', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GLM_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(executeLlm({ prompt: 'hi', provider: 'groq' })).rejects.toThrow(
      /SYSTEM_API_KEY_MISSING/
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
