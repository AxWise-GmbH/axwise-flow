/**
 * GitHub Push backend: Supabase when configured AND the table exists, else localStorage.
 *
 * Stores git push events and their associated tasks. Falls back to localStorage
 * so the app keeps working while the DBA creates the table.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction } from './auditLogBackend';

const PUSHES_KEY = 'orch_github_pushes';
const PUSH_TASKS_KEY = 'orch_github_push_tasks';
const TABLE_PUSHES = 'github_pushes';
const TABLE_PUSH_TASKS = 'github_push_tasks';
const clone = (v) => JSON.parse(JSON.stringify(v));

let supabaseTableReady = null;

async function isTableReady() {
  if (!hasSupabase()) return false;
  if (supabaseTableReady !== null) return supabaseTableReady;

  try {
    const { error } = await supabase.from(TABLE_PUSHES).select('id').limit(0);
    if (error) {
      console.warn(
        `[githubPushBackend] Supabase table "${TABLE_PUSHES}" not available, falling back to localStorage:`,
        error.message
      );
      supabaseTableReady = false;
    } else {
      supabaseTableReady = true;
    }
  } catch (e) {
    console.warn(`[githubPushBackend] Supabase probe failed, using localStorage:`, e.message);
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
function loadPushesFromLocal() {
  try {
    const raw = localStorage.getItem(PUSHES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function savePushesToLocal(list) {
  try {
    localStorage.setItem(PUSHES_KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded */
  }
}

