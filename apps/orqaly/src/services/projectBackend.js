/**
 * Project backend: Supabase when configured AND the table exists, else localStorage.
 *
 * On first Supabase call we probe the "projects" table.  If it doesn't exist
 * (schema-cache error) we silently degrade to localStorage for the rest of the
 * session so the app keeps working while the DBA creates the table.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';

const STORAGE_KEY = 'orch_projects';
const TABLE = 'projects';
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Tracks whether the Supabase table is available this session */
let supabaseTableReady = null; // null = not checked yet

async function isTableReady() {
  if (!hasSupabase()) return false;
  if (supabaseTableReady !== null) return supabaseTableReady;

  try {
    // Light probe — fetch 0 rows just to see if the table is accessible
    const { error } = await supabase.from(TABLE).select('id').limit(0);
    if (error) {
      console.warn(
        `[projectBackend] Supabase table "${TABLE}" not available, falling back to localStorage:`,
        error.message
      );
      supabaseTableReady = false;
    } else {
      supabaseTableReady = true;
    }
  } catch (e) {
    console.warn(`[projectBackend] Supabase probe failed, using localStorage:`, e.message);
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
function projectToRow(p) {
  const {
    id,
    name,
    status,
    category,
    partnerId,
    partnerName,
    workflowId,
    workflowName,
    campaignId,
    campaignName,
    teamId,
    teamName,
    createdAt,
    updatedAt,
    ...rest
  } = p;
  return {
    id,
    name,
    status,
    category: category || null,
    partner_id: partnerId || null,
    workflow_id: workflowId || null,
    campaign_id: campaignId || null,
    data: { partnerName, workflowName, campaignName, teamId, teamName, ...rest },
  };
}

function rowToProject(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    status: r.status || 'Active',
    category: r.category || null,
    partnerId: r.partner_id,
    workflowId: r.workflow_id,
    campaignId: r.campaign_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.data || {}),
  };
}

// ── Supabase operations ───────────────────────────────────────
async function loadFromSupabase() {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('User required: must be authenticated to load projects');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToProject);
}

// ── Public API ────────────────────────────────────────────────
export async function loadProjects() {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      return await loadFromSupabase();
    } catch (e) {
      console.warn(
        '[projectBackend] loadProjects from Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  return clone(loadFromLocalStorage());
}

export async function createProject(project, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to create a project');
      const row = projectToRow(project);
      const { error } = await supabase.from(TABLE).insert({
        ...row,
        user_id: userId,
      });
      if (error) throw error;
      logAction({
        action: 'Project created',
        entity: 'Project',
        entityId: project.id,
        details: project.name,
        meta: {
          source: 'projectBackend',
          importance: 'medium',
          tags: ['create', 'project'],
          ...buildAgentMeta(agentContext),
          codeAfter: JSON.stringify(
            {
              name: project.name,
              status: project.status,
              partnerId: project.partnerId,
              workflowId: project.workflowId,
            },
            null,
            2
          ),
        },
      }).catch(() => {});
      return project;
    } catch (e) {
      console.warn(
        '[projectBackend] createProject Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadFromLocalStorage();
  list.unshift(project);
  saveToLocalStorage(list);
  return project;
}

export async function updateProjectById(id, project, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to update a project');
      const row = projectToRow(project);
      const { error } = await supabase
        .from(TABLE)
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Project updated',
        entity: 'Project',
        entityId: id,
        details: project.name,
        meta: {
          source: 'projectBackend',
          importance: 'medium',
          tags: ['update', 'project'],
          ...buildAgentMeta(agentContext),
          codeAfter: JSON.stringify(
            {
              name: project.name,
              status: project.status,
              partnerId: project.partnerId,
              workflowId: project.workflowId,
            },
            null,
            2
          ),
        },
      }).catch(() => {});
      return project;
    } catch (e) {
      console.warn(
        '[projectBackend] updateProjectById Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadFromLocalStorage();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = project;
  saveToLocalStorage(list);
  return project;
}

export async function deleteProjectById(id, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to delete a project');
      const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Project deleted',
        entity: 'Project',
        entityId: id,
        details: 'Project removed',
        meta: {
          source: 'projectBackend',
          importance: 'high',
          tags: ['delete', 'project'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn(
        '[projectBackend] deleteProjectById Supabase failed, using localStorage:',
        e.message
      );
    }
  }
  const list = loadFromLocalStorage().filter((x) => x.id !== id);
  saveToLocalStorage(list);
  return true;
}
