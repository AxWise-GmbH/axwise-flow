/**
 * Team tasks backend: Supabase when configured AND the table exists, else localStorage.
 *
 * Tasks are per-user. Every query is scoped to the signed-in user's id and every
 * insert stamps it; migration 183 added the column and 184 enforces it in RLS.
 * (Until then these tasks were "internal" — shared across all authenticated
 * users — which meant a new account could read and delete everyone's tasks.)
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';

const STORAGE_KEY = 'orch_team_tasks_v1';
const TABLE = 'team_tasks';
const clone = (v) => JSON.parse(JSON.stringify(v));

let supabaseTableReady = null; // null = unknown, boolean afterwards

// getSession() reads the local session; getUser() would hit /auth/v1/user on
// every Home/JobPool/AgentHub/TaskManager mount.
async function getAuthUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function isTableReady() {
  if (!hasSupabase()) return false;
  if (supabaseTableReady !== null) return supabaseTableReady;
  try {
    const { error } = await supabase.from(TABLE).select('id').limit(0);
    supabaseTableReady = !error;
    if (error) {
      console.warn(
        `[teamTaskBackend] Supabase table "${TABLE}" not available, falling back to localStorage:`,
        error.message
      );
    }
  } catch (e) {
    supabaseTableReady = false;
    console.warn('[teamTaskBackend] Supabase probe failed, using localStorage:', e?.message || e);
  }
  return supabaseTableReady;
}

function shouldUseSupabase() {
  return supabaseTableReady === true;
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToLocalStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

function taskToRow(t, userId) {
  const {
    id,
    title,
    description,
    priority,
    status,
    assignedTo,
    deadline,
    estimate,
    gitCommits,
    attachments,
    createdAt,
    updatedAt,
    createdBy,
    jobPoolId,
    category,
    agentId,
    sequenceOrder,
    // Never let a caller-supplied user_id ride along into `data`.
    user_id: _ignoredUserId,
    ...rest
  } = t || {};

  return {
    id,
    user_id: userId,
    title: title || '',
    description: description || '',
    priority: priority || 'medium',
    status: status || 'todo',
    assigned_to: assignedTo || '',
    deadline: deadline || null,
    estimate: estimate || '',
    git_commits: Array.isArray(gitCommits) ? gitCommits : [],
    attachments: Array.isArray(attachments) ? attachments : [],
    created_by: createdBy || null,
    created_at: createdAt || new Date().toISOString(),
    updated_at: updatedAt || new Date().toISOString(),
    job_pool_id: jobPoolId || null,
    category: category || null,
    agent_id: agentId || null,
    sequence_order: sequenceOrder || 0,
    data: rest,
  };
}

function rowToTask(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    priority: r.priority || 'medium',
    status: r.status || 'todo',
    assignedTo: r.assigned_to || '',
    deadline: r.deadline || '',
    estimate: r.estimate || '',
    gitCommits: Array.isArray(r.git_commits) ? r.git_commits : [],
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    jobPoolId: r.job_pool_id || null,
    category: r.category || null,
    agentId: r.agent_id || null,
    sequenceOrder: r.sequence_order || 0,
    ...(r.data || {}),
  };
}

export async function loadTeamTasks() {
  await isTableReady();
  if (shouldUseSupabase()) {
    const userId = await getAuthUserId();
    // No session: return nothing rather than falling through to the local
    // mirror, which belongs to whoever used this browser last.
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(rowToTask).filter(Boolean);
    } catch (e) {
      console.warn('[teamTaskBackend] loadTeamTasks failed:', e?.message || e);
      return [];
    }
  }
  return clone(loadFromLocalStorage());
}

export async function createTeamTask(task, agentContext = null) {
  await isTableReady();
  const now = new Date().toISOString();
  const next = {
    ...task,
    createdAt: task?.createdAt || now,
    updatedAt: now,
  };

  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('No signed-in user; cannot create a team task.');
      const row = taskToRow(next, userId);
      const { error } = await supabase.from(TABLE).insert(row);
      if (error) throw error;
      logAction({
        action: 'Team task created',
        entity: 'TeamTask',
        entityId: next.id,
        details: next.title || '',
        meta: { source: 'teamTaskBackend', ...buildAgentMeta(agentContext) },
      }).catch(() => {});
      return next;
    } catch (e) {
      console.warn('[teamTaskBackend] createTeamTask failed, using localStorage:', e?.message || e);
    }
  }

  const list = loadFromLocalStorage();
  list.unshift(next);
  saveToLocalStorage(list);
  return next;
}

export async function updateTeamTaskById(id, patch, agentContext = null) {
  await isTableReady();
  const updates = { ...(patch || {}), updatedAt: new Date().toISOString() };

  if (shouldUseSupabase()) {
    try {
      // Map known fields; keep extras inside data JSON.
      const {
        assignedTo,
        gitCommits,
        attachments,
        createdBy: _createdBy,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...rest
      } = updates;
      const payload = {
        ...(updates.title !== undefined ? { title: updates.title || '' } : {}),
        ...(updates.description !== undefined ? { description: updates.description || '' } : {}),
        ...(updates.priority !== undefined ? { priority: updates.priority || 'medium' } : {}),
        ...(updates.status !== undefined ? { status: updates.status || 'todo' } : {}),
        ...(assignedTo !== undefined ? { assigned_to: assignedTo || '' } : {}),
        ...(updates.deadline !== undefined ? { deadline: updates.deadline || null } : {}),
        ...(updates.estimate !== undefined ? { estimate: updates.estimate || '' } : {}),
        ...(gitCommits !== undefined
          ? { git_commits: Array.isArray(gitCommits) ? gitCommits : [] }
          : {}),
        ...(attachments !== undefined
          ? { attachments: Array.isArray(attachments) ? attachments : [] }
          : {}),
        data: rest,
        updated_at: updates.updatedAt,
      };

      const userId = await getAuthUserId();
      if (!userId) throw new Error('No signed-in user; cannot update a team task.');
      // Redundant under 184's RLS, but defence in depth: an id alone must never
      // be enough to touch another user's row.
      const { error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Team task updated',
        entity: 'TeamTask',
        entityId: id,
        details: updates.title ?? null,
        meta: { source: 'teamTaskBackend', ...buildAgentMeta(agentContext) },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn(
        '[teamTaskBackend] updateTeamTaskById failed, using localStorage:',
        e?.message || e
      );
    }
  }

  const list = loadFromLocalStorage();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  list[idx] = { ...list[idx], ...updates, id };
  saveToLocalStorage(list);
  return true;
}

export async function deleteTeamTaskById(id, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('No signed-in user; cannot delete a team task.');
      const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Team task deleted',
        entity: 'TeamTask',
        entityId: id,
        details: null,
        meta: { source: 'teamTaskBackend', ...buildAgentMeta(agentContext) },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn(
        '[teamTaskBackend] deleteTeamTaskById failed, using localStorage:',
        e?.message || e
      );
    }
  }

  const list = loadFromLocalStorage().filter((t) => t.id !== id);
  saveToLocalStorage(list);
  return true;
}

export async function clearAllTeamTasks(agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    const userId = await getAuthUserId();
    // Without a user this used to issue `.neq('id', '__never__')` — an unbounded
    // delete that wiped every user's tasks. Never widen the scope on failure.
    if (!userId) {
      console.warn('[teamTaskBackend] clearAllTeamTasks: no signed-in user, refusing to delete.');
      return false;
    }
    try {
      const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Team tasks cleared',
        entity: 'TeamTask',
        entityId: '—',
        details: 'All team tasks cleared',
        meta: { source: 'teamTaskBackend', importance: 'high', ...buildAgentMeta(agentContext) },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn('[teamTaskBackend] clearAllTeamTasks failed:', e?.message || e);
      return false;
    }
  }

  saveToLocalStorage([]);
  return true;
}

/**
 * Load completed task outputs for a job, ordered by sequence.
 * Used for waterfall context — previous outputs feed into the next task.
 * @param {string} jobPoolId
 * @param {number} [beforeSequence] — only tasks with sequenceOrder < this value
 * @returns {Promise<Array<{ title: string, output: string }>>}
 */
