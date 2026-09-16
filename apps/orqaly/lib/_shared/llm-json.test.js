import { describe, it, expect } from 'vitest';
import { parseLlmJson } from './llm-json.js';

describe('parseLlmJson — clean input', () => {
  it('parses a plain object', () => {
    expect(parseLlmJson('{"a": 1, "b": "two"}')).toEqual({ a: 1, b: 'two' });
  });

  it('strips markdown code fences', () => {
    expect(parseLlmJson('```json\n{"ok": true}\n```')).toEqual({ ok: true });
  });

  it('extracts JSON embedded in prose', () => {
    expect(parseLlmJson('Here you go:\n{"n": 3}\nThanks!')).toEqual({ n: 3 });
  });

  it('parses an array', () => {
    expect(parseLlmJson('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('returns null for non-JSON / empty / non-string', () => {
    expect(parseLlmJson('just words')).toBeNull();
    expect(parseLlmJson('')).toBeNull();
    expect(parseLlmJson(null)).toBeNull();
    expect(parseLlmJson(undefined)).toBeNull();
  });
});

describe('parseLlmJson — raw control chars inside string values (Gemini/thinking models)', () => {
  it('parses an object whose string value contains a literal newline', () => {
    const raw = '{\n  "action": "answer",\n  "message": "You have 0 agents.\n\nWould you like to create one?",\n  "proposedActions": []\n}';
    const result = parseLlmJson(raw);
    expect(result?.action).toBe('answer');
    expect(result?.message).toContain('You have 0 agents.');
    expect(result?.message).toContain('Would you like to create one?');
    expect(Array.isArray(result?.proposedActions)).toBe(true);
  });

  it('parses an object whose string value contains a literal tab', () => {
    const raw = '{"action":"answer","message":"Line1\tLine2","proposedActions":[]}';
    const result = parseLlmJson(raw);
    expect(result?.action).toBe('answer');
    expect(result?.message).toBe('Line1\tLine2');
  });

  it('parses a pretty-printed read action with a multi-line thought', () => {
    const raw = '{\n  "action": "read",\n  "calls": [ { "tool": "goal.list", "args": {} } ],\n  "thought": "I need the goals\nto find the last failure."\n}';
    const result = parseLlmJson(raw);
    expect(result?.action).toBe('read');
    expect(result?.calls?.[0]?.tool).toBe('goal.list');
    expect(result?.thought).toContain('find the last failure');
  });

  it('does not corrupt structural whitespace (still parses to exact values)', () => {
    const raw = '{\n  "a": 1,\n  "b": "two"\n}';
    expect(parseLlmJson(raw)).toEqual({ a: 1, b: 'two' });
  });
});

describe('parseLlmJson — truncation repair', () => {
  it('closes an object truncated inside a string value', () => {
    const truncated = '{"complexity_score": 0.7, "complexity_reason": "requires extensive research and reasoning';
    const result = parseLlmJson(truncated);
    expect(result?.complexity_score).toBe(0.7);
    expect(result?.complexity_reason).toContain('requires extensive research');
  });

  it('closes nested objects/arrays left open by truncation', () => {
    const truncated = '{"a": 1, "feasibility": {"risk_factors": ["one", "two';
    const result = parseLlmJson(truncated);
    expect(result?.a).toBe(1);
    expect(Array.isArray(result?.feasibility?.risk_factors)).toBe(true);
    expect(result.feasibility.risk_factors[0]).toBe('one');
  });

  it('drops a dangling key that has no value yet', () => {
    const truncated = '{"strategy": "revised", "phases": [{"name": "Design"}], "confidence_score":';
    const result = parseLlmJson(truncated);
    expect(result?.strategy).toBe('revised');
    expect(result?.phases?.[0]?.name).toBe('Design');
  });

  it('drops a trailing comma before appended closers', () => {
    const truncated = '{"phases": [{"name": "A"}, ';
    const result = parseLlmJson(truncated);
    expect(result?.phases?.[0]?.name).toBe('A');
  });

  it('repairs a truncated array', () => {
    const truncated = '[{"name": "A"}, {"name": "B"';
    const result = parseLlmJson(truncated);
    expect(result?.[0]?.name).toBe('A');
    expect(result?.[1]?.name).toBe('B');
  });

  it('still returns null when there is no JSON to salvage', () => {
    expect(parseLlmJson('I could not complete that request.')).toBeNull();
  });
});
