/**
 * Knowledge base handler — CRUD, search with embeddings, file/link/tag support.
 *
 * Routes (via query param `op`):
 *   POST ?op=add       — Add a document (generates embedding)
 *   POST ?op=update    — Update a document by ID
 *   POST ?op=search    — Search by query (generates query embedding, runs similarity search)
 *   GET  ?op=list      — List documents (filters: owner_type, owner_id, content_type, tags, is_pinned, organization_id, concilium_id)
 *   GET  ?op=get       — Get a single document by ID
 *   GET  ?op=tags      — List distinct tags for current user
 *   POST ?op=delete    — Delete a document by ID
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  generateEmbedding,
  hashEmbedding,
  estimateTokens,
  EMBEDDING_DIM,
} from '../_shared/embeddings.js';
import { federatedLiveSearch } from './_shared/kb-federated-search.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { agentMemoryOwnerId } from '../_shared/agent-memory.js';

const log = createLogger('knowledge-base');

// ── Operations ────────────────────────────────────────────────────

const LIST_FIELDS =
  'id, title, source, category, metadata, token_count, created_at, updated_at, owner_type, owner_id, content_type, tags, file_path, file_name, file_size, file_mime, url, url_meta, is_pinned, refs, organization_id, concilium_id';

// Category groups for structured filtering — maps display groups to raw DB values.
// Raw category values are never changed (backwards compatible).
const CATEGORY_GROUPS = {
  Goals: ['goal-plan', 'goal-output', 'goal-report', 'goal-retrospective'],
  Agents: ['agent-report', 'agent-work-memory', 'job-memory'],
  Quality: ['calibration_sample', 'quality_criteria', 'library_example', 'osja_review'],
  System: ['system_flag'],
  Bookmarks: ['bookmark'],
  General: ['general', 'technical', 'business', 'legal', 'support', 'other'],
};

/**
 * Capture a version snapshot of a document. Best-effort: never blocks the KB
 * write (e.g. if the versions table has not been migrated yet).
 */