export async function loadCompletedTaskOutputs(jobPoolId, beforeSequence = Infinity) {
  await isTableReady();
  if (shouldUseSupabase()) {
    const userId = await getAuthUserId();
    if (!userId) return [];
    try {
      let query = supabase
        .from(TABLE)
        .select('title, data, sequence_order')
        .eq('user_id', userId)
        .eq('job_pool_id', jobPoolId)
        .eq('status', 'done')
        .order('sequence_order', { ascending: true });

      if (beforeSequence < Infinity) {
        query = query.lt('sequence_order', beforeSequence);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || [])
        .filter((r) => r.data?.output)
        .map((r) => ({ title: r.title, output: r.data.output }));
    } catch (e) {
      console.warn('[teamTaskBackend] loadCompletedTaskOutputs failed:', e?.message || e);
    }
  }

  // localStorage fallback
  const list = loadFromLocalStorage();
  return list
    .filter(
      (t) => t.jobPoolId === jobPoolId && t.status === 'done' && t.sequenceOrder < beforeSequence
    )
    .sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0))
    .filter((t) => t.data?.output || t.output)
    .map((t) => ({ title: t.title, output: t.data?.output || t.output }));
}

// The team_tasks schema lives in supabase/migrations/183_data_isolation_backfill.sql
// and its RLS in 184_data_isolation_rls.sql. A second copy used to live here as
// a TEAM_TASKS_MIGRATION_SQL constant with nothing importing it; it drifted six
// columns behind the real table, and its `auth.role() = 'authenticated'` policy
// — pasted into the dashboard by hand — is what let every user read and delete
// every other user's tasks. Keep the schema in migrations only.
