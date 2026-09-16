import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: {},
  userClient: {},
  saveUserApiKey: vi.fn(),
  loadToolCredentialSnapshot: vi.fn(),
  reserveToolCredentialWrite: vi.fn(),
  releaseToolCredentialWrite: vi.fn(),
  finalizeToolCredentialDelete: vi.fn(),
  invalidateResolveCache: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
  handleApiError: (res, error) => res.status(500).json({ error: error.message }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user-1'),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ startTimer: () => vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: vi.fn(() => mocks.userClient),
  buildSupabaseAdminClient: vi.fn(() => mocks.admin),
}));
vi.mock('../security/resolve-user-key.js', () => ({
  invalidateResolveCache: mocks.invalidateResolveCache,
}));
vi.mock('./_shared/save-user-api-key.js', () => ({
  saveUserApiKey: mocks.saveUserApiKey,
}));
vi.mock('./_shared/tool-credential-write-reservation.js', () => ({
  toolIdFromCredentialProvider: (provider) =>
    typeof provider === 'string' && provider.startsWith('tool:') ? provider.slice(5) : null,
  loadToolCredentialSnapshot: mocks.loadToolCredentialSnapshot,
  reserveToolCredentialWrite: mocks.reserveToolCredentialWrite,
  releaseToolCredentialWrite: mocks.releaseToolCredentialWrite,
  finalizeToolCredentialDelete: mocks.finalizeToolCredentialDelete,
}));

const { default: handler } = await import('./user-api-keys.js');

