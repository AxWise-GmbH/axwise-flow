import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./kb-connection-auth.js', () => ({ resolveConnectionAuth: vi.fn() }));
vi.mock('./notion-ingest.js', () => ({ syncNotionToKb: vi.fn(async () => ({ count: 3 })) }));
vi.mock('./dropbox-ingest.js', () => ({ syncDropboxToKb: vi.fn(async () => ({ count: 4 })) }));
vi.mock('./onedrive-ingest.js', () => ({ syncOneDriveToKb: vi.fn(async () => ({ count: 5 })) }));
vi.mock('./google-drive-ingest.js', () => ({ syncGoogleDriveToKb: vi.fn(async () => ({ count: 6 })) }));
vi.mock('./mega-ingest.js', () => ({ syncMegaToKb: vi.fn(async () => ({ count: 7 })) }));

import { resolveConnectionAuth } from './kb-connection-auth.js';
import { syncDropboxToKb } from './dropbox-ingest.js';
import { syncMegaToKb } from './mega-ingest.js';
import { runConnectionSync } from './kb-sync-dispatch.js';

beforeEach(() => {
  vi.clearAllMocks();
  resolveConnectionAuth.mockResolvedValue({ method: 'byok', token: 'tok' });
});

describe('runConnectionSync', () => {
  it('rejects import-only sources with 400', async () => {
    await expect(runConnectionSync({ admin: {}, userId: 'u', conn: { source_type: 'obsidian' } })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a connection whose method is none (import mode) with 400', async () => {
    resolveConnectionAuth.mockResolvedValueOnce({ method: 'none' });
    await expect(runConnectionSync({ admin: {}, userId: 'u', conn: { source_type: 'dropbox' } })).rejects.toMatchObject({ status: 400 });
  });

  it('dispatches Dropbox with the resolved token + scope', async () => {
    const count = await runConnectionSync({ admin: { a: 1 }, userId: 'u', conn: { id: 'c1', source_type: 'dropbox', scope: { path: '/x' } } });
    expect(count).toBe(4);
    expect(syncDropboxToKb).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok', connectionId: 'c1', scope: { path: '/x' } }));
  });

  it('dispatches Mega with resolved creds', async () => {
    resolveConnectionAuth.mockResolvedValueOnce({ method: 'byok', creds: { email: 'e', password: 'p' } });
    const count = await runConnectionSync({ admin: {}, userId: 'u', conn: { id: 'c9', source_type: 'mega' } });
    expect(count).toBe(7);
    expect(syncMegaToKb).toHaveBeenCalledWith(expect.objectContaining({ creds: { email: 'e', password: 'p' }, connectionId: 'c9' }));
  });
});
