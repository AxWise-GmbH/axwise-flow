/**
 * Guardrail test: every bundled skill must pass the Phase A validator.
 * If a bundled skill is ever edited to include an injection phrase,
 * this test fails before the seed hits production.
 */
import { describe, it, expect } from 'vitest';
import { BUNDLED_SKILLS } from '../../src/config/bundledSkills.js';
import { validateSkill } from './skill-validation.js';

describe('BUNDLED_SKILLS — all must pass validator', () => {
  it('has at least 20 bundled skills', () => {
    expect(BUNDLED_SKILLS.length).toBeGreaterThanOrEqual(20);
  });

  for (const skill of BUNDLED_SKILLS) {
    it(`passes validator: ${skill.slug}`, () => {
      const result = validateSkill({
        name: skill.name,
        description: skill.description,
        content: skill.content,
      });
      if (!result.ok) {
        // Surface the rule + excerpt in the failure message so it's easy to fix.
        throw new Error(
          `Skill "${skill.slug}" rejected by validator — rule: ${result.rule}, reason: ${result.reason}, excerpt: ${result.excerpt}`
        );
      }
      expect(result.ok).toBe(true);
    });
  }

  it('every skill has required fields', () => {
    for (const skill of BUNDLED_SKILLS) {
      expect(skill.slug).toMatch(/^[a-z0-9-]+$/);
      expect(skill.name).toBeTruthy();
      expect(skill.content).toBeTruthy();
      expect(skill.category).toBeTruthy();
      expect(Array.isArray(skill.compatible_roles)).toBe(true);
    }
  });

  it('covers multiple categories', () => {
    const cats = new Set(BUNDLED_SKILLS.map((s) => s.category));
    expect(cats.size).toBeGreaterThanOrEqual(5);
  });
});
