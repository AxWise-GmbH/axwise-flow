/**
 * Dispatcher tests - focus on the generic-template fallback that lets NEW
 * catalog actions (which have no bespoke email template) still deliver, and on
 * the subscription gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupabase: vi.fn(() => true),
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'a@b.com' } } })),
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
  loadPreferences: vi.fn(async () => ({ agent_created: true, partner_created: true })),
}));

vi.mock('../lib/supabase', () => ({
  hasSupabase: mocks.hasSupabase,
  supabase: { auth: { getUser: mocks.getUser, getSession: mocks.getSession } },
}));
vi.mock('./emailNotificationPreferences', () => ({
  loadPreferences: mocks.loadPreferences,
  isActionEnabled: (key, prefs) => !!prefs?.[key],
}));

const { maybeNotify, invalidatePrefsCache } = await import('./emailNotificationDispatcher.js');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasSupabase.mockReturnValue(true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  mocks.loadPreferences.mockResolvedValue({ agent_created: true, partner_created: true });
  invalidatePrefsCache();
});

describe('maybeNotify', () => {
  it('uses the generic template and POSTs for an action with no bespoke template', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'e1' }) }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await maybeNotify('agent_created', { name: 'Scout' });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/send-notification');
    const body = JSON.parse(opts.body);
    expect(body.action).toBe('agent_created');
    // generic subject == catalog action label
    expect(body.subject).toBe('Agent created');
    expect(body.html).toBeTruthy();
  });

  it('does not send when the action is not subscribed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.loadPreferences.mockResolvedValue({ agent_created: false });
    invalidatePrefsCache();

    const result = await maybeNotify('agent_created', { name: 'Scout' });

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false (no throw) when the API responds non-OK', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await maybeNotify('partner_created', { name: 'Acme' });

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
