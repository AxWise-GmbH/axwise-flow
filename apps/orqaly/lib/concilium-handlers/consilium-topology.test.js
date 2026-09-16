/**
 * Tests for the consilium-topology handler.
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

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './consilium-topology.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}
function makeReq(method = 'GET', query = {}, body = {}) {
  return { method, headers: {}, query, body };
}

// Flexible chained-query mock. `results[table][op]` -> { data, error }.
function resolveResult(table, op, results) {
  const entry = results[table] && results[table][op];
  const val = typeof entry === 'function' ? entry() : entry;
  return val || { data: null, error: null };
}
function makeAdmin(results = {}) {
  const from = vi.fn((table) => {
    const state = { table, op: 'select' };
    const resolve = () => resolveResult(table, state.op, results);
    const b = {
      select: vi.fn(function () { return this; }),
      insert: vi.fn(function () { state.op = 'insert'; return this; }),
      update: vi.fn(function () { state.op = 'update'; return this; }),
      delete: vi.fn(function () { state.op = 'delete'; return this; }),
      eq: vi.fn(function () { return this; }),
      order: vi.fn(function () { return this; }),
      limit: vi.fn(async () => resolve()),
      maybeSingle: vi.fn(async () => resolve()),
      single: vi.fn(async () => resolve()),
      then: (cb, eb) => Promise.resolve(resolve()).then(cb, eb),
    };
    return b;
  });
  return { from };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('consilium-topology handler', () => {
  it('returns 200 for OPTIONS', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('OPTIONS'), res);
    expect(res._status).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET', { op: 'get' }), res);
    expect(res._status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false });
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET', { op: 'get' }), res);
    expect(res._status).toBe(429);
  });

  it('returns 503 when database not configured', async () => {
    buildSupabaseAdminClient.mockReturnValue(null);
    const res = makeRes();
    await handler(makeReq('GET', { op: 'get' }), res);
    expect(res._status).toBe(503);
  });

  it('get returns the existing diagram', async () => {
    const diagram = { id: 'd1', current_version: 3, nodes: [], edges: [] };
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({ consilium_topology: { select: { data: diagram } } }));
    const res = makeRes();
    await handler(makeReq('GET', { op: 'get' }), res);
    expect(res._status).toBe(200);
    expect(res._body.diagram).toEqual(diagram);
  });

  it('get seeds a new diagram when none exists', async () => {
    const created = { id: 'd-new', current_version: 0, nodes: [], edges: [] };
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({
      // all seed source tables return empty
      consilium_topology: { select: { data: null }, insert: { data: created } },
    }));
    const res = makeRes();
    await handler(makeReq('GET', { op: 'get' }), res);
    expect(res._status).toBe(200);
    expect(res._body.diagram).toEqual(created);
  });

  it('save bumps the version, snapshots, and returns the new version', async () => {
    const diagram = { id: 'd1', current_version: 2, nodes: [], edges: [] };
    const updated = { ...diagram, current_version: 3 };
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({
      consilium_topology: { select: { data: diagram }, update: { data: updated } },
      consilium_topology_versions: { insert: { error: null } },
      consilium_topology_activity: { insert: { error: null } },
    }));
    const res = makeRes();
    await handler(makeReq('POST', { op: 'save' }, { nodes: [], edges: [], expectedVersion: 2 }), res);
    expect(res._status).toBe(200);
    expect(res._body.version).toBe(3);
    expect(res._body.diagram).toEqual(updated);
  });

  it('save returns 409 on a stale expectedVersion', async () => {
    const diagram = { id: 'd1', current_version: 5, nodes: [], edges: [] };
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({ consilium_topology: { select: { data: diagram } } }));
    const res = makeRes();
    await handler(makeReq('POST', { op: 'save' }, { nodes: [], edges: [], expectedVersion: 2 }), res);
    expect(res._status).toBe(409);
  });

  it('save returns 400 when nodes/edges are missing', async () => {
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({}));
    const res = makeRes();
    await handler(makeReq('POST', { op: 'save' }, { nodes: 'x' }), res);
    expect(res._status).toBe(400);
  });

  it('restore-version applies a snapshot as a new version', async () => {
    const diagram = { id: 'd1', current_version: 4, nodes: [], edges: [] };
    const updated = { ...diagram, current_version: 5 };
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({
      consilium_topology: { select: { data: diagram }, update: { data: updated } },
      consilium_topology_versions: { select: { data: { nodes: [], edges: [] } }, insert: { error: null } },
      consilium_topology_activity: { insert: { error: null } },
    }));
    const res = makeRes();
    await handler(makeReq('POST', { op: 'restore-version', version: '2' }), res);
    expect(res._status).toBe(200);
    expect(res._body.version).toBe(5);
  });

  it('list-versions returns version metadata', async () => {
    const diagram = { id: 'd1', current_version: 2 };
    const versions = [{ version: 2 }, { version: 1 }];
    let call = 0;
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({
      consilium_topology: { select: { data: diagram } },
      consilium_topology_versions: { select: () => (call++, { data: versions }) },
    }));
    const res = makeRes();
    await handler(makeReq('GET', { op: 'list-versions' }), res);
    expect(res._status).toBe(200);
    expect(res._body.versions).toEqual(versions);
  });

  it('list-activity returns the activity feed', async () => {
    const diagram = { id: 'd1' };
    const activity = [{ action: 'save' }];
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({
      consilium_topology: { select: { data: diagram } },
      consilium_topology_activity: { select: { data: activity } },
    }));
    const res = makeRes();
    await handler(makeReq('GET', { op: 'list-activity' }), res);
    expect(res._status).toBe(200);
    expect(res._body.activity).toEqual(activity);
  });

  it('returns 400 for an unknown op', async () => {
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({}));
    const res = makeRes();
    await handler(makeReq('GET', { op: 'bogus' }), res);
    expect(res._status).toBe(400);
  });
});
