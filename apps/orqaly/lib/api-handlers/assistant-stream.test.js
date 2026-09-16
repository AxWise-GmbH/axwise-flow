/**
 * Tests for POST /api/app?path=assistant-stream (SSE) — AxWise copilot.chat seam.
 * Note: this endpoint has no live UI caller (wired for completeness), so the
 * test just proves the seam records and does not block a normal reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, msg) => res.status(code).json({ error: msg })),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: () => ({ allowed: true }),
  getRateLimitIdentifier: () => 'rl',
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ startTimer: () => vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({})),
}));
vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: vi.fn(async () => ({
    content: 'Hello there.',
    estimatedCostUsd: 0,
    model: 'm',
    provider: 'groq',
  })),
}));
vi.mock('../security/content-guard.js', () => ({
  guardUserContent: (msg) => ({ action: 'allow', cleaned: msg }),
  blockedResponse: (res) => res.status(400).json({ blocked: true }),
}));
vi.mock('../security/audit-security-event.js', () => ({ auditSecurityEvent: vi.fn() }));

const { withAxwiseTracked } = vi.hoisted(() => ({
  withAxwiseTracked: vi.fn(async () => ({ processedOutputs: {}, degraded: false, skipped: false })),
}));
vi.mock('../integrations/axwise/index.js', () => ({
  withAxwiseTracked,
  buildCopilotContext: (o) => ({ integrationPoint: 'copilot.chat', ...o }),
}));

import handler from './assistant-stream.js';

function makeSseRes() {
  return {
    events: [],
    _status: 200,
    status(c) {
      this._status = c;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    writeHead() {
      return this;
    },
    write(chunk) {
      this.events.push(chunk);
      return true;
    },
    end() {
      this.ended = true;
      return this;
    },
    setHeader() {},
  };
}
const makeReq = (body) => ({ method: 'POST', headers: {}, query: {}, body });

beforeEach(() => {
  vi.clearAllMocks();
  withAxwiseTracked.mockResolvedValue({ processedOutputs: {}, degraded: false, skipped: false });
  delete process.env.AXWISE_ENFORCE;
});

describe('assistant-stream AxWise seam', () => {
  it('records a copilot.chat call and streams the reply in shadow', async () => {
    const res = makeSseRes();
    await handler(
      makeReq({ message: 'give me a status summary', personality: 'professional' }),
      res
    );
    expect(withAxwiseTracked).toHaveBeenCalledTimes(1);
    expect(withAxwiseTracked.mock.calls[0][0].integrationPoint).toBe('copilot.chat');
    // SSE streamed a done event with the reply.
    const joined = res.events.join('');
    expect(joined).toContain('event: done');
    expect(res.ended).toBe(true);
  });
});
