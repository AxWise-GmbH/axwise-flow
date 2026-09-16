/**
 * Tests for org-communication timeline handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
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

vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import handler from './org-communication.js';

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

function makeReq(query = {}) {
  return { method: 'GET', headers: {}, query };
}

function chain(terminal) {
  const self = {
    eq: vi.fn(() => self),
    or: vi.fn(() => self),
    in: vi.fn(() => self),
    order: vi.fn(() => self),
    limit: vi.fn(() => self),
    maybeSingle: vi.fn(async () => terminal),
    then: (resolve, reject) => Promise.resolve(terminal).then(resolve, reject),
  };
  return self;
}

function buildMockAdmin() {
  const org = { id: 'org-1', name: 'Acme', consilium_id: 'board-1', slug: 'acme' };
  const goals = [{ id: 'g1', title: 'Weekly report', status: 'active', created_at: '2026-05-01T00:00:00Z', org_id: 'org-1', team_id: null }];
  const messages = [{ id: 'm1', goal_id: 'g1', sender_name: 'Agent', channel: 'team', message: 'Hello', message_type: 'info', created_at: '2026-05-01T01:00:00Z' }];
  const commRows = [{ id: 'c1', sender_name: 'You', content: '[Org] Run report', context_type: 'organization', context_id: 'org-1', metadata: {}, created_at: '2026-05-01T02:00:00Z' }];

  return {
    from: vi.fn((table) => {
      if (table === 'organizations') {
        return { select: vi.fn(() => chain({ data: org, error: null })) };
      }
      if (table === 'org_teams') {
        return { select: vi.fn(() => chain({ data: [], error: null })) };
      }
      if (table === 'goals') {
        return { select: vi.fn(() => chain({ data: goals, error: null })) };
      }
      if (table === 'goal_messages') {
        return { select: vi.fn(() => chain({ data: messages, error: null })) };
      }
      if (table === 'goal_log') {
        return { select: vi.fn(() => chain({ data: [], error: null })) };
      }
      if (table === 'notification_log') {
        return { select: vi.fn(() => chain({ data: [], error: null })) };
      }
      if (table === 'org_agents') {
        return { select: vi.fn(() => chain({ data: [], error: null })) };
      }
      if (table === 'pulse_cycles') {
        return { select: vi.fn(() => chain({ data: [], error: null })) };
      }
      if (table === 'concilium_evaluations') {
        return { select: vi.fn(() => chain({ data: [], error: null })) };
      }
      if (table === 'communication_logs') {
        return { select: vi.fn(() => chain({ data: commRows, error: null })) };
      }
      return { select: vi.fn(() => chain({ data: [], error: null })) };
    }),
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('org-communication handler', () => {
  it('returns 401 when unauthenticated', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    buildSupabaseAdminClient.mockReturnValue(buildMockAdmin());
    const res = makeRes();
    await handler(makeReq({ op: 'timeline', orgId: 'org-1' }), res);
    expect(res._status).toBe(401);
  });

  it('returns unified timeline for owned org', async () => {
    buildSupabaseAdminClient.mockReturnValue(buildMockAdmin());
    const res = makeRes();
    await handler(makeReq({ op: 'timeline', orgId: 'org-1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.org.name).toBe('Acme');
    expect(res._body.scope.goalCount).toBe(1);
    const sources = res._body.events.map((e) => e.source);
    expect(sources).toContain('goal_history');
    expect(sources).toContain('command');
  });

  it('requires orgId', async () => {
    buildSupabaseAdminClient.mockReturnValue(buildMockAdmin());
    const res = makeRes();
    await handler(makeReq({ op: 'timeline' }), res);
    expect(res._status).toBe(400);
  });
});
