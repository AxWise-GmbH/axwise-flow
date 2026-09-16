/**
 * Tests for concilium teams handler.
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
import handler from './teams.js';

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

describe('teams handler', () => {
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

  it('GET lists teams', async () => {
    const teams = [{ id: 't1', name: 'Alpha Team' }];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(async () => ({ data: teams, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(200);
    expect(res._body.teams).toEqual(teams);
  });

  it('GET single team by id includes members', async () => {
    const team = { id: 't1', name: 'Alpha Team' };
    const members = [{ team_id: 't1', member_id: 'm1' }];
    const fromMock = vi.fn((table) => {
      if (table === 'concilium_teams') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () { return this; }),
            maybeSingle: vi.fn(async () => ({ data: team, error: null })),
          })),
        };
      }
      // concilium_team_members
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          then: vi.fn(async (cb) => cb({ data: members, error: null })),
        })),
      };
    });
    buildSupabaseAdminClient.mockReturnValue({ from: fromMock });
    const res = makeRes();
    await handler(makeReq('GET', { id: 't1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.team).toEqual(team);
    expect(res._body.members).toEqual(members);
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

  it('POST creates a team', async () => {
    const created = { id: 't-new', name: 'New Team' };
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
    await handler(makeReq('POST', {}, { name: 'New Team' }), res);
    expect(res._status).toBe(201);
    expect(res._body.team.name).toBe('New Team');
  });

  it('POST returns 400 without name', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, {}), res);
    expect(res._status).toBe(400);
  });

  it('POST action=add-member adds a member to a team', async () => {
    const teamMember = { team_id: 't1', member_id: 'm1', user_id: 'user-1' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: teamMember, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'add-member', id: 't1' }, { memberId: 'm1' }), res);
    expect(res._status).toBe(201);
    expect(res._body.teamMember).toEqual(teamMember);
  });

  it('POST action=add-member returns 400 without memberId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', { action: 'add-member', id: 't1' }, {}), res);
    expect(res._status).toBe(400);
  });

  it('POST action=remove-member removes a member from a team', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', { action: 'remove-member', id: 't1' }, { memberId: 'm1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.removed).toBe(true);
  });

  it('POST action=remove-member returns 400 without memberId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', { action: 'remove-member', id: 't1' }, {}), res);
    expect(res._status).toBe(400);
  });

  it('POST action=set-leader sets the team leader', async () => {
    const updated = { id: 't1', leader_id: 'm2' };
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
    await handler(makeReq('POST', { action: 'set-leader', id: 't1' }, { leaderId: 'm2' }), res);
    expect(res._status).toBe(200);
    expect(res._body.team.leader_id).toBe('m2');
  });

  it('POST action=set-leader returns 400 without leaderId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', { action: 'set-leader', id: 't1' }, {}), res);
    expect(res._status).toBe(400);
  });

  it('POST action requires id query param', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', { action: 'add-member' }), res);
    expect(res._status).toBe(400);
  });

  it('POST with invalid action returns 400', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', { action: 'fly-away', id: 't1' }), res);
    expect(res._status).toBe(400);
  });

  it('PUT updates a team', async () => {
    const updated = { id: 't1', name: 'Renamed Team' };
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
    await handler(makeReq('PUT', { id: 't1' }, { name: 'Renamed Team' }), res);
    expect(res._status).toBe(200);
    expect(res._body.team.name).toBe('Renamed Team');
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
    await handler(makeReq('PUT', { id: 't1' }, { garbage: 'x' }), res);
    expect(res._status).toBe(400);
  });

  it('DELETE removes a team', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function () { return { eq: vi.fn(async () => ({ error: null })) }; }),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('DELETE', { id: 't1' }), res);
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
