/**
 * assistants endpoint contract tests. Mocks at the boundary (auth, rate-limit,
 * supabase user client) to exercise routing, the action switch, validation, and
 * response shape (list + currentId).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'token'),
  buildSupabaseUserClient: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 99, limit: 100, reset: 0 })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'rl'),
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    startTimer: () => () => undefined,
  }),
}));

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
vi.mock('../../api/_lib/logger.js', () => ({ createLogger: mocks.createLogger }));

const { default: handler } = await import('./assistants.js');

/**
 * Chainable supabase builder mock. The builder is thenable so awaiting a
 * select/eq/order chain resolves to { data: listRows }; single()/maybeSingle()
 * resolve to the configured single rows.
 */
function makeUserClient({ listRows = [], singleRow = null, maybeRow = null, error = null } = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: maybeRow, error })),
    single: vi.fn(async () => ({ data: singleRow, error })),
    then: (resolve) => resolve({ data: listRows, error }),
  };
  return { client: { from: vi.fn(() => builder) }, builder };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
  };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.getBearerToken.mockReturnValue('token');
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 99, limit: 100, reset: 0 });
});

describe('assistants handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, limit: 100, reset: 0 });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(429);
  });

  it('GET lists assistants and reports the current one', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client } = makeUserClient({
      listRows: [
        { id: 'a1', organization_id: 'org1', name: 'Acme', config: {}, steps: {}, activated: true, is_current: true },
        { id: 'a2', organization_id: null, name: 'Side', config: {}, steps: {}, activated: false, is_current: false },
      ],
    });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.assistants).toHaveLength(2);
    expect(res.body.currentId).toBe('a1');
    expect(res.body.assistants[0].organizationId).toBe('org1');
  });

  it('POST create returns the new current assistant', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const newRow = { id: 'a3', organization_id: 'org9', name: 'Fintech', config: {}, steps: {}, activated: false, is_current: true };
    const { client } = makeUserClient({ singleRow: newRow, listRows: [newRow] });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'create', organizationId: 'org9', name: 'Fintech' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.assistant.id).toBe('a3');
    expect(res.body.currentId).toBe('a3');
  });

  it('POST save without an id is rejected', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(makeUserClient().client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'save', config: {} } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST with an unknown action is rejected', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(makeUserClient().client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'frobnicate' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
