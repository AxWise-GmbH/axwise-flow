/**
 * Tests for the huggingface-models handler + normalizer.
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

let fetchImpl = async () => ({ ok: true, status: 200, json: async () => [] });
let lastFetchUrl = '';
let fetchUrls = [];
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (url, ...a) => {
    lastFetchUrl = url;
    fetchUrls.push(url);
    return fetchImpl(url, ...a);
  },
}));

vi.mock('../security/resolve-user-key.js', () => ({
  resolveUserKey: vi.fn(async () => ({ key: null, source: 'none' })),
}));

const mod = await import('./huggingface-models.js');
const handler = mod.default;
const { normalizeHfModel, formatParams } = mod;

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

beforeEach(() => {
  authReturns = mockUser;
  rateAllowed = true;
  lastFetchUrl = '';
  fetchUrls = [];
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => [] });
});

describe('normalizeHfModel', () => {
  it('extracts detailed fields from a full HF payload', () => {
    const m = normalizeHfModel({
      id: 'Orenguteng/Llama-3.1-8B-Lexi-Uncensored',
      author: 'Orenguteng',
      downloads: 88000,
      likes: 1200,
      pipeline_tag: 'text-generation',
      gated: false,
      tags: ['license:llama3.1', 'text-generation'],
      siblings: [{ rfilename: 'a' }, { rfilename: 'b' }],
      safetensors: { total: 8030000000 },
    });
    expect(m.repoId).toBe('Orenguteng/Llama-3.1-8B-Lexi-Uncensored');
    expect(m.name).toBe('Llama-3.1-8B-Lexi-Uncensored');
    expect(m.exactModel).toBe('Orenguteng/Llama-3.1-8B-Lexi-Uncensored');
    expect(m.provider).toBe('@Orenguteng');
    expect(m.downloads).toBe(88000);
    expect(m.likes).toBe(1200);
    expect(m.license).toBe('llama3.1');
    expect(m.gated).toBe(false);
    expect(m.files).toBe(2);
    expect(m.paramsLabel).toBe('8B');
    expect(m.sizeClass).toBe('sm');
    expect(m.url).toBe('https://huggingface.co/Orenguteng/Llama-3.1-8B-Lexi-Uncensored');
    expect(m.source).toBe('huggingface');
    // Rent-card safety defaults so a merged import never crashes the grid.
    expect(m.pricePerHour).toBe(0);
    expect(m.status).toBe('online');
    expect(typeof m.rating).toBe('number');
  });

  it('reads license from cardData and marks gated models', () => {
    const m = normalizeHfModel({
      id: 'AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored',
      cardData: { license: 'apache-2.0' },
      gated: 'manual',
      safetensors: { total: 27000000000 },
    });
    expect(m.license).toBe('apache-2.0');
    expect(m.gated).toBe(true);
    expect(m.sizeClass).toBe('md'); // 27B
    expect(m.author).toBe('AEON-7'); // derived from id when author missing
  });

  it('falls back to a name-parsed size for GGUF/quant repos without safetensors', () => {
    const m = normalizeHfModel({
      id: 'bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF',
      downloads: 22000,
      pipeline_tag: 'text-generation',
      siblings: Array.from({ length: 29 }, (_, i) => ({ rfilename: `f${i}` })),
    });
    expect(m.paramsLabel).toBe('24B');
    expect(m.sizeClass).toBe('md');
    expect(m.files).toBe(29);
  });

  it('returns null when the repo id is missing', () => {
    expect(normalizeHfModel({ downloads: 5 })).toBeNull();
  });

  it('formatParams renders B/M suffixes', () => {
    expect(formatParams(8030000000)).toBe('8B');
    expect(formatParams(70000000000)).toBe('70B');
    expect(formatParams(690000000)).toBe('690M');
    expect(formatParams(0)).toBeNull();
  });
});

describe('huggingface-models handler', () => {
  it('returns 401 without a user', async () => {
    authReturns = null;
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    rateAllowed = false;
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(429);
  });

  it('405 on non-GET', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('searches HF and returns normalized models', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'TheDrummer/Cydonia-24B-v4',
          downloads: 12000,
          likes: 300,
          pipeline_tag: 'text-generation',
          tags: ['license:apache-2.0'],
          siblings: [{ rfilename: 'a' }],
          safetensors: { total: 24000000000 },
        },
      ],
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { q: 'Cydonia 24B' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.models).toHaveLength(1);
    expect(res.body.models[0].repoId).toBe('TheDrummer/Cydonia-24B-v4');
    expect(res.body.models[0].license).toBe('apache-2.0');
    // request asks HF for detailed metadata + downloads sort + search term
    expect(lastFetchUrl).toContain('full=true');
    expect(lastFetchUrl).toContain('sort=downloads');
    expect(lastFetchUrl).toContain('search=Cydonia');
  });

  it('respects the limit param', async () => {
    fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () =>
        Array.from({ length: 40 }, (_, i) => ({ id: `vendor/model-${i}`, downloads: i })),
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { limit: '5' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.models).toHaveLength(5);
  });

  it('502 when Hugging Face request fails', async () => {
    fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(502);
  });

  it('maps category=text to a single text-generation request', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'text' } }, res);
    expect(res.statusCode).toBe(200);
    expect(fetchUrls).toHaveLength(1);
    expect(fetchUrls[0]).toContain('pipeline_tag=text-generation');
  });

  it('maps category=coding to a text-generation + code-filter request', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'coding' } }, res);
    expect(res.statusCode).toBe(200);
    expect(fetchUrls).toHaveLength(1);
    expect(fetchUrls[0]).toContain('pipeline_tag=text-generation');
    expect(fetchUrls[0]).toContain('filter=code');
  });

  it('fans category=video out to two requests and dedupes the merged result', async () => {
    fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        // Both sub-queries surface the same repo; one has more downloads.
        if (url.includes('text-to-video')) {
          return [
            { id: 'wan/T2V', downloads: 5000, pipeline_tag: 'text-to-video' },
            { id: 'shared/both', downloads: 100, pipeline_tag: 'text-to-video' },
          ];
        }
        return [
          { id: 'ltx/I2V', downloads: 9000, pipeline_tag: 'image-to-video' },
          { id: 'shared/both', downloads: 8000, pipeline_tag: 'image-to-video' },
        ];
      },
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'video' } }, res);
    expect(res.statusCode).toBe(200);
    expect(fetchUrls).toHaveLength(2);
    expect(fetchUrls.some((u) => u.includes('pipeline_tag=text-to-video'))).toBe(true);
    expect(fetchUrls.some((u) => u.includes('pipeline_tag=image-to-video'))).toBe(true);
    const ids = res.body.models.map((m) => m.repoId);
    // shared/both appears once, sorted by downloads desc across the merge.
    expect(ids).toEqual(['ltx/I2V', 'shared/both', 'wan/T2V']);
    expect(res.body.models.find((m) => m.repoId === 'shared/both').downloads).toBe(8000);
  });

  it('returns survivors when only some category sub-queries fail', async () => {
    fetchImpl = async (url) => {
      if (url.includes('image-to-video')) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => [{ id: 'wan/T2V', downloads: 5000 }] };
    };
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'video' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.models.map((m) => m.repoId)).toEqual(['wan/T2V']);
  });

  it('502 when every category sub-query fails', async () => {
    fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'video' } }, res);
    expect(res.statusCode).toBe(502);
  });

  it('400 on an unknown category', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'nonsense' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
