/**
 * Tool backend: Supabase when configured AND the table exists, else localStorage.
 *
 * On first Supabase call we probe the "tools" table.  If it doesn't exist
 * (schema-cache error) we silently degrade to localStorage for the rest of the
 * session so the app keeps working while the DBA creates the table.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';
import { stripPersistedCredentials } from './persistedCredentialSanitizer';

const STORAGE_KEY = 'orch_tools';
const TABLE = 'tools';
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
        `[toolBackend] Supabase table "${TABLE}" not available, falling back to localStorage:`,
        error.message
      );
      supabaseTableReady = false;
    } else {
      supabaseTableReady = true;
    }
  } catch (e) {
    console.warn(`[toolBackend] Supabase probe failed, using localStorage:`, e.message);
    supabaseTableReady = false;
  }
  return supabaseTableReady;
}

function shouldUseSupabase() {
  return supabaseTableReady === true;
}

function isProtectedWriteError(error) {
  // Migration 214 uses 42501 for owner/RLS and active credential-reservation
  // conflicts.  Falling back to localStorage would falsely report a browser
  // edit as saved while the authoritative row deliberately rejected it.
  return String(error?.code || '') === '42501';
}

function toActionableDeleteError(error) {
  if (
    isProtectedWriteError(error) &&
    /current credential before deleting the tool/i.test(String(error?.message || ''))
  ) {
    return Object.assign(
      new Error("Delete this tool's saved credential first, then retry deleting the tool."),
      {
        code: 'TOOL_CREDENTIAL_DELETE_REQUIRED',
        cause: error,
      }
    );
  }
  return error;
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
    if (!Array.isArray(list)) return [];
    const clean = stripPersistedCredentials(list);
    // Compatibility cleanup for browsers that predate encrypted credential
    // storage. Never return a legacy plaintext value even if cleanup fails.
    if (JSON.stringify(clean) !== JSON.stringify(list)) saveToLocalStorage(clean);
    return clean;
  } catch {
    return [];
  }
}

function saveToLocalStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripPersistedCredentials(list)));
  } catch {}
}

// ── Supabase row mapping ──────────────────────────────────────
function toolToRow(t) {
  const {
    id,
    name,
    description,
    status,
    connectionType,
    usedBy,
    createdAt,
    updatedAt,
    credentialConfigured: _credentialConfigured,
    ...rest
  } = t;
  return {
    id,
    name,
    description: description || '',
    status: status || 'active',
    connection_type: connectionType || 'internal',
    used_by: Array.isArray(usedBy) ? usedBy : [],
    data: stripPersistedCredentials(rest),
  };
}

function rowToTool(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    status: r.status || 'active',
    connectionType: r.connection_type || 'internal',
    usedBy: Array.isArray(r.used_by) ? r.used_by : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...stripPersistedCredentials(r.data || {}),
  };
}

// ── Supabase operations ───────────────────────────────────────
async function loadFromSupabase() {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('User required: must be authenticated to load tools');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const tools = (data || []).map(rowToTool);
  if (tools.length === 0) return tools;

  // Read metadata only. Plaintext never leaves Vault; this flag is safe for UI
  // status badges and is explicitly excluded from tools.data on later writes.
  const { data: keyRows, error: keyError } = await supabase
    .from('user_api_keys')
    .select('provider, slot')
    .eq('user_id', userId)
    .eq('is_current', true)
    .in(
      'provider',
      tools.map((tool) => `tool:${tool.id}`)
    );
  if (keyError) return tools;
  const configured = new Set((keyRows || []).map((row) => `${row.provider}:${row.slot}`));
  return tools.map((tool) => ({
    ...tool,
    credentialConfigured: configured.has(
      `tool:${tool.id}:${tool.connectionType === 'webhook' ? 'webhook_secret' : 'default'}`
    ),
  }));
}

// ── Public API ────────────────────────────────────────────────
export async function loadTools() {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      return await loadFromSupabase();
    } catch (e) {
      console.warn('[toolBackend] loadTools from Supabase failed, using localStorage:', e.message);
    }
  }
  return clone(loadFromLocalStorage());
}

export async function createTool(tool, agentContext = null) {
  const cleanTool = stripPersistedCredentials(tool);
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to create a tool');
      const row = toolToRow(cleanTool);
      const { error } = await supabase.from(TABLE).insert({
        ...row,
        user_id: userId,
      });
      if (error) throw error;
      logAction({
        action: 'Tool created',
        entity: 'Tool',
        entityId: cleanTool.id,
        details: cleanTool.name,
        meta: {
          source: 'toolBackend',
          importance: 'medium',
          tags: ['create', 'tool'],
          ...buildAgentMeta(agentContext),
          codeAfter: JSON.stringify(
            {
              name: cleanTool.name,
              status: cleanTool.status,
              connectionType: cleanTool.connectionType,
            },
            null,
            2
          ),
        },
      }).catch(() => {});
      return cleanTool;
    } catch (e) {
      if (isProtectedWriteError(e)) throw e;
      console.warn('[toolBackend] createTool Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage();
  list.unshift(cleanTool);
  saveToLocalStorage(list);
  return cleanTool;
}

export async function updateToolById(id, tool, agentContext = null) {
  const cleanTool = stripPersistedCredentials(tool);
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to update a tool');
      const row = toolToRow(cleanTool);
      const { error } = await supabase
        .from(TABLE)
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Tool updated',
        entity: 'Tool',
        entityId: id,
        details: cleanTool.name,
        meta: {
          source: 'toolBackend',
          importance: 'medium',
          tags: ['update', 'tool'],
          ...buildAgentMeta(agentContext),
          codeAfter: JSON.stringify(
            {
              name: cleanTool.name,
              status: cleanTool.status,
              connectionType: cleanTool.connectionType,
            },
            null,
            2
          ),
        },
      }).catch(() => {});
      return cleanTool;
    } catch (e) {
      if (isProtectedWriteError(e)) throw e;
      console.warn('[toolBackend] updateToolById Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = cleanTool;
  saveToLocalStorage(list);
  return cleanTool;
}

export async function deleteToolById(id, agentContext = null) {
  await isTableReady();
  if (shouldUseSupabase()) {
    try {
      const userId = await getAuthUserId();
      if (!userId) throw new Error('User required: must be authenticated to delete a tool');
      const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      logAction({
        action: 'Tool deleted',
        entity: 'Tool',
        entityId: id,
        details: 'Tool removed',
        meta: {
          source: 'toolBackend',
          importance: 'high',
          tags: ['delete', 'tool'],
          ...buildAgentMeta(agentContext),
        },
      }).catch(() => {});
      return true;
    } catch (e) {
      if (isProtectedWriteError(e)) throw toActionableDeleteError(e);
      console.warn('[toolBackend] deleteToolById Supabase failed, using localStorage:', e.message);
    }
  }
  const list = loadFromLocalStorage().filter((x) => x.id !== id);
  saveToLocalStorage(list);
  return true;
}
