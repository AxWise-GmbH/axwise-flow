/**
 * System agents: AI agents with system access (Permissions → Agents tab).
 * CRUD for system_agents table; used for role assignment and audit attribution.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const SYSTEM_AGENTS_KEY = 'orch_system_agents_v1';

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function loadFromStorage() {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(SYSTEM_AGENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveToStorage(list) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(SYSTEM_AGENTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function mapRow(r) {
  return {
    id: r.id,
    name: r.name || '',
    type: r.type || 'custom',
    roleId: r.role_id ?? null,
    agentHubId: r.agent_hub_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Load all system agents (Supabase or localStorage fallback).
 * @returns {Promise<Array<{ id: string, name: string, type: string, roleId: string|null, agentHubId: string|null, createdAt: string, updatedAt: string }>>}
 */
export async function loadSystemAgents() {
  if (hasSupabase() && supabase) {
    try {
      const { data, error } = await supabase
        .from('system_agents')
        .select('id, name, type, role_id, agent_hub_id, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (!error && data) return data.map(mapRow);
    } catch {
      // fall through to localStorage
    }
  }
  return loadFromStorage();
}

/**
 * Create a system agent.
 * @param {{ name: string, type?: string, roleId?: string|null, agentHubId?: string|null }} payload
 */
export async function createSystemAgent(payload) {
  const name = (payload?.name || '').trim();
  const type = (payload?.type || 'custom').trim() || 'custom';
  // Enforce: all new agents must have the Agent role — no exceptions
  const roleId = 'role-agent';
  const agentHubId = payload?.agentHubId ?? null;
  if (!name) throw new Error('Agent name is required');

  if (hasSupabase() && supabase) {
    try {
      const { data, error } = await supabase
        .from('system_agents')
        .insert({
          name,
          type,
          role_id: roleId,
          agent_hub_id: agentHubId || null,
        })
        .select('id, name, type, role_id, agent_hub_id, created_at, updated_at')
        .single();
      if (!error && data) return mapRow(data);
    } catch (e) {
      throw e;
    }
  }
  const list = loadFromStorage();
  const id = `sa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const agent = {
    id,
    name,
    type,
    roleId,
    agentHubId,
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(agent);
  saveToStorage(list);
  return agent;
}

/**
 * Update a system agent.
 * @param {string} id
 * @param {{ name?: string, type?: string, roleId?: string|null }} payload
 */
export async function updateSystemAgent(id, payload) {
  if (!id) throw new Error('Agent id is required');
  const updates = {};
  if (payload?.name !== undefined) updates.name = (payload.name || '').trim();
  if (payload?.type !== undefined) updates.type = (payload.type || 'custom').trim() || 'custom';
  if (payload?.roleId !== undefined) updates.role_id = payload.roleId;
  updates.updated_at = new Date().toISOString();

  if (hasSupabase() && supabase) {
    const { data, error } = await supabase
      .from('system_agents')
      .update(updates)
      .eq('id', id)
      .select('id, name, type, role_id, agent_hub_id, created_at, updated_at')
      .single();
    if (!error && data) return mapRow(data);
  }
  const list = loadFromStorage();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Agent not found');
  list[idx] = {
    ...list[idx],
    ...(updates.name !== undefined && { name: updates.name }),
    ...(updates.type !== undefined && { type: updates.type }),
    ...(updates.role_id !== undefined && { roleId: updates.role_id }),
    updatedAt: updates.updated_at,
  };
  saveToStorage(list);
  return list[idx];
}

/**
 * Delete a system agent.
 * @param {string} id
 */
export async function deleteSystemAgent(id) {
  if (!id) throw new Error('Agent id is required');
  if (hasSupabase() && supabase) {
    const { error } = await supabase.from('system_agents').delete().eq('id', id);
    if (!error) return;
  }
  const list = loadFromStorage().filter((a) => a.id !== id);
  saveToStorage(list);
}

export const AGENT_TYPES = [
  { value: 'custom', label: 'Custom' },
  { value: 'claw', label: 'Claw' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai_compatible', label: 'OpenAI-compatible' },
];
