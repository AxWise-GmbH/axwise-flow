import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the token verifier and admin client the guard depends on. getBearerToken is
// reimplemented (trivial) so we can drive it from req.headers in each case.
const verifySupabaseToken = vi.fn();
vi.mock('./auth.js', () => ({
  getBearerToken: (req) => {
    const h = req.headers?.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : null;
  },
  verifySupabaseToken: (...args) => verifySupabaseToken(...args),
}));

const maybeSingle = vi.fn();
const buildSupabaseAdminClient = vi.fn();
vi.mock('./supabase-server.js', () => ({
  buildSupabaseAdminClient: (...args) => buildSupabaseAdminClient(...args),
}));

import { enforceDemoWriteGuard, _resetDemoGuardCache } from './demo-guard.js';

const DEMO_ID = 'demo-user-1';

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = vi.fn((c) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b) => {
    res.body = b;
    return res;
  });
  return res;
}

function makeReq({ method = 'POST', token = 'tok', query = {} } = {}) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    query,
  };
}

function stubAdminRole(roleId) {
  maybeSingle.mockResolvedValue({ data: roleId ? { role_id: roleId } : null });
  buildSupabaseAdminClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  });
}

describe('enforceDemoWriteGuard', () => {
  beforeEach(() => {
    _resetDemoGuardCache();
    process.env.DEMO_USER_IDS = DEMO_ID;
    delete process.env.DEMO_GUARD_BLOCK_ALL_VIEWERS;
    verifySupabaseToken.mockReset().mockResolvedValue({ id: DEMO_ID });
    buildSupabaseAdminClient.mockReset();
    maybeSingle.mockReset();
  });

  afterEach(() => {
    delete process.env.DEMO_USER_IDS;
    delete process.env.DEMO_GUARD_BLOCK_ALL_VIEWERS;
  });

  it('allows GET for the demo user without touching the response', async () => {
    const res = makeRes();
    const blocked = await enforceDemoWriteGuard(makeReq({ method: 'GET' }), res);
    expect(blocked).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows OPTIONS and HEAD', async () => {
    for (const method of ['OPTIONS', 'HEAD']) {
      const res = makeRes();
      expect(await enforceDemoWriteGuard(makeReq({ method }), res)).toBe(false);
    }
  });

  it('passes through requests with no bearer token (cron/webhook)', async () => {
    const res = makeRes();
    const blocked = await enforceDemoWriteGuard(makeReq({ token: null }), res);
    expect(blocked).toBe(false);
    expect(verifySupabaseToken).not.toHaveBeenCalled();
  });

  it('passes through when the token cannot be verified', async () => {
    verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    expect(await enforceDemoWriteGuard(makeReq(), res)).toBe(false);
  });

  it('blocks a demo user POST write with 403 and a clear message', async () => {
    const res = makeRes();
    const blocked = await enforceDemoWriteGuard(makeReq({ query: { path: 'boards' } }), res);
    expect(blocked).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toMatch(/read-only demo/i);
  });

  it('blocks demo DELETE too', async () => {
    const res = makeRes();
    const blocked = await enforceDemoWriteGuard(
      makeReq({ method: 'DELETE', query: { path: 'contacts' } }),
      res
    );
    expect(blocked).toBe(true);
    expect(res.statusCode).toBe(403);
  });

  it('allows a read-over-POST on the allowlist (knowledge-base:search)', async () => {
    const res = makeRes();
    const blocked = await enforceDemoWriteGuard(
      makeReq({ query: { path: 'knowledge-base', op: 'search' } }),
      res
    );
    expect(blocked).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows a read-over-POST matched via the sub param (contacts:find-matches)', async () => {
    const res = makeRes();
    const blocked = await enforceDemoWriteGuard(
      makeReq({ query: { path: 'contacts', sub: 'find-matches' } }),
      res
    );
    expect(blocked).toBe(false);
  });

  it('does NOT block a non-demo user writing', async () => {
    verifySupabaseToken.mockResolvedValue({ id: 'someone-else' });
    const res = makeRes();
    const blocked = await enforceDemoWriteGuard(makeReq({ query: { path: 'boards' } }), res);
    expect(blocked).toBe(false);
  });

  it('blocks a role-viewer write only when DEMO_GUARD_BLOCK_ALL_VIEWERS=true', async () => {
    verifySupabaseToken.mockResolvedValue({ id: 'viewer-42' });
    stubAdminRole('role-viewer');

    // Flag off: a viewer who is not in DEMO_USER_IDS may still write.
    let res = makeRes();
    expect(await enforceDemoWriteGuard(makeReq({ query: { path: 'boards' } }), res)).toBe(false);

    // Flag on: viewer is treated as demo and blocked.
    process.env.DEMO_GUARD_BLOCK_ALL_VIEWERS = 'true';
    _resetDemoGuardCache();
    res = makeRes();
    expect(await enforceDemoWriteGuard(makeReq({ query: { path: 'boards' } }), res)).toBe(true);
    expect(res.statusCode).toBe(403);
  });

  it('caches the role lookup within its TTL (one DB hit for repeated calls)', async () => {
    process.env.DEMO_GUARD_BLOCK_ALL_VIEWERS = 'true';
    verifySupabaseToken.mockResolvedValue({ id: 'viewer-99' });
    stubAdminRole('role-viewer');

    await enforceDemoWriteGuard(makeReq({ query: { path: 'boards' } }), makeRes());
    await enforceDemoWriteGuard(makeReq({ query: { path: 'boards' } }), makeRes());

    expect(buildSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
