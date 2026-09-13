/**
 * Tests for the shared claude-code reroute helpers.
 *
 * The reroute function itself is covered in depth by
 * lib/agent-handlers/llm-executor-override.test.js, which imports it through
 * llm-executor.js's re-export — that file doubles as the regression test that
 * the move to lib/_shared/ kept the old import path working.
 *
 * This file covers the pieces that are new here: the shared skip guard
 * (shouldAttemptReroute) and the no-paid-fallback predicate
 * (forbidsPaidFallback), both of which llm-executor-v2.js now depends on.
 */
import { describe, it, expect } from 'vitest';
import {
  maybeRerouteToClaudeCode,
  shouldAttemptReroute,
  forbidsPaidFallback,
  forcedClaudeCodeModel,
  DEFAULT_CLAUDE_CODE_MODEL,
} from './claude-code-reroute.js';

describe('maybeRerouteToClaudeCode (shared module export)', () => {
  it('is importable from lib/_shared and behaves identically', () => {
    const off = maybeRerouteToClaudeCode('groq', { env: {}, sdkAvailable: true });
    expect(off.provider).toBe('groq');

    const all = maybeRerouteToClaudeCode('groq', {
      env: { CLAUDE_CODE_LOCAL: 'all' },
      sdkAvailable: true,
    });
    expect(all.provider).toBe('claude-code');
    expect(all.model).toBe('claude-opus-5');
  });
});

describe('shouldAttemptReroute', () => {
  it('allows the reroute on a plain localhost env', () => {
    expect(shouldAttemptReroute({ env: {} })).toBe(true);
  });

  it('skips on Vercel so production never loads the dev SDK', () => {
    expect(shouldAttemptReroute({ env: { VERCEL: '1' } })).toBe(false);
  });

  it('skips under vitest and NODE_ENV=test', () => {
    expect(shouldAttemptReroute({ env: { VITEST: 'true' } })).toBe(false);
    expect(shouldAttemptReroute({ env: { NODE_ENV: 'test' } })).toBe(false);
  });

  it('skips when the caller pinned a provider (compare mode)', () => {
    expect(shouldAttemptReroute({ env: {}, pinnedProvider: true })).toBe(false);
  });

  it('skips when the bypass flag is set, so fall-through cannot loop', () => {
    expect(shouldAttemptReroute({ env: {}, bypass: true })).toBe(false);
  });

  // The subscription path runs the Agent SDK with allowedTools: [] and returns
  // no toolCalls, so rerouting a tool-carrying call makes the model narrate
  // ("I'll create the GitHub repo...") instead of performing the action.
  it('skips when the call carries tools, so tool_calls stay possible', () => {
    expect(shouldAttemptReroute({ env: {}, hasTools: true })).toBe(false);
  });

  it('still reroutes when there are no tools', () => {
    expect(shouldAttemptReroute({ env: {}, hasTools: false })).toBe(true);
  });
});

describe('forcedClaudeCodeModel', () => {
  it('defaults to Opus 5 when CLAUDE_CODE_MODEL is unset', () => {
    expect(forcedClaudeCodeModel({})).toBe('claude-opus-5');
    expect(DEFAULT_CLAUDE_CODE_MODEL).toBe('claude-opus-5');
  });

  it('honours an explicit model — the latency/quality lever', () => {
    expect(forcedClaudeCodeModel({ CLAUDE_CODE_MODEL: 'claude-haiku-4-5' })).toBe('claude-haiku-4-5');
  });

  it('ignores blank values rather than forcing an empty model name', () => {
    expect(forcedClaudeCodeModel({ CLAUDE_CODE_MODEL: '   ' })).toBe('claude-opus-5');
    expect(forcedClaudeCodeModel({ CLAUDE_CODE_MODEL: '' })).toBe('claude-opus-5');
  });

  it('feeds the all-mode reroute', () => {
    const r = maybeRerouteToClaudeCode('groq', {
      env: { CLAUDE_CODE_LOCAL: 'all', CLAUDE_CODE_MODEL: 'claude-haiku-4-5' },
      sdkAvailable: true,
    });
    expect(r.provider).toBe('claude-code');
    expect(r.model).toBe('claude-haiku-4-5');
  });
});

describe('forbidsPaidFallback', () => {
  it('is true only in all-mode', () => {
    expect(forbidsPaidFallback({ CLAUDE_CODE_LOCAL: 'all' })).toBe(true);
  });

  it('is false when unset, off, or any other value', () => {
    expect(forbidsPaidFallback({})).toBe(false);
    expect(forbidsPaidFallback({ CLAUDE_CODE_LOCAL: 'off' })).toBe(false);
    expect(forbidsPaidFallback({ CLAUDE_CODE_LOCAL: 'anthropic' })).toBe(false);
  });
});
