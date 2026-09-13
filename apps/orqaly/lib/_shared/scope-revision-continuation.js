/**
 * Return the active native scope-rebuild token.
 *
 * `undefined` means no rebuild is active, `null` means a malformed pending
 * rebuild is missing its mandatory token, and a string is the exact token
 * every continuation must carry.
 */
export function pendingScopeRevisionToken(goal) {
  const revision = goal?.data?.scope_revision;
  if (revision?.status !== 'pending_rebuild') return undefined;
  const token = String(revision.revision_token || '').trim();
  return token || null;
}

export function scopeRevisionContinuationPayload(goal) {
  const token = pendingScopeRevisionToken(goal);
  return token ? { scope_revision_token: token } : {};
}
