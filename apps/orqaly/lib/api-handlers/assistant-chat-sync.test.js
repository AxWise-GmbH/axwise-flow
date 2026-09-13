import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'token'),
  buildSupabaseAdminClient: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'rl'),
  ingestItems: vi.fn(async ({ items }) => ({ count: items.length, truncated: false })),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifySupabaseToken: mocks.verifySupabaseToken, getBearerToken: mocks.getBearerToken }));
vi.mock('../../api/_lib/supabase-server.js', () => ({ buildSupabaseAdminClient: mocks.buildSupabaseAdminClient }));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({ jsonError: (res, c, m) => res.status(c).json({ error: m }), handleApiError: (res, e) => res.status(500).json({ error: e.message }) }));
vi.mock('../../api/_lib/rate-limit.js', () => ({ checkRateLimit: mocks.checkRateLimit, applyRateLimitHeaders: mocks.applyRateLimitHeaders, getRateLimitIdentifier: mocks.getRateLimitIdentifier }));
vi.mock('../../api/_lib/logger.js', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: () => () => undefined }) }));
vi.mock('./_shared/kb-ingest-common.js', () => ({ ingestItems: mocks.ingestItems }));

const { default: handler } = await import('./assistant-chat-sync.js');

/** Query builder whose chain methods return itself and resolves to `result`. */
function queryBuilder(result) {
  const b = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    then: (resolve) => resolve(result),
  };
  return b;
}
function adminClient(result) {
  return { from: vi.fn(() => queryBuilder(result)) };
}
function makeRes() {
  return { statusCode: 200, body: null, setHeader: vi.fn(), status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.ingestItems.mockClear();
  mocks.ingestItems.mockImplementation(async ({ items }) => ({ count: items.length, truncated: false }));
});

describe('assistant-chat-sync handler', () => {
  it('401 when unauthenticated', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('400 on invalid body (blank space)', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseAdminClient.mockReturnValue(adminClient({ data: [], error: null }));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { space: '   ' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns zero when there is no history', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseAdminClient.mockReturnValue(adminClient({ data: [], error: null }));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ synced: 0, conversations: 0 });
    expect(mocks.ingestItems).not.toHaveBeenCalled();
  });

  it('groups messages by conversation and ingests one doc per conversation into the space', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseAdminClient.mockReturnValue(adminClient({
      data: [
        { conversation_id: 'c1', role: 'user', content: 'hello', created_at: '2026-06-01T10:00:00Z' },
        { conversation_id: 'c1', role: 'assistant', content: 'hi there', created_at: '2026-06-01T10:00:01Z' },
        { conversation_id: 'c2', role: 'user', content: 'second chat', created_at: '2026-06-02T09:00:00Z' },
      ],
      error: null,
    }));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { space: 'My Space' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ synced: 2, conversations: 2, truncated: false });

    expect(mocks.ingestItems).toHaveBeenCalledTimes(1);
    const arg = mocks.ingestItems.mock.calls[0][0];
    expect(arg.sourceTag).toBe('My Space');
    expect(arg.connectionId).toBeNull();
    expect(arg.items).toHaveLength(2);
    expect(arg.items[0].source).toBe('assistant-chat:c1');
    expect(arg.items[0].content).toContain('**user:** hello');
    expect(arg.items[0].content).toContain('**assistant:** hi there');
  });
});
