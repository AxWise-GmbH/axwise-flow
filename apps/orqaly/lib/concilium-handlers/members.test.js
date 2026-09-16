/**
 * Tests for concilium members handler.
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
import handler from './members.js';

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

describe('members handler', () => {
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
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(401);
  });

  it('GET lists members for a board', async () => {
    const members = [{ id: 'm1', name: 'Slish' }];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(async () => ({ data: members, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { conciliumId: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.members).toEqual(members);
  });

  it('GET returns 400 without conciliumId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(400);
  });

  it('GET single member by id', async () => {
    const member = { id: 'm1', name: 'Slish' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: member, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { id: 'm1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.member).toEqual(member);
  });

  it('POST creates a member', async () => {
    const board = { id: 'b1' };
    const created = { id: 'm-new', name: 'NewMember', concilium_id: 'b1' };
    const fromMock = vi.fn((table) => {
      if (table === 'concilium') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () { return this; }),
            maybeSingle: vi.fn(async () => ({ data: board, error: null })),
          })),
        };
      }
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: created, error: null })),
          })),
        })),
      };
    });
    buildSupabaseAdminClient.mockReturnValue({ from: fromMock });
    const res = makeRes();
    await handler(makeReq('POST', {}, {
      conciliumId: 'b1',
      name: 'NewMember',
      provider: 'openai',
      model: 'gpt-4o',
    }), res);
    expect(res._status).toBe(201);
    expect(res._body.member.name).toBe('NewMember');
  });

  it('POST returns 400 without conciliumId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, { name: 'Test' }), res);
    expect(res._status).toBe(400);
  });

  it('POST returns 400 for invalid provider', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, { conciliumId: 'b1', name: 'Test', provider: 'invalid' }), res);
    expect(res._status).toBe(400);
  });

  it('POST returns 400 for invalid role', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, { conciliumId: 'b1', name: 'Test', role: 'dictator' }), res);
    expect(res._status).toBe(400);
  });

  it('PUT updates a member', async () => {
    const updated = { id: 'm1', name: 'Updated' };
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
    await handler(makeReq('PUT', { id: 'm1' }, { name: 'Updated' }), res);
    expect(res._status).toBe(200);
    expect(res._body.member.name).toBe('Updated');
  });

  it('DELETE removes a member', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function () { return { eq: vi.fn(async () => ({ error: null })) }; }),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('DELETE', { id: 'm1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.deleted).toBe(true);
  });

  it('POST quarantine action quarantines a member', async () => {
    const quarantined = { id: 'm1', quarantined: true, quarantine_reason: 'Spam' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: quarantined, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'quarantine', id: 'm1' }, { reason: 'Spam' }), res);
    expect(res._status).toBe(200);
    expect(res._body.member.quarantined).toBe(true);
  });

  it('POST unquarantine action removes quarantine', async () => {
    const unquarantined = { id: 'm1', quarantined: false };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: unquarantined, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'unquarantine', id: 'm1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.member.quarantined).toBe(false);
  });

  it('returns 405 for unsupported methods', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PATCH'), res);
    expect(res._status).toBe(405);
  });
});
