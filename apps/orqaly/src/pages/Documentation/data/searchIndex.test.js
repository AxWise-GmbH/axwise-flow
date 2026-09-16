import { describe, it, expect } from 'vitest';
import { buildDocSearchIndex, docId, TYPE_LABELS } from './searchIndex';
import { TABS } from './tabs';

describe('docId', () => {
  it('sanitizes keys into a stable DOM id', () => {
    expect(docId('env', 'ORQ_KEK_V1')).toBe('doc-env-ORQ-KEK-V1');
    expect(docId('page', '/agent-hub')).toBe('doc-page-agent-hub');
    expect(docId('faq', 3)).toBe('doc-faq-3');
  });
});

describe('buildDocSearchIndex', () => {
  const index = buildDocSearchIndex();
  const validTabs = new Set(TABS.map((t) => t.key));

  it('produces a non-trivial number of records', () => {
    expect(index.length).toBeGreaterThan(50);
  });

  it('gives every record a unique id, a non-empty title, and a valid tab', () => {
    const ids = new Set();
    for (const rec of index) {
      expect(rec.title).toBeTruthy();
      expect(validTabs.has(rec.tab)).toBe(true);
      expect(ids.has(rec.id)).toBe(false);
      ids.add(rec.id);
    }
  });

  it('covers every documented record type (guards against a dropped dataset)', () => {
    const types = new Set(index.map((r) => r.type));
    for (const type of Object.keys(TYPE_LABELS)) {
      expect(types.has(type)).toBe(true);
    }
  });
});
