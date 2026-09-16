/**
 * Organization Vault service — company briefing and per-role conditioning.
 *
 * The briefing is open free text. Conditioning derived from it is injected into
 * every agent's system prompt for that organization, so the same agent produces
 * on-brand work for one company and different on-brand work for another.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function request(url, init = {}) {
  const res = await fetch(url, { ...init, headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.code = data.code;
    err.current = data.current;
    throw err;
  }
  return data;
}

/** Briefing, generated summary, and every enhancement for one organization. */
export async function getOrgVault(orgId) {
  return request(`${getBase()}/api/app?path=org-vault&org_id=${encodeURIComponent(orgId)}`);
}

/**
 * Save the briefing and/or the summary.
 * Pass `edited: true` when the user changed generated text, so the row is
 * marked as hand-touched and generation stops overwriting it silently.
 */
export async function saveOrgVault(orgId, { briefing, summary, edited = false } = {}) {
  return request(`${getBase()}/api/app?path=org-vault`, {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      ...(briefing !== undefined ? { briefing } : {}),
      ...(summary !== undefined ? { summary } : {}),
      edited,
    }),
  });
}

/** One enhancement, by scope. Empty roleKey means the organization-wide default. */
export async function getEnhancement(orgId, { roleKey = '', agentId = null } = {}) {
  const qs = new URLSearchParams({ org_id: orgId });
  if (roleKey) qs.set('role_key', roleKey);
  if (agentId) qs.set('agent_id', agentId);
  const data = await request(`${getBase()}/api/app?path=agent-enhancements&${qs}`);
  return data.enhancement || null;
}

/** Write conditioning by hand. Never calls a model. */
export async function saveEnhancement(
  orgId,
  { roleKey = '', agentId = null, content, isActive } = {}
) {
  return request(`${getBase()}/api/app?path=agent-enhancements`, {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      role_key: roleKey,
      agent_id: agentId,
      ...(content !== undefined ? { content } : {}),
      ...(isActive !== undefined ? { is_active: isActive } : {}),
    }),
  });
}

/**
 * Generate conditioning from the briefing.
 *
 * Throws with `code === 'confirm_overwrite_required'` when the target was
 * written or edited by hand. Show the user both versions and retry with
 * `confirmOverwrite: true` only if they choose to replace it.
 */
export async function generateEnhancement(
  orgId,
  { roleKey = '', agentId = null, confirmOverwrite = false } = {}
) {
  return request(`${getBase()}/api/app?path=agent-enhancements&op=generate`, {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      role_key: roleKey,
      agent_id: agentId,
      confirm_overwrite: confirmOverwrite,
    }),
  });
}

/**
 * Vault status for many organizations at once, for the Organizations table.
 *
 * Reads through the user's own session so RLS applies. Returns
 * { [orgId]: { version, hasBriefing } } with only orgs that have a profile.
 */
export async function getOrgVaultMap(orgIds = []) {
  if (!hasSupabase() || !orgIds.length) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from('organization_profiles')
    .select('org_id, briefing, updated_at')
    .eq('user_id', user.id)
    .in('org_id', orgIds);
  if (error) return {};

  const map = {};
  for (const row of data || []) {
    map[row.org_id] = {
      hasBriefing: Boolean((row.briefing || '').trim()),
      updatedAt: row.updated_at,
    };
  }
  return map;
}
