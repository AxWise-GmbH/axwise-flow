import { describe, it, expect } from 'vitest';
import { HOME_EXPLAIN } from './homeExplainContent';
import { HOME_BLOCK_DEFS } from './homeTemplates';

describe('homeExplainContent', () => {
  it('has an explanation entry for every Home block', () => {
    for (const block of HOME_BLOCK_DEFS) {
      const entry = HOME_EXPLAIN[block.id];
      expect(entry, `missing explain copy for "${block.id}"`).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.how).toBeTruthy();
      expect(entry.source).toBeTruthy();
      expect(Array.isArray(entry.needs)).toBe(true);
      expect(entry.needs.length).toBeGreaterThan(0);
    }
  });

  it('has a valid CTA for every Home block', () => {
    for (const block of HOME_BLOCK_DEFS) {
      const { cta } = HOME_EXPLAIN[block.id];
      expect(cta, `missing cta for "${block.id}"`).toBeTruthy();
      expect(cta.label).toBeTruthy();
      expect(['quick-action', 'navigate']).toContain(cta.kind);
      if (cta.kind === 'quick-action') {
        expect(['org', 'keys', 'assistant'], `bad action for "${block.id}"`).toContain(cta.action);
      } else {
        expect(cta.to, `navigate cta for "${block.id}" needs a 'to'`).toMatch(/^\//);
        expect(cta.to).toContain('action=create');
      }
    }
  });

  it('does not use em or en dashes (project style rule)', () => {
    const text = JSON.stringify(HOME_EXPLAIN);
    expect(text).not.toMatch(/[–—]/);
  });
});
