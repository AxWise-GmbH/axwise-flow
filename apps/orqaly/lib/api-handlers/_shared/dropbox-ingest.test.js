import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { syncDropboxToKb } from './dropbox-ingest.js';

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

describe('syncDropboxToKb', () => {
  it('ingests only text files and dedupes by dropbox:<id>', async () => {
    fetchWithRetry.mockImplementation((url) => {
      if (url.includes('/files/list_folder')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            entries: [
              { '.tag': 'file', id: 'id:1', name: 'notes.md' },
              { '.tag': 'folder', name: 'sub' },
              { '.tag': 'file', id: 'id:2', name: 'pic.png' },
            ],
            has_more: false,
          }),
        });
      }
      if (url.includes('/files/download')) {
        return Promise.resolve({ ok: true, text: async () => '# Notes\nbody' });
      }
      return Promise.resolve({ ok: false });
    });

    const admin = makeAdmin();
    const out = await syncDropboxToKb({ admin, userId: 'u1', token: 'tok', connectionId: 'c1' });
    expect(out.count).toBe(1);
    expect(admin.inserts).toHaveLength(1);
    expect(admin.inserts[0].source).toBe('dropbox:id:1');
  });

  it('throws with .status on a 401', async () => {
    fetchWithRetry.mockResolvedValue({ ok: false, status: 401, text: async () => 'nope' });
    await expect(syncDropboxToKb({ admin: makeAdmin(), userId: 'u1', token: 'bad' })).rejects.toMatchObject({ status: 401 });
  });
});
