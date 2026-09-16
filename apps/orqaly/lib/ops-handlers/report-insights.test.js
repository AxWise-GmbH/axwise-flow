/**
 * Tests for the report-insights handler (platform-default narrative + usage recording).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'ip'),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({})),
}));
vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: vi.fn(async () => ({
    content: 'Revenue is strong.\nRecommendations:\n- Keep going',
    provider: 'gemini',
    model: 'gemini-3.8-flash',
  })),
}));

import handler from './report-insights.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader: vi.fn(),
  };
}

const validBody = {
  reportType: 'tpl-finance-growth',
  templateName: 'Finance & Growth',
  kpis: [{ label: 'Revenue', value: 1000, format: 'currency' }],
  alerts: [],
  topRows: [],
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('report-insights handler', () => {
  it('rejects non-POST', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects unauthenticated requests', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: validBody }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: validBody }, res);
    expect(res.statusCode).toBe(429);
  });

  it('rejects an unknown report type', async () => {
    const res = makeRes();
    await handler(
      { method: 'POST', headers: {}, body: { ...validBody, reportType: 'tpl-nope' } },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects when no KPIs are supplied', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { ...validBody, kpis: [] } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns a narrative and records usage on success', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: validBody }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.narrative).toContain('Revenue is strong');
    expect(res.body.provider).toBe('gemini');
    // usage context must carry the recording fields for /llm-usage.
    expect(executeLlmV2Tracked).toHaveBeenCalledTimes(1);
    const opts = executeLlmV2Tracked.mock.calls[0][0];
    expect(opts.provider).toBe('gemini');
    expect(opts.model).toBe('gemini-3.8-flash');
    expect(opts.usage.userId).toBe('user-1');
    expect(opts.usage.source).toBe('report-insights');
  });

  it('parses a stringified JSON body', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: JSON.stringify(validBody) }, res);
    expect(res.statusCode).toBe(200);
  });
});
