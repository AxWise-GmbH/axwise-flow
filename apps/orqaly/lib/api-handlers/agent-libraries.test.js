/**
 * Tests for the agent-libraries handler.
 * Mocks Supabase admin + Composio + auth; asserts catalog allowlist (L1),
 * sensitive-action gating, and per-action toggle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockUser = { id: 'user-1', email: 't@example.com' };

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

vi.mock('../composio/client.js', () => ({
  isComposioConfigured: vi.fn(() => true),
}));

const initiateMock = vi.fn();
vi.mock('../composio/executor.js', () => ({
  initiateComposioConnection: initiateMock,
}));

// In-memory rows for our fake table
let connectedRows = [];

function buildMockAdmin() {
  function chainFor(table) {
    const state = { table, filters: {}, updateRow: null, insertRow: null, upsertRow: null };
    const self = {
      select: () => self,
      eq: (col, val) => { state.filters[col] = val; return self; },
      neq: (col, val) => { state.filters[`${col}__neq`] = val; return self; },
      order: () => self,
      maybeSingle: async () => ({ data: resolveList(state)[0] || null, error: null }),
      single: async () => {
        const row = state.upsertRow || state.insertRow;
        return { data: { id: 'row-1', ...row }, error: null };
      },
      upsert: (row) => { state.upsertRow = row; applyUpsert(table, row); return self; },
      insert: (row) => { state.insertRow = row; connectedRows.push({ id: 'row-1', ...row }); return self; },
      update: (row) => { state.updateRow = row; return self; },
      then: (onResolve) => {
        if (state.updateRow) {
          for (const r of connectedRows) {
            if (matches(r, state.filters)) Object.assign(r, state.updateRow);
          }
          return Promise.resolve({ data: null, error: null }).then(onResolve);
        }
        return Promise.resolve({ data: resolveList(state), error: null }).then(onResolve);
      },
    };
    return self;
  }
  function matches(row, filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (k.endsWith('__neq')) {
        const col = k.slice(0, -5);
        if (row[col] === v) return false;
      } else if (row[k] !== v) return false;
    }
    return true;
  }
  function resolveList(state) {
    if (state.table !== 'agent_connected_libraries') return [];
    return connectedRows.filter((r) => matches(r, state.filters));
  }
  function applyUpsert(_table, row) {
    const existing = connectedRows.find(
      (r) => r.user_id === row.user_id && r.agent_id === row.agent_id && r.tool_id === row.tool_id,
    );
    if (existing) Object.assign(existing, row);
    else connectedRows.push({ id: 'row-1', ...row });
  }
  return { from: vi.fn((t) => chainFor(t)) };
}

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => buildMockAdmin(),
}));

const handlerModule = await import('./agent-libraries.js');
const handler = handlerModule.default;

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
  return res;
}

beforeEach(() => {
  connectedRows = [];
  initiateMock.mockReset();
});

describe('agent-libraries handler — auth & rate limit', () => {
  it('rejects when no user (verifySupabaseToken returns null)', async () => {
    const auth = await import('../../api/_lib/auth.js');
    auth.verifySupabaseToken.mockResolvedValueOnce(null);
    const req = { method: 'GET', query: { op: 'list', agent_id: 'a-1' }, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown op with 400', async () => {
    const req = { method: 'GET', query: { op: 'bogus' }, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('connect — L1 catalog allowlist', () => {
  it('rejects tool_id not in catalog', async () => {
    initiateMock.mockResolvedValueOnce({ redirectUrl: 'x', connectionId: 'c', status: 'pending' });
    const req = {
      method: 'POST',
      query: { op: 'connect' },
      body: { agent_id: 'a-1', tool_id: 'mcp-fake-not-real' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body?.error)).toMatch(/Unknown library/);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it('400 when agent_id or tool_id missing', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: { op: 'connect' }, body: { agent_id: 'a-1' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('inserts row with safe actions enabled by default and ignores opted-in actions not in actionsSensitive', async () => {
    initiateMock.mockResolvedValueOnce({ redirectUrl: 'oauth://x', connectionId: 'c-1', status: 'pending' });
    const req = {
      method: 'POST',
      query: { op: 'connect' },
      body: {
        agent_id: 'a-1',
        tool_id: 'mcp-github',
        opted_in_sensitive: ['GITHUB_CREATE_ISSUE', 'GITHUB_NOT_REAL_ACTION'],
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    const row = connectedRows[0];
    expect(row.tool_id).toBe('mcp-github');
    expect(row.composio_app).toBe('github');
    expect(row.status).toBe('active');
    // GitHub safe actions: LIST_REPOS, GET_FILE_CONTENT
    expect(row.enabled_actions).toEqual(
      expect.arrayContaining(['GITHUB_LIST_REPOS', 'GITHUB_GET_FILE_CONTENT', 'GITHUB_CREATE_ISSUE']),
    );
    expect(row.enabled_actions).not.toContain('GITHUB_NOT_REAL_ACTION');
    expect(initiateMock).toHaveBeenCalledWith('github', 'user-1', undefined);
  });

  it('502 when Composio call returns error', async () => {
    initiateMock.mockResolvedValueOnce({ error: 'OAuth misconfigured' });
    const res = mockRes();
    await handler(
      { method: 'POST', query: { op: 'connect' }, body: { agent_id: 'a-1', tool_id: 'mcp-github' } },
      res,
    );
    expect(res.statusCode).toBe(502);
    expect(connectedRows).toHaveLength(0);
  });
});

describe('actions toggle — L6 per-action allowlist', () => {
  beforeEach(() => {
    connectedRows.push({
      id: 'row-1',
      user_id: 'user-1',
      agent_id: 'a-1',
      tool_id: 'mcp-github',
      composio_app: 'github',
      status: 'active',
      enabled_actions: ['GITHUB_LIST_REPOS'],
    });
  });

  it('400 when action is not in catalog for that tool', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { op: 'actions' }, body: { id: 'row-1', action: 'BOGUS', enabled: true } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('enables a sensitive action and persists', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { op: 'actions' }, body: { id: 'row-1', action: 'GITHUB_CREATE_ISSUE', enabled: true } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(connectedRows[0].enabled_actions).toContain('GITHUB_CREATE_ISSUE');
  });

  it('disables an enabled action', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { op: 'actions' }, body: { id: 'row-1', action: 'GITHUB_LIST_REPOS', enabled: false } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(connectedRows[0].enabled_actions).not.toContain('GITHUB_LIST_REPOS');
  });

  it('400 when enabled is not boolean', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { op: 'actions' }, body: { id: 'row-1', action: 'GITHUB_LIST_REPOS', enabled: 'yes' } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('disconnect — soft delete', () => {
  it('flips status to revoked', async () => {
    connectedRows.push({
      id: 'row-1',
      user_id: 'user-1',
      agent_id: 'a-1',
      tool_id: 'mcp-github',
      composio_app: 'github',
      status: 'active',
      enabled_actions: ['GITHUB_LIST_REPOS'],
    });
    const res = mockRes();
    await handler({ method: 'POST', query: { op: 'disconnect' }, body: { id: 'row-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(connectedRows[0].status).toBe('revoked');
  });
});

describe('catalog endpoint', () => {
  it('returns flattened catalog metadata', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { op: 'catalog' }, body: {} }, res);
    expect(res.statusCode).toBe(200);
    const items = res.body;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(10);
    const github = items.find((i) => i.id === 'mcp-github');
    expect(github).toMatchObject({ name: 'GitHub', riskTier: 'medium' });
    expect(github.actionsSafe).toContain('GITHUB_LIST_REPOS');
    expect(github.actionsSensitive).toContain('GITHUB_CREATE_ISSUE');
    expect(github.endpointUrl).toBe('https://api.github.com');
  });
});
