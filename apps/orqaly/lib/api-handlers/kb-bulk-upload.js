/**
 * Bulk file ingest into the Knowledge Base. The assistant-setup dialog uses
 * this to take the company's files/folders and make them searchable so the
 * assistant can form an opinion on next steps.
 *
 * POST /api/app?path=kb-bulk-upload
 *   body: { files: [{ name, mime, dataBase64 }] }   (<=20 files, <=5MB each)
 *   -> { added: Number, docs: [{ id, title }], skipped: Number }
 *
 * Text-like files are decoded and embedded; binary files are stored as a KB
 * stub (title + metadata) so they're tracked even when we can't read them.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { applyRateLimitHeaders, checkRateLimit, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { generateEmbedding, hashEmbedding, estimateTokens, EMBEDDING_DIM } from '../_shared/embeddings.js';

const log = createLogger('kb-bulk-upload');

const MAX_FILES = 20;
const MAX_BYTES = 5 * 1024 * 1024;
const TEXT_RE = /^(text\/|application\/(json|xml|csv|markdown|x-ndjson))/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|log|yml|yaml|xml|html?)$/i;

function isTextual(name, mime) {
  return TEXT_RE.test(mime || '') || TEXT_EXT.test(name || '');
}

function decodeBase64(dataBase64) {
  // Accept raw base64 or a data: URL.
  const raw = String(dataBase64 || '').replace(/^data:[^;]*;base64,/, '');
  return Buffer.from(raw, 'base64');
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
    key: `kb-bulk-upload:${getRateLimitIdentifier(req, user.id)}`,
    limit: 10,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) { done({ status: 429 }); return jsonError(res, 429, 'Rate limit exceeded'); }

  try {
    const files = Array.isArray(req.body?.files) ? req.body.files : null;
    if (!files || files.length === 0) {
      done({ status: 400 });
      return jsonError(res, 400, 'files[] (with { name, mime, dataBase64 }) is required');
    }
    if (files.length > MAX_FILES) {
      done({ status: 400 });
      return jsonError(res, 400, `Too many files (max ${MAX_FILES})`);
    }

    const admin = buildSupabaseAdminClient();
    if (!admin) { done({ status: 500 }); return jsonError(res, 500, 'Server not configured'); }

    const docs = [];
    let skipped = 0;
    for (const f of files) {
      const name = String(f?.name || 'file').slice(0, 200);
      const bytes = decodeBase64(f?.dataBase64);
      if (bytes.length === 0 || bytes.length > MAX_BYTES) { skipped += 1; continue; }

      const textual = isTextual(name, f?.mime);
      const content = textual ? bytes.toString('utf8').slice(0, 20000) : '';
      const embedding = content ? await generateEmbedding(content) : hashEmbedding(name, EMBEDDING_DIM);

      const { data, error } = await admin
        .from('knowledge_documents')
        .insert({
          user_id: user.id,
          title: name,
          content,
          source: 'bulk-upload',
          category: 'company',
          metadata: { mime: f?.mime || null, bytes: bytes.length, textual },
          embedding: `[${embedding.join(',')}]`,
          token_count: estimateTokens(content),
          owner_type: 'user',
          content_type: 'file',
          tags: ['bulk-upload', 'company-info'],
          file_name: name,
          file_size: bytes.length,
          file_mime: f?.mime || null,
        })
        .select('id, title')
        .single();
      if (error) { log.warn(req, 'insert.failed', { name, err: error.message }); skipped += 1; continue; }
      docs.push(data);
    }

    done({ status: 200, added: docs.length, skipped });
    return res.status(200).json({ added: docs.length, docs, skipped });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'kb-bulk-upload');
  }
}
