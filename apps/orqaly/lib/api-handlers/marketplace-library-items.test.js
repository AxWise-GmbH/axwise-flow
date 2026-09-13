/**
 * Tests for the marketplace-library-items handler (live, paginated, searchable
 * import-library items) and its CSV parser.
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

let fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (...a) => fetchImpl(...a),
}));

const mod = await import('./marketplace-library-items.js');
const handler = mod.default;
const { parseCsv, _resetCacheForTests } = mod;

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

const csvOk = (text) => async () => ({ ok: true, status: 200, text: async () => text });

beforeEach(() => {
  authReturns = mockUser;
  rateAllowed = true;
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
  _resetCacheForTests();
});

describe('parseCsv', () => {
  it('parses quoted fields with embedded commas and escaped quotes', () => {
    const rows = parseCsv('act,prompt\n"Linux Terminal","cd /home, then run ""ls"""\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['Linux Terminal', 'cd /home, then run "ls"']);
  });

  it('drops blank trailing lines', () => {
    const rows = parseCsv('a,b\n1,2\n\n');
    expect(rows).toHaveLength(2);
  });
});

describe('marketplace-library-items handler', () => {
  it('401 without a user', async () => {
    authReturns = null;
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'skills', sourceId: 'x' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('429 when rate limited', async () => {
    rateAllowed = false;
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'skills', sourceId: 'x' } }, res);
    expect(res.statusCode).toBe(429);
  });

  it('405 on non-GET', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: { category: 'skills', sourceId: 'x' } }, res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid query (missing sourceId)', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'skills' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('unknown sourceId -> live:false, empty items', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'skills', sourceId: 'nope' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ live: false, items: [], total: 0, hasMore: false });
  });

  it('category mismatch for a known source -> live:false', async () => {
    const res = mockRes();
    // awesome-chatgpt-prompts is a skills source; asking under models must not fetch it.
    await handler(
      { method: 'GET', query: { category: 'models', sourceId: 'awesome-chatgpt-prompts' } },
      res
    );
    expect(res.body.live).toBe(false);
  });

  it('maps awesome-chatgpt-prompts CSV to skill items and paginates', async () => {
    const rows = ['act,prompt'];
    for (let i = 0; i < 5; i++) rows.push(`Persona ${i},"Do task ${i}"`);
    fetchImpl = csvOk(rows.join('\n'));
    const res = mockRes();
    await handler(
      {
        method: 'GET',
        query: { category: 'skills', sourceId: 'awesome-chatgpt-prompts', offset: '0', limit: '2' },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.live).toBe(true);
    expect(res.body.total).toBe(5);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
    const item = res.body.items[0];
    expect(item.name).toBe('Persona 0');
    expect(item.content).toContain('Do task 0'); // required skill field
    expect(item.slug).toBeTruthy();
  });

  it('serves later pages via offset', async () => {
    const rows = ['act,prompt'];
    for (let i = 0; i < 5; i++) rows.push(`Persona ${i},Task ${i}`);
    fetchImpl = csvOk(rows.join('\n'));
    const res = mockRes();
    await handler(
      {
        method: 'GET',
        query: { category: 'skills', sourceId: 'awesome-chatgpt-prompts', offset: '4', limit: '2' },
      },
      res
    );
    expect(res.body.items).toHaveLength(1); // 5 total, offset 4 -> last one
    expect(res.body.hasMore).toBe(false);
  });

  it('filters by q server-side', async () => {
    const rows = ['act,prompt', 'Linux Terminal,shell', 'Translator,languages', 'Chef,recipes'];
    fetchImpl = csvOk(rows.join('\n'));
    const res = mockRes();
    await handler(
      {
        method: 'GET',
        query: { category: 'skills', sourceId: 'awesome-chatgpt-prompts', q: 'linux' },
      },
      res
    );
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toMatch(/linux/i);
  });

  it('maps anthropic-skills tree (SKILL.md folders) to skill items', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tree: [
          { type: 'blob', path: 'document-skills/docx/SKILL.md' },
          { type: 'blob', path: 'document-skills/pdf/SKILL.md' },
          { type: 'blob', path: 'README.md' },
          { type: 'tree', path: 'document-skills' },
        ],
      }),
    });
    const res = mockRes();
    await handler(
      { method: 'GET', query: { category: 'skills', sourceId: 'anthropic-skills' } },
      res
    );
    expect(res.body.live).toBe(true);
    expect(res.body.total).toBe(2);
    expect(res.body.items[0].content).toBeTruthy();
    expect(res.body.items[0].name).toBe('Docx');
  });

  it('maps openrouter models with required model fields', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', context_length: 200000 }],
      }),
    });
    const res = mockRes();
    await handler(
      { method: 'GET', query: { category: 'models', sourceId: 'openrouter-models' } },
      res
    );
    expect(res.body.live).toBe(true);
    const m = res.body.items[0];
    expect(m.exactModel).toBe('anthropic/claude-sonnet-4');
    expect(m.sizeClass).toBe('xl');
  });

  it('upstream failure falls back gracefully (200, live:false)', async () => {
    fetchImpl = async () => ({ ok: false, status: 500, text: async () => '' });
    const res = mockRes();
    await handler(
      { method: 'GET', query: { category: 'skills', sourceId: 'awesome-chatgpt-prompts' } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.live).toBe(false);
    expect(res.body.error).toBe('source_unavailable');
  });
});
