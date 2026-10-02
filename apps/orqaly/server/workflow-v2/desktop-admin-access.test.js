// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopAdminAccess, desktopAdminAccessFromEnvironment } from './desktop-admin-access.js';

describe('desktop admin access', () => {
  const verifiedUser = (overrides = {}) => ({
    id: 'user-viktors',
    emailAddresses: [{ emailAddress: 'viktors@axwise.de', verification: { status: 'verified' } }],
    ...overrides,
  });

  it('grants configured user IDs without requiring an email lookup', async () => {
    const getUser = vi.fn();
    const resolve = createDesktopAdminAccess({ adminUserIds: ['user-admin'], getUser });
    expect(await resolve('user-admin')).toBe(true);
    expect(await resolve('user-other')).toBe(false);
    expect(await resolve('')).toBe(false);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('activates preauthorized emails only after backend verification', async () => {
    const getUser = vi.fn(async () => verifiedUser());
    const resolve = createDesktopAdminAccess({ adminEmails: [' VIKTORS@AXWISE.DE '], getUser });
    expect(await resolve('user-viktors')).toBe(true);
    expect(getUser).toHaveBeenCalledWith('user-viktors');
  });

  it.each([
    { emailAddresses: [{ emailAddress: 'viktors@axwise.de', verification: { status: 'unverified' } }] },
    { emailAddresses: [{ emailAddress: 'other@axwise.de', verification: { status: 'verified' } }] },
    { emailAddresses: [], unsafeMetadata: { email: 'viktors@axwise.de', isAdmin: true } },
    { id: 'user-other' },
    { banned: true },
    { locked: true },
  ])('does not authorize unverified, unrelated or disabled identities: %#', async (overrides) => {
    const resolve = createDesktopAdminAccess({
      adminEmails: ['viktors@axwise.de'], getUser: async () => verifiedUser(overrides),
    });
    expect(await resolve('user-viktors')).toBe(false);
  });

  it('refreshes cached grants and denials after the TTL', async () => {
    let time = 0;
    const getUser = vi.fn(async () => verifiedUser());
    const resolve = createDesktopAdminAccess({
      adminEmails: ['viktors@axwise.de'], getUser, now: () => time, cacheTtlMs: 100,
    });
    expect(await resolve('user-viktors')).toBe(true);
    getUser.mockResolvedValue(verifiedUser({ emailAddresses: [] }));
    expect(await resolve('user-viktors')).toBe(true);
    time = 101;
    expect(await resolve('user-viktors')).toBe(false);
    getUser.mockResolvedValue(verifiedUser());
    time = 202;
    expect(await resolve('user-viktors')).toBe(true);
    expect(getUser).toHaveBeenCalledTimes(3);
  });

  it('fails closed when the backend lookup is unavailable', async () => {
    const resolve = createDesktopAdminAccess({
      adminEmails: ['viktors@axwise.de'], getUser: async () => { throw new Error('unavailable'); },
    });
    await expect(resolve('user-viktors')).rejects.toThrow('unavailable');
  });

  it('preserves the existing admin default and allows an explicitly empty list', async () => {
    expect(await desktopAdminAccessFromEnvironment({})('user_2xaXl1ECHV80vYTdmiu6x3X66Wf')).toBe(true);
    expect(await desktopAdminAccessFromEnvironment({ ORQALY_ADMIN_USER_IDS: '' })('user_2xaXl1ECHV80vYTdmiu6x3X66Wf')).toBe(false);
  });
});
