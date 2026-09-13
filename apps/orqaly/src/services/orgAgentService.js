/**
 * Org → Agent assignment service — Supabase-backed.
 * Stores which agents are working on each organization.
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
 * Get all agent IDs assigned to an org.
 */
export async function getOrgAgents(orgId) {
  const user = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('org_agents')
    .select('agent_id')
    .eq('org_id', orgId)
    .eq('user_id', user.id);
  if (error) {
    console.error('getOrgAgents:', error.message);
    return [];
  }
  return (data || []).map((r) => r.agent_id);
}

/**
 * Set agents for an org (replaces existing assignments).
 */
export async function setOrgAgents(orgId, agentIds) {
  const user = await getUser();
  if (!user) return;
  await supabase.from('org_agents').delete().eq('org_id', orgId).eq('user_id', user.id);
  if (agentIds.length > 0) {
    const rows = agentIds.map((aid) => ({ user_id: user.id, org_id: orgId, agent_id: aid }));
    const { error } = await supabase.from('org_agents').insert(rows);
    if (error) console.error('setOrgAgents:', error.message);
  }
}

/**
 * Batch fetch org→agent assignments for a list of org IDs.
 * @returns {Object} map of orgId → agentId[]
 */
export async function getOrgAgentMap(orgIds) {
  if (!orgIds || orgIds.length === 0) return {};
  const user = await getUser();
  if (!user) return {};
  const { data, error } = await supabase
    .from('org_agents')
    .select('org_id, agent_id')
    .in('org_id', orgIds)
    .eq('user_id', user.id);
  if (error) {
    console.error('getOrgAgentMap:', error.message);
    return {};
  }
  const map = {};
  (data || []).forEach((r) => {
    if (!map[r.org_id]) map[r.org_id] = [];
    map[r.org_id].push(r.agent_id);
  });
  return map;
}
