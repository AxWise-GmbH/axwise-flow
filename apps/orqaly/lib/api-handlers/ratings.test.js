/**
 * Tests for the unified ratings handler.
 * Mocks Supabase admin + auth; asserts validation, install-gate, and audit log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockUser = { id: 'user-1', email: 'tester@example.com' };
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => mockUser),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'id'),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, message) => res.status(code).json({ error: message })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));

let ratingsRowsByTable = {};
let auditLogInserts = [];
let installCheckRows = [];
let skillRatingRows = [];
let agentRatingRows = [];

function buildMockAdmin() {
  const api = {
    from: vi.fn((table) => chainFor(table)),
  };
  function chainFor(table) {
    const state = { table, filters: {}, selectCols: null, updateRow: null };
    const self = {
      select: (cols) => { state.selectCols = cols; return self; },
      eq: (col, val) => { state.filters[col] = val; return self; },
      in: (col, vals) => { state.filters[`${col}__in`] = vals; return self; },
      or: () => self,
      order: () => self,
      limit: () => self,
      ilike: () => self,
      maybeSingle: async () => ({ data: resolveSingle(state) }),
      upsert: async (row) => { applyUpsert(table, row); return { error: null }; },
      insert: async (row) => { applyInsert(table, row); return { error: null }; },
      update: (row) => { state.updateRow = row; return self; },
      then: (onResolve) => {
        if (state.updateRow) {
          applyUpdate(table, state.filters, state.updateRow);
          return Promise.resolve({ data: null, error: null }).then(onResolve);
        }
        return Promise.resolve({ data: resolveList(state), error: null }).then(onResolve);
      },
    };
    return self;
  }
  function applyUpdate(table, _filters, _row) {
    ratingsRowsByTable[`${table}__updated`] = (ratingsRowsByTable[`${table}__updated`] || 0) + 1;
  }
  function resolveList(state) {
    if (state.table === 'agent_installed_skills') {
      return installCheckRows.filter((r) =>
        r.user_id === state.filters.user_id && r.skill_id === state.filters.skill_id
      );
    }
    if (state.table === 'agent_ratings') {
      return agentRatingRows.filter((r) => r.agent_id === state.filters.agent_id);
    }
    if (state.table === 'marketplace_ratings') {
      return skillRatingRows.filter((r) =>
        r.item_type === state.filters.item_type
        && (!state.filters.item_id || r.item_id === state.filters.item_id)
        && (!state.filters.item_id__in || state.filters.item_id__in.includes(r.item_id))
        && (!state.filters.agent_id__in || true)
      );
    }
    return [];
  }
  function resolveSingle(state) {
    const list = resolveList(state);
    if (state.table === 'agent_ratings') {
      return list.find((r) => r.user_id === state.filters.user_id) || null;
    }
    if (state.table === 'marketplace_ratings') {
      return list.find((r) => r.user_id === state.filters.user_id) || null;
    }
    return list[0] || null;
  }
  function applyUpsert(table, row) {
    if (table === 'agent_ratings') {
      agentRatingRows = agentRatingRows.filter((r) => !(r.user_id === row.user_id && r.agent_id === row.agent_id));
      agentRatingRows.push(row);
    } else if (table === 'marketplace_ratings') {
      skillRatingRows = skillRatingRows.filter((r) => !(r.user_id === row.user_id && r.item_id === row.item_id && r.item_type === row.item_type));
      skillRatingRows.push(row);
    }
  }
  function applyInsert(table, row) {
    if (table === 'audit_log') auditLogInserts.push(row);
    ratingsRowsByTable[table] = (ratingsRowsByTable[table] || []).concat(row);
  }
  return api;
}

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => buildMockAdmin(),
}));

// Import after mocks
const handlerModule = await import('./ratings.js');
const handler = handlerModule.default;

function mockRes() {
  const res = {
    statusCode: 0,
    body: null,
    _headers: {},
    status(c) { res.statusCode = c; return res; },
    json(payload) { res.body = payload; return res; },
    setHeader(k, v) { res._headers[k] = v; },
    end() {},
  };
  return res;
}

beforeEach(() => {
  ratingsRowsByTable = {};
  auditLogInserts = [];
  installCheckRows = [];
  skillRatingRows = [];
  agentRatingRows = [];
});

describe('ratings handler — submit validation', () => {
  it('rejects when target_type is neither agent nor skill', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: { op: 'submit' }, body: { target_type: 'tool', target_id: 't1', stars: 4 } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/target_type/);
  });

  it('rejects when target_id missing', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: { op: 'submit' }, body: { target_type: 'agent', stars: 4 } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/target_id/);
  });

  it('rejects stars out of range', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: { op: 'submit' }, body: { target_type: 'agent', target_id: 'a1', stars: 7 } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/stars/);
  });

  it('rejects comment > 280 chars', async () => {
    const res = mockRes();
    await handler({
      method: 'POST', query: { op: 'submit' },
      body: { target_type: 'agent', target_id: 'a1', stars: 4, comment: 'x'.repeat(281) },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/comment/);
  });
});

describe('ratings handler — skill install gate', () => {
  it('rejects skill rating when user has not installed it', async () => {
    installCheckRows = [];
    const res = mockRes();
    await handler({
      method: 'POST', query: { op: 'submit' },
      body: { target_type: 'skill', target_id: 'skill-1', stars: 5 },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/install/i);
  });

  it('allows skill rating when user has at least one install', async () => {
    installCheckRows = [{ user_id: 'user-1', skill_id: 'skill-1', agent_id: 'agent-1', id: 'inst-1' }];
    const res = mockRes();
    await handler({
      method: 'POST', query: { op: 'submit' },
      body: { target_type: 'skill', target_id: 'skill-1', stars: 5, comment: 'good' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(skillRatingRows).toHaveLength(1);
    expect(skillRatingRows[0].rating).toBe(5);
    expect(skillRatingRows[0].comment).toBe('good');
  });
});

describe('ratings handler — agent submit', () => {
  it('stores the rating and writes an audit-log entry', async () => {
    const res = mockRes();
    await handler({
      method: 'POST', query: { op: 'submit' },
      body: { target_type: 'agent', target_id: 'agent-42', stars: 4 },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(agentRatingRows).toHaveLength(1);
    expect(agentRatingRows[0].rating).toBe(4);
    expect(auditLogInserts.some((r) => r.action === 'rating.submitted' && r.entity === 'agent' && r.entity_id === 'agent-42')).toBe(true);
  });

  it('overwrites previous rating on re-submit', async () => {
    await handler({
      method: 'POST', query: { op: 'submit' },
      body: { target_type: 'agent', target_id: 'agent-42', stars: 2 },
    }, mockRes());
    await handler({
      method: 'POST', query: { op: 'submit' },
      body: { target_type: 'agent', target_id: 'agent-42', stars: 5 },
    }, mockRes());
    expect(agentRatingRows).toHaveLength(1);
    expect(agentRatingRows[0].rating).toBe(5);
  });
});
