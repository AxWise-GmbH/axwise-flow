/**
 * Personal Assistant chat history — persist and read the assistant <-> user
 * conversation (backed by the assistant_chat_messages table). Mirrors the
 * request/auth pattern used by goalService.
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

/** Fetch the current user's assistant chat history (newest first). */
export async function getAssistantHistory(limit = 300) {
  const qs = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${getBase()}/api/app?path=assistant-history&${qs}`, {
    method: 'GET',
    headers: await getHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

/**
 * Fetch every message of ONE conversation, oldest first, so a past chat can be
 * reopened and continued. The flat `getAssistantHistory` window can truncate an
 * older conversation part-way; this reads it whole.
 * @param {string} conversationId
 * @returns {Promise<Array>} the conversation's messages, oldest first
 */
export async function getConversationMessages(conversationId) {
  if (!conversationId) return [];
  const qs = new URLSearchParams({ conversation: String(conversationId) });
  const res = await fetch(`${getBase()}/api/app?path=assistant-history&${qs}`, {
    method: 'GET',
    headers: await getHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

/**
 * Search the user's assistant history across ALL conversations by keyword.
 * @param {string} query keyword to ILIKE-match against message content
 * @param {{ limit?: number, excludeConversationId?: string }} [opts]
 * @returns {Promise<Array>} matching messages, newest first
 */
export async function searchAssistantHistory(query, opts = {}) {
  const params = { limit: String(opts.limit || 20) };
  if (query) params.q = String(query);
  if (opts.excludeConversationId) params.exclude = String(opts.excludeConversationId);
  const qs = new URLSearchParams(params);
  const res = await fetch(`${getBase()}/api/app?path=assistant-history&${qs}`, {
    method: 'GET',
    headers: await getHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

/**
 * Persist one or more messages for a conversation. Best-effort: callers should
 * not block the chat UX on this (wrap in try/catch or .catch).
 * @param {string} conversationId
 * @param {Array<{role:'user'|'assistant', content:string, mode?:string, metadata?:object}>} messages
 * @param {string} [mode]
 */
export async function logAssistantMessages(conversationId, messages, mode) {
  if (!conversationId || !Array.isArray(messages) || !messages.length) return { inserted: 0 };
  const payload = {
    conversation_id: conversationId,
    messages: messages.map((m) => ({ mode, ...m })),
  };
  const res = await fetch(`${getBase()}/api/app?path=assistant-history`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}
