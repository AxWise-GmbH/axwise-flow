/**
 * assistant-setup endpoint contract tests. Mocks at the boundary (auth,
 * rate-limit, supabase user client) to exercise routing, validation, the
 * config/steps merge, and response shape.
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

const { default: handler } = await import('./assistant-setup.js');

/** Chainable supabase builder mock: maybeSingle -> loadRow, single -> savedRow. */
function makeUserClient({ loadRow = null, savedRow = null, error = null } = {}) {
  const upsert = vi.fn(() => builder);
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    upsert,
    maybeSingle: vi.fn(async () => ({ data: loadRow, error })),
    single: vi.fn(async () => ({ data: savedRow, error })),
  };
  return { client: { from: vi.fn(() => builder) }, upsert };
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

describe('assistant-setup handler', () => {
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

  it('GET returns the existing setup row', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client } = makeUserClient({
      loadRow: { config: { provider: 'gemini' }, steps: { channel: true }, activated: true, updated_at: 't' },
    });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.setup).toEqual({
      config: { provider: 'gemini' }, steps: { channel: true }, activated: true, updatedAt: 't',
    });
  });

  it('GET returns null when no row exists yet', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client } = makeUserClient({ loadRow: null });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.setup).toBeNull();
  });

  it('POST merges config/steps with the existing row and upserts', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, upsert } = makeUserClient({
      loadRow: { config: { provider: 'gemini', tone: 'friendly' }, steps: { channel: true }, activated: false },
      savedRow: { config: { provider: 'openai', tone: 'friendly' }, steps: { channel: true, persona: true }, activated: true, updated_at: 't2' },
    });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: { config: { provider: 'openai' }, steps: { persona: true }, activated: true },
    }, res);
    expect(res.statusCode).toBe(200);
    // Merge preserves existing keys (tone, channel) and applies new ones.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        config: { provider: 'openai', tone: 'friendly' },
        steps: { channel: true, persona: true },
        activated: true,
      }),
      { onConflict: 'user_id' },
    );
    expect(res.body.setup.activated).toBe(true);
  });

  it('POST rejects a non-object config', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(makeUserClient().client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { config: 'nope' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects a non-boolean activated', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(makeUserClient().client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { activated: 'yes' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
