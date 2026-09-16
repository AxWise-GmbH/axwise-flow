/**
 * Tests for /api/app?path=dashboard-auto
 * Covers: auth, method guard, payload validation, schema validation of LLM
 *         output, re-prompt on failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 12, remaining: 11, resetAt: 0 })),
  applyRateLimitHeaders: vi.fn(),
}));

// Admin client isn't needed for these tests; return null so the tracked LLM
// wrapper stays a transparent passthrough to the mocked executeLlm below.
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => null),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res, err) => {
    res._status = 500;
    res._body = { error: err?.message || 'internal' };
    return res;
  }),
}));

// Mock the LLM executor
const mockExecuteLlm = vi.fn();
const mockParseLlmJson = vi.fn((s) => JSON.parse(s));

vi.mock('../agent-handlers/llm-executor.js', () => ({
  executeLlm: (...args) => mockExecuteLlm(...args),
  parseLlmJson: (...args) => mockParseLlmJson(...args),
}));

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './dashboard-auto.js';

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
    url: '/api/app?path=dashboard-auto',
    body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

const VALID_CONFIG = {
  version: 1,
  layout: [{ i: 'b1', x: 0, y: 0, w: 3, h: 3 }],
  blocks: [
    {
      id: 'b1',
      type: 'kpi',
      title: 'Total goals',
      data: { dataset: 'goals', measure: { agg: 'count' } },
    },
  ],
  global_filters: {},
  rationale: 'KPI shows total goal count.',
};

describe('/api/app?path=dashboard-auto', () => {
  it('rejects non-POST', async () => {
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(405);
  });

  it('returns 401 without auth', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler(makeReq('POST', { prompt: 'x' }), res);
    expect(res._status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 12,
      remaining: 0,
      resetAt: 0,
    });
    const res = makeRes();
    await handler(makeReq('POST', { prompt: 'x' }), res);
    expect(res._status).toBe(429);
  });

  it('requires a prompt or refinement', async () => {
    const res = makeRes();
    await handler(makeReq('POST', {}), res);
    expect(res._status).toBe(400);
  });

  it('returns valid config on first try', async () => {
    mockExecuteLlm.mockResolvedValueOnce({
      content: JSON.stringify(VALID_CONFIG),
      usage: {},
      model: 'claude-sonnet-5',
      provider: 'anthropic',
      durationMs: 1234,
      estimatedCostUsd: 0.012,
    });
    const res = makeRes();
    await handler(makeReq('POST', { prompt: 'goals overview' }), res);
    expect(res._status).toBe(200);
    expect(res._body.config.blocks[0].id).toBe('b1');
    expect(res._body.rationale).toBeTruthy();
    expect(res._body.retried).toBe(false);
  });

  it('re-prompts on invalid LLM output, succeeds on retry', async () => {
    const invalid = { version: 1, blocks: [{ id: 'x', type: 'invalid_type' }] };
    mockExecuteLlm
      .mockResolvedValueOnce({
        content: JSON.stringify(invalid),
        usage: {},
        model: 'm',
        provider: 'p',
        durationMs: 100,
        estimatedCostUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(VALID_CONFIG),
        usage: {},
        model: 'm',
        provider: 'p',
        durationMs: 200,
        estimatedCostUsd: 0,
      });
    const res = makeRes();
    await handler(makeReq('POST', { prompt: 'goals overview' }), res);
    expect(res._status).toBe(200);
    expect(res._body.retried).toBe(true);
    expect(mockExecuteLlm).toHaveBeenCalledTimes(2);
  });

  it('returns 422 when both attempts fail validation', async () => {
    const invalid = { version: 1, blocks: [{ id: 'x', type: 'still_invalid' }] };
    mockExecuteLlm
      .mockResolvedValueOnce({
        content: JSON.stringify(invalid),
        usage: {},
        model: 'm',
        provider: 'p',
        durationMs: 100,
        estimatedCostUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(invalid),
        usage: {},
        model: 'm',
        provider: 'p',
        durationMs: 100,
        estimatedCostUsd: 0,
      });
    const res = makeRes();
    await handler(makeReq('POST', { prompt: 'goals overview' }), res);
    expect(res._status).toBe(422);
    expect(res._body.error).toMatch(/LLM_VALIDATION_FAILED/);
  });

  it('returns 422 on JSON parse failure', async () => {
    mockExecuteLlm
      .mockResolvedValueOnce({
        content: 'not json at all',
        usage: {},
        model: 'm',
        provider: 'p',
        durationMs: 100,
        estimatedCostUsd: 0,
      })
      .mockResolvedValueOnce({
        content: 'still not json',
        usage: {},
        model: 'm',
        provider: 'p',
        durationMs: 100,
        estimatedCostUsd: 0,
      });
    mockParseLlmJson
      .mockImplementationOnce(() => {
        throw new Error('unexpected token');
      })
      .mockImplementationOnce(() => {
        throw new Error('unexpected token');
      });
    const res = makeRes();
    await handler(makeReq('POST', { prompt: 'x' }), res);
    expect(res._status).toBe(422);
  });
});
