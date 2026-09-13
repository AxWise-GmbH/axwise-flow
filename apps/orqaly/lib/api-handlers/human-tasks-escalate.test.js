import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, message) => res.status(code).json({ error: message })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ startTimer: () => vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));

vi.stubEnv('CRON_SECRET', 'test-cron-secret');
const { default: handler } = await import('./human-tasks-escalate.js');

function mockRes() {
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

function queryResult(result, filters = []) {
  const query = {
    eq: vi.fn((field, value) => {
      filters.push(['eq', field, value]);
      return query;
    }),
    is: vi.fn((field, value) => {
      filters.push(['is', field, value]);
      return query;
    }),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

function makeAdmin({ candidates, casResult }) {
  const operations = [];
  const admin = {
    from: vi.fn((table) => ({
      select: vi.fn(() => queryResult({ data: candidates, error: null })),
      update: vi.fn((patch) => {
        const operation = { table, patch, filters: [] };
        operations.push(operation);
        return queryResult({ data: casResult, error: null }, operation.filters);
      }),
    })),
  };
  return { admin, operations };
}

function legacyCredentialTask() {
  return {
    id: 'task-1',
    user_id: 'user-1',
    type: 'provide_credential',
    status: 'pending',
    claimed_at: null,
    escalated_at: null,
    escalation_allowed: true,
    escalate_after_seconds: 120,
    updated_at: '2026-08-22T10:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('human credential escalation safety reconciler', () => {
  it('downgrades a legacy timed credential checkpoint to owner-only by exact CAS', async () => {
    const { admin, operations } = makeAdmin({
      candidates: [legacyCredentialTask()],
      casResult: { id: 'task-1' },
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.downgraded).toEqual([{ id: 'task-1', status: 'owner_only' }]);
    expect(operations).toHaveLength(1);
    expect(operations[0].patch).toEqual({
      escalation_allowed: false,
      escalate_after_seconds: null,
    });
    expect(operations[0].filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'task-1'],
        ['eq', 'user_id', 'user-1'],
        ['eq', 'type', 'provide_credential'],
        ['eq', 'status', 'pending'],
        ['eq', 'updated_at', '2026-08-22T10:00:00.000Z'],
        ['is', 'claimed_at', null],
        ['is', 'escalated_at', null],
      ])
    );
    expect(admin.from).toHaveBeenCalledTimes(3);
    expect(admin.from).toHaveBeenNthCalledWith(1, 'human_tasks');
    expect(admin.from).toHaveBeenNthCalledWith(2, 'human_tasks');
    expect(admin.from).toHaveBeenNthCalledWith(3, 'human_tasks');
  });

  it('does nothing when a concurrent claim/completion wins the downgrade CAS', async () => {
    const { admin, operations } = makeAdmin({
      candidates: [legacyCredentialTask()],
      casResult: null,
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.downgraded).toEqual([]);
    expect(operations).toHaveLength(1);
    expect(admin.from).toHaveBeenCalledTimes(3);
  });

  it('preserves an unknown or in-flight legacy dispatch lock', async () => {
    const task = {
      ...legacyCredentialTask(),
      escalated_at: '2026-08-22T10:01:00.000Z',
      escalation_result: { status: 'dispatching' },
    };
    const { admin, operations } = makeAdmin({
      candidates: [task],
      casResult: { id: 'task-1' },
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.downgraded).toEqual([{ id: 'task-1', status: 'legacy_dispatch_locked' }]);
    expect(operations[0].patch).toEqual({
      escalation_allowed: false,
      escalate_after_seconds: null,
    });
  });

  it('unlocks only an explicit fail-closed legacy dispatch outcome', async () => {
    const task = {
      ...legacyCredentialTask(),
      escalated_at: '2026-08-22T10:01:00.000Z',
      escalation_result: { status: 'no_rentahuman_key' },
    };
    const { admin, operations } = makeAdmin({
      candidates: [task],
      casResult: { id: 'task-1' },
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.downgraded).toEqual([{ id: 'task-1', status: 'owner_only' }]);
    expect(operations[0].patch).toEqual({
      escalation_allowed: false,
      escalate_after_seconds: null,
      escalated_at: null,
    });
  });
});
