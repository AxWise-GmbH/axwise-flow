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

const { default: handler } = await import('./ai-chat-import.js');

function adminClient() {
  const b = { update: vi.fn(() => b), eq: vi.fn(() => b), then: (r) => r({ error: null }) };
  return { from: vi.fn(() => b) };
}
function makeRes() {
  return { statusCode: 200, body: null, setHeader: vi.fn(), status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.buildSupabaseAdminClient.mockReturnValue(adminClient());
  mocks.ingestItems.mockClear();
  mocks.ingestItems.mockImplementation(async ({ items }) => ({ count: items.length, truncated: false }));
});

describe('ai-chat-import handler', () => {
  it('401 when unauthenticated', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('400 on invalid provider', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { provider: 'bogus', conversations: [] } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('ingests one item per conversation with source=<provider>:<id>', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: {
          provider: 'chatgpt',
          space: 'My Imports',
          conversations: [
            { id: 'c1', title: 'A', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }] },
            { id: 'c2', title: 'B', messages: [{ role: 'user', content: 'x' }] },
          ],
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ synced: 2, conversations: 2 });
    const arg = mocks.ingestItems.mock.calls[0][0];
    expect(arg.sourceTag).toBe('My Imports');
    expect(arg.items[0].source).toBe('chatgpt:c1');
    expect(arg.items[0].content).toContain('**user:** hi');
    expect(arg.items[0].content).toContain('**assistant:** yo');
  });

  it('skips conversations that render empty', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: {
          provider: 'generic',
          conversations: [{ id: 'c1', title: 'Empty', messages: [{ role: 'user', content: '   ' }] }],
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ synced: 0, conversations: 0 });
    expect(mocks.ingestItems).not.toHaveBeenCalled();
  });
});
