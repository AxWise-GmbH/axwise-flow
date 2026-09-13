import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUserClient, mockAdminClient, mockSaveUserApiKey, mockReserveToolCredentialWrite } =
  vi.hoisted(() => ({
    mockUserClient: vi.fn(),
    mockAdminClient: {},
    mockSaveUserApiKey: vi.fn(),
    mockReserveToolCredentialWrite: vi.fn(),
  }));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
  handleApiError: (res) => res.status(500).json({ error: 'internal' }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user-1'),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    startTimer: () => vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: () => mockUserClient(),
  buildSupabaseAdminClient: () => mockAdminClient,
}));
vi.mock('../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));
vi.mock('./_shared/save-user-api-key.js', () => ({ saveUserApiKey: mockSaveUserApiKey }));
vi.mock('./_shared/tool-credential-write-reservation.js', () => ({
  reserveToolCredentialWrite: mockReserveToolCredentialWrite,
}));

import handler from './tool-setup.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function clientFor(tool) {
  const updates = [];
  return {
    updates,
    from: vi.fn((table) => {
      expect(table).toBe('tools');
      return {
        select: vi.fn(() => {
          const chain = {
            eq: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => ({ data: tool, error: null })),
          };
          return chain;
        }),
        update: vi.fn((payload) => {
          updates.push(payload);
          const chain = { error: null, eq: vi.fn(() => chain) };
          return chain;
        }),
      };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveUserApiKey.mockResolvedValue({ success: true, row: { id: 'key-row' } });
  mockReserveToolCredentialWrite.mockResolvedValue({
    ok: true,
    reservation: { attemptId: 'attempt-1', toolId: 'tool-1', userId: 'user-1' },
  });
});

describe('tool-setup encrypted persistence', () => {
  it('stores an API key in BYOK and removes legacy plaintext from tools.data', async () => {
    const client = clientFor({
      id: 'tool-1',
      user_id: 'user-1',
      name: 'Tool One',
      connection_type: 'api',
      status: 'needs_setup',
      updated_at: '2026-08-22T12:00:00.000Z',
      data: { url: 'https://api.example.test', apiKey: 'legacy-plaintext' },
    });
    mockUserClient.mockReturnValue(client);
    const res = response();

    await handler(
      { method: 'POST', headers: {}, body: { toolId: 'tool-1', apiKey: 'new-secret-value' } },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(mockSaveUserApiKey).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'tool:tool-1',
      slot: 'default',
      label: 'Tool One',
      apiKey: 'new-secret-value',
      skipProbe: true,
      adminClient: mockAdminClient,
      toolCredentialReservation: expect.objectContaining({ attemptId: 'attempt-1' }),
    });
    expect(mockReserveToolCredentialWrite).toHaveBeenCalledWith({
      admin: mockAdminClient,
      userId: 'user-1',
      toolSnapshot: expect.objectContaining({
        id: 'tool-1',
        data: { url: 'https://api.example.test', apiKey: 'legacy-plaintext' },
      }),
      source: 'tool-setup',
    });
    expect(client.updates).toHaveLength(0);
  });

  it('uses a separate Vault slot for webhook signing secrets', async () => {
    const client = clientFor({
      id: 'hook-1',
      user_id: 'user-1',
      name: 'Webhook',
      connection_type: 'webhook',
      status: 'needs_setup',
      updated_at: '2026-08-22T12:00:00.000Z',
      data: { url: 'https://hooks.example.test' },
    });
    mockUserClient.mockReturnValue(client);

    await handler(
      {
        method: 'POST',
        headers: {},
        body: { toolId: 'hook-1', webhookSecret: 'webhook-secret-value' },
      },
      response()
    );

    expect(mockSaveUserApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ slot: 'webhook_secret', apiKey: 'webhook-secret-value' })
    );
  });

  it('does not update tools.data when encrypted storage fails', async () => {
    const client = clientFor({
      id: 'tool-1',
      user_id: 'user-1',
      name: 'Tool One',
      connection_type: 'api',
      status: 'needs_setup',
      updated_at: '2026-08-22T12:00:00.000Z',
      data: {},
    });
    mockUserClient.mockReturnValue(client);
    mockSaveUserApiKey.mockResolvedValue({ success: false, code: 'VAULT_PUT_FAILED' });
    const res = response();

    await handler(
      { method: 'POST', headers: {}, body: { toolId: 'tool-1', apiKey: 'new-secret-value' } },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(client.updates).toHaveLength(0);
  });

  it('returns 409 without reaching Vault when another credential writer owns the tool', async () => {
    const client = clientFor({
      id: 'tool-1',
      user_id: 'user-1',
      name: 'Tool One',
      connection_type: 'api',
      status: 'needs_setup',
      updated_at: '2026-08-22T12:00:00.000Z',
      data: {},
    });
    mockUserClient.mockReturnValue(client);
    mockReserveToolCredentialWrite.mockResolvedValueOnce({
      ok: false,
      code: 'TOOL_CREDENTIAL_WRITE_IN_PROGRESS',
      status: 409,
      message: 'Another credential write is already in progress',
    });
    const res = response();

    await handler(
      { method: 'POST', headers: {}, body: { toolId: 'tool-1', apiKey: 'new-secret-value' } },
      res
    );

    expect(res.statusCode).toBe(409);
    expect(mockSaveUserApiKey).not.toHaveBeenCalled();
    expect(client.updates).toHaveLength(0);
  });
});
