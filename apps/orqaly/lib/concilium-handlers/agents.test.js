/**
 * Tests for concilium agents handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res, _err, _ctx) => {
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
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import handler from './agents.js';

// ── Helpers ───────────────────────────────────────────────────────

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

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────

describe('agents handler', () => {
  it('returns 200 for OPTIONS preflight', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('OPTIONS'), res);
    expect(res._status).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for unsupported methods', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PATCH'), res);
    expect(res._status).toBe(405);
  });

  it('returns 503 when database not configured', async () => {
    buildSupabaseAdminClient.mockReturnValue(null);
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(503);
  });

  it('GET returns agents list', async () => {
    const agents = [{ id: 'a1', name: 'Agent Alpha' }];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(async () => ({ data: agents, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(200);
    expect(res._body.agents).toEqual(agents);
  });

  it('GET with id returns single agent', async () => {
    const agent = { id: 'a1', name: 'Agent Alpha' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: agent, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { id: 'a1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.agent).toEqual(agent);
  });

  it('GET with unknown id returns 404', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { id: 'missing' }), res);
    expect(res._status).toBe(404);
  });

  it('POST registers a new agent', async () => {
    const created = { id: 'a-new', name: 'New Agent' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: created, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', {}, { name: 'New Agent' }), res);
    expect(res._status).toBe(201);
    expect(res._body.agent.name).toBe('New Agent');
  });

  it('POST returns 400 without name', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, {}), res);
    expect(res._status).toBe(400);
  });

  it('POST action=accept transitions agent to accepted', async () => {
    const accepted = { id: 'a1', status: 'accepted', accepted_at: '2026-01-01T00:00:00.000Z' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: accepted, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'accept', id: 'a1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.agent.status).toBe('accepted');
  });

  it('POST action=pause transitions agent to paused', async () => {
    const paused = { id: 'a1', status: 'paused', paused_at: '2026-01-01T00:00:00.000Z' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: paused, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'pause', id: 'a1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.agent.status).toBe('paused');
  });

  it('POST action=terminate transitions agent to terminated', async () => {
    const terminated = { id: 'a1', status: 'terminated', terminated_at: '2026-01-01T00:00:00.000Z' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: terminated, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'terminate', id: 'a1' }, { reason: 'Done' }), res);
    expect(res._status).toBe(200);
    expect(res._body.agent.status).toBe('terminated');
  });

  it('POST action=check-in updates heartbeat', async () => {
    const checkedIn = { id: 'a1', status: 'active', last_check_in: '2026-01-01T00:00:00.000Z', board_id: 'b1' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: checkedIn, error: null })),
          })),
        })),
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: {}, error: null })) })) })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'check-in', id: 'a1' }, { summary: 'All good' }), res);
    expect(res._status).toBe(200);
    expect(res._body.agent.status).toBe('active');
  });

  it('POST action requires id query param', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', { action: 'accept' }), res);
    expect(res._status).toBe(400);
  });

  it('POST with invalid action returns 400', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', { action: 'invalid-action', id: 'a1' }), res);
    expect(res._status).toBe(400);
  });

  it('PUT updates an agent', async () => {
    const updated = { id: 'a1', name: 'Updated Agent' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: updated, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('PUT', { id: 'a1' }, { name: 'Updated Agent' }), res);
    expect(res._status).toBe(200);
    expect(res._body.agent.name).toBe('Updated Agent');
  });

  it('PUT returns 400 when id is missing', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PUT', {}, { name: 'x' }), res);
    expect(res._status).toBe(400);
  });

  it('PUT returns 400 when no valid fields are provided', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PUT', { id: 'a1' }, { garbage: 'x' }), res);
    expect(res._status).toBe(400);
  });

  it('DELETE removes an agent', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function () { return { eq: vi.fn(async () => ({ error: null })) }; }),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('DELETE', { id: 'a1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.deleted).toBe(true);
  });

  it('DELETE returns 400 when id is missing', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('DELETE'), res);
    expect(res._status).toBe(400);
  });
});
