/**
 * M9 / M11 — Tests for maybeRerouteToClaudeCode.
 *
 * M9 motivation: running `npm run dev:local` sent every Anthropic call to
 * the paid API, burning credits on throwaway goal tests. This override
 * silently rewrites `provider: 'anthropic'` → `provider: 'claude-code'` on
 * localhost so the user's Claude Max subscription is used instead.
 *
 * M11 extension: opt-in mode CLAUDE_CODE_LOCAL=all routes EVERY provider
 * through claude-code and forces `claude-opus-5` so every agent on
 * localhost uses Opus via the subscription — including Groq-tagged agents.
 *
 * Return shape is now `{ provider, model? }`:
 *   - `{ provider: '<original>' }` — no reroute, no model override
 *   - `{ provider: 'claude-code', model: null }` — M9 default: reroute
 *     anthropic-only, let caller keep the original model (sonnet-5)
 *   - `{ provider: 'claude-code', model: 'claude-opus-5' }` — M11 all-mode
 *
 * The function is pure: env + SDK-availability are injected so tests don't
 * touch process.env or trigger a real SDK load.
 */
import { describe, it, expect } from 'vitest';
import { maybeRerouteToClaudeCode } from './llm-executor.js';

describe('maybeRerouteToClaudeCode', () => {
  it('leaves non-anthropic providers untouched in default mode', () => {
    for (const p of ['groq', 'openai', 'glm', 'qwen']) {
      const r = maybeRerouteToClaudeCode(p, { env: {}, sdkAvailable: true });
      expect(r.provider).toBe(p);
    }
  });

  it('does NOT reroute when running on Vercel', () => {
    const r = maybeRerouteToClaudeCode('anthropic', { env: { VERCEL: '1' }, sdkAvailable: true });
    expect(r.provider).toBe('anthropic');
  });

  it('reroutes anthropic → claude-code on localhost when SDK is available', () => {
    const r = maybeRerouteToClaudeCode('anthropic', { env: {}, sdkAvailable: true });
    expect(r.provider).toBe('claude-code');
    // No model override in default mode — caller keeps the original model.
    expect(r.model).toBeFalsy();
  });

  it('respects CLAUDE_CODE_LOCAL=off (hard opt-out)', () => {
    const r = maybeRerouteToClaudeCode('anthropic', {
      env: { CLAUDE_CODE_LOCAL: 'off' }, sdkAvailable: true,
    });
    expect(r.provider).toBe('anthropic');
  });

  it('silently stays on anthropic when the SDK is missing', () => {
    const r = maybeRerouteToClaudeCode('anthropic', { env: {}, sdkAvailable: false });
    expect(r.provider).toBe('anthropic');
  });

  it('accepts sdkAvailable as a function (lazy probe, called once)', () => {
    let called = 0;
    const probe = () => { called += 1; return true; };
    const r = maybeRerouteToClaudeCode('anthropic', { env: {}, sdkAvailable: probe });
    expect(r.provider).toBe('claude-code');
    expect(called).toBe(1);
  });

  it('skips reroute under vitest / NODE_ENV=test to preserve mocks', () => {
    expect(maybeRerouteToClaudeCode('anthropic', { env: { VITEST: 'true' }, sdkAvailable: true }).provider).toBe('anthropic');
    expect(maybeRerouteToClaudeCode('anthropic', { env: { NODE_ENV: 'test' }, sdkAvailable: true }).provider).toBe('anthropic');
  });

  // ── M11 all-mode ────────────────────────────────────────────────────────

  it('CLAUDE_CODE_LOCAL=all reroutes every provider and forces Opus 5', () => {
    const env = { CLAUDE_CODE_LOCAL: 'all' };
    for (const p of ['anthropic', 'groq', 'openai', 'glm', 'qwen']) {
      const r = maybeRerouteToClaudeCode(p, { env, sdkAvailable: true });
      expect(r.provider).toBe('claude-code');
      expect(r.model).toBe('claude-opus-5');
    }
  });

  it('all-mode still respects Vercel guard (production never reroutes)', () => {
    const r = maybeRerouteToClaudeCode('groq', {
      env: { CLAUDE_CODE_LOCAL: 'all', VERCEL: '1' }, sdkAvailable: true,
    });
    expect(r.provider).toBe('groq');
    expect(r.model).toBeFalsy();
  });

  it('all-mode still needs the SDK — falls back to original provider when missing', () => {
    const r = maybeRerouteToClaudeCode('groq', {
      env: { CLAUDE_CODE_LOCAL: 'all' }, sdkAvailable: false,
    });
    expect(r.provider).toBe('groq');
    expect(r.model).toBeFalsy();
  });

  it('all-mode still skipped in test environments', () => {
    const r = maybeRerouteToClaudeCode('groq', {
      env: { CLAUDE_CODE_LOCAL: 'all', VITEST: 'true' }, sdkAvailable: true,
    });
    expect(r.provider).toBe('groq');
  });

  // ── pinnedProvider (compare-mode) ────────────────────────────────────────
  //
  // When a goal has `data.test_model` set, pickTestModel returns
  // `{ provider, model, pinnedProvider: true }` and executor passes it
  // through. The env-driven reroute must NOT override the user's pick —
  // otherwise CLAUDE_CODE_LOCAL=all silently collapses the 3-way compare
  // into "Opus vs Opus vs Opus".

  it('pinnedProvider blocks reroute even when CLAUDE_CODE_LOCAL=all is set', () => {
    const env = { CLAUDE_CODE_LOCAL: 'all' };
    for (const p of ['glm', 'qwen', 'groq', 'openai', 'anthropic']) {
      const r = maybeRerouteToClaudeCode(p, { env, sdkAvailable: true, pinnedProvider: true });
      expect(r.provider).toBe(p);
      expect(r.model).toBeFalsy();
    }
  });

  it('pinnedProvider blocks reroute in default mode for anthropic too', () => {
    // Even the default M9 anthropic→claude-code reroute is skipped — the
    // compare UI exposes "Subscription" as provider:'claude-code' directly,
    // so a pinned `anthropic` means "I really want the paid API for A/B".
    const r = maybeRerouteToClaudeCode('anthropic', { env: {}, sdkAvailable: true, pinnedProvider: true });
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBeFalsy();
  });

  it('pinnedProvider defaults to false (existing reroute behavior preserved)', () => {
    const r = maybeRerouteToClaudeCode('anthropic', { env: {}, sdkAvailable: true });
    expect(r.provider).toBe('claude-code');
  });
});