async function recordVersion(admin, { documentId, userId, snapshot, changeType }) {
  try {
    const { data: last } = await admin
      .from('knowledge_document_versions')
      .select('version_no')
      .eq('document_id', documentId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = (last?.version_no || 0) + 1;
    await admin.from('knowledge_document_versions').insert({
      document_id: documentId,
      user_id: userId,
      version_no: nextNo,
      title: snapshot.title ?? null,
      content: snapshot.content ?? null,
      category: snapshot.category ?? null,
      content_type: snapshot.content_type ?? null,
      change_type: changeType,
      actor_type: 'user',
    });
  } catch {
    /* versions are best-effort */
  }
}

/** List version snapshots for a document (newest first), ownership-checked. */
async function handleVersions(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id query param is required' };
  const { data: doc, error: docErr } = await admin
    .from('knowledge_documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (docErr || !doc) return { status: 404, error: 'Document not found' };
  const { data, error } = await admin
    .from('knowledge_document_versions')
    .select(
      'id, version_no, title, content, category, content_type, change_type, actor_type, agent_name, created_at'
    )
    .eq('document_id', id)
    .eq('user_id', userId)
    .order('version_no', { ascending: false });
  if (error) return { status: 200, data: { versions: [] } }; // table not migrated yet
  return { status: 200, data: { versions: data || [] } };
}

async function handleAdd(admin, userId, body, req) {
  const {
    title,
    content,
    source,
    category,
    metadata,
    owner_type,
    owner_id,
    content_type,
    tags,
    file_path,
    file_name,
    file_size,
    file_mime,
    url,
    url_meta,
    is_pinned,
    refs,
    organization_id,
    concilium_id,
  } = body;

  // Content required for notes; file_path required for files; url required for links
  if (content_type === 'file' && !file_path)
    return { status: 400, error: 'file_path is required for file type' };
  if (content_type === 'link' && !url)
    return { status: 400, error: 'url is required for link type' };
  if (!content_type || content_type === 'note' || content_type === 'template') {
    if (!content) return { status: 400, error: 'content is required' };
  }

  // Auto-scrape URL content for links if no content provided
  let resolvedContent = content || '';
  let resolvedUrlMeta = url_meta || {};
  if (content_type === 'link' && url && !content) {
    try {
      const res = await fetchWithRetry(
        url,
        { method: 'GET', headers: { 'User-Agent': 'Orqaly/1.0' } },
        { timeoutMs: 8000, retries: 0 }
      );
      if (res.ok) {
        const html = await res.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = html.match(
          /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
        );
        const stripped = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        resolvedContent = stripped.slice(0, 5000);
        resolvedUrlMeta = {
          title: titleMatch?.[1]?.trim() || '',
          description: descMatch?.[1]?.trim() || '',
          ...resolvedUrlMeta,
        };
      }
    } catch (e) {
      log.warn(req, 'link.scrape.failed', { url, error: e.message });
    }
  }

  const embedding = resolvedContent
    ? await generateEmbedding(resolvedContent)
    : hashEmbedding(title || url || file_name || '', EMBEDDING_DIM);
  const tokenCount = estimateTokens(content || '');

  const row = {
    user_id: userId,
    title: title || (content || '').slice(0, 100),
    content: resolvedContent || '',
    source: source || '',
    category: category || 'general',
    metadata: metadata || {},
    embedding: `[${embedding.join(',')}]`,
    token_count: tokenCount,
    owner_type: owner_type || 'user',
    owner_id: owner_id || null,
    content_type: content_type || 'note',
    tags: Array.isArray(tags) ? tags : [],
    file_path: file_path || null,
    file_name: file_name || null,
    file_size: file_size || null,
    file_mime: file_mime || null,
    url: url || null,
    url_meta: resolvedUrlMeta || {},
    is_pinned: is_pinned || false,
    refs: Array.isArray(refs) ? refs : [],
    organization_id: organization_id || null,
    concilium_id: concilium_id || null,
  };

  const { data, error } = await admin
    .from('knowledge_documents')
    .insert(row)
    .select(LIST_FIELDS)
    .single();

  if (error) throw error;
  await recordVersion(admin, {
    documentId: data.id,
    userId,
    snapshot: {
      title: row.title,
      content: row.content,
      category: row.category,
      content_type: row.content_type,
    },
    changeType: 'create',
  });
  log.info(req, 'document.added', { id: data.id, type: data.content_type });
  return { status: 200, data };
}

async function handleSearch(admin, userId, body, req) {
  const { query, category, limit = 5, threshold = 0.3, owner_type, owner_id } = body;
  if (!query) return { status: 400, error: 'query is required' };

  const queryEmbedding = await generateEmbedding(query);

  // Use agent-scoped search when owner filters are provided
  const rpcName = owner_type && owner_id ? 'search_agent_memory' : 'search_knowledge';
  const rpcParams = {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_count: Math.min(limit, 20),
    match_threshold: threshold,
    filter_user_id: userId,
  };
  if (owner_type && owner_id) {
    rpcParams.filter_owner_type = owner_type;
    rpcParams.filter_owner_id = owner_id;
  } else {
    rpcParams.filter_category = category || null;
  }

  const { data, error } = await admin.rpc(rpcName, rpcParams);

  if (error) throw error;

  // Federate live (over-connection) sources when the user has any. Fail-soft.
  const live =
    owner_type && owner_id
      ? []
      : await federatedLiveSearch({ admin, userId, query, limit }).catch(() => []);

  const merged = [...(data || []), ...live];
  log.info(req, 'search.complete', {
    query: query.slice(0, 50),
    results: (data || []).length,
    live: live.length,
  });
  return { status: 200, data: merged };
}

async function handleUpdate(admin, userId, body, req) {
  const { id, ...patch } = body;
  if (!id) return { status: 400, error: 'id is required' };

  const allowed = [
    'title',
    'content',
    'source',
    'category',
    'metadata',
    'tags',
    'is_pinned',
    'refs',
    'owner_type',
    'owner_id',
    'url',
    'url_meta',
    'organization_id',
    'concilium_id',
  ];
  const row = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (patch[key] !== undefined) row[key] = patch[key];
  }

  // Re-generate embedding if content changed
  if (patch.content) {
    const embedding = await generateEmbedding(patch.content);
    row.embedding = `[${embedding.join(',')}]`;
    row.token_count = estimateTokens(patch.content);
  }

  const { data, error } = await admin
    .from('knowledge_documents')
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select(LIST_FIELDS)
    .single();

  if (error) throw error;
  // Snapshot the new state (fetch content, which is not in LIST_FIELDS).
  const { data: fresh } = await admin
    .from('knowledge_documents')
    .select('title, content, category, content_type')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (fresh)
    await recordVersion(admin, { documentId: id, userId, snapshot: fresh, changeType: 'write' });
  log.info(req, 'document.updated', { id });
  return { status: 200, data };
}

async function handleGet(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id query param is required' };

  const { data, error } = await admin
    .from('knowledge_documents')
    .select(`${LIST_FIELDS}, content`)
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return { status: 200, data };
}

async function handleTags(admin, userId) {
  const { data, error } = await admin
    .from('knowledge_documents')
    .select('tags')
    .eq('user_id', userId);

  if (error) throw error;
  const tagSet = new Set();
  for (const row of data || []) {
    for (const t of row.tags || []) tagSet.add(t);
  }
  return { status: 200, data: [...tagSet].sort((a, b) => a.localeCompare(b)) };
}

async function handleList(admin, userId, query) {
  const category = query?.category || null;
  const categoryGroup = query?.category_group || null;
  const dateFrom = query?.date_from || null;
  const dateTo = query?.date_to || null;
  const agentName = query?.agent_name || null;
  const searchText = query?.search_text || null;
  const limit = Math.min(parseInt(query?.limit, 10) || 50, 200);
  const ownerType = query?.owner_type || null;
  const ownerId = query?.owner_id || null;
  const contentType = query?.content_type || null;
  const pinned = query?.is_pinned;
  const organizationId = query?.organization_id || null;
  const conciliumId = query?.concilium_id || null;

  let q = admin
    .from('knowledge_documents')
    .select(LIST_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Category group takes precedence over single category
  if (categoryGroup && CATEGORY_GROUPS[categoryGroup]) {
    q = q.in('category', CATEGORY_GROUPS[categoryGroup]);
  } else if (category) {
    q = q.eq('category', category);
  }

  // Date range
  if (dateFrom) q = q.gte('created_at', dateFrom);
  if (dateTo) q = q.lte('created_at', dateTo);

  // Agent name (stored in metadata JSONB)
  if (agentName) q = q.contains('metadata', { agent_name: agentName });

  // Server-side text search on title
  if (searchText) q = q.ilike('title', `%${searchText}%`);

  if (ownerType) q = q.eq('owner_type', ownerType);
  if (ownerId) q = q.eq('owner_id', ownerId);
  if (contentType) q = q.eq('content_type', contentType);
  if (pinned === 'true') q = q.eq('is_pinned', true);
  if (organizationId) q = q.eq('organization_id', organizationId);
  if (conciliumId) q = q.eq('concilium_id', conciliumId);

  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleListAgentMemory(admin, userId, query) {
  const agentId = query?.agent_id;
  if (!agentId) return { status: 400, error: 'agent_id is required' };
  const limit = Math.min(parseInt(query?.limit, 10) || 200, 500);

  // 1. Direct agent-scoped records (all categories, all content_types)
  const directPromise = admin
    .from('knowledge_documents')
    .select(LIST_FIELDS)
    .eq('user_id', userId)
    .eq('owner_type', 'agent')
    .eq('owner_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // 2. Find goals this agent participated in (executor OR sender in goal_messages)
  const goalsPromise = (async () => {
    const goalIds = new Set();
    const { data: execGoals } = await admin
      .from('goals')
      .select('id, title')
      .eq('user_id', userId)
      .eq('executor_type', 'agent')
      .eq('executor_id', agentId);
    const goalTitles = new Map();
    for (const g of execGoals || []) {
      goalIds.add(g.id);
      goalTitles.set(g.id, g.title);
    }

    const { data: msgs } = await admin
      .from('goal_messages')
      .select('goal_id')
      .eq('sender_agent_id', agentId);
    for (const m of msgs || []) if (m.goal_id) goalIds.add(m.goal_id);

    if (goalIds.size === 0) return { goalLinkedDocs: [], goalTitles };

    // Fill titles for message-linked goals
    const missing = [...goalIds].filter((id) => !goalTitles.has(id));
    if (missing.length) {
      const { data: extra } = await admin
        .from('goals')
        .select('id, title')
        .eq('user_id', userId)
        .in('id', missing);
      for (const g of extra || []) goalTitles.set(g.id, g.title);
    }

    const orFilter = [...goalIds].map((id) => `metadata->>goal_id.eq.${id}`).join(',');
    const { data: goalLinkedDocs } = await admin
      .from('knowledge_documents')
      .select(LIST_FIELDS)
      .eq('user_id', userId)
      .in('category', ['goal-output', 'goal-report', 'goal-retrospective'])
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(limit);

    return { goalLinkedDocs: goalLinkedDocs || [], goalTitles };
  })();

  const [directRes, goalsRes] = await Promise.all([directPromise, goalsPromise]);
  if (directRes.error) throw directRes.error;

  const direct = (directRes.data || []).map((d) => ({ ...d, source_tag: 'direct' }));
  const goalLinked = (goalsRes.goalLinkedDocs || []).map((d) => ({
    ...d,
    source_tag: 'goal-linked',
    goal_title: goalsRes.goalTitles.get(d.metadata?.goal_id) || null,
  }));

  return { status: 200, data: [...direct, ...goalLinked] };
}

async function handleAgentsInKB(admin, userId) {
  const { data, error } = await admin
    .from('knowledge_documents')
    .select('metadata')
    .eq('user_id', userId)
    .not('metadata->agent_name', 'is', null);

  if (error) throw error;
  const nameSet = new Set();
  for (const row of data || []) {
    const name = row.metadata?.agent_name;
    if (name) nameSet.add(name);
  }
  return { status: 200, data: [...nameSet].sort() };
}

async function handleDelete(admin, userId, body) {
  const { id } = body;
  if (!id) return { status: 400, error: 'id is required' };

  const { error } = await admin
    .from('knowledge_documents')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
  return { status: 200, data: { deleted: id } };
}

/**
 * Register agent personas in the Knowledge Base (one embedded doc per agent),
 * so activated agents (e.g. GitHub imports) are recall-able via search_agent_memory
 * and appear in the "agents in KB" view. Resolves each item's role -> agents.id
 * (user-scoped, like seed-agent-profiles) and dedupes by source `agent-persona:<id>`.
 * Body: { items: [{ role, content, title }] }
 */
async function handleRegisterAgent(admin, userId, body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return { status: 400, error: 'items array is required' };

  const { data: agents, error: agentsErr } = await admin
    .from('agents')
    .select('id, name, metadata')
    .eq('user_id', userId);
  if (agentsErr) throw agentsErr;
  // Predefined catalogue agents retain their seeded identity. Custom
  // metadata.agent_id is user-controlled and may collide, so custom personas
  // are always bound to the immutable agents row UUID.
  const byName = new Map((agents || []).map((agent) => [agent.name, agentMemoryOwnerId(agent)]));

  let registered = 0;
  let skipped = 0;
  for (const item of items.slice(0, 50)) {
    const role = String(item?.role || '').trim();
    const content = String(item?.content || '').trim();
    const agentId = byName.get(role) || byName.get(String(item?.title || '').trim());
    if (!agentId || !content) {
      skipped += 1;
      continue;
    }
    const title = String(item?.title || role || 'Agent').slice(0, 200);
    const source = `agent-persona:${agentId}`;
    const text = content.slice(0, 5000);
    const embedding = await generateEmbedding(text).catch(() =>
      hashEmbedding(title, EMBEDDING_DIM)
    );
    const row = {
      user_id: userId,
      title,
      content: text,
      source,
      category: 'agent-persona',
      content_type: 'note',
      owner_type: 'agent',
      owner_id: agentId,
      tags: ['agent-persona'],
      embedding: `[${embedding.join(',')}]`,
      token_count: estimateTokens(text),
      metadata: { agent_name: title }, // surfaces in the "agents in KB" view
    };
    // One persona doc per agent - dedupe by source.
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
    } else {
      await admin.from('knowledge_documents').insert(row);
    }
    registered += 1;
  }
  return { status: 200, data: { registered, skipped, total: items.length } };
}

// ── Main handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  const rlKey = `knowledge-base:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();

  const GET_OPS = {
    list: handleList,
    get: handleGet,
    tags: handleTags,
    agents_in_kb: handleAgentsInKB,
    'list-agent-memory': handleListAgentMemory,
    versions: handleVersions,
  };
  const POST_OPS = {
    add: handleAdd,
    update: handleUpdate,
    search: handleSearch,
    delete: handleDelete,
    'register-agent': handleRegisterAgent,
  };

  try {
    let result;

    if (req.method === 'GET' && GET_OPS[op]) {
      result = await GET_OPS[op](admin, user.id, req.query, req);
    } else if (req.method === 'POST' && POST_OPS[op]) {
      const body = typeof req.body === 'object' && req.body ? req.body : {};
      result = await POST_OPS[op](admin, user.id, body, req);
    }

    if (!result)
      return jsonError(
        res,
        400,
        'Invalid op. Use: add, update, search, list, get, tags, delete, list-agent-memory, versions'
      );
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'knowledge-base');
  }
}
