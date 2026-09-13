/**
 * Frontend client for the assistant knowledge-ingestion + insights endpoints:
 *   - bulk file upload  -> /api/app?path=kb-bulk-upload
 *   - Obsidian vault     -> /api/app?path=obsidian-sync
 *   - Notion sync        -> /api/app?path=notion-sync (existing)
 *   - first-steps advisor-> /api/app?path=assistant-first-steps
 * Used by DataCard and InsightsCard.
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

async function post(path, body) {
  const res = await fetch(`${getBase()}/api/app?path=${path}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} request failed`);
  return data;
}

/** Read a File into a base64 string (no data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]*;base64,/, ''));
    reader.readAsDataURL(file);
  });
}

/** Upload File[] into the knowledge base. -> { added, docs, skipped } */
export async function bulkUploadFiles(files) {
  const payload = await Promise.all(
    Array.from(files).map(async (f) => ({
      name: f.name,
      mime: f.type,
      dataBase64: await fileToBase64(f),
    }))
  );
  return post('kb-bulk-upload', { files: payload });
}

/**
 * Import text notes into the KB. notes: [{ path, content }] -> { synced, skipped }
 * Backs both Obsidian and Google-Drive (file) imports; `source` tags the docs.
 * Optionally links the import to a kb_connections row.
 */
export function syncObsidian(notes, kbConnectionId = null, source = 'obsidian') {
  return post('obsidian-sync', { notes, kb_connection_id: kbConnectionId, source });
}

/** Generate the "first 30 days" plan. -> { narrative, docId } */
export function firstSteps() {
  return post('assistant-first-steps', {});
}

/**
 * Export assistant chat history into a Knowledge Base space (category).
 * `space` is the target KB category; `conversationId` limits to one conversation;
 * `connectionId` associates the export with a connected KB source (Notion/Dropbox/…).
 * -> { synced, skipped, truncated, conversations }
 */
export function syncAssistantChat({ space, conversationId, connectionId } = {}) {
  return post('assistant-chat-sync', {
    space,
    conversation_id: conversationId,
    kb_connection_id: connectionId,
  });
}

/**
 * Import one batch of parsed conversations (from an external AI-app export) into
 * a KB space. -> { synced, skipped, truncated, conversations }
 */
export function importChatExport({ provider, space, connectionId, conversations }) {
  return post('ai-chat-import', {
    provider,
    space,
    kb_connection_id: connectionId,
    conversations,
  });
}

/**
 * Import many conversations by batching (the server caps at 60 per request).
 * Aggregates the per-batch counts. -> { synced, conversations }
 */
export async function importChatExportBatched(
  { provider, space, connectionId, conversations },
  batchSize = 40
) {
  let synced = 0;
  let total = 0;
  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);
    const res = await importChatExport({ provider, space, connectionId, conversations: batch });
    synced += res.synced || 0;
    total += res.conversations || 0;
  }
  return { synced, conversations: total };
}
