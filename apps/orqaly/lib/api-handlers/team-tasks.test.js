/**
 * Tests for /api/app?path=team-tasks
 * Covers: GET (list, single, filters), POST (create), PUT (update), DELETE, auth,
 * rate limit, validation, and per-user scoping.
 *
 * The Supabase mock is a chainable builder that RECORDS every filter applied, so
 * the scoping tests can only pass if `.eq('user_id', ...)` is genuinely on the
 * query. (It replaced per-test fixed-depth chain stubs, which had to be rewritten
 * by hand whenever a filter was added.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 30, remaining: 29, resetAt: 0 })),
  applyRateLimitHeaders: vi.fn(),
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

const db = vi.hoisted(() => ({ calls: [], result: { data: null, error: null } }));

vi.mock('../../api/_lib/supabase-server.js', () => {
  function builder() {
    const call = { op: null, filters: [], payload: undefined };
    db.calls.push(call);
    const done = async () => db.result;
    const chain = {
      select() {
        call.op = call.op || 'select';
        return chain;
      },
      insert(row) {
        call.op = 'insert';
        call.payload = row;
        return chain;
      },
      update(patch) {
        call.op = 'update';
        call.payload = patch;
        return chain;
      },
      delete() {
        call.op = 'delete';
        return chain;
      },
      eq(col, val) {
        call.filters.push(['eq', col, val]);
        return chain;
      },
      order() {
        return chain;
      },
      limit: done,
      maybeSingle: done,
      single: done,
      // Terminal await for chains with no explicit terminal call (DELETE).
      then(resolve, reject) {
        return done().then(resolve, reject);
      },
    };
    return chain;
  }
  return { buildSupabaseUserClient: vi.fn(() => ({ from: () => builder() })) };
});

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './team-tasks.js';

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

function makeReq(method, query = '', body = null) {
  return {
    method,
    headers: { host: 'localhost' },
    url: `/api/app?path=team-tasks${query}`,
    body,
  };
}

const lastCall = () => db.calls[db.calls.length - 1];
const scopedToUser = (call, uid = 'user-1') =>
  call.filters.some(([kind, col, val]) => kind === 'eq' && col === 'user_id' && val === uid);

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.result = { data: null, error: null };
});

describe('/api/app?path=team-tasks', () => {
  describe('auth', () => {
    it('returns 401 when token is invalid', async () => {
      verifySupabaseToken.mockResolvedValueOnce(null);
      const res = makeRes();
      await handler(makeReq('GET'), res);
      expect(res._status).toBe(401);
    });
  });

  describe('rate limit', () => {
    it('returns 429 when the limit is exceeded', async () => {
      checkRateLimit.mockReturnValueOnce({ allowed: false, limit: 30, remaining: 0, resetAt: 0 });
      const res = makeRes();
      await handler(makeReq('GET'), res);
      expect(res._status).toBe(429);
    });
  });

  describe('method handling', () => {
    it('returns 200 for OPTIONS', async () => {
      const res = makeRes();
      await handler(makeReq('OPTIONS'), res);
      expect(res._status).toBe(200);
    });

    it('returns 405 for PATCH', async () => {
      const res = makeRes();
      await handler(makeReq('PATCH'), res);
      expect(res._status).toBe(405);
    });
  });

  describe('GET', () => {
    it('lists tasks', async () => {
      const tasks = [{ id: 't1', title: 'Test' }];
      db.result = { data: tasks, error: null };
      const res = makeRes();
      await handler(makeReq('GET'), res);
      expect(res._status).toBe(200);
      expect(res._body.tasks).toEqual(tasks);
    });

    it('gets single task by id', async () => {
      const task = { id: 't1', title: 'Test' };
      db.result = { data: task, error: null };
      const res = makeRes();
      await handler(makeReq('GET', '&id=t1'), res);
      expect(res._status).toBe(200);
      expect(res._body.task).toEqual(task);
    });

    it('returns 404 for missing task', async () => {
      db.result = { data: null, error: null };
      const res = makeRes();
      await handler(makeReq('GET', '&id=missing'), res);
      expect(res._status).toBe(404);
    });
  });

  describe('POST', () => {
    it('creates a task', async () => {
      const task = { id: 'task-1', title: 'New task' };
      db.result = { data: task, error: null };
      const res = makeRes();
      await handler(makeReq('POST', '', { title: 'New task' }), res);
      expect(res._status).toBe(201);
      expect(res._body.task).toEqual(task);
    });

    it('returns 400 without title', async () => {
      const res = makeRes();
      await handler(makeReq('POST', '', {}), res);
      expect(res._status).toBe(400);
    });
  });

  describe('PUT', () => {
    it('updates a task', async () => {
      const task = { id: 't1', title: 'Updated', status: 'done' };
      db.result = { data: task, error: null };
      const res = makeRes();
      await handler(makeReq('PUT', '&id=t1', { status: 'done' }), res);
      expect(res._status).toBe(200);
      expect(res._body.task).toEqual(task);
    });

    it('returns 400 without id', async () => {
      const res = makeRes();
      await handler(makeReq('PUT', '', { status: 'done' }), res);
      expect(res._status).toBe(400);
    });

    it('returns 400 with no valid fields', async () => {
      const res = makeRes();
      await handler(makeReq('PUT', '&id=t1', { invalid: true }), res);
      expect(res._status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('deletes a task', async () => {
      db.result = { error: null };
      const res = makeRes();
      await handler(makeReq('DELETE', '&id=t1'), res);
      expect(res._status).toBe(200);
      expect(res._body.deleted).toBe(true);
    });

    it('returns 400 without id', async () => {
      const res = makeRes();
      await handler(makeReq('DELETE'), res);
      expect(res._status).toBe(400);
    });
  });

  // team_tasks had no owner column and an `auth.role() = 'authenticated'` policy,
  // so every user could read and mutate every other user's tasks.
  describe('per-user scoping', () => {
    it('scopes the list query to the caller', async () => {
      db.result = { data: [], error: null };
      await handler(makeReq('GET'), makeRes());
      expect(scopedToUser(lastCall())).toBe(true);
    });

    it('scopes a single-task read to the caller', async () => {
      db.result = { data: { id: 't1' }, error: null };
      await handler(makeReq('GET', '&id=t1'), makeRes());
      expect(scopedToUser(lastCall())).toBe(true);
    });

    it('stamps the caller as owner on create', async () => {
      db.result = { data: { id: 'task-1' }, error: null };
      await handler(makeReq('POST', '', { title: 'New task' }), makeRes());
      expect(lastCall().payload.user_id).toBe('user-1');
    });

    it('ignores a body-supplied user_id on create (no spoofing)', async () => {
      db.result = { data: { id: 'task-1' }, error: null };
      await handler(makeReq('POST', '', { title: 'New task', user_id: 'someone-else' }), makeRes());
      expect(lastCall().payload.user_id).toBe('user-1');
    });

    it('ignores a body-supplied user_id on update', async () => {
      db.result = { data: { id: 't1' }, error: null };
      await handler(
        makeReq('PUT', '&id=t1', { status: 'done', user_id: 'someone-else' }),
        makeRes()
      );
      expect(lastCall().payload.user_id).toBeUndefined();
      expect(scopedToUser(lastCall())).toBe(true);
    });

    it('scopes delete to the caller so an id alone cannot remove another user task', async () => {
      db.result = { error: null };
      await handler(makeReq('DELETE', '&id=t1'), makeRes());
      expect(scopedToUser(lastCall())).toBe(true);
    });
  });
});
