/**
 * Import chat history exported from external AI apps (ChatGPT / Claude / Gemini /
 * Perplexity / DeepSeek / Qwen / Kimi / generic) into the Knowledge Base.
 *
 * These apps expose no history API, so the client parses each app's official
 * data-export file, normalizes it to conversations, and posts them here. We store
 * one KB document per conversation, deduped by `<provider>:<conversation id>`, so
 * re-imports update rather than duplicate. Mirrors obsidian-sync.js.
 *
 * POST /api/app?path=ai-chat-import
 *   body: { provider, space?, kb_connection_id?, conversations: [{ id, title,
 *           messages: [{ role, content }] }] }
 *   -> { synced, skipped, truncated, conversations }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { applyRateLimitHeaders, checkRateLimit, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { aiChatImportSchema } from '../../api/_lib/validate.js';
import { ingestItems } from './_shared/kb-ingest-common.js';

const log = createLogger('ai-chat-import');

/** Render one normalized conversation into a markdown KB document body. */
function conversationToContent(conv) {
  return (conv.messages || [])
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: String(m.content || '').trim() }))
    .filter((m) => m.text)
    .map((m) => `**${m.role}:** ${m.text}`)
    .join('\n\n');
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
    key: `ai-chat-import:${getRateLimitIdentifier(req, user.id)}`,
    limit: 12,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) { done({ status: 429 }); return jsonError(res, 429, 'Rate limit exceeded'); }

  try {
    const parsed = aiChatImportSchema.safeParse(req.body || {});
    if (!parsed.success) {
      done({ status: 400 });
      return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid request');
    }
    const { provider, space, kb_connection_id: connectionId, conversations } = parsed.data;

    const admin = buildSupabaseAdminClient();
    if (!admin) { done({ status: 500 }); return jsonError(res, 500, 'Server not configured'); }

    const items = conversations
      .map((conv) => ({
        source: `${provider}:${conv.id}`,
        title: (conv.title || '').trim() || `${provider} chat`,
        content: conversationToContent(conv),
        url: null,
      }))
      .filter((it) => it.content.trim());

    if (items.length === 0) {
      done({ status: 200, synced: 0 });
      return res.status(200).json({ synced: 0, skipped: conversations.length, truncated: false, conversations: 0 });
    }

    const { count, truncated } = await ingestItems({
      admin,
      userId: user.id,
      connectionId: connectionId || null,
      sourceTag: space, // knowledge_documents.category = the chosen space
      items,
      log: (m) => log.warn(req, 'ingest.truncated', { message: m }),
    });

    if (connectionId) {
      await admin
        .from('kb_connections')
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_ok: true,
          last_sync_error: null,
          docs_synced_count: count,
        })
        .eq('id', connectionId)
        .eq('user_id', user.id)
        .then(null, () => {});
    }

    done({ status: 200, synced: count });
    return res.status(200).json({
      synced: count,
      skipped: items.length - count,
      truncated,
      conversations: items.length,
    });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'ai-chat-import');
  }
}
