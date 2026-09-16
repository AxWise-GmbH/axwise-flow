import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'token'),
  buildSupabaseUserClient: vi.fn(),
  buildSupabaseAdminClient: vi.fn(() => ({})),
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

const { default: handler } = await import('./company-brief.js');

function client({ single = null, list = [] } = {}) {
  const b = {
    select: vi.fn(() => b), eq: vi.fn(() => b), upsert: vi.fn(() => b), update: vi.fn(() => b),
    order: vi.fn(async () => ({ data: list, error: null })),
    maybeSingle: vi.fn(async () => ({ data: single, error: null })),
    single: vi.fn(async () => ({ data: single, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    then: (r) => r({ error: null }),
  };
  return { from: vi.fn(() => b) };
}
function makeRes() {
  return { statusCode: 200, body: null, setHeader: vi.fn(), status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.executeLlmV2Tracked.mockReset();
});

describe('company-brief handler', () => {
  it('401 when unauthenticated', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('429 when rate limited', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.checkRateLimit.mockReturnValue({ allowed: false });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(429);
  });

  it('GET returns brief + answers', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1', summary: 's' }, list: [{ id: 'a1' }] }));
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.brief.id).toBe('b1');
    expect(res.body.answers).toHaveLength(1);
  });

  it('generate-questions returns parsed LLM questions', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1' } }));
    mocks.executeLlmV2Tracked.mockResolvedValue({ content: 'What do you do?\nTop priorities?\nBiggest pain?\nStrengths?' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'generate-questions' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.briefId).toBe('b1');
    expect(res.body.questions.length).toBe(4);
    expect(res.body.questions[0]).toHaveProperty('id');
  });

  it('generate-questions falls back when the LLM fails', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1' } }));
    mocks.executeLlmV2Tracked.mockRejectedValue(new Error('overloaded'));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'generate-questions' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.questions.length).toBeGreaterThanOrEqual(5);
  });

  it('answer rejects missing fields', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client());
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'answer', briefId: 'b1' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('answer stores and returns ok', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ list: [{ question: 'Q', answer: 'A' }] }));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'answer', briefId: 'b1', questionId: 'q1', question: 'Q', answer: 'A' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('next-question returns the adaptive LLM question', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1' }, list: [] }));
    mocks.executeLlmV2Tracked.mockResolvedValue({ content: 'What is your biggest risk?' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'next-question' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.briefId).toBe('b1');
    expect(res.body.done).toBe(false);
    expect(res.body.index).toBe(1);
    expect(res.body.question).toMatchObject({ id: 'q1', text: 'What is your biggest risk?' });
  });

  it('next-question feeds the prior answers into the LLM (adaptivity)', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1' }, list: [{ question: 'Q1', answer: 'we sell shoes' }] }));
    mocks.executeLlmV2Tracked.mockResolvedValue({ content: 'Which shoes sell best?' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'next-question' } }, res);
    expect(mocks.executeLlmV2Tracked).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('we sell shoes') }),
    );
    expect(res.body.index).toBe(2);
  });

  it('next-question completes when the model replies DONE', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1' }, list: [] }));
    mocks.executeLlmV2Tracked.mockResolvedValue({ content: 'DONE' });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'next-question' } }, res);
    expect(res.body.done).toBe(true);
    expect(res.body.question).toBeUndefined();
  });

  it('next-question falls back to the fixed list when the LLM fails', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1' }, list: [] }));
    mocks.executeLlmV2Tracked.mockRejectedValue(new Error('overloaded'));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'next-question' } }, res);
    expect(res.body.done).toBe(false);
    expect(res.body.question.text).toMatch(/what does your company do/i);
  });

  it('next-question caps the interview without calling the LLM', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const eight = Array.from({ length: 8 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    mocks.buildSupabaseUserClient.mockReturnValue(client({ single: { id: 'b1' }, list: eight }));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'next-question' } }, res);
    expect(res.body.done).toBe(true);
    expect(mocks.executeLlmV2Tracked).not.toHaveBeenCalled();
  });
});
