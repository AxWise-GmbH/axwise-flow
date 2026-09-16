/**
 * Personal Assistant chat history — persist + read the assistant <-> user
 * conversation that used to live only in React state.
 *
 * GET  /api/app?path=assistant-history            -> { messages: [...] }  (newest first)
 *     query: limit?, q? (ILIKE content search), exclude? (skip a conversation_id)
 * POST /api/app?path=assistant-history            -> { inserted: <n> }
 *     body: { conversation_id: uuid, messages: [{ role, content, mode?, metadata? }] }
 *
 * RLS on assistant_chat_messages scopes rows to the user; we also use the
 * user-scoped client and filter by user.id in code.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('assistant-history');

const MAX_LIST = 300;
const MAX_BATCH = 20;
const MAX_CONTENT = 8000;

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const isWrite = req.method === 'POST';
  const rl = checkRateLimit({
    key: `assistant-history:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
    limit: isWrite ? 60 : 120,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);
  if (!userClient) {
    done({ status: 500 });
    return jsonError(res, 500, 'Server not configured');
  }

  try {
    if (req.method === 'GET') return await handleList(req, res, userClient, user, done);
    if (req.method === 'POST') return await handleLog(req, res, userClient, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'assistant-history');
  }
}

async function handleList(req, res, userClient, user, done) {
  const limit = Math.min(Number(req.query?.limit) || MAX_LIST, MAX_LIST);
  const q = typeof req.query?.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  const excludeConversationId =
    typeof req.query?.exclude === 'string' ? req.query.exclude.trim() : '';
  // Reading back one conversation to reopen it. The flat list is newest-first
  // because it is a feed; a single conversation is oldest-first because it is
  // a transcript, and the client replays it in order.
  const conversationId =
    typeof req.query?.conversation === 'string' ? req.query.conversation.trim() : '';

  let query = userClient
    .from('assistant_chat_messages')
    .select('id, conversation_id, role, content, mode, metadata, created_at')
    .eq('user_id', user.id);
  if (q) query = query.ilike('content', `%${q}%`);
  if (conversationId) query = query.eq('conversation_id', conversationId);
  if (excludeConversationId) query = query.neq('conversation_id', excludeConversationId);

  const { data, error } = await query
    .order('created_at', { ascending: !!conversationId })
    .limit(limit);

  if (error) {
    log.warn(req, 'list.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load assistant history');
  }

  done({ status: 200, count: data?.length || 0 });
  return res.status(200).json({ messages: data || [] });
}

async function handleLog(req, res, userClient, user, done) {
  const body = isPlainObject(req.body) ? req.body : {};
  const conversationId = body.conversation_id;
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!conversationId || typeof conversationId !== 'string') {
    done({ status: 400 });
    return jsonError(res, 400, 'conversation_id is required');
  }
  if (!messages.length) {
    done({ status: 400 });
    return jsonError(res, 400, 'messages must be a non-empty array');
  }
  if (messages.length > MAX_BATCH) {
    done({ status: 400 });
    return jsonError(res, 400, `messages cannot exceed ${MAX_BATCH} per request`);
  }

  const rows = [];
  for (const m of messages) {
    if (!isPlainObject(m) || (m.role !== 'user' && m.role !== 'assistant')) {
      done({ status: 400 });
      return jsonError(res, 400, "each message needs role 'user' or 'assistant'");
    }
    rows.push({
      user_id: user.id,
      conversation_id: conversationId,
      role: m.role,
      content: String(m.content ?? '').slice(0, MAX_CONTENT),
      mode: m.mode ? String(m.mode).slice(0, 40) : null,
      metadata: isPlainObject(m.metadata) ? m.metadata : {},
    });
  }

  const { error } = await userClient.from('assistant_chat_messages').insert(rows);
  if (error) {
    log.warn(req, 'log.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to save assistant history');
  }

  done({ status: 200, inserted: rows.length });
  return res.status(200).json({ inserted: rows.length });
}
