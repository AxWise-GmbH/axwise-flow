/**
 * Tests for /api/app?path=dashboard-query
 * Covers: auth, method guard, payload caps, per-block error isolation,
 *         catalog validation, markdown short-circuit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 120, remaining: 119, resetAt: 0 })),
  applyRateLimitHeaders: vi.fn(),
}));

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

// Per-table response map keyed by dataset name
let tableResponses = {};

function setTableResponse(table, response) {
  tableResponses[table] = response;
}

function makeChain(table) {
  const resolveFn = () => tableResponses[table] || { data: [], error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    limit: () => Promise.resolve(resolveFn()),
    then: (resolve) => resolve(resolveFn()),
  };
  return chain;
}

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({
    from: (table) => makeChain(table),
  })),
}));

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './dashboard-query.js';

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

function makeReq(method, body = null) {
  return {
    method,
    headers: { host: 'localhost' },
    url: '/api/app?path=dashboard-query',
    body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tableResponses = {};
});

describe('/api/app?path=dashboard-query', () => {
  it('rejects non-POST', async () => {
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(405);
  });

  it('returns 401 without auth', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler(makeReq('POST', { blocks: [] }), res);
    expect(res._status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 120,
      remaining: 0,
      resetAt: 0,
    });
    const res = makeRes();
    await handler(makeReq('POST', { blocks: [] }), res);
    expect(res._status).toBe(429);
  });

  it('returns empty results for empty blocks', async () => {
    const res = makeRes();
    await handler(makeReq('POST', { blocks: [] }), res);
    expect(res._status).toBe(200);
    expect(res._body.results).toEqual({});
  });

  it('caps blocks at 60', async () => {
    const blocks = Array.from({ length: 61 }, (_, i) => ({
      id: `b${i}`,
      type: 'kpi',
      data: { dataset: 'goals', measure: { agg: 'count' } },
    }));
    const res = makeRes();
    await handler(makeReq('POST', { blocks }), res);
    expect(res._status).toBe(400);
  });

  it('short-circuits markdown blocks', async () => {
    const res = makeRes();
    await handler(
      makeReq('POST', {
        blocks: [{ id: 'm1', type: 'markdown', title: 'Note', body: 'Hello' }],
      }),
      res
    );
    expect(res._status).toBe(200);
    expect(res._body.results.m1).toEqual({ rows: [], total: 0, sample_count: 0 });
  });

  it('rejects unknown dataset in a block', async () => {
    const res = makeRes();
    await handler(
      makeReq('POST', {
        blocks: [
          {
            id: 'b1',
            type: 'kpi',
            data: { dataset: 'not_a_table', measure: { agg: 'count' } },
          },
        ],
      }),
      res
    );
    expect(res._status).toBe(200);
    expect(res._body.results.b1.error).toMatch(/unknown dataset/i);
  });

  it('isolates per-block errors (one bad block does not break others)', async () => {
    setTableResponse('goals', { data: [{ id: 1 }, { id: 2 }], error: null });
    const res = makeRes();
    await handler(
      makeReq('POST', {
        blocks: [
          {
            id: 'good',
            type: 'kpi',
            data: { dataset: 'goals', measure: { agg: 'count' } },
          },
          {
            id: 'bad',
            type: 'kpi',
            data: { dataset: 'mystery', measure: { agg: 'count' } },
          },
        ],
      }),
      res
    );
    expect(res._status).toBe(200);
    expect(res._body.results.good.total).toBe(2);
    expect(res._body.results.bad.error).toMatch(/unknown dataset/i);
  });

  it('rejects custom_query with unknown template_id', async () => {
    const res = makeRes();
    await handler(
      makeReq('POST', {
        blocks: [
          {
            id: 'cq',
            type: 'custom_query',
            custom_query: { template_id: 'definitely-not-a-real-template', params: {} },
          },
        ],
      }),
      res
    );
    expect(res._body.results.cq.error).toMatch(/unknown template/i);
  });

  it('aggregates sum correctly', async () => {
    setTableResponse('llm_usage', {
      data: [
        { id: 1, estimated_cost_usd: 5 },
        { id: 2, estimated_cost_usd: 10 },
        { id: 3, estimated_cost_usd: 2.5 },
      ],
      error: null,
    });
    const res = makeRes();
    await handler(
      makeReq('POST', {
        blocks: [
          {
            id: 'b',
            type: 'kpi',
            data: { dataset: 'llm_usage', measure: { agg: 'sum', field: 'estimated_cost_usd' } },
          },
        ],
      }),
      res
    );
    expect(res._body.results.b.total).toBe(17.5);
    expect(res._body.results.b.sample_count).toBe(3);
  });

  it('groups rows by a categorical dimension', async () => {
    setTableResponse('goals', {
      data: [
        { id: 1, status: 'active' },
        { id: 2, status: 'active' },
        { id: 3, status: 'completed' },
      ],
      error: null,
    });
    const res = makeRes();
    await handler(
      makeReq('POST', {
        blocks: [
          {
            id: 'b',
            type: 'breakdown',
            data: {
              dataset: 'goals',
              measure: { agg: 'count' },
              group_by: { field: 'status' },
            },
          },
        ],
      }),
      res
    );
    const rows = res._body.results.b.rows;
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.group === 'active').value).toBe(2);
    expect(rows.find((r) => r.group === 'completed').value).toBe(1);
  });
});
