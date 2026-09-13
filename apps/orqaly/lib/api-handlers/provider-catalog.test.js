/**
 * Tests for the provider-catalog handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => () => {}),
  }),
}));

const mockUser = { id: 'user-1', email: 't@example.com' };
let authReturns = mockUser;
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => authReturns),
}));

let rateAllowed = true;
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: rateAllowed })),
  getRateLimitIdentifier: vi.fn(() => 'id'),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, message) => res.status(code).json({ error: message })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));

let fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (...a) => fetchImpl(...a),
}));

vi.mock('../security/resolve-user-key.js', () => ({
  resolveUserKey: vi.fn(async () => ({ key: null, source: 'none' })),
}));

let composioConfigured = true;
vi.mock('../composio/client.js', () => ({
  isComposioConfigured: () => composioConfigured,
  composioHeaders: () => ({ 'x-api-key': 'k' }),
  composioBaseUrl: () => 'https://backend.composio.dev/api/v2',
}));

const handler = (await import('./provider-catalog.js')).default;

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
}

beforeEach(() => {
  authReturns = mockUser;
  rateAllowed = true;
  composioConfigured = true;
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
});

describe('provider-catalog handler', () => {
  it('returns 401 without a user', async () => {
    authReturns = null;
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'openrouter', category: 'models' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    rateAllowed = false;
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'openrouter', category: 'models' } }, res);
    expect(res.statusCode).toBe(429);
  });

  it('405 on non-GET', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: { provider: 'openrouter', category: 'models' } }, res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid provider', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'bogus', category: 'models' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 when provider does not serve the category', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'composio', category: 'models' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('503 when composio is not configured', async () => {
    composioConfigured = false;
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'composio', category: 'tools' } }, res);
    expect(res.statusCode).toBe(503);
  });

  it('maps composio apps to tool items', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { key: 'gmail', name: 'Gmail', description: 'Email', categories: ['email'] },
          { key: 'slack', name: 'Slack', description: 'Chat', categories: ['messaging'] },
        ],
      }),
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'composio', category: 'tools' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const tool = res.body.items[0];
    expect(tool).toMatchObject({
      id: 'composio-gmail',
      name: 'Gmail',
      connectionType: 'composio',
      status: 'active',
    });
    expect(tool.category).toBe('email');
  });

  it('maps openrouter models to model items with required fields', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', context_length: 200000 },
          { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 },
        ],
      }),
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'openrouter', category: 'models' } }, res);
    expect(res.statusCode).toBe(200);
    const m = res.body.items[0];
    for (const field of ['id', 'name', 'exactModel', 'sizeClass', 'status']) {
      expect(m[field]).toBeTruthy();
    }
    expect(m.exactModel).toBe('anthropic/claude-sonnet-4');
    expect(m.provider).toBe('@openrouter');
    expect(m.sizeClass).toBe('xl'); // 200k context
  });

  it('filters openrouter results by q server-side', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', context_length: 200000 },
          { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 },
        ],
      }),
    });
    const res = mockRes();
    await handler(
      { method: 'GET', query: { provider: 'openrouter', category: 'models', q: 'claude' } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toMatch(/claude/i);
  });

  it('maps hugging face models to model items with display chips', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          modelId: 'mistralai/Mistral-7B-Instruct-v0.3',
          downloads: 1000,
          likes: 42,
          pipeline_tag: 'text-generation',
        },
      ],
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'huggingface', category: 'models' } }, res);
    expect(res.statusCode).toBe(200);
    const m = res.body.items[0];
    expect(m.exactModel).toBe('mistralai/Mistral-7B-Instruct-v0.3');
    expect(m.provider).toBe('@huggingface');
    expect(m).toMatchObject({ downloads: 1000, likes: 42, pipelineTag: 'text-generation' });
  });

  it('caps results at 100 items', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: Array.from({ length: 140 }, (_, i) => ({
          id: `vendor/model-${i}`,
          name: `Model ${i}`,
          context_length: 8192,
        })),
      }),
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'openrouter', category: 'models' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(100);
  });

  it('502 when the provider request fails', async () => {
    fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const res = mockRes();
    await handler({ method: 'GET', query: { provider: 'openrouter', category: 'models' } }, res);
    expect(res.statusCode).toBe(502);
  });
});
