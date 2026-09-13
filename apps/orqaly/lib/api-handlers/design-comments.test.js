import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: null,
  enqueueAgentJob: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn(() => false) }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
  handleApiError: (res, error) => res.status(500).json({ error: error.message }),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => mocks.admin,
}));
vi.mock('../goal-handlers/_helpers.js', async () => {
  const actual = await vi.importActual('../goal-handlers/_helpers.js');
  return { ...actual, enqueueAgentJob: mocks.enqueueAgentJob };
});

import handler from './design-comments.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function matches(row, filters) {
  for (const [column, expected] of Object.entries(filters.eq)) {
    if (column.endsWith('_at')) {
      const actualMs = Date.parse(row[column]);
      const expectedMs = Date.parse(expected);
      if (Number.isFinite(actualMs) && Number.isFinite(expectedMs)) {
        if (actualMs !== expectedMs) return false;
        continue;
      }
    }
    if (row[column] !== expected) return false;
  }
  for (const [column, values] of Object.entries(filters.in)) {
    if (!values.includes(row[column])) return false;
  }
  return true;
}

function createAdmin({
  loseClaimResponse = false,
  failClaimInspection = false,
  normalizeClaimTimestamp = false,
  loseRollbackResponse = false,
  failRollbackInspection = false,
} = {}) {
  const rows = {
    goals: [{ id: 'goal-1', user_id: 'user-1', data: {}, plan: {}, iteration: 0 }],
    design_comments: [
      {
        id: 'comment-1',
        goal_id: 'goal-1',
        user_id: 'user-1',
        element_selector: '#hero',
        element_text: 'Old headline',
        comment_text: 'Make this clearer',
        status: 'open',
        applied_at: null,
        created_at: '2026-08-22T10:00:00.000Z',
        updated_at: '2026-08-22T10:00:00.000Z',
      },
    ],
  };
  const operations = [];
  let updateSequence = 0;
  let claimResponseLost = false;
  let rollbackResponseLost = false;
  let pendingClaimInspection = false;
  let pendingRollbackInspection = false;

  function from(table) {
    const state = {
      table,
      mode: 'select',
      patch: null,
      eq: {},
      in: {},
      limit: null,
      executed: false,
      result: null,
    };

    function execute() {
      if (state.executed) return state.result;
      state.executed = true;
      const tableRows = rows[table] || [];
      let selected = tableRows.filter((row) => matches(row, state));
      if (state.limit !== null) selected = selected.slice(0, state.limit);
      if (state.mode === 'update') {
        updateSequence += 1;
        for (const row of selected) {
          Object.assign(row, state.patch, {
            updated_at: `2026-08-22T10:00:${String(updateSequence).padStart(2, '0')}.000Z`,
          });
          if (
            normalizeClaimTimestamp &&
            state.patch?.status === 'applied' &&
            typeof row.applied_at === 'string'
          ) {
            row.applied_at = row.applied_at.replace(/Z$/, '+00:00');
          }
        }
      }
      state.result = { data: selected.map((row) => ({ ...row })), error: null };
      operations.push({
        table,
        mode: state.mode,
        eq: { ...state.eq },
        in: Object.fromEntries(
          Object.entries(state.in).map(([column, values]) => [column, [...values]])
        ),
        patch: state.patch,
      });
      return state.result;
    }

    const query = {
      select: vi.fn(() => query),
      update: vi.fn((patch) => {
        state.mode = 'update';
        state.patch = patch;
        return query;
      }),
      eq: vi.fn((column, value) => {
        state.eq[column] = value;
        return query;
      }),
      in: vi.fn((column, values) => {
        state.in[column] = values;
        return query;
      }),
      order: vi.fn(() => query),
      limit: vi.fn((value) => {
        state.limit = value;
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        const result = execute();
        return { data: result.data[0] || null, error: result.error };
      }),
      single: vi.fn(async () => {
        const result = execute();
        return { data: result.data[0] || null, error: result.error };
      }),
      then(onFulfilled, onRejected) {
        const result = execute();
        const isClaim = state.mode === 'update' && state.patch?.status === 'applied';
        if (loseClaimResponse && isClaim && !claimResponseLost) {
          claimResponseLost = true;
          pendingClaimInspection = true;
          return Promise.reject(new Error('claim response lost')).then(onFulfilled, onRejected);
        }
        const isRollback =
          state.mode === 'update' &&
          state.patch?.status === 'open' &&
          state.patch?.applied_at === null;
        if (loseRollbackResponse && isRollback && !rollbackResponseLost) {
          rollbackResponseLost = true;
          pendingRollbackInspection = true;
          return Promise.reject(new Error('rollback response lost')).then(onFulfilled, onRejected);
        }
        const isApplicationInspection =
          state.mode === 'select' && state.eq.goal_id === 'goal-1' && Array.isArray(state.in.id);
        if (isApplicationInspection && pendingClaimInspection) {
          pendingClaimInspection = false;
          if (failClaimInspection) {
            return Promise.reject(new Error('claim inspection unavailable')).then(
              onFulfilled,
              onRejected
            );
          }
        }
        if (isApplicationInspection && pendingRollbackInspection) {
          pendingRollbackInspection = false;
          if (failRollbackInspection) {
            return Promise.reject(new Error('rollback inspection unavailable')).then(
              onFulfilled,
              onRejected
            );
          }
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return { from: vi.fn(from), rows, operations };
}

async function request({ method = 'GET', query = {}, body = {} } = {}) {
  const res = response();
  await handler(
    {
      method,
      query,
      body,
      headers: { 'user-agent': 'design-comments-test' },
      socket: { remoteAddress: '127.0.0.1' },
    },
    res
  );
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = createAdmin();
  mocks.enqueueAgentJob.mockImplementation(async (_admin, job) => ({
    ...job,
    status: 'queued',
  }));
});

describe('design comments handler', () => {
  it('uses the current authenticated rate-limit API and permits normal traffic', async () => {
    const res = await request({ query: { op: 'list', goalId: 'goal-1' } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.headers['X-RateLimit-Limit']).toBe('60');
    expect(res.headers['X-RateLimit-Remaining']).toBe('59');
  });

  it('creates a new exact job generation when the same completed comment is reopened', async () => {
    const jobs = [];
    const terminalIds = new Set();
    mocks.enqueueAgentJob.mockImplementation(async (_admin, job) => {
      jobs.push(job);
      return { ...job, status: terminalIds.has(job.id) ? 'done' : 'queued' };
    });

    const first = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });
    expect(first.statusCode).toBe(202);
    terminalIds.add(jobs[0].id);

    const reopened = await request({
      method: 'PATCH',
      query: { op: 'update', id: 'comment-1' },
      body: { status: 'open' },
    });
    expect(reopened.statusCode).toBe(200);

    const second = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });
    expect(second.statusCode).toBe(202);
    expect(jobs).toHaveLength(2);
    expect(jobs[1].id).not.toBe(jobs[0].id);
    expect(jobs[1].payload.feedbackApplicationVersion).not.toBe(
      jobs[0].payload.feedbackApplicationVersion
    );
    expect(jobs[1].payload).toMatchObject({
      goalId: 'goal-1',
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
      commentIds: ['comment-1'],
    });
    expect(jobs[1].user_id).toBe('user-1');

    const openRead = mocks.admin.operations.find(
      (operation) => operation.mode === 'select' && operation.eq.status === 'open'
    );
    const claim = mocks.admin.operations.find(
      (operation) => operation.mode === 'update' && operation.patch?.status === 'applied'
    );
    expect(openRead.eq).toMatchObject({ goal_id: 'goal-1', user_id: 'user-1' });
    expect(claim.eq).toMatchObject({
      goal_id: 'goal-1',
      user_id: 'user-1',
      status: 'open',
    });
  });

  it('fails closed and reopens the exact claimed rows if an old terminal job is returned', async () => {
    mocks.enqueueAgentJob.mockImplementation(async (_admin, job) => ({ ...job, status: 'done' }));

    const res = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });

    expect(res.statusCode).toBe(503);
    expect(mocks.admin.rows.design_comments[0]).toMatchObject({
      goal_id: 'goal-1',
      user_id: 'user-1',
      status: 'open',
      applied_at: null,
    });
  });

  it('recovers an exact committed claim after its write response is lost', async () => {
    mocks.admin = createAdmin({ loseClaimResponse: true });

    const res = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(1);
    expect(mocks.admin.rows.design_comments[0]).toMatchObject({
      goal_id: 'goal-1',
      user_id: 'user-1',
      status: 'applied',
    });
  });

  it('reconciles a committed claim when Postgres returns the same instant in offset form', async () => {
    mocks.admin = createAdmin({ loseClaimResponse: true, normalizeClaimTimestamp: true });

    const res = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(1);
    expect(mocks.admin.rows.design_comments[0].applied_at).toMatch(/\+00:00$/);
  });

  it('fails closed when neither a claim response nor its exact inspection is available', async () => {
    mocks.admin = createAdmin({ loseClaimResponse: true, failClaimInspection: true });

    const res = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });

    expect(res.statusCode).toBe(503);
    expect(mocks.enqueueAgentJob).not.toHaveBeenCalled();
  });

  it('adopts an exact committed rollback after its response is lost', async () => {
    mocks.admin = createAdmin({ loseRollbackResponse: true });
    mocks.enqueueAgentJob.mockRejectedValue(new Error('Preview wake unavailable'));

    const res = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });

    expect(res.statusCode).toBe(503);
    expect(res.body.error).not.toMatch(/requires reconciliation/i);
    expect(mocks.admin.rows.design_comments[0]).toMatchObject({
      status: 'open',
      applied_at: null,
    });
  });

  it('surfaces reconciliation when a lost rollback response cannot be inspected', async () => {
    mocks.admin = createAdmin({
      loseRollbackResponse: true,
      failRollbackInspection: true,
    });
    mocks.enqueueAgentJob.mockRejectedValue(new Error('Preview wake unavailable'));

    const res = await request({ method: 'POST', query: { op: 'apply', goalId: 'goal-1' } });

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires reconciliation/i);
  });
});
