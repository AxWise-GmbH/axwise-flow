/** Client-side default organization name (must match lib/_shared/default-organization.js). */
export const DEFAULT_ORG_NAME = 'Traktor';

/**
 * Pick the Traktor organization from a list (case-insensitive name match).
 * @param {Array<{ id: string, name?: string }>} orgs
 * @returns {string|null}
 */
export function pickTraktorOrgId(orgs) {
  if (!Array.isArray(orgs) || orgs.length === 0) return null;
  const target = DEFAULT_ORG_NAME.toLowerCase();
  const match = orgs.find(
    (o) =>
      String(o.name || '')
        .trim()
        .toLowerCase() === target
  );
  return match?.id || null;
}

/**
 * Pick a deterministic active workspace for a goal.
 *
 * Keep the legacy Traktor preference when it exists, then fall back to the
 * oldest active user-owned organization. The id tie-breaker keeps the choice
 * stable when imported organizations have no creation timestamp.
 *
 * @param {Array<{ id: string, name?: string, is_active?: boolean, created_at?: string }>} orgs
 * @returns {string|null}
 */
export function pickDefaultOrgId(orgs) {
  if (!Array.isArray(orgs) || orgs.length === 0) return null;

  const active = orgs.filter((org) => org?.id && org.is_active !== false);
  if (active.length === 0) return null;

  const traktorId = pickTraktorOrgId(active);
  if (traktorId) return traktorId;

  return (
    [...active].sort((a, b) => {
      const aTime = Date.parse(a.created_at || '');
      const bTime = Date.parse(b.created_at || '');
      const normalizedATime = Number.isFinite(aTime) ? aTime : Number.POSITIVE_INFINITY;
      const normalizedBTime = Number.isFinite(bTime) ? bTime : Number.POSITIVE_INFINITY;
      return normalizedATime - normalizedBTime || String(a.id).localeCompare(String(b.id));
    })[0]?.id || null
  );
}
