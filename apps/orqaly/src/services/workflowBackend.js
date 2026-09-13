/**
 * Workflow backend: Supabase when configured, else localStorage.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';
import { stripPersistedCredentials } from './persistedCredentialSanitizer';

const STORAGE_KEY = 'orch_workflows';
const clone = (v) => JSON.parse(JSON.stringify(v));

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const clean = stripPersistedCredentials(list);
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

function workflowToRow(w) {
  const { id, name, enabled, createdAt, updatedAt, ...rest } = w;
  return { id, name, enabled: !!enabled, data: stripPersistedCredentials(rest) };
}

function rowToWorkflow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled ?? true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.user_id ?? null,
    ...stripPersistedCredentials(r.data || {}),
  };
}

async function loadFromSupabase() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('User required: must be authenticated to load workflows');
  const { data, error } = await supabase
    .from('workflows')
    .select('id, name, enabled, data, created_at, updated_at, user_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToWorkflow);
}

async function insertWorkflow(w, agentContext = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  if (!userId) throw new Error('User required: must be authenticated to create a workflow');
  const row = workflowToRow(w);
  // Persist editor identity in the JSON payload (used by Workflow Info → "User").
  row.data = { ...(row.data || {}), updatedByEmail: user?.email ?? null };
  const { error } = await supabase.from('workflows').insert({
    id: row.id,
    user_id: userId,
    name: row.name,
    enabled: row.enabled,
    data: row.data,
  });
  if (error) throw error;
  const snapshot = buildVersionSnapshot(row.name, row.enabled, row.data);
  logAction({
    action: 'Workflow created',
    entity: 'Workflow',
    entityId: row.id,
    details: row.name,
    meta: {
      source: 'workflowBackend',
      importance: 'medium',
      tags: ['create', 'workflow', 'version'],
      ...buildAgentMeta(agentContext),
      codeAfter: JSON.stringify(snapshot, null, 2),
      versionChanges: ['Workflow created'],
    },
  });
  return {
    ...w,
    createdAt: w.createdAt || new Date().toISOString(),
    updatedAt: w.updatedAt || new Date().toISOString(),
  };
}

/** Build a compact snapshot of workflow state for version tracking. */
function buildVersionSnapshot(name, enabled, data) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  const nodeTypes = {};
  nodes.forEach((n) => {
    const t = n.type || n.data?.blockType || 'unknown';
    nodeTypes[t] = (nodeTypes[t] || 0) + 1;
  });
  return {
    name,
    enabled,
    nodesCount: nodes.length,
    edgesCount: edges.length,
    nodeTypes,
    nodeLabels: nodes.slice(0, 20).map((n) => n.data?.label || n.data?.blockType || n.type || '?'),
  };
}

/** Detect what changed between two snapshots. */
function detectChanges(before, after) {
  const changes = [];
  if (before.name !== after.name) changes.push(`Renamed "${before.name}" → "${after.name}"`);
  if (before.enabled !== after.enabled) changes.push(after.enabled ? 'Enabled' : 'Paused');
  const nd = after.nodesCount - before.nodesCount;
  const ed = after.edgesCount - before.edgesCount;
  if (nd > 0) changes.push(`+${nd} block(s)`);
  if (nd < 0) changes.push(`${nd} block(s)`);
  if (ed > 0) changes.push(`+${ed} connection(s)`);
  if (ed < 0) changes.push(`${ed} connection(s)`);
  if (changes.length === 0) changes.push('Configuration updated');
  return changes;
}

async function updateWorkflow(id, w, agentContext = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  if (!userId) throw new Error('User required: must be authenticated to update a workflow');
  const { data: existing } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (!existing) return null;
  const row = workflowToRow(w);
  // Always stamp the editor email for the "Workflow Info" drawer.
  row.data = { ...(row.data || {}), updatedByEmail: user?.email ?? null };
  const { error } = await supabase
    .from('workflows')
    .update({
      name: row.name,
      enabled: row.enabled,
      data: row.data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;

  const snapshotBefore = buildVersionSnapshot(existing.name, existing.enabled, existing.data);
  const snapshotAfter = buildVersionSnapshot(row.name, row.enabled, row.data);
  const changes = detectChanges(snapshotBefore, snapshotAfter);

  logAction({
    action: 'Workflow updated',
    entity: 'Workflow',
    entityId: id,
    details: row.name,
    meta: {
      source: 'workflowBackend',
      importance: 'medium',
      tags: ['update', 'workflow', 'version'],
      ...buildAgentMeta(agentContext),
      codeBefore: JSON.stringify(snapshotBefore, null, 2),
      codeAfter: JSON.stringify(snapshotAfter, null, 2),
      versionChanges: changes,
    },
  });
  return { ...w, updatedAt: new Date().toISOString() };
}

export async function loadWorkflows() {
  if (hasSupabase()) return loadFromSupabase();
  return loadFromLocalStorage();
}

export function saveWorkflows(list) {
  if (hasSupabase()) return Promise.resolve(); // Supabase uses individual inserts/updates
  saveToLocalStorage(list);
  return Promise.resolve();
}

export async function createWorkflow(w, agentContext = null) {
  const cleanWorkflow = stripPersistedCredentials(w);
  if (hasSupabase()) return insertWorkflow(cleanWorkflow, agentContext);
  const list = loadFromLocalStorage();
  list.unshift(cleanWorkflow);
  saveToLocalStorage(list);
  return cleanWorkflow;
}

export async function updateWorkflowById(id, w, agentContext = null) {
  const cleanWorkflow = stripPersistedCredentials(w);
  if (hasSupabase()) return updateWorkflow(id, cleanWorkflow, agentContext);
  const list = loadFromLocalStorage();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = cleanWorkflow;
  saveToLocalStorage(list);
  return cleanWorkflow;
}

export async function deleteWorkflowById(id, agentContext = null) {
  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    if (!userId) throw new Error('User required: must be authenticated to delete a workflow');
    const { error } = await supabase.from('workflows').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    logAction({
      action: 'Workflow deleted',
      entity: 'Workflow',
      entityId: id,
      details: 'Workflow removed',
      meta: {
        source: 'workflowBackend',
        importance: 'high',
        tags: ['delete', 'workflow'],
        ...buildAgentMeta(agentContext),
      },
    });
    return true;
  }
  const list = loadFromLocalStorage().filter((x) => x.id !== id);
  saveToLocalStorage(list);
  return true;
}
