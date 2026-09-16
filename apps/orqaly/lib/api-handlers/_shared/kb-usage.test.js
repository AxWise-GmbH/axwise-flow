import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));
vi.mock('./kb-connection-auth.js', () => ({ resolveConnectionAuth: vi.fn() }));

import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { resolveConnectionAuth } from './kb-connection-auth.js';
import { getConnectionUsage, recordStorageSnapshot } from './kb-usage.js';

beforeEach(() => vi.clearAllMocks());

describe('getConnectionUsage', () => {
  it('returns docs-only (no API call) for a non-quota source', async () => {
    const out = await getConnectionUsage({ admin: {}, userId: 'u', conn: { source_type: 'notion', docs_synced_count: 5 } });
    expect(out).toMatchObject({ bytesUsed: null, bytesTotal: null, docsCount: 5, ok: true });
    expect(fetchWithRetry).not.toHaveBeenCalled();
    expect(resolveConnectionAuth).not.toHaveBeenCalled();
  });

  it('reads Dropbox quota via get_space_usage', async () => {
    resolveConnectionAuth.mockResolvedValue({ method: 'byok', token: 't' });
    fetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ used: 100, allocation: { allocated: 1000 } }) });
    const out = await getConnectionUsage({ admin: {}, userId: 'u', conn: { source_type: 'dropbox', docs_synced_count: 3 } });
    expect(out).toMatchObject({ bytesUsed: 100, bytesTotal: 1000, docsCount: 3, ok: true });
    expect(fetchWithRetry.mock.calls[0][0]).toContain('get_space_usage');
  });

  it('is fail-soft when the credential is missing', async () => {
    resolveConnectionAuth.mockRejectedValue(Object.assign(new Error('no key'), { status: 400 }));
    const out = await getConnectionUsage({ admin: {}, userId: 'u', conn: { source_type: 'dropbox', docs_synced_count: 0 } });
    expect(out.ok).toBe(false);
    expect(out.error).toContain('no key');
  });

  it('treats an unlimited Google Drive (no limit) as bytesTotal null', async () => {
    resolveConnectionAuth.mockResolvedValue({ method: 'byok', token: 't' });
    fetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ storageQuota: { usage: '42' } }) });
    const out = await getConnectionUsage({ admin: {}, userId: 'u', conn: { source_type: 'google-drive', docs_synced_count: 0 } });
    expect(out).toMatchObject({ bytesUsed: 42, bytesTotal: null, ok: true });
  });
});

describe('recordStorageSnapshot', () => {
  it('upserts a snapshot row keyed by day', async () => {
    let captured;
    const admin = {
      from: vi.fn(() => ({
        upsert: vi.fn((row, opts) => {
          captured = { row, opts };
          return { then: (cb, eb) => Promise.resolve({}).then(cb, eb) };
        }),
      })),
    };
    await recordStorageSnapshot({
      admin,
      userId: 'u',
      conn: { id: 'c1', user_id: 'u', source_type: 'dropbox', docs_synced_count: 4, last_sync_ok: true },
      usage: { bytesUsed: 10, bytesTotal: 100, docsCount: 4, latencyMs: 20 },
    });
    expect(captured.row).toMatchObject({ kb_connection_id: 'c1', source_type: 'dropbox', bytes_used: 10, bytes_total: 100, docs_count: 4 });
    expect(captured.opts.onConflict).toContain('snapshot_date');
  });
});
