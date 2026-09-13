/**
 * Org → Team assignment service — Supabase-backed.
 * Stores which teams are working on each organization.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getUser() {
  if (!hasSupabase()) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user || null;
}

/**
 * Get all team IDs assigned to an org.
 */
export async function getOrgTeams(orgId) {
  const user = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('org_teams')
    .select('team_id')
    .eq('org_id', orgId)
    .eq('user_id', user.id);
  if (error) {
    console.error('getOrgTeams:', error.message);
    return [];
  }
  return (data || []).map((r) => r.team_id);
}

/**
 * Set teams for an org (replaces existing assignments).
 */
export async function setOrgTeams(orgId, teamIds) {
  const user = await getUser();
  if (!user) return;
  await supabase.from('org_teams').delete().eq('org_id', orgId).eq('user_id', user.id);
  if (teamIds.length > 0) {
    const rows = teamIds.map((tid) => ({ user_id: user.id, org_id: orgId, team_id: tid }));
    const { error } = await supabase.from('org_teams').insert(rows);
    if (error) console.error('setOrgTeams:', error.message);
  }
}

/**
 * Batch fetch org→team assignments for a list of org IDs.
 * @returns {Object} map of orgId → teamId[]
 */
export async function getOrgTeamMap(orgIds) {
  if (!orgIds || orgIds.length === 0) return {};
  const user = await getUser();
  if (!user) return {};
  const { data, error } = await supabase
    .from('org_teams')
    .select('org_id, team_id')
    .in('org_id', orgIds)
    .eq('user_id', user.id);
  if (error) {
    console.error('getOrgTeamMap:', error.message);
    return {};
  }
  const map = {};
  (data || []).forEach((r) => {
    if (!map[r.org_id]) map[r.org_id] = [];
    map[r.org_id].push(r.team_id);
  });
  return map;
}
