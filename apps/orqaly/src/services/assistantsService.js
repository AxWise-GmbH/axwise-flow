/**
 * Frontend client for /api/app?path=assistants - the per-user list of AI
 * assistants (each scoped to an organization). Supersedes the single-row
 * assistantSetupService for multi-assistant flows. The current assistant is the
 * one the console and setup wizard act on.
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

async function post(body) {
  const res = await fetch(`${getBase()}/api/app?path=assistants`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Assistant request failed');
  return data;
}

/** @returns {Promise<{ assistants: Array, currentId: string|null }>} */
export async function loadAssistants() {
  const res = await fetch(`${getBase()}/api/app?path=assistants`, { headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load assistants');
  return { assistants: data.assistants || [], currentId: data.currentId || null };
}

/** Create a new assistant (becomes current). */
export function createAssistant({ organizationId = null, name } = {}) {
  return post({ action: 'create', organizationId, name });
}

/** Make `id` the current assistant. */
export function switchAssistant(id) {
  return post({ action: 'switch', id });
}

/** Rename an assistant. */
export function renameAssistant(id, name) {
  return post({ action: 'rename', id, name });
}

/** Delete an assistant; the backend promotes another to current if needed. */
export function deleteAssistant(id) {
  return post({ action: 'delete', id });
}

/** Merge a partial config/steps/activated patch into one assistant. */
export async function saveAssistant(id, patch = {}) {
  const data = await post({ action: 'save', id, ...patch });
  return data.assistant;
}
