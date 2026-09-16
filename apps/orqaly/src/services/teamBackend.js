/**
 * Team backend: Supabase when configured AND the table exists, else localStorage.
 *
 * On first Supabase call we probe the "teams" table.  If it doesn't exist
 * (schema-cache error) we silently degrade to localStorage for the rest of the
 * session so the app keeps working while the DBA creates the table.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';

const STORAGE_KEY = 'orch_teams';
const TABLE = 'teams';
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
        `[teamBackend] Supabase table "${TABLE}" not available, falling back to localStorage:`,
        error.message
      );
      supabaseTableReady = false;
    } else {
      supabaseTableReady = true;
    }
  } catch (e) {
    console.warn(`[teamBackend] Supabase probe failed, using localStorage:`, e.message);
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
function teamToRow(t) {
  const {
    id,
    name,
    description,
    status,
    agents,
    jobIds,
    messages,
    createdById,
    createdByName,
    createdAt,
    updatedAt,
    ...rest
  } = t;
  return {
    id,
    name: name || '',
    description: description || '',
    status: status || 'active',
    agents: Array.isArray(agents) ? agents : [],
    created_by_id: createdById || null,
    created_by_name: createdByName || '',
    data: { jobIds, messages, ...rest },
  };
}

function rowToTeam(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name || '',
    description: r.description || '',
    status: r.status || 'active',
    agents: Array.isArray(r.agents) ? r.agents : [],
    createdById: r.created_by_id || null,
    createdByName: r.created_by_name || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.data || {}),
  };
}

// ── Supabase operations ───────────────────────────────────────
async function loadFromSupabase() {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('User required: must be authenticated to load teams');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToTeam);
}

// ── Public API ────────────────────────────────────────────────
export async function loadTeams() {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      return await loadFromSupabase();
    } catch (e) {
      console.warn('[teamBackend] loadTeams from Supabase failed, using localStorage:', e.message);
    }
  }
  return clone(loadFromLocalStorage());
}

export async function createTeam(team, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to create a team');
      const row = teamToRow(team);
      const { error } = await supabase.from(TABLE).insert({
        ...row,
        user_id: userId,
      });
      if (error) throw error;
      logAction({
        action: 'Team created',
        entity: 'Team',
        entityId: team.id,
        details: team.name,
        meta: {
          source: 'teamBackend',
          importance: 'medium',
          tags: ['create', 'team'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return team;
    } catch (e) {
      console.warn('[teamBackend] createTeam Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage();
  list.unshift(team);
  saveToLocalStorage(list);
  return team;
}

export async function updateTeamById(id, team, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to update a team');
      const row = teamToRow(team);
      const { error } = await supabase
        .from(TABLE)
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Team updated',
        entity: 'Team',
        entityId: id,
        details: team.name,
        meta: {
          source: 'teamBackend',
          importance: 'medium',
          tags: ['update', 'team'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return team;
    } catch (e) {
      console.warn('[teamBackend] updateTeamById Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = team;
  saveToLocalStorage(list);
  return team;
}

export async function deleteTeamById(id, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to delete a team');
      const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Team deleted',
        entity: 'Team',
        entityId: id,
        details: 'Team removed',
        meta: {
          source: 'teamBackend',
          importance: 'high',
          tags: ['delete', 'team'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return true;
    } catch (e) {
      console.warn('[teamBackend] deleteTeamById Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage().filter((x) => x.id !== id);
  saveToLocalStorage(list);
  return true;
}
