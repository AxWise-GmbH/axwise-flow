/**
 * Sketch prompt service — frontend CRUD for user-imported prompts that
 * augment an agent at task execution time (see lib/agent-handlers/execute-task.js).
 *
 * Table: sketch_prompts (migration 112).
 * Statuses: draft | applied | archived.
 */
import { supabase } from '../lib/supabase';

const TABLE = 'sketch_prompts';

function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured.');
  return supabase;
}

/**
 * List the current user's sketch prompts.
 * Options: { status?, agentId? } filters.
 */
export async function listSketchPrompts({ status, agentId } = {}) {
  const client = requireClient();
  let q = client
    .from(TABLE)
    .select(
      'id, agent_id, name, description, content, source_type, source_meta, tags, status, applied_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  if (agentId) q = q.eq('agent_id', agentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Create a sketch prompt. If `agentId` is present, it is marked applied
 * immediately; otherwise it is saved as a draft.
 */
export async function createSketchPrompt({
  name,
  description = null,
  content,
  sourceType = 'file',
  sourceMeta = {},
  tags = [],
  agentId = null,
}) {
  if (!name || !content) throw new Error('Name and content are required.');
  const client = requireClient();
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const user = userData?.user;
  if (!user) throw new Error('You must be signed in to save prompts.');

  const row = {
    user_id: user.id,
    agent_id: agentId || null,
    name: String(name).trim(),
    description: description ? String(description).trim() : null,
    content: String(content),
    source_type: sourceType,
    source_meta: sourceMeta || {},
    tags: Array.isArray(tags) ? tags : [],
    status: agentId ? 'applied' : 'draft',
    applied_at: agentId ? new Date().toISOString() : null,
  };

  const { data, error } = await client.from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** Apply an existing draft to an agent (or re-target an already-applied prompt). */
export async function applyToAgent(promptId, agentId) {
  if (!promptId || !agentId) throw new Error('promptId and agentId are required.');
  const client = requireClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ agent_id: agentId, status: 'applied', applied_at: new Date().toISOString() })
    .eq('id', promptId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function archiveSketchPrompt(promptId) {
  const client = requireClient();
  const { error } = await client.from(TABLE).update({ status: 'archived' }).eq('id', promptId);
  if (error) throw new Error(error.message);
}

export async function unarchiveSketchPrompt(promptId) {
  const client = requireClient();
  const { data, error } = await client.from(TABLE).select('agent_id').eq('id', promptId).single();
  if (error) throw new Error(error.message);
  const nextStatus = data?.agent_id ? 'applied' : 'draft';
  const { error: updErr } = await client
    .from(TABLE)
    .update({ status: nextStatus })
    .eq('id', promptId);
  if (updErr) throw new Error(updErr.message);
}

export async function deleteSketchPrompt(promptId) {
  const client = requireClient();
  const { error } = await client.from(TABLE).delete().eq('id', promptId);
  if (error) throw new Error(error.message);
}
