/**
 * Agent Profile service — CRUD for agent identity cards + avatar generation.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const STORAGE_KEY = 'orch_agent_profiles_v1';

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

async function get(path, op, params = {}) {
  const qs = new URLSearchParams({ op, ...params });
  for (const [k, v] of qs.entries()) {
    if (!v) qs.delete(k);
  }
  const res = await fetch(`${getBase()}/api/app?path=${path}&${qs}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} ${op} failed`);
  return data;
}

async function post(path, op, body = {}) {
  const res = await fetch(`${getBase()}/api/app?path=${path}&op=${op}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} ${op} failed`);
  return data;
}

// ── localStorage cache ─────────────────────────────────────────────────────
const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

function loadLocal() {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(profiles) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {}
}

// ── Profile CRUD ───────────────────────────────────────────────────────────

/** Fetch a single profile by agent_id */
export async function getProfile(agentId) {
  try {
    const data = await get('agent-profiles', 'get', { agent_id: agentId });
    return data;
  } catch {
    // Fallback to local cache
    const local = loadLocal();
    return local.find((p) => p.agent_id === agentId) || null;
  }
}

/** List all profiles for the current user */
export async function listProfiles(search = '') {
  try {
    const data = await get('agent-profiles', 'list', search ? { search } : {});
    if (Array.isArray(data)) saveLocal(data);
    return data;
  } catch {
    return loadLocal();
  }
}

/** Upsert (create or update) a profile */
export async function upsertProfile(profile) {
  const data = await post('agent-profiles', 'upsert', profile);
  // Update local cache
  const local = loadLocal();
  const idx = local.findIndex((p) => p.agent_id === profile.agent_id);
  if (idx >= 0) local[idx] = { ...local[idx], ...data };
  else local.push(data);
  saveLocal(local);
  return data;
}

/** Delete a profile */
export async function deleteProfile(id) {
  const res = await fetch(`${getBase()}/api/app?path=agent-profiles&op=delete&id=${id}`, {
    method: 'DELETE',
    headers: await getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Delete failed');
  }
  // Remove from local cache
  const local = loadLocal().filter((p) => p.id !== id);
  saveLocal(local);
  return true;
}

// ── Seed ───────────────────────────────────────────────────────────────────

/** Check how many profiles exist */
export async function getSeedStatus() {
  return get('seed-agent-profiles', 'status');
}

/** Seed predefined profiles for agents that don't have one */
export async function seedProfiles(profiles) {
  return post('seed-agent-profiles', 'seed', { profiles });
}

// ── Avatar generation ──────────────────────────────────────────────────────

/** Generate an AI avatar for an agent */
export async function generateAvatar({
  agent_id,
  display_name,
  gender,
  age,
  job_title,
  variant = 'headshot',
}) {
  return post('generate-agent-avatar', 'generate', {
    agent_id,
    display_name,
    gender,
    age,
    job_title,
    variant,
  });
}

/** Get a public/signed URL for an avatar path */
export async function getAvatarUrl(path) {
  return post('generate-agent-avatar', 'get-url', { path });
}

/** Delete an avatar */
export async function deleteAvatar(agentId, variant = 'headshot') {
  return post('generate-agent-avatar', 'delete', { agent_id: agentId, variant });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Get profiles indexed by agent_id for quick lookup */
export async function getProfileMap() {
  const profiles = await listProfiles();
  const map = new Map();
  for (const p of profiles) {
    map.set(p.agent_id, p);
  }
  return map;
}