function response() {
  return {
    statusCode: 200,
    body: null,
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

function request() {
  return {
    method: 'POST',
    headers: {},
    body: {
      provider: 'tool:tool-github',
      slot: 'default',
      label: 'GitHub',
      apiKey: 'manual-secret-value',
      skipProbe: true,
    },
  };
}

function deleteRequest() {
  return {
    method: 'DELETE',
    headers: {},
    query: { id: 'key-row' },
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function keyRow(overrides = {}) {
  return {
    id: 'key-row',
    user_id: 'user-1',
    provider: 'tool:tool-github',
    slot: 'default',
    label: 'GitHub',
    masked_preview: 'abcd…wxyz',
    fingerprint: 'fingerprint',
    key_length: 24,
    vault_secret_id: 'vault-secret-id',
    kek_id: 'ORQ_KEK_V1',
    is_current: true,
    superseded_at: null,
    superseded_by: null,
    last_tested_at: null,
    last_test_ok: null,
    created_at: '2026-08-22T10:00:00.000Z',
    updated_at: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}

function makeDeleteClients({ modes = [], remaining = false, row = {} } = {}) {
  const state = {
    row: keyRow(row),
    modes: [...modes],
    inspectionUnknown: false,
    updates: [],
  };

  function query(operation, payload = null) {
    const filters = [];
    let returning = operation === 'select';
    const matches = (row) => filters.every(({ field, value }) => (row?.[field] ?? null) === value);
    const evaluate = async () => {
      if (operation === 'select') {
        const isRemainingLookup = filters.some(({ field }) => field === 'provider');
        if (isRemainingLookup) {
          return {
            data: remaining ? { id: 'remaining-key-row' } : null,
            error: null,
          };
        }
        if (state.inspectionUnknown) {
          return { data: null, error: { message: 'inspection unavailable' } };
        }
        return { data: matches(state.row) ? clone(state.row) : null, error: null };
      }

      state.updates.push(clone(payload));
      const matched = matches(state.row);
      const mode = state.modes.shift() || 'success';
      const commit = () => {
        if (!matched) return;
        Object.assign(state.row, clone(payload), {
          updated_at: '2026-08-22T10:01:00.000Z',
        });
      };
      if (mode === 'success') {
        commit();
        return { data: matched && returning ? clone(state.row) : null, error: null };
      }
      if (mode === 'stale') return { data: null, error: null };
      if (mode === 'error_committed' || mode === 'throw_committed') commit();
      if (mode === 'error_conflict') {
        state.row.fingerprint = 'concurrently-edited';
        state.row.updated_at = '2026-08-22T10:02:00.000Z';
      }
      if (mode === 'error_unknown') state.inspectionUnknown = true;
      if (mode === 'throw_committed') throw new Error('delete response lost');
      return { data: null, error: { message: `delete ${mode}` } };
    };
    const chain = {
      eq(field, value) {
        filters.push({ field, value });
        return chain;
      },
      limit() {
        return chain;
      },
      select() {
        returning = true;
        return chain;
      },
      maybeSingle: evaluate,
      then(resolve, reject) {
        return evaluate().then(resolve, reject);
      },
    };
    return chain;
  }

  mocks.userClient = {
    from: () => ({ select: () => query('select') }),
  };
  mocks.admin = {
    from(table) {
      if (table !== 'user_api_keys') throw new Error(`Unexpected table ${table}`);
      return {
        select: () => query('select'),
        update: (payload) => query('update', payload),
      };
    },
  };
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = {};
  mocks.userClient = {};
  mocks.loadToolCredentialSnapshot.mockResolvedValue({
    ok: true,
    snapshot: {
      id: 'tool-github',
      user_id: 'user-1',
      name: 'GitHub',
      data: {},
      status: 'needs_setup',
      updated_at: '2026-08-22T12:00:00.000Z',
    },
  });
  mocks.reserveToolCredentialWrite.mockResolvedValue({
    ok: true,
    reservation: { attemptId: 'manual-attempt', toolId: 'tool-github', userId: 'user-1' },
  });
  mocks.releaseToolCredentialWrite.mockResolvedValue({ ok: true });
  mocks.finalizeToolCredentialDelete.mockResolvedValue({ ok: true });
  mocks.saveUserApiKey.mockResolvedValue({
    success: true,
    row: {
      id: 'key-row',
      provider: 'tool:tool-github',
      slot: 'default',
      maskedPreview: 'abcd…wxyz',
      tail: 'wxyz',
    },
  });
});

describe('user-api-keys tool writer reservation', () => {
  it('acquires and passes the shared reservation before a manual tool:* save', async () => {
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(mocks.loadToolCredentialSnapshot).toHaveBeenCalledWith({
      admin: mocks.admin,
      userId: 'user-1',
      toolId: 'tool-github',
    });
    expect(mocks.reserveToolCredentialWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: mocks.admin,
        userId: 'user-1',
        source: 'user-api-keys',
      })
    );
    expect(mocks.saveUserApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'tool:tool-github',
        adminClient: mocks.admin,
        toolCredentialReservation: expect.objectContaining({ attemptId: 'manual-attempt' }),
      })
    );
  });

  it('returns 409 without saving when the browser already owns the tool', async () => {
    mocks.reserveToolCredentialWrite.mockResolvedValueOnce({
      ok: false,
      code: 'TOOL_CREDENTIAL_WRITE_IN_PROGRESS',
      status: 409,
      message: 'Another credential write is already in progress',
    });
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(409);
    expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
  });
});

