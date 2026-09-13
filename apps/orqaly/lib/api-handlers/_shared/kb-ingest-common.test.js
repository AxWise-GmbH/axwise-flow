import { describe, it, expect, vi } from 'vitest';
import { isTextFile, extOf, titleFromPath, upsertKbDoc, ingestItems, MAX_FILES } from './kb-ingest-common.js';

function makeAdmin({ existing = null } = {}) {
  const inserts = [];
  const updates = [];
  const admin = {
    inserts,
    updates,
    from: vi.fn(() => ({
      select: vi.fn(function () { return this; }),
      eq: vi.fn(function () { return this; }),
      maybeSingle: vi.fn(async () => ({ data: existing })),
      insert: vi.fn((row) => { inserts.push(row); return Promise.resolve({ error: null }); }),
      update: vi.fn((row) => { updates.push(row); return { eq: vi.fn(() => Promise.resolve({ error: null })) }; }),
    })),
  };
  return admin;
}

describe('kb-ingest-common helpers', () => {
  it('extOf + isTextFile classify by extension and mime', () => {
    expect(extOf('notes.MD')).toBe('md');
    expect(isTextFile('a.md')).toBe(true);
    expect(isTextFile('a.csv')).toBe(true);
    expect(isTextFile('photo.png')).toBe(false);
    expect(isTextFile('blob', 'text/plain')).toBe(true);
    expect(isTextFile('blob', 'image/png')).toBe(false);
  });

  it('titleFromPath strips folders and extension', () => {
    expect(titleFromPath('/a/b/report.md')).toBe('report');
  });
});

describe('upsertKbDoc', () => {
  it('inserts a new doc and returns "inserted"', async () => {
    const admin = makeAdmin({ existing: null });
    const out = await upsertKbDoc({ admin, userId: 'u1', source: 'dropbox:1', title: 'T', content: 'hello world', connectionId: 'c1' });
    expect(out).toBe('inserted');
    expect(admin.inserts).toHaveLength(1);
    expect(admin.inserts[0].source).toBe('dropbox:1');
    expect(admin.inserts[0].metadata.kb_connection_id).toBe('c1');
  });

  it('updates when a doc with the same source exists', async () => {
    const admin = makeAdmin({ existing: { id: 'doc-1' } });
    const out = await upsertKbDoc({ admin, userId: 'u1', source: 'dropbox:1', title: 'T', content: 'hi there' });
    expect(out).toBe('updated');
    expect(admin.updates).toHaveLength(1);
  });

  it('skips empty content', async () => {
    const admin = makeAdmin();
    const out = await upsertKbDoc({ admin, userId: 'u1', source: 'x:1', title: 'T', content: '   ' });
    expect(out).toBe('skipped');
    expect(admin.inserts).toHaveLength(0);
  });
});

describe('ingestItems', () => {
  it('caps at MAX_FILES and reports truncation', async () => {
    const admin = makeAdmin();
    const items = Array.from({ length: MAX_FILES + 3 }, (_, i) => ({ source: `s:${i}`, title: `t${i}`, content: 'body text' }));
    const { count, truncated } = await ingestItems({ admin, userId: 'u1', sourceTag: 'dropbox', items });
    expect(truncated).toBe(true);
    expect(count).toBe(MAX_FILES);
    expect(admin.inserts).toHaveLength(MAX_FILES);
  });
});
