/**
 * Tests for POST /api/app?path=team-chat — focused on the AxWise copilot.chat seam.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn(() => false) }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ user: { id: 'user-1', email: 't@e.com' } })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, msg) => res.status(code).json({ error: msg })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({})),
}));
const executeLlmV2Tracked = vi.fn(async () => ({ content: 'On it.', usage: {}, durationMs: 10 }));
vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: (...a) => executeLlmV2Tracked(...a),
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

import handler from './team-chat.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    status(c) {
      this._status = c;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    setHeader() {},
    end() {
      return this;
    },
  };
}
const makeReq = (body) => ({ method: 'POST', headers: {}, query: {}, body });
const TEAM = { id: 'team-1', name: 'Alpha', agents: [] };

beforeEach(() => {
  vi.clearAllMocks();
  withAxwiseTracked.mockResolvedValue({ processedOutputs: {}, degraded: false, skipped: false });
  delete process.env.AXWISE_ENFORCE;
});

describe('team-chat AxWise seam', () => {
  it('records a copilot.chat call and still replies in shadow', async () => {
    const res = makeRes();
    await handler(makeReq({ message: 'how is the team doing?', team: TEAM }), res);
    expect(withAxwiseTracked).toHaveBeenCalledTimes(1);
    expect(withAxwiseTracked.mock.calls[0][0].integrationPoint).toBe('copilot.chat');
    expect(res._status).toBe(200);
    expect(res._body.reply).toBe('On it.');
    expect(res._body.blocked).toBeUndefined();
  });

  it('blocks the reply when AxWise denies under authoritative enforcement', async () => {
    process.env.AXWISE_ENFORCE = 'authoritative';
    withAxwiseTracked.mockResolvedValueOnce({
      degraded: false,
      skipped: false,
      processedOutputs: { security: { scopeDecision: 'denied', blockReason: 'Nope.' } },
    });
    const res = makeRes();
    await handler(makeReq({ message: 'restricted', team: TEAM }), res);
    expect(res._status).toBe(200);
    expect(res._body.blocked).toBe(true);
    expect(res._body.reply).toBe('Nope.');
    expect(executeLlmV2Tracked).not.toHaveBeenCalled();
  });
});
