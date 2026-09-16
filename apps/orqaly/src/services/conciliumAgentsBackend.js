/**
 * Concilium agents backend: Supabase CRUD for AI agent lifecycle.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const TABLE = 'concilium_agents';

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function assertSupabase() {
  if (!hasSupabase()) throw new Error('Supabase required for concilium agents');
}

function rowToAgent(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name || '',
    description: r.description || '',
    boardId: r.board_id,
    agentType: r.agent_type || 'external',
    status: r.status || 'pending',
    trackingToken: r.tracking_token,
    checkInIntervalMs: r.check_in_interval_ms || 300000,
    lastCheckIn: r.last_check_in,
    missedCheckIns: r.missed_check_ins || 0,
    totalRequests: r.total_requests || 0,
    totalTokensUsed: r.total_tokens_used || 0,
    totalCostUsd: parseFloat(r.total_cost_usd) || 0,
    totalEvaluations: r.total_evaluations || 0,
    maxRequestsPerHour: r.max_requests_per_hour || 60,
    maxCostPerDayUsd: parseFloat(r.max_cost_per_day_usd) || 5,
    metadata: r.metadata || {},
    acceptedAt: r.accepted_at,
    terminatedAt: r.terminated_at,
    terminationReason: r.termination_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function loadAgents(boardId = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  let query = supabase.from(TABLE).select('*').eq('user_id', userId);
  if (boardId) query = query.eq('board_id', boardId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToAgent);
}

export async function registerAgent(agentData) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name: agentData.name,
      description: agentData.description || '',
      board_id: agentData.boardId || null,
      agent_type: agentData.agentType || 'external',
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToAgent(data);
}

export async function updateAgentStatus(id, action, body = {}) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const updates = { updated_at: new Date().toISOString() };
  if (action === 'accept') {
    updates.status = 'accepted';
    updates.accepted_at = updates.updated_at;
  }
  if (action === 'pause') {
    updates.status = 'paused';
    updates.paused_at = updates.updated_at;
  }
  if (action === 'resume') {
    updates.status = 'active';
  }
  if (action === 'terminate') {
    updates.status = 'terminated';
    updates.terminated_at = updates.updated_at;
    updates.termination_reason = body.reason || '';
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToAgent(data);
}

export async function deleteAgent(id) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  return true;
}
