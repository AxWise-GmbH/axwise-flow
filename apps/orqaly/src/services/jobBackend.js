/**
 * Job backend: Supabase when configured AND the table exists, else localStorage.
 *
 * On first Supabase call we probe the "jobs" table.  If it doesn't exist
 * (schema-cache error) we silently degrade to localStorage for the rest of the
 * session so the app keeps working while the DBA creates the table.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';
import { addLog } from './communicatorService';

const STORAGE_KEY = 'orch_jobs';
const TABLE = 'jobs';
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
        `[jobBackend] Supabase table "${TABLE}" not available, falling back to localStorage:`,
        error.message
      );
      supabaseTableReady = false;
    } else {
      supabaseTableReady = true;
    }
  } catch (e) {
    console.warn(`[jobBackend] Supabase probe failed, using localStorage:`, e.message);
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
function jobToRow(j) {
  const {
    id,
    description,
    status,
    category,
    assignedAgentId,
    assignedAgentName,
    requirements,
    conciliumId,
    conciliumName,
    teamId,
    teamName,
    addedBy,
    relatedProjects,
    relatedWorkflows,
    relatedTasks,
    relatedPartners,
    sourceRequestId,
    approvalStatus,
    reportId,
    costUsd,
    createdAt,
    updatedAt,
    ...rest
  } = j;
  return {
    id,
    description: description || '',
    status: status || 'active',
    category: category || null,
    assigned_agent_id: assignedAgentId || null,
    assigned_agent_name: assignedAgentName || '',
    requirements: requirements || '',
    concilium_id: conciliumId || null,
    concilium_name: conciliumName || '',
    related_projects: Array.isArray(relatedProjects) ? relatedProjects : [],
    related_workflows: Array.isArray(relatedWorkflows) ? relatedWorkflows : [],
    related_tasks: Array.isArray(relatedTasks) ? relatedTasks : [],
    related_partners: Array.isArray(relatedPartners) ? relatedPartners : [],
    data: { teamId, teamName, addedBy, sourceRequestId, approvalStatus, reportId, ...rest },
    ...(sourceRequestId && { source_request_id: sourceRequestId }),
    ...(approvalStatus && { approval_status: approvalStatus }),
    ...(reportId && { report_id: reportId }),
    ...(costUsd > 0 && { cost_usd: costUsd }),
  };
}

function rowToJob(r) {
  if (!r) return null;
  return {
    id: r.id,
    description: r.description || '',
    status: r.status || 'active',
    category: r.category || null,
    assignedAgentId: r.assigned_agent_id || null,
    assignedAgentName: r.assigned_agent_name || '',
    requirements: r.requirements || '',
    conciliumId: r.concilium_id || null,
    conciliumName: r.concilium_name || '',
    relatedProjects: Array.isArray(r.related_projects) ? r.related_projects : [],
    relatedWorkflows: Array.isArray(r.related_workflows) ? r.related_workflows : [],
    relatedTasks: Array.isArray(r.related_tasks) ? r.related_tasks : [],
    relatedPartners: Array.isArray(r.related_partners) ? r.related_partners : [],
    sourceRequestId: r.source_request_id || (r.data || {}).sourceRequestId || null,
    costUsd: Number(r.cost_usd || (r.data || {}).costUsd || 0),
    approvalStatus: r.approval_status || (r.data || {}).approvalStatus || null,
    reportId: r.report_id || (r.data || {}).reportId || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.data || {}),
  };
}

// ── Supabase operations ───────────────────────────────────────
async function loadFromSupabase() {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('User required: must be authenticated to load jobs');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToJob);
}

// ── Public API ────────────────────────────────────────────────
export async function loadJobs() {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      return await loadFromSupabase();
    } catch (e) {
      console.warn('[jobBackend] loadJobs from Supabase failed, using localStorage:', e.message);
    }
  }
  return clone(loadFromLocalStorage());
}

export async function createJob(job, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to create a job');
      const row = jobToRow(job);
      const { error } = await supabase.from(TABLE).insert({
        ...row,
        user_id: userId,
      });
      if (error) throw error;
      logAction({
        action: 'Job created',
        entity: 'Job',
        entityId: job.id,
        details: job.description,
        meta: {
          source: 'jobBackend',
          importance: 'medium',
          tags: ['create', 'job'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      addLog({
        thread_id: job.id,
        sender_type: 'user',
        sender_name: 'User',
        content: `Job created: "${job.description || job.title || job.id}"`,
        context_type: 'build',
        context_id: job.id,
        context_label: job.description || job.title || '',
        platform: 'internal',
        metadata: { action: 'created', job_id: job.id, status: job.status },
      }).catch(() => {});
      return job;
    } catch (e) {
      console.warn('[jobBackend] createJob Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage();
  list.unshift(job);
  saveToLocalStorage(list);
  return job;
}

export async function updateJobById(id, job, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to update a job');
      const row = jobToRow(job);
      const { error } = await supabase
        .from(TABLE)
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Job updated',
        entity: 'Job',
        entityId: id,
        details: job.description,
        meta: {
          source: 'jobBackend',
          importance: 'medium',
          tags: ['update', 'job'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      addLog({
        thread_id: id,
        sender_type: 'system',
        sender_name: 'Job Pipeline',
        content: `Job updated: "${job.description || job.title || id}" — status: ${job.status || 'unknown'}`,
        context_type: 'build',
        context_id: id,
        context_label: job.description || job.title || '',
        platform: 'internal',
        metadata: { action: 'updated', job_id: id, status: job.status },
      }).catch(() => {});
      return job;
    } catch (e) {
      console.warn('[jobBackend] updateJobById Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = job;
  saveToLocalStorage(list);
  return job;
}

export async function deleteJobById(id, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to delete a job');
      const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Job deleted',
        entity: 'Job',
        entityId: id,
        details: 'Job removed',
        meta: {
          source: 'jobBackend',
          importance: 'high',
          tags: ['delete', 'job'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn('[jobBackend] deleteJobById Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage().filter((x) => x.id !== id);
  saveToLocalStorage(list);
  return true;
}
