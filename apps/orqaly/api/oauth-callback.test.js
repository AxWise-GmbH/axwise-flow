import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./_lib/security-headers.js', () => ({ applySecurityHeaders: vi.fn() }));
vi.mock('./_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'ip'),
}));
vi.mock('./_lib/supabase-server.js', () => ({ buildSupabaseAdminClient: vi.fn() }));
const { mockStoreOAuthTokenEnvelope, mockDeleteOAuthTokenEnvelope } = vi.hoisted(() => ({
  mockStoreOAuthTokenEnvelope: vi.fn(),
  mockDeleteOAuthTokenEnvelope: vi.fn(),
}));
vi.mock('../lib/security/oauth-token-vault.js', () => ({
  storeOAuthTokenEnvelope: mockStoreOAuthTokenEnvelope,
  deleteOAuthTokenEnvelope: mockDeleteOAuthTokenEnvelope,
}));

import { buildSupabaseAdminClient } from './_lib/supabase-server.js';
import { signState } from '../lib/integrations/_shared/kb-oauth-providers.js';
import handler from './oauth-callback.js';

function makeRes() {
  return {
    statusCode: 200,
    _headers: {},
    ended: false,
    setHeader(k, v) {
      this._headers[k] = v;
    },
    end() {
      this.ended = true;
      return this;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
  };
}
const makeReq = (query = {}) => ({ method: 'GET', headers: {}, query });

function makeAdmin() {
  const calls = { credInsert: 0, connInsert: 0, credentialRows: [] };
  const from = vi.fn((table) => ({
    select: vi.fn(function () {
      return this;
    }),
    eq: vi.fn(function () {
      return this;
    }),
    maybeSingle: vi.fn(async () => ({ data: null })),
    update: vi.fn(function () {
      return this;
    }),
    insert: vi.fn(function (row) {
      if (table === 'integration_credentials') {
        calls.credInsert += 1;
        calls.credentialRows.push(row);
      } else calls.connInsert += 1;
      return this;
    }),
    single: vi.fn(async () => ({
      data: table === 'integration_credentials' ? { id: 'cred-1' } : { id: 'conn-1' },
    })),
  }));
  return { from, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OAUTH_STATE_SECRET = 'test-secret';
  process.env.PUBLIC_BASE_URL = 'https://app.test';
  process.env.DROPBOX_CLIENT_ID = 'dbx-id';
  process.env.DROPBOX_CLIENT_SECRET = 'dbx-secret';
  mockStoreOAuthTokenEnvelope.mockResolvedValue({
    vaultSecretId: 'vault-1',
    kekId: 'ORQ_KEK_V1',
    algorithm: 'AES-256-GCM',
    version: 1,
  });
});

describe('oauth-callback', () => {
  it('rejects an invalid state (redirects with connected_error)', async () => {
    const res = makeRes();
    await handler(makeReq({ provider: 'dropbox', code: 'abc', state: 'forged.sig' }), res);
    expect(res.statusCode).toBe(302);
    expect(res._headers.Location).toContain('connected_error=invalid_state');
  });

  it('exchanges the code, stores the credential and links the connection', async () => {
    const admin = makeAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          scope: 'files',
        }),
      }))
    );
    const state = signState({ userId: 'user-1', provider: 'dropbox' }, Date.now());

    const res = makeRes();
    await handler(makeReq({ provider: 'dropbox', code: 'the-code', state }), res);

    expect(res.statusCode).toBe(302);
    expect(res._headers.Location).toBe('https://app.test/knowledge-base?connected=dropbox');
    expect(admin.calls.credInsert).toBe(1);
    expect(admin.calls.connInsert).toBe(1);
    expect(mockStoreOAuthTokenEnvelope).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'dropbox',
      tokens: expect.objectContaining({ access_token: 'at', refresh_token: 'rt' }),
    });
    expect(admin.calls.credentialRows[0]).toMatchObject({
      access_token: null,
      refresh_token: null,
      vault_secret_id: 'vault-1',
      credential_kek_id: 'ORQ_KEK_V1',
    });
    expect(JSON.stringify(admin.calls.credentialRows[0])).not.toContain('"at"');
    expect(JSON.stringify(admin.calls.credentialRows[0])).not.toContain('"rt"');
    vi.unstubAllGlobals();
  });

  it('redirects with error when the provider returned ?error', async () => {
    const res = makeRes();
    await handler(makeReq({ provider: 'dropbox', error: 'access_denied' }), res);
    expect(res._headers.Location).toContain('connected_error=provider_denied');
    expect(res._headers.Location).not.toContain('access_denied');
  });
});
