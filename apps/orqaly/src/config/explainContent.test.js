import { describe, it, expect } from 'vitest';
import { slugifyTitle, resolveExplain, EXPLAIN_CONTENT } from './explainContent';

describe('slugifyTitle', () => {
  it('slugs titles the same way BentoCard marks them', () => {
    expect(slugifyTitle('Key Stats')).toBe('key-stats');
    expect(slugifyTitle('Connected sources')).toBe('connected-sources');
    expect(slugifyTitle('  Storage Monitor!  ')).toBe('storage-monitor');
    expect(slugifyTitle('')).toBe('');
  });
});

describe('resolveExplain', () => {
  it('returns a route entry with block-by-block content', () => {
    expect(resolveExplain('/organizations')?.blocks?.['org-toolbar']).toBeTruthy();
    expect(resolveExplain('/knowledge-base')?.blocks?.['connected-sources']).toBeTruthy();
  });
  it('falls back to the parent route', () => {
    expect(resolveExplain('/knowledge-base/anything')?.blocks?.['storage-monitor']).toBeTruthy();
  });
  it('returns null for an unknown route', () => {
    expect(resolveExplain('/no-such-page')).toBeNull();
    expect(resolveExplain('')).toBeNull();
  });
});

describe('EXPLAIN_CONTENT quality', () => {
  // Every marked section across the pages should have real, non-empty copy.
  const EXPECTED = {
    '/organizations': ['org-metrics', 'org-tabs', 'org-toolbar', 'org-content'],
    '/consilium': ['consilium-metrics', 'consilium-tabs', 'consilium-content'],
    '/agent-hub': ['agent-metrics', 'agent-tabs', 'agent-toolbar', 'agent-content'],
    '/tools': ['tools-metrics', 'tools-toolbar', 'tools-content'],
    '/knowledge-base': ['kb-metrics', 'kb-toolbar', 'kb-content', 'connected-sources', 'storage-monitor'],
    '/communicator': ['communicator-metrics', 'communicator-view-tabs', 'communicator-sidebar', 'communicator-content'],
    '/marketplace': ['marketplace-metrics', 'marketplace-tabs', 'marketplace-content'],
    '/workflow': ['workflow-toolbar', 'workflow-content'],
    '/reports': ['reports-tab-nav', 'reports-ai-builder'],
    '/dashboard': ['dashboard-hero', 'dashboard-kpi', 'dashboard-categories', 'dashboard-history'],
    '/job-pool': ['jobpool-tabs', 'jobpool-metrics', 'jobpool-toolbar', 'jobpool-content'],
  };

  for (const [route, ids] of Object.entries(EXPECTED)) {
    it(`${route} has non-empty title + how for each block`, () => {
      const blocks = EXPLAIN_CONTENT[route]?.blocks || {};
      for (const id of ids) {
        expect(blocks[id], `${route} -> ${id}`).toBeTruthy();
        expect(blocks[id].title.length).toBeGreaterThan(0);
        expect(blocks[id].how.length).toBeGreaterThan(20);
      }
    });
  }
});
