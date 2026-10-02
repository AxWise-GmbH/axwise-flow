import { createClerkClient } from '@clerk/express';

const configuredValues = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);

export function createDesktopAdminAccess({
  adminUserIds = [], adminEmails = [], getUser, now = Date.now, cacheTtlMs = 60_000,
} = {}) {
  const ids = new Set(adminUserIds);
  const emails = new Set(adminEmails.map((email) => email.trim().toLowerCase()));
  const cache = new Map();
  if (emails.size && typeof getUser !== 'function') throw new Error('ADMIN_USER_LOOKUP_REQUIRED');

  return async (userId) => {
    if (typeof userId !== 'string' || !userId) return false;
    if (ids.has(userId)) return true;
    if (!emails.size) return false;
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now()) return cached.isAdmin;

    // Read verified emails from Clerk's backend, never from headers or user-editable metadata.
    const user = await getUser(userId);
    const isAdmin = user?.id === userId && !user.banned && !user.locked &&
      user.emailAddresses?.some((address) => address.verification?.status === 'verified' &&
        emails.has(address.emailAddress?.trim().toLowerCase())) === true;
    if (cache.size >= 1000) cache.delete(cache.keys().next().value);
    cache.set(userId, { isAdmin, expiresAt: now() + cacheTtlMs });
    return isAdmin;
  };
}

export function desktopAdminAccessFromEnvironment(environment = process.env) {
  const adminUserIds = configuredValues(environment.ORQALY_ADMIN_USER_IDS ?? 'user_2xaXl1ECHV80vYTdmiu6x3X66Wf,user_2xdZVfEfNCMGdl6ZsBLYYdCoWIw');
  const adminEmails = configuredValues(environment.ORQALY_ADMIN_USER_EMAILS ?? 'vitalijs@axwise.de,viktors@axwise.de');
  const client = adminEmails.length && environment.CLERK_SECRET_KEY ? createClerkClient({ secretKey: environment.CLERK_SECRET_KEY }) : null;
  return createDesktopAdminAccess({ adminUserIds, adminEmails, getUser: client && ((userId) => client.users.getUser(userId)) });
}
