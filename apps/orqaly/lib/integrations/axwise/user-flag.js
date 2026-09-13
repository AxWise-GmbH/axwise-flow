/**
 * Per-user AxWise kill switch resolver. Reads users.axwise_enabled and reports
 * whether the user turned AxWise OFF for their account.
 *
 * Fail closed when the preference cannot be read: a database/client error or
 * missing lookup context reports AxWise as disabled. A successful lookup with
 * no stored preference still preserves the product default (enabled). This
 * keeps the user's OFF choice a privacy boundary even during partial outages.
 *
 * Cached in-memory (short TTL per user) so it never adds a DB round-trip to the
 * hot path on repeat requests; the read is a single PK lookup, so the TTL stays
 * low - the toggle is a user-facing control and must bite promptly. The write
 * path (user-prefs) clears this cache, but only for its own serverless instance,
 * so the TTL is what actually bounds staleness across the fleet.
 */
const TTL_MS = 10_000;
const _cache = new Map(); // userId -> { disabled: boolean, at: ms }

/** Drop cached flags so the next call re-reads the DB. Called by the user-prefs
 *  write path on toggle, and by tests. Pass a userId to evict just that user. */
export function clearAxwiseUserFlagCache(userId) {
  if (userId) _cache.delete(userId);
  else _cache.clear();
}

export async function isAxwiseUserDisabled(admin, userId) {
  if (!admin || !userId) return true;
  const now = Date.now();
  const hit = _cache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.disabled;
  try {
    const { data, error } = await admin
      .from('users')
      .select('axwise_enabled')
      .eq('id', userId)
      .maybeSingle();
    if (error) return true; // fail closed; don't cache transient errors
    const disabled = data?.axwise_enabled === false;
    _cache.set(userId, { disabled, at: now });
    return disabled;
  } catch {
    return true;
  }
}
