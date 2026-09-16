/**
 * Storage-connections endpoint contract tests. Mocks at the boundary layer
 * (auth, the security wrapper, the backend probe) so we exercise routing,
 * validation, and response shape end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const userClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [{
              id: 'conn-1', kind: 'supabase', slot: 'primary', label: 'Test',
              metadata: { bucket: 'b' }, last_tested_at: '2026-01-01', last_test_ok: true,
              last_test_error: null, created_at: '2026-01-01', updated_at: '2026-01-01',
            }], error: null })),
          })),
        })),
      })),
    })),
  };

  return {
    verifySupabaseToken: vi.fn(),
    getBearerToken: vi.fn(() => 'token'),
    buildSupabaseUserClient: vi.fn(() => userClient),
    saveStorageConnection: vi.fn(),
    deleteStorageConnection: vi.fn(),
    recordConnectionTest: vi.fn(),
    readStorageConnection: vi.fn(),
    probeUserConnection: vi.fn(),
    invalidateClientCache: vi.fn(),
    checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 99, limit: 100, reset: 0 })),
    applyRateLimitHeaders: vi.fn(),
    getRateLimitIdentifier: vi.fn(() => 'rl'),
    createLogger: () => ({
      info: vi.fn(), warn: vi.fn(), error: vi.fn(),
      startTimer: () => () => undefined,
    }),
  };
});

vi.mock('../../api/_lib/auth.js', () => ({
  verifySupabaseToken: mocks.verifySupabaseToken,
  getBearerToken: mocks.getBearerToken,
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: mocks.buildSupabaseUserClient,
}));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, code, msg) => res.status(code).json({ error: msg }),
  handleApiError: (res, err) => res.status(500).json({ error: err.message }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: mocks.checkRateLimit,
  applyRateLimitHeaders: mocks.applyRateLimitHeaders,
  getRateLimitIdentifier: mocks.getRateLimitIdentifier,
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: mocks.createLogger,
}));
vi.mock('../security/storage-connections.js', () => ({
  saveStorageConnection: mocks.saveStorageConnection,
  deleteStorageConnection: mocks.deleteStorageConnection,
  recordConnectionTest: mocks.recordConnectionTest,
  readStorageConnection: mocks.readStorageConnection,
}));
vi.mock('../storage/backends/supabase.js', () => ({
  probeUserConnection: mocks.probeUserConnection,
  invalidateClientCache: mocks.invalidateClientCache,
}));

const { default: handler } = await import('./storage-connections.js');

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
  };
  return res;
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m?.mockReset?.());
  mocks.getBearerToken.mockReturnValue('token');
  mocks.buildSupabaseUserClient.mockImplementation(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [{
              id: 'conn-1', kind: 'supabase', slot: 'primary', label: 'Test',
              metadata: { bucket: 'b' }, last_tested_at: '2026-01-01', last_test_ok: true,
              last_test_error: null, created_at: '2026-01-01', updated_at: '2026-01-01',
            }], error: null })),
          })),
        })),
      })),
    })),
  }));
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 99, limit: 100, reset: 0 });
});

describe('storage-connections handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('GET returns connection list (no credentials)', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.connections).toHaveLength(1);
    expect(res.body.connections[0]).not.toHaveProperty('credential');
    expect(res.body.connections[0]).not.toHaveProperty('vault_secret_id');
  });

  it('POST rejects missing kind', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: { credential: 'x' },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects missing credential', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: { kind: 'supabase' },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST runs probe before saving and rejects on probe failure', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    mocks.probeUserConnection.mockResolvedValue({ ok: false, error: 'wrong key' });
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: {
        kind: 'supabase',
        credential: JSON.stringify({ url: 'https://x.supabase.co', serviceRoleKey: 'srk' }),
      },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/probe failed/i);
    expect(mocks.saveStorageConnection).not.toHaveBeenCalled();
  });

  it('POST saves connection on successful probe', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    mocks.probeUserConnection.mockResolvedValue({ ok: true });
    mocks.saveStorageConnection.mockResolvedValue({
      id: 'conn-2', kind: 'supabase', slot: 'primary', label: 'Mine', metadata: {},
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: {
        kind: 'supabase',
        label: 'Mine',
        credential: JSON.stringify({ url: 'https://x.supabase.co', serviceRoleKey: 'srk' }),
        metadata: { bucket: 'my-bucket' },
      },
    }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('conn-2');
    expect(res.body.lastTestOk).toBe(true);
    expect(mocks.recordConnectionTest).toHaveBeenCalledWith('conn-2', { ok: true });
  });

  it('DELETE removes connection', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    mocks.deleteStorageConnection.mockResolvedValue();
    const res = makeRes();
    await handler({
      method: 'DELETE',
      headers: {},
      query: { id: 'conn-1' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.deleteStorageConnection).toHaveBeenCalledWith('conn-1', 'user-1');
  });

  it('DELETE rejects missing id', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    const res = makeRes();
    await handler({ method: 'DELETE', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST action=test runs probe on existing connection', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    mocks.readStorageConnection.mockResolvedValue({
      kind: 'supabase', credential: 'cred', metadata: {}, slot: 'primary', userId: 'user-1',
    });
    mocks.probeUserConnection.mockResolvedValue({ ok: true });
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: { action: 'test', id: 'conn-1' },
      body: {},
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.recordConnectionTest).toHaveBeenCalledWith('conn-1', { ok: true });
  });
});
