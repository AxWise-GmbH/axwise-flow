/**
 * Obsidian vault sync into the Knowledge Base. Obsidian has no free cloud API,
 * so v1 ingests an exported vault: the client sends each markdown note's path +
 * content and we store one KB note per file (mirrors notion-sync.js, which
 * pulls from the Notion API).
 *
 * POST /api/app?path=obsidian-sync
 *   body: { notes: [{ path, content }] }   (<=200 notes)
 *   -> { synced: Number, skipped: Number }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { applyRateLimitHeaders, checkRateLimit, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { generateEmbedding, hashEmbedding, estimateTokens, EMBEDDING_DIM } from '../_shared/embeddings.js';

const log = createLogger('obsidian-sync');

const MAX_NOTES = 200;

function titleFromPath(p) {
  const base = String(p || 'note').split('/').pop() || 'note';
  return base.replace(/\.md$/i, '').slice(0, 200);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const done = log.startTimer(req, 'request', { method: req.method });
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) { done({ status: 401 }); return jsonError(res, 401, 'Unauthorized'); }

  const rl = checkRateLimit({
    key: `obsidian-sync:${getRateLimitIdentifier(req, user.id)}`,
    limit: 6,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) { done({ status: 429 }); return jsonError(res, 429, 'Rate limit exceeded'); }

  try {
    const notes = Array.isArray(req.body?.notes) ? req.body.notes : null;
    if (!notes || notes.length === 0) {
      done({ status: 400 });
      return jsonError(res, 400, 'notes[] (with { path, content }) is required');
    }
    if (notes.length > MAX_NOTES) {
      done({ status: 400 });
      return jsonError(res, 400, `Too many notes (max ${MAX_NOTES})`);
    }

    const admin = buildSupabaseAdminClient();
    if (!admin) { done({ status: 500 }); return jsonError(res, 500, 'Server not configured'); }

    // Optional link to a kb_connections row (tags docs + tracks sync state).
    const kbConnectionId = req.body?.kbConnectionId || req.body?.kb_connection_id || null;
    // The same text-notes importer backs Obsidian and Google-Drive (file) imports.
    const source = req.body?.source === 'google-drive' ? 'google-drive' : 'obsidian';

    let synced = 0;
    let skipped = 0;
    for (const n of notes) {
      const path = String(n?.path || '').slice(0, 400);
      const content = String(n?.content || '').slice(0, 20000);
      if (!content.trim()) { skipped += 1; continue; }
      const title = titleFromPath(path);
      const embedding = await generateEmbedding(content).catch(() => hashEmbedding(title, EMBEDDING_DIM));

      const { error } = await admin.from('knowledge_documents').insert({
        user_id: user.id,
        title,
        content,
        source,
        category: source,
        metadata: { vaultPath: path, ...(kbConnectionId ? { kb_connection_id: kbConnectionId } : {}) },
        embedding: `[${embedding.join(',')}]`,
        token_count: estimateTokens(content),
        owner_type: 'user',
        content_type: 'note',
        tags: [source, path].filter(Boolean),
      });
      if (error) { log.warn(req, 'insert.failed', { path, err: error.message }); skipped += 1; continue; }
      synced += 1;
    }

    if (kbConnectionId) {
      await admin
        .from('kb_connections')
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_ok: true,
          last_sync_error: null,
          docs_synced_count: synced,
        })
        .eq('id', kbConnectionId)
        .eq('user_id', user.id)
        .then(null, () => {});
    }

    done({ status: 200, synced, skipped });
    return res.status(200).json({ synced, skipped });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'obsidian-sync');
  }
}
