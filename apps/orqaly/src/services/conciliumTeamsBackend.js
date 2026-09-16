/**
 * Concilium teams backend: Supabase CRUD for teams.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const TABLE = 'concilium_teams';
const JUNCTION = 'concilium_team_members';

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function assertSupabase() {
  if (!hasSupabase()) throw new Error('Supabase required for concilium teams');
}

function rowToTeam(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name || '',
    description: r.description || '',
    leaderId: r.leader_id,
    isActive: r.is_active !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function loadTeams() {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToTeam);
}

export async function createTeam(teamData) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, name: teamData.name, description: teamData.description || '' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToTeam(data);
}

export async function updateTeamById(id, updates) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const row = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.isActive !== undefined) row.is_active = updates.isActive;
  if (updates.leaderId !== undefined) row.leader_id = updates.leaderId;
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToTeam(data);
}

export async function deleteTeamById(id) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  return true;
}

export async function addTeamMember(teamId, memberId) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(JUNCTION)
    .insert({ team_id: teamId, member_id: memberId, user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function removeTeamMember(teamId, memberId) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { error } = await supabase
    .from(JUNCTION)
    .delete()
    .eq('team_id', teamId)
    .eq('member_id', memberId)
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

// ── Agent Teams (My Agents workforce teams) ──────────────────

const AGENT_TEAMS = 'agent_teams';
const AGENT_TEAM_MEMBERS = 'agent_team_members';

export async function loadAgentTeams() {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(AGENT_TEAMS)
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToTeam);
}

export async function loadAgentTeamMembers(teamId) {
  assertSupabase();
  const { data, error } = await supabase
    .from(AGENT_TEAM_MEMBERS)
    .select('member_id, role, joined_at')
    .eq('team_id', teamId);
  if (error) throw error;
  return data || [];
}
