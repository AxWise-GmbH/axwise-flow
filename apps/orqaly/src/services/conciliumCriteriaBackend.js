/**
 * Concilium criteria backend: Supabase CRUD for evaluation criteria.
 * No localStorage fallback — criteria require real DB-backed storage.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';

const TABLE = 'concilium_criteria';

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function assertSupabase() {
  if (!hasSupabase()) throw new Error('Supabase required for concilium criteria');
}

// ── Row mapping ──────────────────────────────────────────────────

function rowToCriterion(r) {
  if (!r) return null;
  return {
    id: r.id,
    conciliumId: r.concilium_id,
    name: r.name || '',
    weight: parseFloat(r.weight) || 1.0,
    rubric: r.rubric || '',
    examples: Array.isArray(r.examples) ? r.examples : [],
    version: r.version || 1,
    isActive: r.is_active !== false,
    sortOrder: r.sort_order || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function criterionToRow(c) {
  return {
    concilium_id: c.conciliumId,
    name: c.name || '',
    weight: c.weight ?? 1.0,
    rubric: c.rubric || '',
    examples: Array.isArray(c.examples) ? c.examples : [],
    sort_order: c.sortOrder ?? 0,
  };
}

// ── Public API ───────────────────────────────────────────────────

export async function loadCriteria(conciliumId) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('concilium_id', conciliumId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToCriterion);
}

export async function createCriterion(criterion, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const row = criterionToRow(criterion);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...row, user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  logAction({
    action: 'Criterion created',
    entity: 'ConciliumCriteria',
    entityId: data.id,
    details: criterion.name,
    meta: {
      source: 'conciliumCriteriaBackend',
      importance: 'medium',
      tags: ['create', 'criterion'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  return rowToCriterion(data);
}

export async function updateCriterionById(id, updates, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const row = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.weight !== undefined) row.weight = updates.weight;
  if (updates.rubric !== undefined) row.rubric = updates.rubric;
  if (updates.examples !== undefined) row.examples = updates.examples;
  if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
  if (updates.isActive !== undefined) row.is_active = updates.isActive;
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
    action: 'Criterion updated',
    entity: 'ConciliumCriteria',
    entityId: id,
    details: updates.name || id,
    meta: {
      source: 'conciliumCriteriaBackend',
      importance: 'medium',
      tags: ['update', 'criterion'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  return rowToCriterion(data);
}

export async function deleteCriterionById(id, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  logAction({
    action: 'Criterion deleted',
    entity: 'ConciliumCriteria',
    entityId: id,
    details: 'Criterion removed',
    meta: {
      source: 'conciliumCriteriaBackend',
      importance: 'high',
      tags: ['delete', 'criterion'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  return true;
}
