/**
 * request-password-reset contract tests. Mocks at the boundary (auth, rate-limit,
 * supabase admin client, Resend fetch, logger) to verify the handler never strands
 * the admin: every email-failure path returns 200 with the recovery `link` and a
 * machine-readable `reason`, while the real error is logged for observability.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: () => () => undefined,
  };
  return {
    verifySupabaseToken: vi.fn(),
    getBearerToken: vi.fn(() => 'token'),
    buildSupabaseAdminClient: vi.fn(),
    checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, limit: 10, reset: 0 })),
    applyRateLimitHeaders: vi.fn(),
    getRateLimitIdentifier: vi.fn(() => 'rl'),
    fetchWithRetry: vi.fn(),
    logger,
    createLogger: vi.fn(() => logger),
  };
});

vi.mock('../../api/_lib/auth.js', () => ({
  verifySupabaseToken: mocks.verifySupabaseToken,
  getBearerToken: mocks.getBearerToken,
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, code, msg) => res.status(code).json({ error: msg }),
  handleApiError: (res, err) => res.status(500).json({ error: err.message }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: mocks.checkRateLimit,
  applyRateLimitHeaders: mocks.applyRateLimitHeaders,
  getRateLimitIdentifier: mocks.getRateLimitIdentifier,
}));
vi.mock('../../api/_lib/fetch.js', () => ({ fetchWithRetry: mocks.fetchWithRetry }));
vi.mock('../../api/_lib/logger.js', () => ({ createLogger: mocks.createLogger }));

const { default: handler } = await import('./request-password-reset.js');

const ACTION_LINK = 'https://orchestratori.vercel.app/auth/callback?flow=recovery&token=abc123';

/**
 * Build an admin client whose `user_roles` queries pass the Super Admin check and
 * whose auth.admin.generateLink returns a recovery action_link.
 */
function makeAdmin({ callerRole = 'role-super-admin', superCount = 1, generateLinkError = null } = {}) {
  const userRoles = {
    select: vi.fn(() => userRoles),
    eq: vi.fn(() => userRoles),
    maybeSingle: vi.fn(async () => ({
      data: callerRole ? { role_id: callerRole } : null,
      error: null,
    })),
    upsert: vi.fn(async () => ({ error: null })),
    // The count query (`.select(col, { count, head }).eq(...)`) is awaited directly,
    // so the builder itself is thenable and resolves to { count }.
    then: (resolve) => resolve({ count: superCount, error: null }),
  };
  return {
    from: vi.fn(() => userRoles),
    auth: {
      admin: {
        generateLink: vi.fn(async () => ({
          data: generateLinkError ? null : { properties: { action_link: ACTION_LINK } },
          error: generateLinkError,
        })),
      },
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    end() {
      return this;
    },
  };
}

function makeReq(body = { email: 'vitalijs@axwise.de' }) {
  return { method: 'POST', headers: {}, body };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  mocks.verifySupabaseToken.mockResolvedValue({ id: 'admin-1' });
  mocks.getBearerToken.mockReturnValue('token');
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 9, limit: 10, reset: 0 });
  mocks.buildSupabaseAdminClient.mockReturnValue(makeAdmin());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('request-password-reset handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-super-admin callers with 403', async () => {
    mocks.buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ callerRole: 'role-viewer', superCount: 1 })
    );
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('returns emailSent:true when Resend accepts the send', async () => {
    mocks.fetchWithRetry.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_123' }),
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, emailSent: true });
  });

  it('degrades with the recovery link (not a hard error) when the domain is unverified', async () => {
    mocks.fetchWithRetry.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        name: 'validation_error',
        message: 'You can only send testing emails to your own email address.',
      }),
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      emailSent: false,
      link: ACTION_LINK,
      reason: 'domain_unverified',
    });
    expect(res.body.note).toBeTruthy();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it('degrades with the recovery link on a generic Resend failure', async () => {
    mocks.fetchWithRetry.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Resend error' }),
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      emailSent: false,
      link: ACTION_LINK,
      reason: 'send_failed',
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it('returns the recovery link and never calls Resend when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      emailSent: false,
      link: ACTION_LINK,
      reason: 'email_not_configured',
    });
    expect(mocks.fetchWithRetry).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it('surfaces a 400 when the recovery link cannot be generated', async () => {
    mocks.buildSupabaseAdminClient.mockReturnValue(
      makeAdmin({ generateLinkError: { message: 'User not found' } })
    );
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(400);
  });
});
