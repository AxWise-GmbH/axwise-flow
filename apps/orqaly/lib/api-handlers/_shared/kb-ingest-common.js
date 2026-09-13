/**
 * Shared Knowledge Base ingest helpers used by every server-side sync core
 * (Dropbox / OneDrive / Google Drive / Mega). Keeps one tested embed + upsert
 * path so all sources behave identically and dedupe correctly.
 */
import { generateEmbedding, hashEmbedding, estimateTokens, EMBEDDING_DIM } from '../../_shared/embeddings.js';

// Per-sync guards so a huge cloud folder can't blow the serverless budget.
export const MAX_FILES = 50;
export const MAX_BYTES = 20000; // per-file content cap (chars), matches obsidian-sync

// Text file types we ingest. Binary docs (pdf/docx/images) are out of scope for v1.
const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'csv', 'json', 'yaml', 'yml', 'html', 'htm', 'rtf']);
const TEXT_MIME_HINTS = ['text/', 'application/json', 'application/xml', 'markdown', 'csv'];

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

/** True when a file (by name and/or mime) is a plain-text type we can embed. */
export function isTextFile(name, mime = '') {
  if (TEXT_EXTENSIONS.has(extOf(name))) return true;
  const m = String(mime || '').toLowerCase();
  return TEXT_MIME_HINTS.some((h) => m.includes(h));
}

export function titleFromPath(p) {
  const base = String(p || 'file').split('/').pop() || 'file';
  return base.replace(/\.[a-z0-9]+$/i, '').slice(0, 200) || 'file';
}

/**
 * Upsert one document into knowledge_documents, deduped by `source`.
 * @returns {Promise<'inserted'|'updated'|'skipped'>}
 */
export async function upsertKbDoc({ admin, userId, source, title, content, url, connectionId, sourceTag }) {
  const text = String(content || '').slice(0, MAX_BYTES);
  if (!text.trim()) return 'skipped';
  const tag = sourceTag || String(source || '').split(':')[0] || 'file';

  const embedding = await generateEmbedding(text).catch(() => hashEmbedding(title || tag, EMBEDDING_DIM));
  const row = {
    user_id: userId,
    title: String(title || 'Untitled').slice(0, 200),
    content: text,
    source,
    category: tag,
    content_type: 'note',
    owner_type: 'user',
    tags: [tag, 'imported'],
    embedding: `[${embedding.join(',')}]`,
    token_count: estimateTokens(text),
    metadata: {
      last_synced_at: new Date().toISOString(),
      ...(url ? { url } : {}),
      ...(connectionId ? { kb_connection_id: connectionId } : {}),
    },
  };

  const { data: existing } = await admin
    .from('knowledge_documents')
    .select('id')
    .eq('user_id', userId)
    .eq('source', source)
    .maybeSingle();

  if (existing) {
    await admin
      .from('knowledge_documents')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return 'updated';
  }
  await admin.from('knowledge_documents').insert(row);
  return 'inserted';
}

/**
 * Run a list of {source,title,content,url} items through upsertKbDoc, honouring
 * MAX_FILES. Returns { count, truncated } where count = docs written.
 * `log` (optional) is called with a message when the file list is truncated.
 */
export async function ingestItems({ admin, userId, connectionId, sourceTag, items, log }) {
  const truncated = items.length > MAX_FILES;
  const batch = items.slice(0, MAX_FILES);
  if (truncated && typeof log === 'function') {
    log(`[kb-ingest] ${sourceTag}: capped at ${MAX_FILES} of ${items.length} files`);
  }
  let count = 0;
  for (const it of batch) {
    const outcome = await upsertKbDoc({
      admin,
      userId,
      source: it.source,
      title: it.title,
      content: it.content,
      url: it.url,
      connectionId,
      sourceTag,
    });
    if (outcome !== 'skipped') count += 1;
  }
  return { count, truncated };
}
