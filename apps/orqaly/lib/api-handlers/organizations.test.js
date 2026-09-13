/**
 * Tests for /api/app?path=organizations — finances (org_id on goals) and activity scoping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 60, remaining: 59, resetAt: 0 })),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => { res._status = status; res._body = { error: msg }; return res; }),
  handleApiError: vi.fn((res) => { res._status = 500; return res; }),
}));

const tableResponses = {};

function chain(table) {
  const state = { table, filters: [], inFilters: {}, order: null, limitN: null, head: false, single: false };
  const api = {
    select(_cols, opts) {
      if (opts?.head) state.head = true;
      return api;
    },
    eq(col, val) { state.filters.push(['eq', col, val]); return api; },
    in(col, vals) { state.inFilters[col] = vals; return api; },
    is(col, val) { state.filters.push(['is', col, val]); return api; },
    order(_col, _opts) { state.order = true; return api; },
    limit(n) { state.limitN = n; return api; },
    maybeSingle: vi.fn(async () => tableResponses[`${table}:single`] ?? { data: null, error: null }),
    single: vi.fn(async () => tableResponses[`${table}:single`] ?? { data: null, error: null }),
    then(resolve) {
      const key = `${table}:${JSON.stringify(state)}`;
      const preset = tableResponses[key] ?? tableResponses[table] ?? { data: [], error: null, count: 0 };
      return Promise.resolve(preset).then(resolve);
    },
  };
  return api;
}

const mockFrom = vi.fn((table) => chain(table));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import handler from './organizations.js';

function makeRes() {
  return {
    _status: 200, _body: null,
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
}

function makeReq(query = {}) {
  return {
    method: 'GET',
    headers: { host: 'localhost' },
    url: '/api/app?path=organizations',
    query: { path: 'organizations', ...query },
    body: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
});

describe('/api/app?path=organizations', () => {
  it('finances includes goals linked by direct org_id', async () => {
    tableResponses.organizations = { data: [{ id: 'org-1' }], error: null };
    tableResponses.org_agents = { data: [], error: null };
    tableResponses.org_teams = { data: [], error: null };
    tableResponses.goals = {
      data: [{
        id: 'g1', team_id: null, org_id: 'org-1', budget_usd: 100, spent_usd: 20,
      }],
      error: null,
    };
    tableResponses.financial_events = { data: [], error: null };

    const res = makeRes();
    await handler(makeReq({ op: 'finances', org_id: 'org-1' }), res);
    expect(res._status).toBe(200);
    expect(res._body['org-1'].budget).toBe(100);
    expect(res._body['org-1'].spent).toBe(20);
  });

  it('activity returns org-scoped counts and scope_ids', async () => {
    tableResponses.org_agents = { data: [{ agent_id: 'a1' }], error: null };
    tableResponses.org_teams = { data: [{ team_id: 't1' }], error: null };
    tableResponses.goals = {
      data: [
        { id: 'g1', status: 'active', org_id: 'org-1', team_id: null },
        { id: 'g2', status: 'completed', org_id: 'org-1', team_id: null },
      ],
      error: null,
    };
    tableResponses.audit_log = {
      data: [
        { id: 'l1', action: 'updated', entity: 'Goal', entity_id: 'g1', details: '', created_at: '2026-01-01T00:00:00Z' },
        { id: 'l2', action: 'created', entity: 'Partner', entity_id: 'p9', details: '', created_at: '2026-01-02T00:00:00Z' },
      ],
      error: null,
    };
    tableResponses.goal_log = { data: [], error: null };
    tableResponses.saved_dashboards = { data: [{ id: 'd1', title: 'Ops', description: '' }], error: null, count: 1 };

    const res = makeRes();
    await handler(makeReq({ op: 'activity', org_id: 'org-1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.counts.active_goals).toBe(1);
    expect(res._body.counts.completed_goals).toBe(1);
    expect(res._body.scope_ids).toContain('org-1');
    expect(res._body.scope_ids).toContain('g1');
    expect(res._body.items.some((i) => i.entity_id === 'g1')).toBe(true);
    expect(res._body.items.some((i) => i.entity_id === 'p9')).toBe(false);
  });

  it('activity requires org_id', async () => {
    const res = makeRes();
    await handler(makeReq({ op: 'activity' }), res);
    expect(res._status).toBe(400);
  });
});
