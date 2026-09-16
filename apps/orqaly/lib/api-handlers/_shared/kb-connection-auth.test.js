import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../security/resolve-user-key.js', () => ({ resolveUserKey: vi.fn() }));
vi.mock('../../integrations/_shared/oauth-refresh.js', () => ({ refreshIfExpiring: vi.fn() }));

import { resolveUserKey } from '../../security/resolve-user-key.js';
import { refreshIfExpiring } from '../../integrations/_shared/oauth-refresh.js';
import { resolveConnectionAuth, BYOK_PROVIDER } from './kb-connection-auth.js';

beforeEach(() => vi.clearAllMocks());

describe('resolveConnectionAuth', () => {
  it('returns method none for import connections', async () => {
    const out = await resolveConnectionAuth({ admin: {}, userId: 'u', conn: { source_type: 'obsidian', credential_ref: { kind: 'none' } } });
    expect(out).toEqual({ method: 'none' });
  });

  it('resolves an OAuth token via integration_credentials', async () => {
    refreshIfExpiring.mockResolvedValue({ access_token: 'ya29', id: 'cred-1' });
    const out = await resolveConnectionAuth({
      admin: {},
      userId: 'u',
      conn: { source_type: 'dropbox', credential_ref: { kind: 'oauth', provider: 'dropbox', credential_id: 'cred-1' } },
    });
    expect(refreshIfExpiring).toHaveBeenCalledWith({}, 'cred-1');
    expect(out.method).toBe('oauth');
    expect(out.token).toBe('ya29');
  });

  it('throws 400 when the OAuth credential is gone', async () => {
    refreshIfExpiring.mockResolvedValue(null);
    await expect(
      resolveConnectionAuth({ admin: {}, userId: 'u', conn: { source_type: 'dropbox', credential_ref: { kind: 'oauth', credential_id: 'x' } } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('resolves a BYOK token (default provider by source)', async () => {
    resolveUserKey.mockResolvedValue({ key: 'sl.token' });
    const out = await resolveConnectionAuth({ admin: {}, userId: 'u', conn: { source_type: 'dropbox', credential_ref: {} } });
    expect(resolveUserKey).toHaveBeenCalledWith(expect.objectContaining({ provider: BYOK_PROVIDER.dropbox }));
    expect(out).toEqual({ method: 'byok', token: 'sl.token' });
  });

  it('parses Mega email/password from the BYOK blob', async () => {
    resolveUserKey.mockResolvedValue({ key: JSON.stringify({ email: 'a@b.co', password: 'pw' }) });
    const out = await resolveConnectionAuth({ admin: {}, userId: 'u', conn: { source_type: 'mega', credential_ref: { kind: 'byok', provider: 'data:mega' } } });
    expect(out).toEqual({ method: 'byok', creds: { email: 'a@b.co', password: 'pw' } });
  });

  it('throws 400 when a BYOK key is missing', async () => {
    resolveUserKey.mockResolvedValue({ key: null });
    await expect(
      resolveConnectionAuth({ admin: {}, userId: 'u', conn: { source_type: 'onedrive', credential_ref: {} } })
    ).rejects.toMatchObject({ status: 400 });
  });
});
