/**
 * resendPasswordEmail seam tests.
 *
 * The /roles "Resend password" UI branches entirely on the shape this function
 * returns (`emailSent`, `link`, `reason`, `note`). These tests lock that contract
 * so a failed send is never reported as success and the manual reset-link fallback
 * is always carried through to the UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupabase: vi.fn(() => true),
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
  logAction: vi.fn(async () => {}),
  maybeNotify: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  hasSupabase: mocks.hasSupabase,
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock('./auditLogBackend', () => ({ logAction: mocks.logAction }));
vi.mock('./emailNotificationDispatcher', () => ({ maybeNotify: mocks.maybeNotify }));

const { resendPasswordEmail, inviteUser } = await import('./rolesPermissionsService.js');

const LINK = 'https://orchestratori.vercel.app/auth/callback?flow=recovery&token=abc';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasSupabase.mockReturnValue(true);
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

function stubFetch({ ok = true, payload = {} } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => payload }))
  );
}

describe('resendPasswordEmail', () => {
  it('reports emailSent:false and carries the recovery link/reason/note when the send failed', async () => {
    stubFetch({
      ok: true,
      payload: {
        success: true,
        email: 'vitalijs@axwise.de',
        emailSent: false,
        link: LINK,
        reason: 'domain_unverified',
        note: 'Email domain not verified. Copy the reset link and send it to the user.',
      },
    });
    const result = await resendPasswordEmail('u1', 'vitalijs@axwise.de');
    expect(result.emailSent).toBe(false);
    expect(result.link).toBe(LINK);
    expect(result.reason).toBe('domain_unverified');
    expect(result.note).toBeTruthy();
  });

  it('reports emailSent:true when the API confirms the email was sent', async () => {
    stubFetch({ ok: true, payload: { success: true, email: 'a@b.com', emailSent: true } });
    const result = await resendPasswordEmail('u1', 'a@b.com');
    expect(result.emailSent).toBe(true);
  });

  it('throws when the API returns a non-OK response', async () => {
    stubFetch({ ok: false, payload: { error: 'Only Super Admin can send password reset.' } });
    await expect(resendPasswordEmail('u1', 'a@b.com')).rejects.toThrow(
      /Only Super Admin/
    );
  });

  it('POSTs the email to the request-password-reset endpoint with the bearer token', async () => {
    stubFetch({ ok: true, payload: { success: true, email: 'a@b.com', emailSent: true } });
    await resendPasswordEmail('u1', 'a@b.com');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/request-password-reset'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({ email: 'a@b.com' }),
      })
    );
  });
});

/**
 * inviteUser seam tests.
 *
 * Two contracts worth locking. (1) A routing fault returns an HTML body, and
 * collapsing that to `{}` used to surface as a bare "Failed to send invitation."
 * — which blamed the mailer for what was really a 404. (2) An omitted password
 * must reach the API as `undefined`, since that is what selects the backend's
 * invite-email branch over createUser.
 */
describe('inviteUser', () => {
  function stubFetchRaw({ ok = true, status = 200, json } = {}) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, json })));
  }

  it('reports the HTTP status when the error body is not JSON', async () => {
    // An Express/proxy 404 serves an HTML page, so res.json() rejects.
    stubFetchRaw({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    await expect(inviteUser({ email: 'a@b.com' })).rejects.toThrow('(HTTP 404)');
  });

  it("prefers the server's error message over the generic fallback", async () => {
    stubFetchRaw({ ok: false, status: 403, json: async () => ({ error: 'Only Super Admin can perform this action.' }) });
    await expect(inviteUser({ email: 'a@b.com' })).rejects.toThrow(/Only Super Admin/);
  });

  it('appends server detail to the message when present', async () => {
    stubFetchRaw({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Roles tables missing', detail: 'Run the migration.' }),
    });
    await expect(inviteUser({ email: 'a@b.com' })).rejects.toThrow(/Roles tables missing\n\nRun the migration\./);
  });

  it('omits the password so the API takes the invite-email branch', async () => {
    stubFetchRaw({ json: async () => ({ success: true, userId: 'u1', createdWithPassword: false }) });
    const result = await inviteUser({ email: 'a@b.com', roleId: 'role-viewer' });
    expect(result).toMatchObject({ success: true, userId: 'u1', createdWithPassword: false });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('password');
  });

  it('forwards a supplied password and reports createdWithPassword', async () => {
    stubFetchRaw({ json: async () => ({ success: true, userId: 'u2', createdWithPassword: true }) });
    const result = await inviteUser({ email: 'a@b.com', password: 'hunter2hunter2' });
    expect(result.createdWithPassword).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body).password).toBe('hunter2hunter2');
  });
});
