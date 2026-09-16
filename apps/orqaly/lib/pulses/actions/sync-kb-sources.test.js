import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api-handlers/_shared/kb-sync-dispatch.js', () => ({ runConnectionSync: vi.fn() }));
import { runConnectionSync } from '../../api-handlers/_shared/kb-sync-dispatch.js';
import { handleSyncKbSources } from './sync-kb-sources.js';

// select('*').eq().eq().eq() resolves to { data: conns }; update().eq() is a no-op.
function makeAdmin(conns) {
  const updates = [];
  return {
    updates,
    from: vi.fn(() => {
      const b = {
        select: vi.fn(function () { return this; }),
        update: vi.fn(function (p) { updates.push(p); return this; }),
        eq: vi.fn(function () { return this; }),
        then: (cb, eb) => Promise.resolve({ data: conns }).then(cb, eb),
      };
      return b;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runConnectionSync.mockResolvedValue(3);
});

describe('handleSyncKbSources', () => {
  it('skips connections without an interval (not due)', async () => {
    const out = await handleSyncKbSources(makeAdmin([{ id: 'c1', user_id: 'u1', source_type: 'dropbox', sync_interval_secs: null }]));
    expect(out).toMatchObject({ due: 0, ran: 0 });
    expect(runConnectionSync).not.toHaveBeenCalled();
  });

  it('runs a due connection via the dispatcher and records success', async () => {
    const admin = makeAdmin([{ id: 'c1', user_id: 'u1', source_type: 'dropbox', sync_interval_secs: 86400, last_synced_at: null }]);
    const out = await handleSyncKbSources(admin);
    expect(runConnectionSync).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(out).toMatchObject({ due: 1, ran: 1, synced: 3, failed: 0 });
    expect(admin.updates.some((u) => u.last_sync_ok === true && u.docs_synced_count === 3)).toBe(true);
  });

  it('counts a 4xx (import-only / no credential) as skipped, not failed', async () => {
    const err = new Error('import only');
    err.status = 400;
    runConnectionSync.mockRejectedValueOnce(err);
    const out = await handleSyncKbSources(
      makeAdmin([{ id: 'c1', user_id: 'u1', source_type: 'dropbox', sync_interval_secs: 86400, last_synced_at: null }])
    );
    expect(out).toMatchObject({ ran: 0, skipped: 1, failed: 0 });
  });

  it('records a 5xx failure', async () => {
    runConnectionSync.mockRejectedValueOnce(new Error('boom'));
    const admin = makeAdmin([{ id: 'c1', user_id: 'u1', source_type: 'dropbox', sync_interval_secs: 86400, last_synced_at: null }]);
    const out = await handleSyncKbSources(admin);
    expect(out).toMatchObject({ failed: 1 });
    expect(admin.updates.some((u) => u.last_sync_ok === false)).toBe(true);
  });
});