function loadPushTasksFromLocal() {
  try {
    const raw = localStorage.getItem(PUSH_TASKS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function savePushTasksToLocal(list) {
  try {
    localStorage.setItem(PUSH_TASKS_KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded */
  }
}

// ── Row mapping ──────────────────────────────────────────────
function pushToRow(p) {
  const {
    id,
    repo,
    branch,
    commitSha,
    commitMessage,
    commitAuthor,
    commitUrl,
    pushedAt,
    notes,
    createdAt,
    updatedAt,
    ...rest
  } = p;
  return {
    id,
    repo: repo || '',
    branch: branch || 'main',
    commit_sha: commitSha || '',
    commit_message: commitMessage || '',
    commit_author: commitAuthor || '',
    commit_url: commitUrl || '',
    pushed_at: pushedAt || new Date().toISOString(),
    notes: notes || '',
    data: rest,
  };
}

function rowToPush(r) {
  if (!r) return null;
  return {
    id: r.id,
    repo: r.repo,
    branch: r.branch,
    commitSha: r.commit_sha,
    commitMessage: r.commit_message,
    commitAuthor: r.commit_author,
    commitUrl: r.commit_url,
    pushedAt: r.pushed_at,
    notes: r.notes || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.data || {}),
  };
}

function pushTaskToRow(pt) {
  const { id, pushId, taskRef, taskTitle, taskType, partnerId, projectId, ...rest } = pt;
  return {
    ...(id ? { id } : {}),
    push_id: pushId,
    task_ref: taskRef || '',
    task_title: taskTitle || '',
    task_type: taskType || 'partner_task',
    partner_id: partnerId || null,
    project_id: projectId || null,
    data: rest,
  };
}

function rowToPushTask(r) {
  if (!r) return null;
  return {
    id: r.id,
    pushId: r.push_id,
    taskRef: r.task_ref,
    taskTitle: r.task_title,
    taskType: r.task_type || 'partner_task',
    partnerId: r.partner_id,
    projectId: r.project_id,
    createdAt: r.created_at,
    ...(r.data || {}),
  };
}

// ── Supabase operations ───────────────────────────────────────
async function loadPushesFromSupabase() {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('User required: must be authenticated to load pushes');
  const { data, error } = await supabase
    .from(TABLE_PUSHES)
    .select('*')
    .eq('user_id', userId)
    .order('pushed_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToPush);
}

async function loadPushTasksFromSupabase(pushId) {
  const { data, error } = await supabase
    .from(TABLE_PUSH_TASKS)
    .select('*')
    .eq('push_id', pushId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToPushTask);
}

async function loadAllPushTasksFromSupabase(pushIds) {
  if (!pushIds.length) return [];
  const { data, error } = await supabase
    .from(TABLE_PUSH_TASKS)
    .select('*')
    .in('push_id', pushIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToPushTask);
}

// ── Public API ────────────────────────────────────────────────
export async function loadPushes() {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      return await loadPushesFromSupabase();
    } catch (e) {
      console.warn(
        '[githubPushBackend] loadPushes from Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  return clone(loadPushesFromLocal());
}

export async function loadPushesWithTasks() {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const pushes = await loadPushesFromSupabase();
      const pushIds = pushes.map((p) => p.id);
      const allTasks = await loadAllPushTasksFromSupabase(pushIds);
      return pushes.map((p) => ({
        ...p,
        tasks: allTasks.filter((t) => t.pushId === p.id),
      }));
    } catch (e) {
      console.warn(
        '[githubPushBackend] loadPushesWithTasks failed, using localStorage:',
        e.message
      );
    }
  }
  const pushes = clone(loadPushesFromLocal());
  const tasks = clone(loadPushTasksFromLocal());
  return pushes.map((p) => ({
    ...p,
    tasks: tasks.filter((t) => t.pushId === p.id),
  }));
}

export async function createPush(push) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required');
      const row = pushToRow(push);
      const { error } = await supabase.from(TABLE_PUSHES).insert({
        ...row,
        user_id: userId,
      });
      if (error) throw error;
      await logAction({
        action: 'GitHub push recorded',
        entity: 'GitHubPush',
        entityId: push.id,
        details: `${push.commitSha} — ${push.commitMessage}`.slice(0, 120),
        meta: {
          source: 'githubPushBackend',
          importance: 'medium',
          tags: ['create', 'github', 'push'],
          codeAfter: JSON.stringify(
            { id: push.id, repo: push.repo, branch: push.branch, sha: push.commitSha },
            null,
            2
          ),
        },
      }).catch(() => {});
      return push;
    } catch (e) {
      console.warn(
        '[githubPushBackend] createPush Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadPushesFromLocal();
  list.unshift(push);
  savePushesToLocal(list);
  return push;
}

export async function updatePushById(id, push) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required');
      const row = pushToRow(push);
      const { error } = await supabase
        .from(TABLE_PUSHES)
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      await logAction({
        action: 'GitHub push updated',
        entity: 'GitHubPush',
        entityId: id,
        details: `${push.commitSha} — ${push.commitMessage}`.slice(0, 120),
        meta: {
          source: 'githubPushBackend',
          importance: 'low',
          tags: ['update', 'github', 'push'],
        },
      }).catch(() => {});
      return push;
    } catch (e) {
      console.warn(
        '[githubPushBackend] updatePushById Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadPushesFromLocal();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = push;
  savePushesToLocal(list);
  return push;
}

export async function deletePushById(id) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required');
      const { error } = await supabase
        .from(TABLE_PUSHES)
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      await logAction({
        action: 'GitHub push deleted',
        entity: 'GitHubPush',
        entityId: id,
        details: 'Push record removed',
        meta: {
          source: 'githubPushBackend',
          importance: 'medium',
          tags: ['delete', 'github', 'push'],
        },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn(
        '[githubPushBackend] deletePushById Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const pushes = loadPushesFromLocal().filter((x) => x.id !== id);
  savePushesToLocal(pushes);
  const tasks = loadPushTasksFromLocal().filter((t) => t.pushId !== id);
  savePushTasksToLocal(tasks);
  return true;
}

// ── Push Tasks (assigned tasks) ───────────────────────────────
export async function loadTasksForPush(pushId) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      return await loadPushTasksFromSupabase(pushId);
    } catch (e) {
      console.warn('[githubPushBackend] loadTasksForPush failed, using localStorage:', e.message);
    }
  }
  return clone(loadPushTasksFromLocal()).filter((t) => t.pushId === pushId);
}

export async function addTaskToPush(pushTask) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const row = pushTaskToRow(pushTask);
      const { data, error } = await supabase
        .from(TABLE_PUSH_TASKS)
        .insert(row)
        .select('*')
        .single();
      if (error) throw error;
      await logAction({
        action: 'Task assigned to push',
        entity: 'GitHubPushTask',
        entityId: data.id,
        details: `${pushTask.taskTitle} -> push ${pushTask.pushId}`,
        meta: {
          source: 'githubPushBackend',
          importance: 'low',
          tags: ['assign', 'github', 'task'],
        },
      }).catch(() => {});
      return rowToPushTask(data);
    } catch (e) {
      console.warn(
        '[githubPushBackend] addTaskToPush Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const entry = {
    ...pushTask,
    id: pushTask.id || `pt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  const list = loadPushTasksFromLocal();
  list.push(entry);
  savePushTasksToLocal(list);
  return entry;
}

export async function removeTaskFromPush(pushTaskId) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const { error } = await supabase.from(TABLE_PUSH_TASKS).delete().eq('id', pushTaskId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn(
        '[githubPushBackend] removeTaskFromPush Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadPushTasksFromLocal().filter((t) => t.id !== pushTaskId);
  savePushTasksToLocal(list);
  return true;
}

export async function removeAllTasksFromPush(pushId) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const { error } = await supabase.from(TABLE_PUSH_TASKS).delete().eq('push_id', pushId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn(
        '[githubPushBackend] removeAllTasksFromPush failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadPushTasksFromLocal().filter((t) => t.pushId !== pushId);
  savePushTasksToLocal(list);
  return true;
}
