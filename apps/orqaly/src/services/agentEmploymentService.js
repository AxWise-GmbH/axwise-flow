/**
 * Agent employment service — reverse lookup of where an agent is "hired".
 *
 * For a given agent, resolves the organizations it's assigned to (with the
 * assignment start date and the consilium board governing each org) and the
 * teams it belongs to (with role + join date). All user-scoped; best-effort
 * (returns empty arrays rather than throwing). No new tables — reads the
 * existing org_agents / organizations / concilium / agent_team_members /
 * agent_teams.
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
 * @param {string} agentId
 * @returns {Promise<{ orgs: Array<{org_id,org_name,consilium_id,consilium_name,assigned_at}>,
 *                     teams: Array<{team_id,team_name,role,joined_at}> }>}
 */
export async function getAgentEmployment(agentId) {
  const empty = { orgs: [], teams: [] };
  if (!agentId) return empty;
  const user = await getUser();
  if (!user) return empty;

  const [orgs, teams] = await Promise.all([
    loadOrgEmployment(user.id, agentId),
    loadTeamEmployment(user.id, agentId),
  ]);
  return { orgs, teams };
}

async function loadOrgEmployment(userId, agentId) {
  try {
    const { data: links, error } = await supabase
      .from('org_agents')
      .select('org_id, created_at')
      .eq('agent_id', agentId)
      .eq('user_id', userId);
    if (error || !links?.length) return [];

    const orgIds = [...new Set(links.map((l) => l.org_id))];
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, consilium_id')
      .in('id', orgIds);
    const orgById = Object.fromEntries((orgs || []).map((o) => [o.id, o]));

    const consiliumIds = [...new Set((orgs || []).map((o) => o.consilium_id).filter(Boolean))];
    let boardById = {};
    if (consiliumIds.length) {
      const { data: boards } = await supabase
        .from('concilium')
        .select('id, name')
        .in('id', consiliumIds);
      boardById = Object.fromEntries((boards || []).map((b) => [b.id, b.name]));
    }

    return links
      .map((l) => {
        const org = orgById[l.org_id];
        if (!org) return null;
        return {
          org_id: l.org_id,
          org_name: org.name || 'Untitled organization',
          consilium_id: org.consilium_id || null,
          consilium_name: org.consilium_id ? boardById[org.consilium_id] || null : null,
          assigned_at: l.created_at || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.assigned_at || 0) - new Date(b.assigned_at || 0));
  } catch {
    return [];
  }
}

/**
 * Batched reverse lookup for many agents at once (for the Agent Hub table).
 * @param {string[]} agentIds  candidate agent ids (id / agent_id / _supabase_id)
 * @returns {Promise<Object>} map of agent_id -> orgs[] (same shape as getAgentEmployment().orgs)
 */
export async function getAgentEmploymentMap(agentIds) {
  if (!agentIds?.length) return {};
  const user = await getUser();
  if (!user) return {};
  try {
    const ids = [...new Set(agentIds.filter(Boolean))];
    if (!ids.length) return {};
    const { data: links, error } = await supabase
      .from('org_agents')
      .select('agent_id, org_id, created_at')
      .in('agent_id', ids)
      .eq('user_id', user.id);
    if (error || !links?.length) return {};

    const orgIds = [...new Set(links.map((l) => l.org_id))];
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, consilium_id')
      .in('id', orgIds);
    const orgById = Object.fromEntries((orgs || []).map((o) => [o.id, o]));

    const consiliumIds = [...new Set((orgs || []).map((o) => o.consilium_id).filter(Boolean))];
    let boardById = {};
    if (consiliumIds.length) {
      const { data: boards } = await supabase
        .from('concilium')
        .select('id, name')
        .in('id', consiliumIds);
      boardById = Object.fromEntries((boards || []).map((b) => [b.id, b.name]));
    }

    const map = {};
    for (const l of links) {
      const org = orgById[l.org_id];
      if (!org) continue;
      (map[l.agent_id] ||= []).push({
        org_id: l.org_id,
        org_name: org.name || 'Untitled organization',
        consilium_id: org.consilium_id || null,
        consilium_name: org.consilium_id ? boardById[org.consilium_id] || null : null,
        assigned_at: l.created_at || null,
      });
    }
    return map;
  } catch {
    return {};
  }
}

async function loadTeamEmployment(userId, agentId) {
  try {
    const { data: members, error } = await supabase
      .from('agent_team_members')
      .select('team_id, role, joined_at')
      .eq('member_id', agentId)
      .eq('user_id', userId);
    if (error || !members?.length) return [];

    const teamIds = [...new Set(members.map((m) => m.team_id))];
    const { data: teams } = await supabase.from('agent_teams').select('id, name').in('id', teamIds);
    const nameById = Object.fromEntries((teams || []).map((t) => [t.id, t.name]));

    return members
      .map((m) => ({
        team_id: m.team_id,
        team_name: nameById[m.team_id] || 'Team',
        role: m.role || 'member',
        joined_at: m.joined_at || null,
      }))
      .sort((a, b) => new Date(a.joined_at || 0) - new Date(b.joined_at || 0));
  } catch {
    return [];
  }
}

export default getAgentEmployment;
