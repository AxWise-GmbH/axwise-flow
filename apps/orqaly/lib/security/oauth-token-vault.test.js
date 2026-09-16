import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPutEnvelope, mockReadEnvelope, mockDeleteEnvelope } = vi.hoisted(() => ({
  mockPutEnvelope: vi.fn(),
  mockReadEnvelope: vi.fn(),
  mockDeleteEnvelope: vi.fn(),
}));

vi.mock('./vault-storage.js', () => ({
  putEnvelope: mockPutEnvelope,
  readEnvelope: mockReadEnvelope,
  deleteEnvelope: mockDeleteEnvelope,
}));

import {
  buildOAuthCredentialAad,
  storeOAuthTokenEnvelope,
  readOAuthTokenEnvelope,
} from './oauth-token-vault.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ORQ_KEK_ACTIVE = 'ORQ_KEK_V1';
  process.env.ORQ_KEK_V1 = Buffer.alloc(32, 7).toString('base64');
  mockPutEnvelope.mockResolvedValue('vault-1');
});

describe('OAuth token Vault envelopes', () => {
  it('stores only ciphertext and binds it to the user/provider AAD', async () => {
    await storeOAuthTokenEnvelope({
      userId: 'user-1',
      provider: 'dropbox',
      tokens: { access_token: 'access-secret-value', refresh_token: 'refresh-secret-value' },
    });

    const payload = mockPutEnvelope.mock.calls[0][0];
    expect(payload.name).toMatch(/^integration_credentials\/user-1\/dropbox\//);
    expect(payload.envelopeJson).not.toContain('access-secret-value');
    expect(payload.envelopeJson).not.toContain('refresh-secret-value');
    expect(JSON.parse(payload.envelopeJson).aad).toBe(buildOAuthCredentialAad('user-1', 'dropbox'));
  });

  it('round-trips tokens only through the encrypted Vault envelope', async () => {
    await storeOAuthTokenEnvelope({
      userId: 'user-1',
      provider: 'onedrive',
      tokens: { access_token: 'access-value', refresh_token: 'refresh-value' },
    });
    mockReadEnvelope.mockResolvedValue(mockPutEnvelope.mock.calls[0][0].envelopeJson);

    await expect(
      readOAuthTokenEnvelope({
        user_id: 'user-1',
        provider: 'onedrive',
        vault_secret_id: 'vault-1',
      })
    ).resolves.toEqual({ access_token: 'access-value', refresh_token: 'refresh-value' });
  });

  it('fails closed when the row identity does not match the envelope AAD', async () => {
    await storeOAuthTokenEnvelope({
      userId: 'user-1',
      provider: 'dropbox',
      tokens: { access_token: 'access-value', refresh_token: 'refresh-value' },
    });
    mockReadEnvelope.mockResolvedValue(mockPutEnvelope.mock.calls[0][0].envelopeJson);

    await expect(
      readOAuthTokenEnvelope({
        user_id: 'user-2',
        provider: 'dropbox',
        vault_secret_id: 'vault-1',
      })
    ).rejects.toThrow('ENVELOPE_AAD_MISMATCH');
  });

  it('fails closed when no encrypted pointer exists', async () => {
    await expect(
      readOAuthTokenEnvelope({ user_id: 'user-1', provider: 'dropbox' })
    ).rejects.toThrow('OAUTH_CREDENTIAL_ENCRYPTED_VALUE_MISSING');
    expect(mockReadEnvelope).not.toHaveBeenCalled();
  });
});
