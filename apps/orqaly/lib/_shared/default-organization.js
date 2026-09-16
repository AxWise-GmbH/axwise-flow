/**
 * Preferred legacy organization for goals.
 *
 * New installations are not required to have an organization with this name;
 * resolveDefaultOrgId falls back to the oldest active organization owned by
 * the user when Traktor is unavailable.
 */
export const DEFAULT_ORG_NAME = 'Traktor';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function resolveDefaultOrgId(admin, userId) {
  if (!admin || !userId) return null;

  const { data: preferred, error: preferredError } = await admin
    .from('organizations')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .ilike('name', DEFAULT_ORG_NAME)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (preferredError) return null;
  if (preferred?.id) return preferred.id;

  const { data: fallback, error: fallbackError } = await admin
    .from('organizations')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackError || !fallback?.id) return null;
  return fallback.id;
}

/**
 * Resolve org_id for a new goal: explicit value → parent goal → preferred
 * Traktor organization → first active user-owned organization.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 * @param {{ orgId?: string|null, parentGoalId?: string|null }} opts
 * @returns {Promise<string|null>}
 */
export async function resolveGoalOrgId(admin, userId, { orgId, parentGoalId } = {}) {
  // An explicit organization is a security boundary, not a client hint. The
  // service-role client bypasses RLS, so always prove that the requested
  // workspace is both active and owned by the authenticated user before a
  // goal (and its AxWise tenant context) is created.
  if (orgId) {
    const { data: organization, error } = await admin
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to verify the selected organization: ${error.message}`);
    }
    return organization?.id || null;
  }

  if (parentGoalId) {
    const { data: parent } = await admin
      .from('goals')
      .select('org_id')
      .eq('id', parentGoalId)
      .eq('user_id', userId)
      .maybeSingle();
    if (parent?.org_id) return parent.org_id;
  }

  return resolveDefaultOrgId(admin, userId);
}
