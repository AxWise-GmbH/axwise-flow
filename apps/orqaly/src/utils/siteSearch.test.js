import { describe, it, expect } from 'vitest';
import { searchSite, buildSnippet } from './siteSearch';
import { buildSiteSearchIndex } from '../data/siteSearchIndex';

describe('siteSearch', () => {
  it('returns empty for blank query', () => {
    expect(searchSite('')).toEqual([]);
    expect(searchSite('   ')).toEqual([]);
  });

  it('finds Consilium in FAQ and related pages', () => {
    const results = searchSite('Consilium', { index: buildSiteSearchIndex() });
    expect(results.length).toBeGreaterThan(0);
    const titles = results.map((r) => r.entry.title);
    expect(titles.some((t) => /Consilium/i.test(t) || t.includes('Consilium'))).toBe(true);
  });

  it('requires all tokens for multi-word search', () => {
    const results = searchSite('agent hub', { index: buildSiteSearchIndex() });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const hay = `${r.entry.title} ${r.entry.text}`.toLowerCase();
      expect(hay).toContain('agent');
      expect(hay).toContain('hub');
    }
  });

  it('buildSnippet highlights matched terms', () => {
    const { parts } = buildSnippet('The Agent Hub unifies seven workspaces for agents.', 'Agent');
    expect(parts.some((p) => p.highlight && /agent/i.test(p.text))).toBe(true);
  });
});
