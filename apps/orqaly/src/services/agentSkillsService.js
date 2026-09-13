/**
 * Agent Skills service — browse, install, and manage skill packs.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function get(op, params = {}) {
  const qs = new URLSearchParams({ op, ...params });
  for (const [k, v] of qs.entries()) {
    if (!v) qs.delete(k);
  }
  const res = await fetch(`${getBase()}/api/app?path=agent-skills&${qs}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Agent skills ${op} failed`);
  return data;
}

async function post(op, body = {}) {
  const res = await fetch(`${getBase()}/api/app?path=agent-skills&op=${op}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Agent skills ${op} failed`);
    if (data.rule) err.rule = data.rule;
    if (data.excerpt) err.excerpt = data.excerpt;
    throw err;
  }
  return data;
}

export function listSkills(filters = {}) {
  return get('list', filters);
}

export function getSkill(id) {
  return get('get', { id });
}

export function installSkill(agentId, skillId) {
  return post('install', { agent_id: agentId, skill_id: skillId });
}

export function uninstallSkill(agentId, skillId) {
  return post('uninstall', { agent_id: agentId, skill_id: skillId });
}

export function updateCustomContent(agentId, skillId, customContent) {
  return post('update-custom', {
    agent_id: agentId,
    skill_id: skillId,
    custom_content: customContent,
  });
}

export function toggleSkill(agentId, skillId, isActive) {
  return post('toggle', { agent_id: agentId, skill_id: skillId, is_active: isActive });
}

export function getInstalledSkills(agentId) {
  return get('installed', { agent_id: agentId });
}

export function seedBundledSkills(skills) {
  return post('seed', { skills });
}

export function createSkill({ name, description, category, tags, content, icon }) {
  return post('create', { name, description, category, tags, content, icon });
}

export function getActiveSkillsForAgent(agentId) {
  return get('active-for-agent', { agent_id: agentId });
}

export function getAgentsUsingSkill(skillId) {
  return get('agents-using-skill', { skill_id: skillId });
}

export async function forgeSkill({ description, category, compatible_roles }) {
  const res = await fetch(`${getBase()}/api/app?path=skill-forge&op=generate`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ description, category, compatible_roles }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Forge generation failed');
    throw err;
  }
  return data;
}

export function approveForgeSkill(skillId, approve = true) {
  return post('approve-forge', { skill_id: skillId, approve });
}

export function listPendingForge() {
  return get('pending-forge');
}
