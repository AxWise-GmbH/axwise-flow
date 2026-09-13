/**
 * Concilium backend: Supabase CRUD for boards (v2 schema).
 * localStorage fallback removed — enterprise features require DB-backed persistence.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';
import { addLog } from './communicatorService';

const TABLE = 'concilium';

function assertSupabase() {
  if (!hasSupabase()) throw new Error('Supabase required for concilium');
}

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Row mapping (camelCase ↔ snake_case) ──────────────────────
function conciliumToRow(c) {
  const row = {
    id: c.id,
    name: c.name || '',
    quantity: c.quantity || 1,
    llms: Array.isArray(c.llms) ? c.llms : [],
    purpose: c.purpose || '',
    status: c.status || 'active',
    created_by_id: c.createdById || null,
    created_by_name: c.createdByName || '',
    change_log: Array.isArray(c.changeLog) ? c.changeLog : [],
    started_at: c.startedAt || new Date().toISOString(),
    working_on: Array.isArray(c.workingOn) ? c.workingOn : [],
  };
  // v2 fields
  if (c.description !== undefined) row.description = c.description;
  if (c.securityLevel !== undefined) row.security_level = c.securityLevel;
  if (c.approvalThreshold !== undefined) row.approval_threshold = c.approvalThreshold;
  if (c.confidenceThreshold !== undefined) row.confidence_threshold = c.confidenceThreshold;
  if (c.autoQuarantineOnViolation !== undefined)
    row.auto_quarantine_on_violation = c.autoQuarantineOnViolation;
  return row;
}

function rowToConcilium(r) {
  if (!r) return null;
  return {
    id: r.id,
    uuidId: r.uuid_id || null,
    name: r.name || '',
    quantity: r.quantity || 1,
    llms: Array.isArray(r.llms) ? r.llms : [],
    purpose: r.purpose || '',
    status: r.status || 'active',
    createdById: r.created_by_id || null,
    createdByName: r.created_by_name || '',
    changeLog: Array.isArray(r.change_log) ? r.change_log : [],
    startedAt: r.started_at,
    workingOn: Array.isArray(r.working_on) ? r.working_on : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // v2 fields
    description: r.description || '',
    securityLevel: r.security_level || 'standard',
    approvalThreshold: Number.parseFloat(r.approval_threshold) || 0.6,
    confidenceThreshold: Number.parseFloat(r.confidence_threshold) || 0.7,
    autoQuarantineOnViolation: r.auto_quarantine_on_violation || false,
  };
}

// ── Public API ────────────────────────────────────────────────
export async function loadConcilium() {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToConcilium);
}

export async function createConcilium(concilium, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const row = conciliumToRow(concilium);
  const { error } = await supabase.from(TABLE).insert({ ...row, user_id: userId });
  if (error) throw error;
  logAction({
    action: 'Concilium created',
    entity: 'Concilium',
    entityId: concilium.id,
    details: concilium.name,
    meta: {
      source: 'conciliumBackend',
      importance: 'medium',
      tags: ['create', 'concilium'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  addLog({
    thread_id: concilium.id,
    sender_type: 'user',
    sender_name: concilium.createdByName || 'User',
    content: `Consilium board "${concilium.name}" created`,
    context_type: 'consilium',
    context_id: concilium.id,
    context_label: concilium.name,
    platform: 'internal',
    metadata: { action: 'created', board_name: concilium.name },
  }).catch(() => {});
  return concilium;
}

export async function updateConciliumById(id, concilium, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const row = conciliumToRow(concilium);
  const { error } = await supabase
    .from(TABLE)
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
  logAction({
    action: 'Concilium updated',
    entity: 'Concilium',
    entityId: id,
    details: concilium.name,
    meta: {
      source: 'conciliumBackend',
      importance: 'medium',
      tags: ['update', 'concilium'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  addLog({
    thread_id: id,
    sender_type: 'user',
    sender_name: concilium.createdByName || 'User',
    content: `Consilium board "${concilium.name}" updated`,
    context_type: 'consilium',
    context_id: id,
    context_label: concilium.name,
    platform: 'internal',
    metadata: { action: 'updated', board_name: concilium.name },
  }).catch(() => {});
  return concilium;
}

export async function deleteConciliumById(id, agentContext = null) {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  logAction({
    action: 'Concilium deleted',
    entity: 'Concilium',
    entityId: id,
    details: 'Concilium removed',
    meta: {
      source: 'conciliumBackend',
      importance: 'high',
      tags: ['delete', 'concilium'],
      ...buildAgentMeta(agentContext),
    },
  }).catch(() => {});
  addLog({
    thread_id: id,
    sender_type: 'user',
    sender_name: 'User',
    content: `Consilium board deleted`,
    context_type: 'consilium',
    context_id: id,
    platform: 'internal',
    metadata: { action: 'deleted' },
  }).catch(() => {});
  return true;
}
