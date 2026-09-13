/**
 * Request backend: Supabase when configured AND the table exists, else localStorage.
 *
 * On first Supabase call we probe the "job_requests" table.  If it doesn't exist
 * (schema-cache error) we silently degrade to localStorage for the rest of the
 * session so the app keeps working while the DBA creates the table.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';

const STORAGE_KEY = 'orch_requests';
const TABLE = 'job_requests';
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Tracks whether the Supabase table is available this session */
let supabaseTableReady = null; // null = not checked yet

async function isTableReady() {
  if (!hasSupabase()) return false;
  if (supabaseTableReady !== null) return supabaseTableReady;

  try {
    const { error } = await supabase.from(TABLE).select('id').limit(0);
    if (error) {
      console.warn(
        `[requestBackend] Supabase table "${TABLE}" not available, falling back to localStorage:`,
        error.message
      );
      supabaseTableReady = false;
    } else {
      supabaseTableReady = true;
    }
  } catch (e) {
    console.warn(`[requestBackend] Supabase probe failed, using localStorage:`, e.message);
    supabaseTableReady = false;
  }
  return supabaseTableReady;
}

function shouldUseSupabase() {
  return supabaseTableReady === true;
}

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── localStorage helpers ──────────────────────────────────────
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveToLocalStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

// ── Supabase row mapping ──────────────────────────────────────
function requestToRow(r) {
  const {
    id,
    requestText,
    status,
    parsedTitle,
    parsedCategory,
    parsedRequirements,
    parsedPriority,
    assignedConciliumId,
    assignedConciliumName,
    resultJobId,
    resultAgentId,
    processingNotes,
    costUsd,
    createdAt,
    updatedAt,
    ...rest
  } = r;
  return {
    id,
    request_text: requestText || '',
    status: status || 'pending',
    parsed_title: parsedTitle || null,
    parsed_category: parsedCategory || null,
    parsed_requirements: parsedRequirements || null,
    parsed_priority: parsedPriority || 'medium',
    assigned_concilium_id: assignedConciliumId || null,
    assigned_concilium_name: assignedConciliumName || '',
    result_job_id: resultJobId || null,
    result_agent_id: resultAgentId || null,
    processing_notes: processingNotes || '',
    cost_usd: costUsd || 0,
    data: rest,
  };
}

function rowToRequest(r) {
  if (!r) return null;
  return {
    id: r.id,
    requestText: r.request_text || '',
    status: r.status || 'pending',
    parsedTitle: r.parsed_title || null,
    parsedCategory: r.parsed_category || null,
    parsedRequirements: r.parsed_requirements || null,
    parsedPriority: r.parsed_priority || 'medium',
    assignedConciliumId: r.assigned_concilium_id || null,
    assignedConciliumName: r.assigned_concilium_name || '',
    resultJobId: r.result_job_id || null,
    resultAgentId: r.result_agent_id || null,
    processingNotes: r.processing_notes || '',
    costUsd: r.cost_usd || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.data || {}),
  };
}

// ── Supabase operations ───────────────────────────────────────
async function loadFromSupabase() {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('User required: must be authenticated to load requests');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToRequest);
}

// ── Public API ────────────────────────────────────────────────
export { isTableReady };

export async function loadRequests() {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      return await loadFromSupabase();
    } catch (e) {
      console.warn(
        '[requestBackend] loadRequests from Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  return clone(loadFromLocalStorage());
}

export async function createRequest(request, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to create a request');
      const row = requestToRow(request);
      const { error } = await supabase.from(TABLE).insert({
        ...row,
        user_id: userId,
      });
      if (error) throw error;
      logAction({
        action: 'Request created',
        entity: 'Request',
        entityId: request.id,
        details: request.parsedTitle || request.requestText?.slice(0, 80) || 'New request',
        meta: {
          source: 'requestBackend',
          importance: 'medium',
          tags: ['create', 'request'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return request;
    } catch (e) {
      console.warn(
        '[requestBackend] createRequest Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadFromLocalStorage();
  list.unshift(request);
  saveToLocalStorage(list);
  return request;
}

export async function updateRequestById(id, request, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to update a request');
      const row = requestToRow(request);
      const { error } = await supabase
        .from(TABLE)
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Request updated',
        entity: 'Request',
        entityId: id,
        details: request.parsedTitle || request.requestText?.slice(0, 80) || 'Updated request',
        meta: {
          source: 'requestBackend',
          importance: 'medium',
          tags: ['update', 'request'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return request;
    } catch (e) {
      console.warn(
        '[requestBackend] updateRequestById Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadFromLocalStorage();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = request;
  saveToLocalStorage(list);
  return request;
}

export async function deleteRequestById(id, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to delete a request');
      const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Request deleted',
        entity: 'Request',
        entityId: id,
        details: 'Request removed',
        meta: {
          source: 'requestBackend',
          importance: 'high',
          tags: ['delete', 'request'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn(
        '[requestBackend] deleteRequestById Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadFromLocalStorage().filter((x) => x.id !== id);
  saveToLocalStorage(list);
  return true;
}
