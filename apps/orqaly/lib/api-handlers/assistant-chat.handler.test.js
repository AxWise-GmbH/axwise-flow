/**
 * Handler-level tests for the assistant-chat 'chat' action, focused on the
 * no-leak fallback: when the model returns unparseable output, the user must
 * NEVER receive the raw protocol/JSON text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, msg) => res.status(code).json({ error: msg })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'user-1'),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    startTimer: () => () => {},
    warn: () => {},
    error: () => {},
    info: () => {},
  }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: vi.fn(() => ({})),
  buildSupabaseAdminClient: vi.fn(() => null),
}));
vi.mock('../concilium-handlers/llm-executor-v2.js', () => ({ parseLlmJson: vi.fn() }));
vi.mock('../usage-handlers/tracked-llm.js', () => ({ executeLlmV2Tracked: vi.fn() }));
vi.mock('../security/content-guard.js', () => ({
  guardUserContent: (msg) => ({ action: 'allow', cleaned: msg }),
  blockedResponse: vi.fn((res) => res.status(400).json({ blocked: true })),
}));
vi.mock('../security/audit-security-event.js', () => ({ auditSecurityEvent: vi.fn() }));

const { withAxwiseTracked } = vi.hoisted(() => ({
  withAxwiseTracked: vi.fn(async () => ({ processedOutputs: {}, degraded: false, skipped: false })),
}));
vi.mock('../integrations/axwise/index.js', () => ({
  withAxwiseTracked,
  buildCopilotContext: (o) => ({ integrationPoint: 'copilot.chat', ...o }),
}));

import { parseLlmJson } from '../concilium-handlers/llm-executor-v2.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import handler from './assistant-chat.js';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(d) {
      this.body = d;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

describe("assistant-chat 'chat' action — no-leak fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeLlmV2Tracked.mockResolvedValue({
      content: 'x',
      usage: {},
      estimatedCostUsd: 0.001,
      model: 'gemini-3-pro-preview',
      provider: 'gemini',
    });
  });

  it('returns a graceful message (never the raw protocol JSON) when output is unparseable', async () => {
    // A thinking model emits protocol JSON with a raw newline the parser rejects.
    executeLlmV2Tracked.mockResolvedValue({
      content:
        '{"action":"answer","message":"You have 0 agents.\n\nCreate one?","proposedActions":[{"tool":"agent.create"}]}',
      usage: {},
      estimatedCostUsd: 0.001,
      model: 'gemini-3-pro-preview',
      provider: 'gemini',
    });
    parseLlmJson.mockReturnValue(null); // simulate parse failure

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'chat', message: 'how many agents' },
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('I had trouble formatting that answer. Please try asking again.');
    expect(res.body.message).not.toContain('"action"');
    expect(res.body.message).not.toContain('proposedActions');
    expect(res.body.calls).toEqual([]);
  });

  it('still returns the parsed reply on the happy path (fallback does not fire)', async () => {
    parseLlmJson.mockReturnValue({ message: 'All good', calls: [] });

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'chat', message: 'status?' },
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('All good');
    expect(res.body.calls).toEqual([]);
    expect(executeLlmV2Tracked).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', model: 'gemini-3.8-flash' })
    );
  });

  it('preserves an explicit BYOK provider and model selection', async () => {
    parseLlmJson.mockReturnValue({ message: 'Explicit model used', calls: [] });

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: {
        action: 'chat',
        message: 'status?',
        provider: 'openai',
        model: 'gpt-4.1-mini',
      },
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(executeLlmV2Tracked).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', model: 'gpt-4.1-mini' })
    );
  });
});

describe('assistant-chat AxWise copilot.chat seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withAxwiseTracked.mockResolvedValue({ processedOutputs: {}, degraded: false, skipped: false });
    executeLlmV2Tracked.mockResolvedValue({
      content: 'x',
      usage: {},
      estimatedCostUsd: 0,
      model: 'm',
      provider: 'groq',
    });
    parseLlmJson.mockReturnValue({ message: 'ok', calls: [] });
    delete process.env.AXWISE_ENFORCE;
  });

  it("records a copilot.chat call for the 'chat' action and still replies in shadow", async () => {
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'chat', message: 'how do I create a goal?' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(withAxwiseTracked).toHaveBeenCalledTimes(1);
    expect(withAxwiseTracked.mock.calls[0][0].integrationPoint).toBe('copilot.chat');
    expect(res.statusCode).toBe(200);
    expect(res.body.blocked).toBeUndefined();
  });

  it("records a copilot.chat call for the 'natural-reply' action", async () => {
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'natural-reply', message: 'what did we discuss?' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(withAxwiseTracked).toHaveBeenCalledTimes(1);
    expect(withAxwiseTracked.mock.calls[0][0].integrationPoint).toBe('copilot.chat');
    expect(res.statusCode).toBe(200);
    expect(res.body.blocked).toBeUndefined();
  });

  it('blocks the reply when AxWise denies under authoritative enforcement', async () => {
    process.env.AXWISE_ENFORCE = 'authoritative';
    withAxwiseTracked.mockResolvedValueOnce({
      degraded: false,
      skipped: false,
      processedOutputs: { security: { scopeDecision: 'denied', blockReason: 'Not permitted.' } },
    });
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'chat', message: 'do restricted thing' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.blocked).toBe(true);
    expect(res.body.message).toBe('Not permitted.');
  });
});
