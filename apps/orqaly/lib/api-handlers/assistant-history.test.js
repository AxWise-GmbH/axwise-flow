/**
 * assistant-history endpoint contract tests. Mocks at the boundary (auth,
 * rate-limit, supabase user client) to exercise routing, validation, and
 * response shape for log (POST) and list (GET).
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
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

const { default: handler } = await import('./assistant-history.js');

/** Chainable supabase mock. list path resolves on .limit(); insert on .insert(). */
function makeUserClient({ listRows = [], listError = null, insertError = null } = {}) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: listRows, error: listError })),
    insert,
  };
  return { client: { from: vi.fn(() => builder) }, insert, builder };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    end() {
      return this;
    },
  };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.getBearerToken.mockReturnValue('token');
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 99, limit: 100, reset: 0 });
});

describe('assistant-history handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  // Reopening a past chat: select that conversation and hand it back as a
  // transcript (oldest first), not as a feed slice.
  it('GET scopes to one conversation and orders it oldest first', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeUserClient({ listRows: [] });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { conversation: 'c-7' } }, res);
    expect(res.statusCode).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith('conversation_id', 'c-7');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('GET keeps the flat feed newest first', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeUserClient({ listRows: [] });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    await handler({ method: 'GET', headers: {}, query: {} }, makeRes());
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(builder.eq).not.toHaveBeenCalledWith('conversation_id', expect.anything());
  });

  it('GET returns the user-scoped messages', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const rows = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'hi',
        mode: 'assistant',
        metadata: {},
        created_at: 't',
      },
    ];
    const { client, builder } = makeUserClient({ listRows: rows });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.messages).toEqual(rows);
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('GET with q + exclude searches content and skips the current conversation', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const rows = [
      {
        id: 'm9',
        conversation_id: 'c-old',
        role: 'user',
        content: 'about the budget',
        mode: 'assistant',
        metadata: {},
        created_at: 't',
      },
    ];
    const { client, builder } = makeUserClient({ listRows: rows });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler(
      { method: 'GET', headers: {}, query: { q: 'budget', exclude: 'c-current' } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.messages).toEqual(rows);
    expect(builder.ilike).toHaveBeenCalledWith('content', '%budget%');
    expect(builder.neq).toHaveBeenCalledWith('conversation_id', 'c-current');
  });

  it('GET without q does not filter by content', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeUserClient({ listRows: [] });
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    await handler({ method: 'GET', headers: {}, query: {} }, makeRes());
    expect(builder.ilike).not.toHaveBeenCalled();
    expect(builder.neq).not.toHaveBeenCalled();
  });

  it('POST inserts user-stamped rows', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, insert } = makeUserClient();
    mocks.buildSupabaseUserClient.mockReturnValue(client);
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: {
          conversation_id: 'c1',
          messages: [
            { role: 'user', content: 'hello', mode: 'assistant' },
            { role: 'assistant', content: 'hi back' },
          ],
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toBe(2);
    const inserted = insert.mock.calls[0][0];
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      user_id: 'u1',
      conversation_id: 'c1',
      role: 'user',
      content: 'hello',
      mode: 'assistant',
    });
  });

  it('POST rejects a missing conversation_id', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(makeUserClient().client);
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: { messages: [{ role: 'user', content: 'x' }] },
      },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects an invalid role', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(makeUserClient().client);
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: { conversation_id: 'c1', messages: [{ role: 'bot', content: 'x' }] },
      },
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
