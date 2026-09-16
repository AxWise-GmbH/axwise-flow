/**
 * Tests for concilium agent-reports handler.
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
import handler from './agent-reports.js';

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

describe('agent-reports handler', () => {
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
    await handler(makeReq('GET', { agentId: 'a1' }), res);
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
    await handler(makeReq('GET', { agentId: 'a1' }), res);
    expect(res._status).toBe(503);
  });

  it('GET lists reports by agentId', async () => {
    const reports = [
      { id: 'r1', agent_id: 'a1', report_type: 'activity', summary: 'Done' },
    ];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: reports, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { agentId: 'a1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.reports).toEqual(reports);
  });

  it('GET lists reports by boardId', async () => {
    const reports = [
      { id: 'r2', board_id: 'b1', report_type: 'check_in' },
    ];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: reports, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { boardId: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.reports).toEqual(reports);
  });

  it('GET returns 400 without agentId or boardId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(400);
  });

  it('POST submits a report', async () => {
    const created = { id: 'r-new', agent_id: 'a1', report_type: 'activity', summary: 'All good' };
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
    await handler(makeReq('POST', {}, {
      agentId: 'a1',
      report_type: 'activity',
      summary: 'All good',
    }), res);
    expect(res._status).toBe(201);
    expect(res._body.report.summary).toBe('All good');
  });

  it('POST returns 400 without agentId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, { report_type: 'activity' }), res);
    expect(res._status).toBe(400);
  });

  it('POST returns 400 for invalid report_type', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, { agentId: 'a1', report_type: 'banana' }), res);
    expect(res._status).toBe(400);
  });

  it('POST defaults report_type to activity when omitted', async () => {
    const created = { id: 'r-new', agent_id: 'a1', report_type: 'activity' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn((row) => {
          expect(row.report_type).toBe('activity');
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: created, error: null })),
            })),
          };
        }),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', {}, { agentId: 'a1', summary: 'Test' }), res);
    expect(res._status).toBe(201);
  });
});
