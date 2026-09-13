import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api-handlers/_shared/kb-usage.js', () => ({
  getConnectionUsage: vi.fn(),
  recordStorageSnapshot: vi.fn(async () => {}),
}));
vi.mock('../../notifications/dispatch.js', () => ({ notifyUser: vi.fn(async () => {}) }));

import { getConnectionUsage, recordStorageSnapshot } from '../../api-handlers/_shared/kb-usage.js';
import { notifyUser } from '../../notifications/dispatch.js';
import { handleSnapshotStorageMetrics } from './snapshot-storage-metrics.js';

function makeAdmin(conns) {
  return {
    from: vi.fn(() => {
      const b = {
        select: vi.fn(function () { return this; }),
        eq: vi.fn(function () { return this; }),
        then: (cb, eb) => Promise.resolve({ data: conns }).then(cb, eb),
      };
      return b;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConnectionUsage.mockResolvedValue({ ok: true, bytesUsed: 10, bytesTotal: 100, docsCount: 2, latencyMs: 5 });
});

describe('handleSnapshotStorageMetrics', () => {
  it('snapshots every enabled connection', async () => {
    const admin = makeAdmin([
      { id: 'c1', user_id: 'u1', source_type: 'dropbox' },
      { id: 'c2', user_id: 'u1', source_type: 'onedrive' },
    ]);
    const out = await handleSnapshotStorageMetrics(admin);
    expect(out).toMatchObject({ status: 'done', snapped: 2, alerts: 0 });
    expect(recordStorageSnapshot).toHaveBeenCalledTimes(2);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('fires a storage-almost-full alert past 90%', async () => {
    getConnectionUsage.mockResolvedValue({ ok: true, bytesUsed: 95, bytesTotal: 100, docsCount: 0, latencyMs: 5 });
    const admin = makeAdmin([{ id: 'c1', user_id: 'u1', source_type: 'dropbox' }]);
    const out = await handleSnapshotStorageMetrics(admin);
    expect(out.alerts).toBe(1);
    expect(notifyUser).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ priority: 'high' }));
  });
});
