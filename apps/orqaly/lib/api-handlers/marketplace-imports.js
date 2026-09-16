/**
 * Marketplace imported libraries - per-user catalogs imported into the
 * Marketplace tabs via the "Import From..." button.
 *
 * GET    /api/app?path=marketplace-imports&category=<cat>  -> list user's libraries
 * POST   /api/app?path=marketplace-imports                 -> upsert one library
 * DELETE /api/app?path=marketplace-imports&id=<uuid>       -> remove one library
 *
 * Backed by public.marketplace_imported_libraries (migration 171), RLS user-scoped.
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
import { marketplaceImportSchema } from '../../api/_lib/validate.js';

const log = createLogger('marketplace-imports');

const VALID_CATEGORIES = new Set(['orgs', 'teams', 'agents', 'models', 'tools', 'skills']);

function rowToDto(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    category: row.category,
    name: row.name,
    description: row.description || null,
    author: row.author || null,
    url: row.url || null,
    custom: !!row.custom,
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: row.created_at || null,
  };
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

  const isWrite = req.method === 'POST' || req.method === 'DELETE';
  const rl = checkRateLimit({
    key: `marketplace-imports:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
    limit: isWrite ? 20 : 60,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);

  try {
    if (req.method === 'GET') return await handleList(req, res, userClient, user, done);
    if (req.method === 'POST') return await handleUpsert(req, res, userClient, user, done);
    if (req.method === 'DELETE') return await handleRemove(req, res, userClient, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'marketplace-imports');
  }
}

async function handleList(req, res, userClient, user, done) {
  const category = req.query?.category;
  let query = userClient
    .from('marketplace_imported_libraries')
    .select('id, source_id, category, name, description, author, url, custom, items, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (category) {
    if (!VALID_CATEGORIES.has(category)) {
      done({ status: 400 });
      return jsonError(res, 400, 'Invalid category');
    }
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    log.warn(req, 'list.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load imported libraries');
  }

  done({ status: 200 });
  return res.status(200).json({ libraries: (data || []).map(rowToDto) });
}

async function handleUpsert(req, res, userClient, user, done) {
  const parsed = marketplaceImportSchema.safeParse(req.body || {});
  if (!parsed.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid payload');
  }
  const body = parsed.data;

  const { data, error } = await userClient
    .from('marketplace_imported_libraries')
    .upsert(
      {
        user_id: user.id,
        category: body.category,
        source_id: body.sourceId,
        name: body.name,
        description: body.description ?? null,
        author: body.author ?? null,
        url: body.url ?? null,
        custom: body.custom,
        items: body.items,
      },
      { onConflict: 'user_id,category,source_id' },
    )
    .select('id, source_id, category, name, description, author, url, custom, items, created_at')
    .maybeSingle();

  if (error) {
    log.warn(req, 'upsert.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to import library');
  }

  done({ status: 200 });
  return res.status(200).json({ library: data ? rowToDto(data) : null });
}

async function handleRemove(req, res, userClient, user, done) {
  const id = req.query?.id;
  if (!id) {
    done({ status: 400 });
    return jsonError(res, 400, 'Missing id');
  }

  const { error } = await userClient
    .from('marketplace_imported_libraries')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id);

  if (error) {
    log.warn(req, 'remove.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to remove imported library');
  }

  done({ status: 200 });
  return res.status(200).json({ ok: true });
}
