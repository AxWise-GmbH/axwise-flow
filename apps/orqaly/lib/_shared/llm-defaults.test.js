import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FALLBACK_PROVIDER,
  FALLBACK_MODEL,
  FALLBACK_CHEAP_MODEL,
  defaultProvider,
  defaultModel,
  defaultCheapModel,
  defaultLlm,
  hasDefaultOverride,
  applyDefaultProvider,
  applyDefaultProviderMap,
} from './llm-defaults.js';

const VARS = ['LLM_DEFAULT_PROVIDER', 'LLM_DEFAULT_MODEL', 'LLM_DEFAULT_CHEAP_MODEL', 'VERCEL'];

describe('llm-defaults', () => {
  let saved;

  beforeEach(() => {
    saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));
    for (const v of VARS) delete process.env[v];
  });

  afterEach(() => {
    for (const v of VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });

  describe('with no override (the production case)', () => {
    it('falls back to the exact Gemini provider, primary model, and cheap model', () => {
      expect(defaultProvider()).toBe(FALLBACK_PROVIDER);
      expect(defaultModel()).toBe(FALLBACK_MODEL);
      expect(defaultCheapModel()).toBe(FALLBACK_CHEAP_MODEL);
      expect(defaultLlm()).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
      expect(hasDefaultOverride()).toBe(false);
    });

    it('moves historical Groq baseline entries to the new unset default', () => {
      const entry = { provider: 'groq', model: 'llama-3.3-70b-versatile' };
      expect(applyDefaultProvider(entry)).toEqual({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
      });
    });

    it('preserves deliberate non-Gemini pins without an override', () => {
      const entry = { provider: 'anthropic', model: 'claude-sonnet-5' };
      expect(applyDefaultProvider(entry)).toEqual(entry);
    });
  });

  describe('with LLM_DEFAULT_PROVIDER/MODEL set', () => {
    beforeEach(() => {
      process.env.LLM_DEFAULT_PROVIDER = 'gemini';
      process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';
    });

    it('resolves the override', () => {
      expect(defaultProvider()).toBe('gemini');
      expect(defaultModel()).toBe('gemini-3.8-flash');
      expect(hasDefaultOverride()).toBe(true);
      expect(defaultLlm()).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    });

    it('reads env at call time, not module load', () => {
      process.env.LLM_DEFAULT_PROVIDER = 'openai';
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      expect(defaultProvider()).toBe('openai');
      expect(defaultModel()).toBe('gpt-4o-mini');
    });

    it('rejects a localhost-only Claude Code default in Vercel production', () => {
      process.env.VERCEL = '1';
      process.env.LLM_DEFAULT_PROVIDER = 'claude-code';
      process.env.LLM_DEFAULT_MODEL = 'claude-opus-5';
      process.env.LLM_DEFAULT_CHEAP_MODEL = 'claude-haiku-4-5';

      expect(defaultLlm()).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
      expect(defaultCheapModel()).toBe('gemini-3.8-flash');
    });

    it('does not hand a groq-specific cheap model to another provider', () => {
      // 'llama-3.1-8b-instant' is meaningless on Gemini; fall back to the
      // override model rather than sending a name the provider will reject.
      expect(defaultCheapModel()).toBe('gemini-3.8-flash');
    });

    it('honours an explicit cheap-model override', () => {
      process.env.LLM_DEFAULT_CHEAP_MODEL = 'gemini-3.8-flash';
      expect(defaultCheapModel()).toBe('gemini-3.8-flash');
    });

    it('redirects entries on the groq baseline', () => {
      expect(applyDefaultProvider({ provider: 'groq', model: 'llama-3.3-70b-versatile' })).toEqual({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
      });
    });

    it('preserves deliberate non-groq pins by default', () => {
      // Frontend Developer is pinned to Claude Sonnet for landing-page HTML;
      // a blanket redirect would silently downgrade that deliverable.
      const pinned = { provider: 'anthropic', model: 'claude-sonnet-5' };
      expect(applyDefaultProvider(pinned)).toEqual(pinned);
    });

    it('redirects even deliberate pins when force is set', () => {
      expect(
        applyDefaultProvider({ provider: 'anthropic', model: 'claude-sonnet-5' }, { force: true })
      ).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    });

    it('maps the cheap baseline model onto the cheap default', () => {
      process.env.LLM_DEFAULT_CHEAP_MODEL = 'gemini-3.8-flash';
      expect(applyDefaultProvider({ provider: 'groq', model: 'llama-3.1-8b-instant' })).toEqual({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
      });
    });

    it('tolerates undefined entries (unmapped agent roles)', () => {
      expect(applyDefaultProvider(undefined)).toBeUndefined();
      expect(applyDefaultProvider(null)).toBeNull();
      expect(applyDefaultProvider({})).toEqual({});
    });

    it('rewrites a whole role map without mutating the original', () => {
      const map = {
        Designer: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
        'Frontend Developer': { provider: 'anthropic', model: 'claude-sonnet-5' },
      };
      const out = applyDefaultProviderMap(map);
      expect(out.Designer).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
      expect(out['Frontend Developer']).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
      });
      expect(map.Designer.provider).toBe('groq');
    });
  });
});
