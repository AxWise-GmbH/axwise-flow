/**
 * Tests for the kb-connections handler (unified dispatch + capabilities + Zod).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({ buildSupabaseAdminClient: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res) => {
    res._status = 500;
    res._body = { error: 'internal' };
    return res;
  }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: vi.fn(() => vi.fn()) }),
}));
vi.mock('./_shared/kb-sync-dispatch.js', () => ({ runConnectionSync: vi.fn(async () => 3) }));
vi.mock('./_shared/kb-connection-auth.js', () => ({
  resolveConnectionAuth: vi.fn(async () => ({ method: 'byok', token: 'x' })),
  BYOK_PROVIDER: {
    notion: 'data:notion',
    dropbox: 'data:dropbox',
    onedrive: 'data:onedrive',
    'google-drive': 'data:google-drive',
    mega: 'data:mega',
  },
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { runConnectionSync } from './_shared/kb-sync-dispatch.js';
import { resolveConnectionAuth } from './_shared/kb-connection-auth.js';
import handler from './kb-connections.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}
const makeReq = (method = 'GET', query = {}, body = {}) => ({ method, headers: {}, query, body });

// op-keyed chainable mock: results[table][op] -> { data, error }
function makeAdmin(results = {}) {
  const from = vi.fn((table) => {
    const state = { table, op: 'select' };
    const resolve = () => {
      const e = results[table] && results[table][state.op];
      return (typeof e === 'function' ? e() : e) || { data: null, error: null };
    };
    const b = {
      select: vi.fn(function () { return this; }),
      insert: vi.fn(function () { state.op = 'insert'; return this; }),
      update: vi.fn(function () { state.op = 'update'; return this; }),
      delete: vi.fn(function () { state.op = 'delete'; return this; }),
      eq: vi.fn(function () { return this; }),
      in: vi.fn(function () { return this; }),
      not: vi.fn(function () { return this; }),
      order: vi.fn(function () { return this; }),
      maybeSingle: vi.fn(async () => resolve()),
      single: vi.fn(async () => resolve()),
      then: (cb, eb) => Promise.resolve(resolve()).then(cb, eb),
    };
    return b;
  });
  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveConnectionAuth.mockResolvedValue({ method: 'byok', token: 'x' });
  runConnectionSync.mockResolvedValue(3);
});
afterEach(() => vi.restoreAllMocks());

describe('kb-connections handler', () => {
  it('401 when unauthenticated', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(401);
  });

  it('GET lists connections and returns a capabilities map', async () => {
    const rows = [{ id: 'c1', source_type: 'notion', mode: 'sync' }];
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ kb_connections: { select: { data: rows } }, user_api_keys: { select: { data: [] } } })
    );
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(200);
    expect(res._body.connections).toEqual(rows);
    expect(res._body.capabilities.dropbox.methods).toContain('oauth');
    expect(res._body.capabilities.mega.methods).toEqual(['byok', 'import']);
  });

  it('GET marks a source byokPresent when the user has a saved key', async () => {
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({
        kb_connections: { select: { data: [] } },
        user_api_keys: { select: { data: [{ provider: 'data:dropbox' }] } },
      })
    );
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._body.capabilities.dropbox.byokPresent).toBe(true);
    expect(res._body.capabilities.onedrive.byokPresent).toBe(false);
  });

  it('POST creates a connection when none exists', async () => {
    const created = { id: 'c-new', source_type: 'notion', mode: 'sync' };
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ kb_connections: { select: { data: null }, insert: { data: created } } })
    );
    const res = makeRes();
    await handler(makeReq('POST', {}, { source_type: 'notion', mode: 'sync' }), res);
    expect(res._status).toBe(200);
    expect(res._body.connection).toEqual(created);
  });

  it('POST now accepts dropbox as a valid source', async () => {
    const created = { id: 'c-dbx', source_type: 'dropbox', mode: 'sync' };
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ kb_connections: { select: { data: null }, insert: { data: created } } })
    );
    const res = makeRes();
    await handler(makeReq('POST', {}, { source_type: 'dropbox', mode: 'sync' }), res);
    expect(res._status).toBe(200);
    expect(res._body.connection).toEqual(created);
  });

  it('POST rejects an unknown source_type (Zod)', async () => {
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({}));
    const res = makeRes();
    await handler(makeReq('POST', {}, { source_type: 'ftp' }), res);
    expect(res._status).toBe(400);
  });

  it('POST rejects live mode for a download-only source', async () => {
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({}));
    const res = makeRes();
    await handler(makeReq('POST', {}, { source_type: 'dropbox', mode: 'live' }), res);
    expect(res._status).toBe(400);
  });

  it('sync runs the dispatcher and returns the count', async () => {
    runConnectionSync.mockResolvedValueOnce(5);
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ kb_connections: { select: { data: { id: 'c1', source_type: 'dropbox' } }, update: {} } })
    );
    const res = makeRes();
    await handler(makeReq('POST', { action: 'sync', id: 'c1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.synced).toBe(5);
    expect(runConnectionSync).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  it('sync surfaces a 400 from the dispatcher (import-only / no credential)', async () => {
    const err = new Error('dropbox is set to file import');
    err.status = 400;
    runConnectionSync.mockRejectedValueOnce(err);
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ kb_connections: { select: { data: { id: 'c2', source_type: 'dropbox' } } } })
    );
    const res = makeRes();
    await handler(makeReq('POST', { action: 'sync', id: 'c2' }), res);
    expect(res._status).toBe(400);
  });

  it('test action reports method when the credential resolves', async () => {
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ kb_connections: { select: { data: { id: 'c1', source_type: 'dropbox' } } } })
    );
    const res = makeRes();
    await handler(makeReq('POST', { action: 'test', id: 'c1' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true, method: 'byok' });
  });

  it('test action reports ok:false when the credential is missing', async () => {
    const err = new Error('No dropbox credential connected.');
    err.status = 400;
    resolveConnectionAuth.mockRejectedValueOnce(err);
    buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ kb_connections: { select: { data: { id: 'c1', source_type: 'dropbox' } } } })
    );
    const res = makeRes();
    await handler(makeReq('POST', { action: 'test', id: 'c1' }), res);
    expect(res._body.ok).toBe(false);
  });

  it('DELETE removes a connection', async () => {
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({ kb_connections: { delete: {} } }));
    const res = makeRes();
    await handler(makeReq('DELETE', { id: 'c1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.deleted).toBe(true);
  });
});
