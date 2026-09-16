import { describe, expect, it } from 'vitest';
import { normalizeGoalComplexity } from './goal-complexity.js';

describe('normalizeGoalComplexity', () => {
  it.each([
    ['simple', 'simple'],
    ['low', 'simple'],
    ['medium', 'complex'],
    ['standard', 'complex'],
    ['moderate', 'complex'],
    ['advanced', 'complex'],
    ['unexpected', 'simple'],
  ])('maps %s to the production goals enum %s', (input, expected) => {
    expect(normalizeGoalComplexity(input)).toBe(expected);
  });
});
