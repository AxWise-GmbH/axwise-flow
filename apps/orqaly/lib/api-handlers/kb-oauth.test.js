import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => { res._status = status; res._body = { error: msg }; return res; }),
  handleApiError: vi.fn((res) => { res._status = 500; return res; }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
}));

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import handler from './kb-oauth.js';

function makeRes() {
  return {
    _status: 200, _body: null, _headers: {},
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}
const makeReq = (query = {}) => ({ method: 'POST', headers: {}, query, body: {} });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OAUTH_STATE_SECRET = 'test-secret';
  process.env.PUBLIC_BASE_URL = 'https://app.test';
  process.env.DROPBOX_CLIENT_ID = 'dbx-id';
  process.env.DROPBOX_CLIENT_SECRET = 'dbx-secret';
  delete process.env.ONEDRIVE_CLIENT_ID;
  delete process.env.ONEDRIVE_CLIENT_SECRET;
});

describe('kb-oauth authorize', () => {
  it('401 when unauthenticated', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler(makeReq({ action: 'authorize', provider: 'dropbox' }), res);
    expect(res._status).toBe(401);
  });

  it('returns a consent URL for a configured provider', async () => {
    const res = makeRes();
    await handler(makeReq({ action: 'authorize', provider: 'dropbox' }), res);
    expect(res._status).toBe(200);
    expect(res._body.url).toContain('https://www.dropbox.com/oauth2/authorize');
    expect(res._body.url).toContain('client_id=dbx-id');
    expect(res._body.url).toContain('state=');
    expect(res._body.url).toContain('token_access_type=offline');
  });

  it('503 when the provider OAuth env is not configured', async () => {
    const res = makeRes();
    await handler(makeReq({ action: 'authorize', provider: 'onedrive' }), res);
    expect(res._status).toBe(503);
  });

  it('400 for an unknown provider', async () => {
    const res = makeRes();
    await handler(makeReq({ action: 'authorize', provider: 'nope' }), res);
    expect(res._status).toBe(400);
  });
});
