import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { syncOneDriveToKb } from './onedrive-ingest.js';

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

describe('syncOneDriveToKb', () => {
  it('walks folders, downloads text files, dedupes by onedrive:<id>', async () => {
    fetchWithRetry.mockImplementation((url) => {
      if (url.includes('/me/drive/root/children')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            value: [
              { id: '1', name: 'a.txt', file: { mimeType: 'text/plain' }, '@microsoft.graph.downloadUrl': 'https://dl/a', webUrl: 'https://od/a' },
              { id: 'F', name: 'folder', folder: {} },
              { id: '3', name: 'c.png', file: { mimeType: 'image/png' } },
            ],
          }),
        });
      }
      if (url.includes('/me/drive/items/F/children')) {
        return Promise.resolve({ ok: true, json: async () => ({ value: [] }) });
      }
      if (url.startsWith('https://dl/')) {
        return Promise.resolve({ ok: true, text: async () => 'hello onedrive' });
      }
      return Promise.resolve({ ok: false });
    });

    const admin = makeAdmin();
    const out = await syncOneDriveToKb({ admin, userId: 'u1', token: 'tok', connectionId: 'c1' });
    expect(out.count).toBe(1);
    expect(admin.inserts[0].source).toBe('onedrive:1');
    expect(admin.inserts[0].metadata.url).toBe('https://od/a');
  });

  it('throws with .status on a 401', async () => {
    fetchWithRetry.mockResolvedValue({ ok: false, status: 401, text: async () => 'nope' });
    await expect(syncOneDriveToKb({ admin: makeAdmin(), userId: 'u1', token: 'bad' })).rejects.toMatchObject({ status: 401 });
  });
});
