import { afterEach, describe, expect, it } from 'vitest';
import {
  GEMINI_HIGH_REASONING_DEADLINE_MS,
  VERCEL_GEMINI_HIGH_REASONING_DEADLINE_MS,
  geminiReasoningEffort,
  isGeminiThinkingModel,
  resolveLlmDeadlineMs,
  resolveLlmNetworkRetries,
  SUPPORTED_GEMINI_REASONING_EFFORTS,
} from './gemini-reasoning.js';

const ORIGINAL = process.env.GEMINI_REASONING_EFFORT;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GEMINI_REASONING_EFFORT;
  else process.env.GEMINI_REASONING_EFFORT = ORIGINAL;
});

describe('Gemini reasoning configuration', () => {
  it.each(['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'])(
    'recognizes %s as a thinking model',
    (model) => expect(isGeminiThinkingModel('gemini', model)).toBe(true)
  );

  it('does not alter other models or providers', () => {
    expect(isGeminiThinkingModel('openai', 'gemini-3.8-flash')).toBe(false);
    expect(isGeminiThinkingModel('gemini', 'gemini-2.5-flash')).toBe(false);
  });

  it('defaults to medium and supports an explicit high evaluation setting', () => {
    delete process.env.GEMINI_REASONING_EFFORT;
    expect(geminiReasoningEffort()).toBe('medium');
    expect(geminiReasoningEffort('HIGH')).toBe('high');
    expect(SUPPORTED_GEMINI_REASONING_EFFORTS).toEqual(['low', 'medium', 'high']);
  });

  it('fails safely to medium for an unsupported value', () => {
    expect(geminiReasoningEffort('xhigh')).toBe('medium');
  });

  it('gives high-reasoning Gemini a bounded five-minute deadline', () => {
    expect(
      resolveLlmDeadlineMs({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        reasoningEffort: 'high',
        requestedTimeoutMs: 60_000,
        defaultTimeoutMs: 30_000,
        env: {},
      })
    ).toBe(GEMINI_HIGH_REASONING_DEADLINE_MS);
  });

  it('leaves room for durable recovery beneath the Vercel function ceiling', () => {
    const call = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      reasoningEffort: 'high',
      requestedTimeoutMs: 420_000,
      defaultTimeoutMs: 30_000,
      env: { VERCEL: '1' },
    };

    expect(resolveLlmDeadlineMs(call)).toBe(VERCEL_GEMINI_HIGH_REASONING_DEADLINE_MS);
    expect(resolveLlmNetworkRetries(call)).toBe(0);
  });

  it('retains the provider retry outside the Vercel high-reasoning boundary', () => {
    expect(
      resolveLlmNetworkRetries({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        reasoningEffort: 'high',
        env: {},
      })
    ).toBe(1);
    expect(
      resolveLlmNetworkRetries({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        reasoningEffort: 'medium',
        env: { VERCEL: '1' },
      })
    ).toBe(1);
  });

  it('preserves ordinary defaults and an explicitly longer deadline', () => {
    expect(
      resolveLlmDeadlineMs({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        reasoningEffort: 'medium',
        requestedTimeoutMs: 60_000,
        defaultTimeoutMs: 30_000,
      })
    ).toBe(60_000);
    expect(
      resolveLlmDeadlineMs({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        reasoningEffort: 'high',
        requestedTimeoutMs: 420_000,
        defaultTimeoutMs: 30_000,
        env: {},
      })
    ).toBe(420_000);
    expect(
      resolveLlmDeadlineMs({
        provider: 'openai',
        model: 'gpt-4o-mini',
        reasoningEffort: 'high',
        defaultTimeoutMs: 25_000,
      })
    ).toBe(25_000);
  });
});
