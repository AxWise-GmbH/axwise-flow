/**
 * send-notification fan-out tests - the new channel routing: a subscribed
 * action delivers email (when the email channel is on) and writes a
 * notification_log in-app row (when the in-app channel is on), gated by the
 * per-user _channels preference and the per-action subscription.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const adminInserts = [];
let currentPrefs = {};

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'tok'),
  fetchWithRetry: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 19, limit: 20, reset: 0 })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'rl'),
  buildSupabaseUserClient: vi.fn(),
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  verifySupabaseToken: mocks.verifySupabaseToken,
  getBearerToken: mocks.getBearerToken,
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, code, msg) => res.status(code).json({ error: msg }),
  handleApiError: (res, err) => res.status(500).json({ error: err.message }),
}));
vi.mock('../../api/_lib/fetch.js', () => ({ fetchWithRetry: mocks.fetchWithRetry }));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: mocks.checkRateLimit,
  applyRateLimitHeaders: mocks.applyRateLimitHeaders,
  getRateLimitIdentifier: mocks.getRateLimitIdentifier,
}));
vi.mock('../../api/_lib/validate.js', () => ({
  sendNotificationBodySchema: { safeParse: (b) => ({ success: true, data: b }) },
  stitchTemplateSyncSchema: { safeParse: (b) => ({ success: true, data: b }) },
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: mocks.buildSupabaseUserClient,
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../src/services/emailTemplates.js', () => ({ TEMPLATE_MAP: {} }));

const { default: handler } = await import('./send-notification.js');

function makeUserClient(preferences) {
  return {
    from: vi.fn((table) => {
      const chain = {};
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () =>
        table === 'email_notification_preferences'
          ? { data: { preferences }, error: null }
          : { data: null, error: null }
      );
      chain.insert = vi.fn(async () => ({ error: null }));
      return chain;
    }),
  };
}

function makeAdminClient() {
  return {
    from: vi.fn((table) => ({
      insert: vi.fn(async (row) => {
        adminInserts.push({ table, row });
        return { error: null };
      }),
    })),
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

function makeReq(channels) {
  return {
    method: 'POST',
    headers: {},
    body: {
      action: 'role_updated',
      data: { roleName: 'Admin' },
      subject: 'Role permissions changed',
      html: '<p>Role changed</p>',
      text: 'Role changed',
      _channels: channels,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  adminInserts.length = 0;
  vi.stubEnv('RESEND_API_KEY', 're_test');
  mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
  mocks.getBearerToken.mockReturnValue('tok');
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 19, limit: 20, reset: 0 });
  mocks.fetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ id: 'email_1' }) });
  mocks.buildSupabaseAdminClient.mockImplementation(() => makeAdminClient());
  mocks.buildSupabaseUserClient.mockImplementation(() => makeUserClient(currentPrefs));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('send-notification channel fan-out', () => {
  it('delivers both email and in-app when both channels are on', async () => {
    currentPrefs = { role_updated: true, _channels: { email: true, inapp: true } };
    const res = makeRes();
    await handler(makeReq({ email: true, inapp: true }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, emailSent: true, inAppSent: true });
    expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(1);
    const inApp = adminInserts.find((i) => i.table === 'notification_log');
    expect(inApp).toBeTruthy();
    expect(inApp.row.channel).toBe('in_app');
    expect(inApp.row.event_type).toBe('role_updated');
  });

  it('writes the in-app row but skips email when the email channel is off', async () => {
    currentPrefs = { role_updated: true, _channels: { email: false, inapp: true } };
    const res = makeRes();
    await handler(makeReq({ email: false, inapp: true }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ emailSent: false, inAppSent: true });
    expect(mocks.fetchWithRetry).not.toHaveBeenCalled();
    expect(adminInserts.some((i) => i.table === 'notification_log')).toBe(true);
  });

  it('skips entirely (no email, no in-app) when the action is not subscribed', async () => {
    currentPrefs = { role_updated: false, _channels: { email: true, inapp: true } };
    const res = makeRes();
    await handler(makeReq({ email: true, inapp: true }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ skipped: true, reason: 'disabled_by_preferences' });
    expect(mocks.fetchWithRetry).not.toHaveBeenCalled();
    expect(adminInserts.some((i) => i.table === 'notification_log')).toBe(false);
  });
});
