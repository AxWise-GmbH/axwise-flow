import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { syncGoogleDriveToKb } from './google-drive-ingest.js';

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

describe('syncGoogleDriveToKb', () => {
  it('exports native docs and downloads text files', async () => {
    fetchWithRetry.mockImplementation((url) => {
      if (url.includes('/files?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            files: [
              { id: '1', name: 'Doc', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://g/1' },
              { id: '2', name: 'note.md', mimeType: 'text/markdown' },
              { id: '3', name: 'pic.png', mimeType: 'image/png' },
            ],
            nextPageToken: null,
          }),
        });
      }
      if (url.includes('/export')) return Promise.resolve({ ok: true, text: async () => 'exported doc' });
      if (url.includes('alt=media')) return Promise.resolve({ ok: true, text: async () => 'md body' });
      return Promise.resolve({ ok: false });
    });

    const admin = makeAdmin();
    const out = await syncGoogleDriveToKb({ admin, userId: 'u1', token: 'tok', connectionId: 'c1' });
    expect(out.count).toBe(2);
    const sources = admin.inserts.map((r) => r.source).sort();
    expect(sources).toEqual(['gdrive:1', 'gdrive:2']);
  });

  it('scopes the query to a folder when provided', async () => {
    fetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ files: [], nextPageToken: null }) });
    await syncGoogleDriveToKb({ admin: makeAdmin(), userId: 'u1', token: 'tok', scope: { folderId: 'FOLDER' } });
    const url = fetchWithRetry.mock.calls[0][0];
    expect(decodeURIComponent(url)).toContain("'FOLDER' in parents");
  });
});
