import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({ buildSupabaseAdminClient: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => { res._status = status; res._body = { error: msg }; return res; }),
  handleApiError: vi.fn((res) => { res._status = 500; return res; }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
}));
vi.mock('./_shared/kb-usage.js', () => ({
  getConnectionUsage: vi.fn(async () => ({ ok: true, bytesUsed: 100, bytesTotal: 1000, docsCount: 5, latencyMs: 12 })),
  recordStorageSnapshot: vi.fn(async () => {}),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { recordStorageSnapshot } from './_shared/kb-usage.js';
import handler from './storage-monitor.js';

function makeRes() {
  return {
    _status: 200, _body: null, _headers: {},
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}
const makeReq = (method = 'GET', query = {}, body = {}) => ({ method, headers: {}, query, body });

// per-table terminal-await mock
function makeAdmin(results = {}) {
  return {
    from: vi.fn((table) => {
      const b = {
        select: vi.fn(function () { return this; }),
        eq: vi.fn(function () { return this; }),
        gte: vi.fn(function () { return this; }),
        order: vi.fn(function () { return this; }),
        limit: vi.fn(function () { return this; }),
        then: (cb, eb) => Promise.resolve(results[table] || { data: [] }).then(cb, eb),
      };
      return b;
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('storage-monitor handler', () => {
  it('401 when unauthenticated', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(401);
  });

  it('GET current assembles providers + overview', async () => {
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({
        kb_connections: { data: [{ id: 'c1', source_type: 'dropbox', mode: 'sync', enabled: true, last_sync_ok: true, credential_ref: { kind: 'byok' } }] },
        integration_credentials: { data: [] },
        audit_log: { data: [] },
      })
    );
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(200);
    expect(res._body.providers).toHaveLength(1);
    expect(res._body.providers[0]).toMatchObject({ source_type: 'dropbox', status: 'online', quotaPct: 10, bytesUsed: 100 });
    expect(res._body.overview).toMatchObject({ connected: 1, online: 1, totalBytesUsed: 100, totalDocs: 5 });
  });

  it('GET history aggregates snapshots per day', async () => {
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({
        storage_metric_snapshots: {
          data: [
            { snapshot_date: '2026-07-01', source_type: 'dropbox', bytes_used: 100, docs_count: 2 },
            { snapshot_date: '2026-07-01', source_type: 'onedrive', bytes_used: 50, docs_count: 1 },
          ],
        },
      })
    );
    const res = makeRes();
    await handler(makeReq('GET', { view: 'history', range: '30' }), res);
    expect(res._status).toBe(200);
    expect(res._body.series).toEqual([{ date: '2026-07-01', bytes_used: 150, docs_count: 3 }]);
  });

  it('POST action=snapshot records snapshots', async () => {
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({ kb_connections: { data: [{ id: 'c1', source_type: 'dropbox' }] } }));
    const res = makeRes();
    await handler(makeReq('POST', { action: 'snapshot' }), res);
    expect(res._status).toBe(200);
    expect(res._body.snapped).toBe(1);
    expect(recordStorageSnapshot).toHaveBeenCalled();
  });
});
