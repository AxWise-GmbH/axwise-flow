import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(),
  verifySupabaseToken: vi.fn(),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res.statusCode = status;
    return { error: msg };
  }),
  handleApiError: vi.fn(),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 20, remaining: 19 })),
  getRateLimitIdentifier: vi.fn(() => 'user:test'),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    startTimer: vi.fn(() => vi.fn()),
    error: vi.fn(),
  })),
}));

import handler from './tts.js';
import { getBearerToken, verifySupabaseToken } from '../../api/_lib/auth.js';

function createReq(body = {}, method = 'POST') {
  return { method, body, query: { path: 'tts' } };
}

function createRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    end(data) { res.body = data; return res; },
    writeHead: vi.fn(),
    write: vi.fn(),
    setHeader: vi.fn(),
    headersSent: false,
  };
  return res;
}

describe('TTS handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ELEVENLABS_API_KEY;
  });

  it('returns 401 without auth token', async () => {
    getBearerToken.mockReturnValue(null);
    verifySupabaseToken.mockResolvedValue(null);

    const req = createReq({ text: 'Hello' });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 without text', async () => {
    getBearerToken.mockReturnValue('token');
    verifySupabaseToken.mockResolvedValue({ id: 'u1' });

    const req = createReq({});
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text exceeds 2000 chars', async () => {
    getBearerToken.mockReturnValue('token');
    verifySupabaseToken.mockResolvedValue({ id: 'u1' });

    const req = createReq({ text: 'a'.repeat(2001) });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 501 when ELEVENLABS_API_KEY is not set', async () => {
    getBearerToken.mockReturnValue('token');
    verifySupabaseToken.mockResolvedValue({ id: 'u1' });

    const req = createReq({ text: 'Hello world' });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(501);
  });

  it('returns 405 for GET requests', async () => {
    const req = createReq({}, 'GET');
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
