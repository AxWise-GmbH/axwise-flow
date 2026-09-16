/**
 * AI Chat Synchronization — export the user's assistant chat history into a
 * Knowledge Base "space" (a knowledge_documents category) so conversations
 * become searchable KB docs. Reuses the shared KB ingest/dedup path so a
 * re-sync updates the existing doc per conversation instead of duplicating.
 *
 * POST /api/app?path=assistant-chat-sync
 *   body: { space?: string (default 'Assistant Chats'), conversation_id?: uuid }
 *   -> { synced, skipped, truncated, conversations }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { applyRateLimitHeaders, checkRateLimit, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { assistantChatSyncSchema } from '../../api/_lib/validate.js';
import { ingestItems } from './_shared/kb-ingest-common.js';

const log = createLogger('assistant-chat-sync');

// Cap how much history we scan per sync so a huge account can't blow the budget.
const MAX_MESSAGES = 2000;

function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toISOString().slice(0, 10);
}

/** Group ordered messages by conversation_id, preserving first-seen order. */
function groupByConversation(messages) {
  const map = new Map();
  for (const m of messages) {
    const id = m.conversation_id || 'unknown';
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(m);
  }
  return map;
}

/** Turn one conversation's messages into a { source, title, content } item. */
function conversationToItem(conversationId, msgs) {
  const firstUser = msgs.find((m) => m.role === 'user');
  const lead = String(firstUser?.content || msgs[0]?.content || '').trim().replace(/\s+/g, ' ');
  const shortLead = lead.slice(0, 80);
  const title = `Chat — ${formatDate(msgs[0]?.created_at)}${shortLead ? `: ${shortLead}` : ''}`;
  const content = msgs
    .map((m) => `**${m.role === 'assistant' ? 'assistant' : 'user'}:** ${String(m.content || '').trim()}`)
    .join('\n\n');
  return { source: `assistant-chat:${conversationId}`, title, content, url: null };
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
    key: `assistant-chat-sync:${getRateLimitIdentifier(req, user.id)}`,
    limit: 6,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) { done({ status: 429 }); return jsonError(res, 429, 'Rate limit exceeded'); }

  try {
    const parsed = assistantChatSyncSchema.safeParse(req.body || {});
    if (!parsed.success) {
      done({ status: 400 });
      return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid request');
    }
    const { space, conversation_id: conversationId, kb_connection_id: connectionId } = parsed.data;

    const admin = buildSupabaseAdminClient();
    if (!admin) { done({ status: 500 }); return jsonError(res, 500, 'Server not configured'); }

    let query = admin
      .from('assistant_chat_messages')
      .select('conversation_id, role, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES);
    if (conversationId) query = query.eq('conversation_id', conversationId);

    const { data: messages, error } = await query;
    if (error) { done({ status: 500 }); return jsonError(res, 500, error.message); }

    const rows = Array.isArray(messages) ? messages : [];
    if (rows.length === 0) {
      done({ status: 200, synced: 0 });
      return res.status(200).json({ synced: 0, skipped: 0, truncated: false, conversations: 0 });
    }

    const grouped = groupByConversation(rows);
    const items = [];
    for (const [id, msgs] of grouped.entries()) {
      if (id === 'unknown') continue;
      items.push(conversationToItem(id, msgs));
    }

    const { count, truncated } = await ingestItems({
      admin,
      userId: user.id,
      connectionId: connectionId || null, // tags docs with metadata.kb_connection_id
      sourceTag: space, // sets knowledge_documents.category = the chosen space
      items,
      log: (m) => log.warn(req, 'ingest.truncated', { message: m }),
    });

    done({ status: 200, synced: count });
    return res.status(200).json({
      synced: count,
      skipped: items.length - count,
      truncated,
      conversations: items.length,
    });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'assistant-chat-sync');
  }
}
