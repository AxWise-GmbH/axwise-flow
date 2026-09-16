import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked lazily-imported megajs. Storage(opts).ready resolves to an object with
// a `root` tree and a `close` method (matches the real megajs shape closely).
const storageObj = {
  root: {
    children: [
      { directory: false, name: 'a.md', nodeId: 'n1', downloadBuffer: (cb) => cb(null, Buffer.from('hello mega')) },
      {
        directory: true,
        name: 'sub',
        children: [{ directory: false, name: 'skip.png', nodeId: 'n2', downloadBuffer: (cb) => cb(null, Buffer.from('img')) }],
      },
      { directory: false, name: 'b.txt', nodeId: 'n3', downloadBuffer: (cb) => cb(null, Buffer.from('world')) },
    ],
  },
  close: vi.fn(),
};
vi.mock('megajs', () => ({
  Storage: vi.fn(function () {
    this.ready = Promise.resolve(storageObj);
    this.close = storageObj.close;
  }),
}));

import { syncMegaToKb } from './mega-ingest.js';

function makeAdmin() {
  const inserts = [];
  return {
    inserts,
    from: vi.fn(() => ({
      select: vi.fn(function () { return this; }),
      eq: vi.fn(function () { return this; }),
      maybeSingle: vi.fn(async () => ({ data: null })),
      insert: vi.fn((r) => { inserts.push(r); return Promise.resolve({ error: null }); }),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    })),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('syncMegaToKb', () => {
  it('walks the tree and ingests only text files', async () => {
    const admin = makeAdmin();
    const out = await syncMegaToKb({ admin, userId: 'u1', creds: { email: 'e', password: 'p' }, connectionId: 'c1' });
    expect(out.count).toBe(2);
    const sources = admin.inserts.map((r) => r.source).sort();
    expect(sources).toEqual(['mega:n1', 'mega:n3']);
  });
});
