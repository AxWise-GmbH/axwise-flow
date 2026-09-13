import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'token'),
  buildSupabaseAdminClient: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'rl'),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifySupabaseToken: mocks.verifySupabaseToken, getBearerToken: mocks.getBearerToken }));
vi.mock('../../api/_lib/supabase-server.js', () => ({ buildSupabaseAdminClient: mocks.buildSupabaseAdminClient }));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({ jsonError: (res, c, m) => res.status(c).json({ error: m }), handleApiError: (res, e) => res.status(500).json({ error: e.message }) }));
vi.mock('../../api/_lib/rate-limit.js', () => ({ checkRateLimit: mocks.checkRateLimit, applyRateLimitHeaders: mocks.applyRateLimitHeaders, getRateLimitIdentifier: mocks.getRateLimitIdentifier }));
vi.mock('../../api/_lib/logger.js', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: () => () => undefined }) }));
vi.mock('../_shared/embeddings.js', () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2]),
  hashEmbedding: vi.fn(() => [0.3, 0.4]),
  estimateTokens: vi.fn(() => 3),
  EMBEDDING_DIM: 384,
}));

const { default: handler } = await import('./obsidian-sync.js');

function adminClient() {
  const b = { insert: vi.fn(async () => ({ error: null })) };
  return { from: vi.fn(() => b) };
}
function makeRes() {
  return { statusCode: 200, body: null, setHeader: vi.fn(), status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.buildSupabaseAdminClient.mockReturnValue(adminClient());
});

describe('obsidian-sync handler', () => {
  it('401 when unauthenticated', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { notes: [] } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('400 when notes missing', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('syncs markdown notes and skips empties', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { notes: [
      { path: 'vault/idea.md', content: '# Idea\nbuild things' },
      { path: 'vault/empty.md', content: '   ' },
    ] } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.synced).toBe(1);
    expect(res.body.skipped).toBe(1);
  });
});
