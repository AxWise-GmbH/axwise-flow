import { describe, it, expect } from 'vitest';
import { ASSISTANT_EXPLAIN } from './assistantExplainContent';

// Mirror of ASSISTANT_BLOCK_DEFS ids in AssistantPage.jsx (kept in sync here so
// this test does not import the heavy page module).
const BLOCK_IDS = [
  'profile',
  'voice',
  'channels',
  'communication',
  'data',
  'contacts',
  'brief',
  'team',
  'insights',
  'conversations',
  'usage',
];

// openEdit() step vocabulary in AssistantPage.jsx.
const KNOWN_STEPS = ['keys', 'channel', 'voice', 'data', 'brief', 'insights'];

describe('assistantExplainContent', () => {
  it('has an explanation entry for every Assistant block', () => {
    for (const id of BLOCK_IDS) {
      const entry = ASSISTANT_EXPLAIN[id];
      expect(entry, `missing explain copy for "${id}"`).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.how).toBeTruthy();
      expect(entry.source).toBeTruthy();
      expect(Array.isArray(entry.needs)).toBe(true);
      expect(entry.needs.length).toBeGreaterThan(0);
    }
  });

  it('has a valid CTA for every block (label + exactly one of step|to)', () => {
    for (const id of BLOCK_IDS) {
      const { cta } = ASSISTANT_EXPLAIN[id];
      expect(cta, `missing cta for "${id}"`).toBeTruthy();
      expect(cta.label).toBeTruthy();
      const hasStep = typeof cta.step === 'string';
      const hasTo = typeof cta.to === 'string';
      expect(hasStep !== hasTo, `cta for "${id}" needs exactly one of step|to`).toBe(true);
      if (hasStep) expect(KNOWN_STEPS, `bad step for "${id}"`).toContain(cta.step);
      if (hasTo) expect(cta.to).toMatch(/^\//);
    }
  });

  it('does not use em or en dashes (project style rule)', () => {
    expect(JSON.stringify(ASSISTANT_EXPLAIN)).not.toMatch(/[–—]/);
  });
});
