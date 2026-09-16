import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'token'),
  buildSupabaseUserClient: vi.fn(),
  buildSupabaseAdminClient: vi.fn(),
  executeLlmV2Tracked: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'rl'),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifySupabaseToken: mocks.verifySupabaseToken, getBearerToken: mocks.getBearerToken }));
vi.mock('../../api/_lib/supabase-server.js', () => ({ buildSupabaseUserClient: mocks.buildSupabaseUserClient, buildSupabaseAdminClient: mocks.buildSupabaseAdminClient }));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({ jsonError: (res, c, m) => res.status(c).json({ error: m }), handleApiError: (res, e) => res.status(500).json({ error: e.message }) }));
vi.mock('../../api/_lib/rate-limit.js', () => ({ checkRateLimit: mocks.checkRateLimit, applyRateLimitHeaders: mocks.applyRateLimitHeaders, getRateLimitIdentifier: mocks.getRateLimitIdentifier }));
vi.mock('../../api/_lib/logger.js', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: () => () => undefined }) }));
vi.mock('../usage-handlers/tracked-llm.js', () => ({ executeLlmV2Tracked: mocks.executeLlmV2Tracked }));
vi.mock('../_shared/embeddings.js', () => ({ generateEmbedding: vi.fn(async () => [0.1, 0.2]), estimateTokens: vi.fn(() => 5) }));

const { default: handler } = await import('./assistant-first-steps.js');

function userClient() {
  const b = {
    select: vi.fn(() => b), eq: vi.fn(() => b), order: vi.fn(() => b),
    limit: vi.fn(async () => ({ data: [{ title: 'Doc', category: 'company' }], error: null })),
    maybeSingle: vi.fn(async () => ({ data: { summary: 'We sell widgets' }, error: null })),
  };
  return { from: vi.fn(() => b) };
}
function adminClient() {
  const a = { insert: vi.fn(() => a), select: vi.fn(() => a), single: vi.fn(async () => ({ data: { id: 'doc1' }, error: null })) };
  return { from: vi.fn(() => a) };
}
function makeRes() {
  return { statusCode: 200, body: null, setHeader: vi.fn(), status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.buildSupabaseUserClient.mockReturnValue(userClient());
  mocks.buildSupabaseAdminClient.mockReturnValue(adminClient());
  mocks.executeLlmV2Tracked.mockReset();
});

describe('assistant-first-steps handler', () => {
  it('401 when unauthenticated', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('405 for non-POST', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('generates a narrative from brief + KB and persists it', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.executeLlmV2Tracked.mockResolvedValue({ content: 'First steps:\n- do X' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.narrative).toMatch(/First steps/);
    expect(res.body.docId).toBe('doc1');
  });

  it('falls back to a default plan when the LLM fails', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.executeLlmV2Tracked.mockRejectedValue(new Error('overloaded'));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.narrative).toMatch(/First steps/i);
  });
});
