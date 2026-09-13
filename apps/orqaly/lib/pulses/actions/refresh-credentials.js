/**
 * Phase 5: proactively refresh OAuth credentials that expire in the next
 * 24 hours so business-hours calls never hit a cold refresh. Stays a
 * graceful no-op until lib/integrations/_shared/oauth-refresh.js exists.
 */
export async function handleRefreshCredentials(admin, _pulse, _ctx) {
  let refresh;
  try {
    ({ refreshExpiringCredentials: refresh } = await import('../../integrations/_shared/oauth-refresh.js'));
  } catch {
    return { status: 'skipped', reason: 'oauth-refresh module not configured' };
  }
  const stats = await refresh(admin);
  return { status: 'done', ...stats };
}
