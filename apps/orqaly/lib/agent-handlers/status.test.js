import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: () => 'test-token',
  verifySupabaseToken: mocks.verifySupabaseToken,
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
  handleApiError: (res, error) => res.status(500).json({ error: error.message }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: () => ({ allowed: true, limit: 60, remaining: 59, resetAt: Date.now() + 60_000 }),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: () => 'user-1',
}));

import handler from './status.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function request(id = 'job-1') {
  return {
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: { id },
  };
}

function fakeAdmin(rows = []) {
  const state = { selected: null, filters: [] };
  const query = {
    eq(column, value) {
      state.filters.push([column, value]);
      return query;
    },
    async maybeSingle() {
      const row = rows.find((candidate) =>
        state.filters.every(([column, value]) => String(candidate[column]) === String(value))
      );
      return { data: row ? structuredClone(row) : null, error: null };
    },
  };
  return {
    state,
    from: vi.fn((table) => {
      if (table !== 'agent_jobs') throw new Error(`Unexpected table: ${table}`);
      return {
        select: vi.fn((columns) => {
          state.selected = columns;
          return query;
        }),
      };
    }),
  };
}

async function run(rows) {
  const admin = fakeAdmin(rows);
  mocks.buildSupabaseAdminClient.mockReturnValue(admin);
  const res = response();
  await handler(request(), res);
  return { admin, res };
}

describe('agent job status ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
  });

  it('returns an owned job using the top-level user_id boundary', async () => {
    const { admin, res } = await run([
      {
        id: 'job-1',
        user_id: 'user-1',
        status: 'done',
        result: { answer: 42 },
        error: null,
        created_at: '2026-08-22T10:00:00.000Z',
        updated_at: '2026-08-22T10:01:00.000Z',
        // A legacy/incorrect payload owner must not override the canonical
        // top-level owner selected by the database query.
        payload: { _userId: 'user-2' },
      },
    ]);

    expect(admin.state.selected).toContain('user_id');
    expect(admin.state.selected).not.toContain('payload');
    expect(admin.state.filters).toEqual([
      ['id', 'job-1'],
      ['user_id', 'user-1'],
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      job_id: 'job-1',
      status: 'done',
      result: { answer: 42 },
      error: undefined,
      created_at: '2026-08-22T10:00:00.000Z',
      updated_at: '2026-08-22T10:01:00.000Z',
    });
  });

  it('hides a foreign job even when its payload claims the authenticated user', async () => {
    const { res } = await run([
      {
        id: 'job-1',
        user_id: 'user-2',
        status: 'running',
        payload: { _userId: 'user-1' },
      },
    ]);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Job not found' });
  });

  it('hides a foreign job when its payload has no owner marker', async () => {
    const { res } = await run([
      {
        id: 'job-1',
        user_id: 'user-2',
        status: 'running',
        payload: {},
      },
    ]);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Job not found' });
  });

  it('returns the same response for a missing row as for every foreign row', async () => {
    const { res } = await run([]);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Job not found' });
  });
});
