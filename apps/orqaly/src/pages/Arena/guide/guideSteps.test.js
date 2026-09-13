import { describe, it, expect } from 'vitest';
import { ARENA_GUIDE_STEPS } from './guideSteps';

describe('ARENA_GUIDE_STEPS', () => {
  it('walks the six steps in the order the story needs', () => {
    expect(ARENA_GUIDE_STEPS.map((s) => s.key)).toEqual([
      'departments',
      'stack',
      'connect',
      'briefs',
      'team',
      'rates',
    ]);
  });

  it('gives every step a card, an icon and copy', () => {
    for (const s of ARENA_GUIDE_STEPS) {
      expect(typeof s.Card).toBe('function');
      expect(s.icon).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.short).toBeTruthy();
      expect(s.desc).toBeTruthy();
    }
  });

  it('makes only the rates step optional', () => {
    const optional = ARENA_GUIDE_STEPS.filter((s) => !s.required).map((s) => s.key);
    expect(optional).toEqual(['rates']);
  });

  it('keeps the step copy free of jargon a non-technical person would trip on', () => {
    const jargon = /\b(API|OAuth|token|endpoint|webhook|SDK)\b/i;
    for (const s of ARENA_GUIDE_STEPS) {
      expect(s.label).not.toMatch(jargon);
      expect(s.desc).not.toMatch(jargon);
    }
  });
});
