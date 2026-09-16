/**
 * Frontend client for /api/app?path=assistant-setup — the single per-user
 * AI-assistant setup row that powers the unified AssistantSetupChatDialog.
 *
 * Replaces the two legacy localStorage flags (orch_assistant_config /
 * orch_assistant_active). The hook (useAssistantSetup) keeps mirroring those
 * keys until every reader is migrated, so this service only speaks to the API.
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

/**
 * Load the current user's assistant setup.
 * @returns {Promise<{ config: object, steps: object, activated: boolean, updatedAt: string|null } | null>}
 */
export async function loadAssistantSetup() {
  const res = await fetch(`${getBase()}/api/app?path=assistant-setup`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load assistant setup');
  return data.setup || null;
}

/**
 * Save a partial update. config/steps are merged server-side with the
 * existing row, so callers only send what changed.
 * @param {{ config?: object, steps?: object, activated?: boolean }} patch
 * @returns {Promise<{ config: object, steps: object, activated: boolean, updatedAt: string|null }>}
 */
export async function saveAssistantSetup(patch = {}) {
  const res = await fetch(`${getBase()}/api/app?path=assistant-setup`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save assistant setup');
  return data.setup;
}
