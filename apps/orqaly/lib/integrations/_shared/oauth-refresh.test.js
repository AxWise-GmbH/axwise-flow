import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWarn, mockNotifyUser, mockReadTokens, mockStoreTokens, mockDeleteTokens } = vi.hoisted(
  () => ({
    mockWarn: vi.fn(),
    mockNotifyUser: vi.fn(),
    mockReadTokens: vi.fn(),
    mockStoreTokens: vi.fn(),
    mockDeleteTokens: vi.fn(),
  })
);

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: mockWarn }),
}));
vi.mock('../../notifications/dispatch.js', () => ({ notifyUser: mockNotifyUser }));
vi.mock('../../security/oauth-token-vault.js', () => ({
  OAUTH_CREDENTIAL_SELECT: 'safe_columns_only',
  readOAuthTokenEnvelope: mockReadTokens,
  storeOAuthTokenEnvelope: mockStoreTokens,
  deleteOAuthTokenEnvelope: mockDeleteTokens,
}));

import { refreshIfExpiring } from './oauth-refresh.js';

function makeAdmin(row) {
  const updates = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: row, error: null })) })),
    })),
    update: vi.fn((payload) => {
      updates.push(payload);
      const chain = {
        error: null,
        eq: vi.fn(() => chain),
      };
      return chain;
    }),
  }));
  return { from, updates };
}

function credential(overrides = {}) {
  return {
    id: 'cred-1',
    user_id: 'user-1',
    provider: 'dropbox',
    status: 'active',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    refresh_failure_count: 0,
    vault_secret_id: 'vault-old',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DROPBOX_CLIENT_ID = 'client-id';
  process.env.DROPBOX_CLIENT_SECRET = 'client-secret';
  mockReadTokens.mockResolvedValue({ access_token: 'access-old', refresh_token: 'refresh-old' });
  mockStoreTokens.mockResolvedValue({
    vaultSecretId: 'vault-new',
    kekId: 'ORQ_KEK_V1',
    algorithm: 'AES-256-GCM',
    version: 1,
  });
});

describe('OAuth refresh credential boundary', () => {
  it('returns a non-expiring token only after reading its Vault envelope', async () => {
    const row = credential();
    const admin = makeAdmin(row);

    await expect(refreshIfExpiring(admin, row.id)).resolves.toMatchObject({
      id: row.id,
      access_token: 'access-old',
      refresh_token: 'refresh-old',
    });
    expect(mockReadTokens).toHaveBeenCalledWith(row);
  });

  it('fails closed and marks reauthorization when encrypted resolution fails', async () => {
    const row = credential();
    const admin = makeAdmin(row);
    mockReadTokens.mockRejectedValue(new Error('corrupt envelope'));

    await expect(refreshIfExpiring(admin, row.id)).resolves.toBeNull();
    expect(admin.updates).toContainEqual(expect.objectContaining({ status: 'needs_reauth' }));
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('access-old');
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('refresh-old');
  });

  it('rotates into a new envelope and writes only pointer metadata', async () => {
    const row = credential({ expires_at: new Date(Date.now() + 1_000).toISOString() });
    const admin = makeAdmin(row);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access-new',
          refresh_token: 'refresh-new',
          expires_in: 3600,
        }),
      }))
    );

    const result = await refreshIfExpiring(admin, row.id);

    expect(result).toMatchObject({ access_token: 'access-new', refresh_token: 'refresh-new' });
    expect(mockStoreTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'dropbox',
      tokens: { access_token: 'access-new', refresh_token: 'refresh-new' },
    });
    const persisted = admin.updates.find((update) => update.vault_secret_id === 'vault-new');
    expect(persisted).toMatchObject({
      access_token: null,
      refresh_token: null,
      credential_kek_id: 'ORQ_KEK_V1',
    });
    expect(JSON.stringify(persisted)).not.toContain('access-new');
    expect(JSON.stringify(persisted)).not.toContain('refresh-new');
    expect(mockDeleteTokens).toHaveBeenCalledWith('vault-old');
    vi.unstubAllGlobals();
  });
});
