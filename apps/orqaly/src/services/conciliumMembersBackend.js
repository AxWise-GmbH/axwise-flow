/**
 * Concilium members backend: Supabase CRUD for board members.
 * No localStorage fallback — members require real DB-backed storage.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';
import { resolveLlmPair } from '../utils/llmPair';

const TABLE = 'concilium_members';

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function assertSupabase() {
  if (!hasSupabase()) throw new Error('Supabase required for concilium members');
}

// ── Row mapping ──────────────────────────────────────────────────

function rowToMember(r) {
  if (!r) return null;
  const llm = resolveLlmPair({ provider: r.provider, model: r.model });
  return {
    id: r.id,
    conciliumId: r.concilium_id,
    name: r.name || '',
    role: (typeof r.role === 'object' ? r.role?.value : r.role) || 'evaluator',
    resume: r.resume || '',
    skills: Array.isArray(r.skills) ? r.skills : [],
    comments: Array.isArray(r.comments) ? r.comments : [],
    provider: llm.provider,
    model: llm.model,
    temperature: r.temperature ?? 0.7,
    maxTokens: r.max_tokens ?? 4096,
    totalEvaluations: r.total_evaluations || 0,
    avgResponseTimeMs: r.avg_response_time_ms || 0,
    avgCostUsd: parseFloat(r.avg_cost_usd) || 0,
    totalTokensUsed: r.total_tokens_used || 0,
    active: r.active !== false,
    quarantined: r.quarantined || false,
    quarantineReason: r.quarantine_reason || null,
    quarantinedAt: r.quarantined_at || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function memberToRow(m) {
  const llm = resolveLlmPair({ provider: m.provider, model: m.model });
  return {
    concilium_id: m.conciliumId,
    name: m.name || '',
    role: m.role || 'evaluator',
    resume: m.resume || '',
    skills: Array.isArray(m.skills) ? m.skills : [],
    comments: Array.isArray(m.comments) ? m.comments : [],
    provider: llm.provider,
    model: llm.model,
    temperature: m.temperature ?? 0.7,
    max_tokens: m.maxTokens ?? 4096,
    active: m.active !== false,
  };
}

// ── Public API ───────────────────────────────────────────────────

export async function loadMembers(conciliumId) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('concilium_id', conciliumId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToMember);
}

/**
 * Member counts per board for the authenticated user, in a single query.
 * Returns a map of `{ [conciliumId]: count }`. Used by the Home dashboard's
 * Consilium Activity block to show each board's agent (member) count without
 * an N-per-board fetch.
 */
export async function loadMemberCountsByBoard() {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase.from(TABLE).select('concilium_id').eq('user_id', userId);
  if (error) throw error;
  const counts = {};
  for (const row of data || []) {
    const key = row.concilium_id;
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export async function createMember(member, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const row = memberToRow(member);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...row, user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  logAction({
    action: 'Member created',
    entity: 'ConciliumMember',
    entityId: data.id,
    details: member.name,
    meta: {
      source: 'conciliumMembersBackend',
      importance: 'medium',
      tags: ['create', 'member'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  return rowToMember(data);
}

export async function updateMemberById(id, updates, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const row = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.role !== undefined) row.role = updates.role || 'evaluator';
  if (updates.resume !== undefined) row.resume = updates.resume;
  if (updates.skills !== undefined) row.skills = updates.skills;
  if (updates.comments !== undefined) row.comments = updates.comments;
  if (updates.provider !== undefined || updates.model !== undefined) {
    const llm = resolveLlmPair({ provider: updates.provider, model: updates.model });
    row.provider = llm.provider;
    row.model = llm.model;
  }
  if (updates.temperature !== undefined) row.temperature = updates.temperature;
  if (updates.maxTokens !== undefined) row.max_tokens = updates.maxTokens;
  if (updates.active !== undefined) row.active = updates.active;
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  logAction({
    action: 'Member updated',
    entity: 'ConciliumMember',
    entityId: id,
    details: updates.name || id,
    meta: {
      source: 'conciliumMembersBackend',
      importance: 'medium',
      tags: ['update', 'member'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  return rowToMember(data);
}

export async function deleteMemberById(id, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  logAction({
    action: 'Member deleted',
    entity: 'ConciliumMember',
    entityId: id,
    details: 'Member removed',
    meta: {
      source: 'conciliumMembersBackend',
      importance: 'high',
      tags: ['delete', 'member'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  return true;
}

export async function quarantineMember(id, reason = 'Manual quarantine') {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      quarantined: true,
      quarantine_reason: reason,
      quarantined_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToMember(data);
}

export async function unquarantineMember(id) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      quarantined: false,
      quarantine_reason: null,
      quarantined_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToMember(data);
}
