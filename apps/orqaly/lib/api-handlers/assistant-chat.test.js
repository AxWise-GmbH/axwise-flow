import { describe, it, expect } from 'vitest';
import {
  buildModelIdentityLine,
  modelLabel,
  buildFunctionCallingPrompt,
  buildCopilotSystemPrompt,
} from './assistant-chat.js';

describe('assistant-chat model identity', () => {
  it('modelLabel maps known ids and falls back to the raw id', () => {
    expect(modelLabel('gemini-2.5-pro')).toBe('Gemini 2.5 Pro');
    expect(modelLabel('claude-opus-5')).toBe('Claude Opus 5');
    expect(modelLabel('some-future-model')).toBe('some-future-model');
    expect(modelLabel('')).toBe('');
  });

  it('buildModelIdentityLine states the real model and provider', () => {
    const line = buildModelIdentityLine('gemini', 'gemini-2.5-pro');
    expect(line).toContain('Gemini 2.5 Pro');
    expect(line).toContain('gemini-2.5-pro');
    expect(line).toContain('provider: gemini');
    expect(line).toMatch(/never guess a different version/i);
  });

  it('buildModelIdentityLine reports Gemini 3 / preview models by their real id', () => {
    const line = buildModelIdentityLine('gemini', 'gemini-3-pro-preview');
    expect(line).toContain('Gemini 3 Pro (preview)');
    expect(line).toContain('gemini-3-pro-preview');
    expect(modelLabel('gemini-3.5-flash')).toBe('Gemini 3.5 Flash');
    expect(modelLabel('gemini-3.8-flash')).toBe('Gemini 3.8 Flash');
  });

  it('buildModelIdentityLine returns empty when no model is known', () => {
    expect(buildModelIdentityLine('gemini', undefined)).toBe('');
    expect(buildModelIdentityLine(undefined, '')).toBe('');
  });

  it('buildCopilotSystemPrompt embeds the selected model identity', () => {
    const prompt = buildCopilotSystemPrompt({ provider: 'gemini', model: 'gemini-2.5-pro' });
    expect(prompt).toContain('Gemini 2.5 Pro');
    expect(prompt).toContain('gemini-2.5-pro');
  });

  it('buildCopilotSystemPrompt omits the identity line without a model (no crash)', () => {
    const prompt = buildCopilotSystemPrompt({});
    expect(prompt).not.toMatch(/Your identity:/);
    expect(typeof prompt).toBe('string');
  });

  it('buildFunctionCallingPrompt embeds the selected model identity', () => {
    const { systemPrompt } = buildFunctionCallingPrompt({
      message: 'hi',
      provider: 'anthropic',
      model: 'claude-opus-5',
    });
    expect(systemPrompt).toContain('Claude Opus 5');
    expect(systemPrompt).toContain('claude-opus-5');
  });

  it('buildFunctionCallingPrompt omits the identity line without a model', () => {
    const { systemPrompt } = buildFunctionCallingPrompt({ message: 'hi' });
    expect(systemPrompt).not.toMatch(/Your identity:/);
  });

  it('buildFunctionCallingPrompt keeps the earliest turn (no 6-message cap)', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i === 0 ? 'FIRSTMSG_hey' : `turn ${i}`,
    }));
    const { systemPrompt } = buildFunctionCallingPrompt({
      message: 'what was my first message',
      history,
    });
    // slice(-6) would have dropped index 0; windowHistory keeps it.
    expect(systemPrompt).toContain('FIRSTMSG_hey');
  });

  it('buildFunctionCallingPrompt appends the omission note when the window overflows', () => {
    const history = Array.from({ length: 45 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${i}`,
    }));
    const { systemPrompt } = buildFunctionCallingPrompt({ message: 'hi', history });
    expect(systemPrompt).toMatch(/earlier messages in this conversation were omitted/i);
  });

  it('copilot + function-calling prompts instruct the model to escape newlines in JSON strings', () => {
    expect(buildCopilotSystemPrompt({})).toMatch(
      /escape every newline inside a string value as \\n/i
    );
    const { systemPrompt } = buildFunctionCallingPrompt({ message: 'hi' });
    expect(systemPrompt).toMatch(/escape every newline inside a string value as \\n/i);
  });
});
