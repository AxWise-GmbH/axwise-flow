/**
 * Tests for GET /api/assistant-home-summary
 *
 * Covers: auth gate, method guard, success shape, partial-failure isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  applyRateLimitHeaders: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'rl-id'),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    startTimer: () => () => {},
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './assistant-home-summary.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(c) {
      this._status = c;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
    },
  };
}

function makeReq(method = 'GET') {
  return { method, headers: {}, query: {}, url: '/api/assistant-home-summary' };
}

/**
 * Build a fluent mock client where every table query terminates by returning
 * `{ count, error }`. The `head:true, count:'exact'` chain we use in the
 * handler resolves to the awaited promise — so we make the select() chain
 * itself thenable.
 */
function mockClient(tableResults) {
  const queryCalls = [];
  return {
    queryCalls,
    from: vi.fn((table) => ({
      select: vi.fn(() => {
        // Return a thenable AND a chainable with .eq/.in/.neq/.lte/.gte all returning the same
        const result = tableResults[table] ?? { count: 0, error: null };
        const builder = {
          eq: vi.fn(() => builder),
          is: vi.fn(() => builder),
          gt: vi.fn(() => builder),
          neq: vi.fn((column, value) => {
            queryCalls.push([table, 'neq', column, value]);
            return builder;
          }),
          in: vi.fn((column, value) => {
            queryCalls.push([table, 'in', column, value]);
            return builder;
          }),
          lte: vi.fn(() => builder),
          gte: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          then: (resolve) => Promise.resolve(result).then(resolve),
        };
        return builder;
      }),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifySupabaseToken.mockReset();
  buildSupabaseUserClient.mockReset();
  checkRateLimit.mockReturnValue({ allowed: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assistant-home-summary', () => {
  it('rejects non-GET methods', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, url: '' }, res);
    expect(res._status).toBe(405);
  });

  it('rejects unauthenticated requests', async () => {
    verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(401);
  });

  it('rejects rate-limited requests', async () => {
    verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    checkRateLimit.mockReturnValue({ allowed: false });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(429);
  });

  it('returns 503 when DB is not configured', async () => {
    verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    buildSupabaseUserClient.mockReturnValue(null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(503);
  });

  it('returns expected shape on success', async () => {
    verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const client = mockClient({
      goals: { count: 3, error: null },
      team_tasks: { count: 12, error: null },
      workflows: { count: 4, error: null },
      concilium_boards_v2: { count: 1, error: null },
      report_kpi_snapshots: { count: 7, error: null },
      partners: { count: 25, error: null },
    });
    buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      ok: true,
      activeGoals: 3,
      tasksDueThisWeek: 12,
      workflows: 4,
      boards: 1,
      recentReports: 7,
      partners: 25,
    });
    expect(typeof res._body.generatedAt).toBe('string');
    const taskStatusFilters = client.queryCalls.filter(
      ([table, , column]) => table === 'team_tasks' && column === 'status'
    );
    expect(taskStatusFilters).toEqual([
      ['team_tasks', 'in', 'status', ['planned', 'todo', 'inProgress', 'blocked']],
      ['team_tasks', 'in', 'status', ['planned', 'todo', 'inProgress', 'blocked']],
    ]);
  });

  it('isolates per-query failures (failed table → null, others still returned)', async () => {
    verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    buildSupabaseUserClient.mockReturnValue(
      mockClient({
        goals: { count: 0, error: { message: 'permission denied' } },
        team_tasks: { count: 5, error: null },
        workflows: { count: 2, error: null },
        concilium_boards_v2: { count: 0, error: null },
        report_kpi_snapshots: { count: 0, error: null },
        partners: { count: 10, error: null },
      })
    );
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.activeGoals).toBeNull();
    expect(res._body.tasksDueThisWeek).toBe(5);
    expect(res._body.partners).toBe(10);
  });
});