describe('user-api-keys tool delete reservation', () => {
  it('reserves the tool, deletes exact metadata, and finalizes into setup state', async () => {
    const state = makeDeleteClients();
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(mocks.reserveToolCredentialWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: mocks.admin,
        userId: 'user-1',
        source: 'user-api-keys-delete',
      })
    );
    expect(state.row).toMatchObject({ is_current: false, superseded_at: expect.any(String) });
    expect(mocks.finalizeToolCredentialDelete).toHaveBeenCalledWith({
      admin: mocks.admin,
      reservation: expect.objectContaining({ attemptId: 'manual-attempt' }),
      hasRemainingCredential: false,
    });
    expect(mocks.invalidateResolveCache).toHaveBeenCalledWith(
      'user-1',
      'tool:tool-github',
      'default'
    );
  });

  it('keeps the tool active when another current credential slot remains', async () => {
    makeDeleteClients({ remaining: true });
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(mocks.finalizeToolCredentialDelete).toHaveBeenCalledWith(
      expect.objectContaining({ hasRemainingCredential: true })
    );
  });

  it('preserves ordinary provider deletion without acquiring a tool fence', async () => {
    const state = makeDeleteClients({ row: { provider: 'llm:gemini' } });
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(state.row.is_current).toBe(false);
    expect(mocks.loadToolCredentialSnapshot).not.toHaveBeenCalled();
    expect(mocks.reserveToolCredentialWrite).not.toHaveBeenCalled();
    expect(mocks.finalizeToolCredentialDelete).not.toHaveBeenCalled();
  });

  it('treats an already inactive tool row as idempotent without taking a fence', async () => {
    const state = makeDeleteClients({ row: { is_current: false } });
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(state.updates).toHaveLength(0);
    expect(mocks.reserveToolCredentialWrite).not.toHaveBeenCalled();
  });

  it('does not mutate metadata when another writer owns the tool', async () => {
    const state = makeDeleteClients();
    mocks.reserveToolCredentialWrite.mockResolvedValueOnce({
      ok: false,
      code: 'TOOL_CREDENTIAL_WRITE_IN_PROGRESS',
      status: 409,
      message: 'Another credential write is already in progress',
    });
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(409);
    expect(state.updates).toHaveLength(0);
    expect(state.row.is_current).toBe(true);
  });

  it.each(['error_committed', 'throw_committed'])(
    'reconciles a committed delete after %s response loss',
    async (mode) => {
      const state = makeDeleteClients({ modes: [mode] });
      const res = response();

      await handler(deleteRequest(), res);

      expect(res.statusCode).toBe(200);
      expect(state.row.is_current).toBe(false);
      expect(mocks.releaseToolCredentialWrite).not.toHaveBeenCalled();
      expect(mocks.finalizeToolCredentialDelete).toHaveBeenCalledTimes(1);
    }
  );

  it('retries a delete only after proving the original metadata snapshot', async () => {
    const state = makeDeleteClients({ modes: ['error_original'] });
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(state.updates).toHaveLength(2);
    expect(state.row.is_current).toBe(false);
  });

  it('releases the exact tool fence after two proven-absent delete writes', async () => {
    const state = makeDeleteClients({ modes: ['error_original', 'error_original'] });
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/retry safely/i);
    expect(state.row.is_current).toBe(true);
    expect(mocks.releaseToolCredentialWrite).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeToolCredentialDelete).not.toHaveBeenCalled();
  });

  it.each(['error_conflict', 'error_unknown'])(
    'retains the tool fence when delete inspection is %s',
    async (mode) => {
      makeDeleteClients({ modes: [mode] });
      const res = response();

      await handler(deleteRequest(), res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/needs reconciliation/i);
      expect(mocks.releaseToolCredentialWrite).not.toHaveBeenCalled();
      expect(mocks.finalizeToolCredentialDelete).not.toHaveBeenCalled();
    }
  );

  it('fails closed after metadata commit when remaining-key state is unknown', async () => {
    makeDeleteClients();
    const originalAdmin = mocks.admin;
    const originalFrom = originalAdmin.from.bind(originalAdmin);
    originalAdmin.from = (table) => {
      const tableApi = originalFrom(table);
      if (table !== 'user_api_keys') return tableApi;
      return {
        ...tableApi,
        select: () => {
          const query = tableApi.select();
          const originalMaybeSingle = query.maybeSingle;
          query.maybeSingle = async () => {
            const result = await originalMaybeSingle();
            return result?.data?.id === 'remaining-key-row'
              ? result
              : { data: null, error: { message: 'remaining state unavailable' } };
          };
          return query;
        },
      };
    };
    const res = response();

    await handler(deleteRequest(), res);

    expect(res.statusCode).toBe(503);
    expect(mocks.finalizeToolCredentialDelete).not.toHaveBeenCalled();
    expect(mocks.releaseToolCredentialWrite).not.toHaveBeenCalled();
  });
});
