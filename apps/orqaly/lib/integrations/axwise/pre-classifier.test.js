import { describe, expect, it } from 'vitest';
import { shouldEvaluate } from './pre-classifier.js';
import { buildCopilotContext, buildConsiliumCreateContext } from './context.js';

const tenant = { userId: 'u1', orgId: 'o1' };
const chat = (message) => buildCopilotContext({ requestId: 'r', tenant, message });

describe('axwise/pre-classifier shouldEvaluate', () => {
  it('always evaluates non-copilot points', () => {
    expect(shouldEvaluate(buildConsiliumCreateContext({ requestId: 'r', tenant, board: { name: 'B' } }))).toBe(true);
  });

  it('skips empty messages', () => {
    expect(shouldEvaluate(chat('   '))).toBe(false);
  });

  it('skips smalltalk', () => {
    expect(shouldEvaluate(chat('hello'))).toBe(false);
    expect(shouldEvaluate(chat('thanks'))).toBe(false);
  });

  it('skips billing/transactional questions', () => {
    expect(shouldEvaluate(chat('where is my invoice?'))).toBe(false);
    expect(shouldEvaluate(chat('I want a refund'))).toBe(false);
  });

  it('evaluates substantive requests', () => {
    expect(shouldEvaluate(chat('Draft a launch plan for our new fintech product'))).toBe(true);
  });

  it('returns false for malformed context', () => {
    expect(shouldEvaluate(null)).toBe(false);
    expect(shouldEvaluate({})).toBe(false);
  });
});
