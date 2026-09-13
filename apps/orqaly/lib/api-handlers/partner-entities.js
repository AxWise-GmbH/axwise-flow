/**
 * Partner-entities handler — the Partners ready-business data surface.
 *
 * Polymorphic entities (partner|supplier|warehouse|crm|<custom>) plus the
 * per-user type config (personalized fields/filters/metrics). All rows are
 * user-scoped; every query filters by user.id.
 *
 * Routes (via query param `op`):
 *   GET  ?op=types-list                      — user's type configs (seeds 4 defaults on first use)
 *   POST ?op=types-upsert                    — create/update a type config
 *   GET  ?op=list&type_key=&search=&...      — entities for a type + aggregated metrics (seeds demo rows once)
 *   GET  ?op=get&id=<uuid>                   — single entity
 *   POST ?op=create                          — body { entity_type_key, name, status?, tags?, data }
 *   POST ?op=update&id=<uuid>                — partial update
 *   POST ?op=delete&id=<uuid>                — delete
 *   POST ?op=transform                       — body { id, target_type_key } → clone into new type
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import { partnerEntitySchema, partnerEntityTypeSchema } from '../../api/_lib/validate.js';
import { DEFAULT_ENTITY_TYPES } from '../../src/config/partnerEntityTypes.js';

const log = createLogger('partner-entities');

// ── Type configs ────────────────────────────────────────────────────────────

async function ensureDefaultTypes(admin, userId) {
  const { data: existing } = await admin
    .from('partner_entity_types')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (existing && existing.length) return;
  const rows = DEFAULT_ENTITY_TYPES.map((t) => ({ ...t, user_id: userId }));
  // Idempotent: unique (user_id, type_key) makes a concurrent double-seed a no-op.
  await admin.from('partner_entity_types').upsert(rows, { onConflict: 'user_id,type_key', ignoreDuplicates: true });
}

async function handleTypesList(admin, userId) {
  await ensureDefaultTypes(admin, userId);
  const { data, error } = await admin
    .from('partner_entity_types')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleTypesUpsert(admin, userId, body) {
  const parsed = partnerEntityTypeSchema.safeParse(body || {});
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0]?.message || 'Invalid type config' };
  const t = parsed.data;
  const row = {
    user_id: userId,
    type_key: t.type_key,
    label: t.label ?? null,
    icon: t.icon ?? null,
    color: t.color ?? null,
    description: t.description ?? null,
    sort_order: t.sort_order ?? 0,
    fields: t.fields ?? [],
    filters: t.filters ?? [],
    metrics: t.metrics ?? [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from('partner_entity_types')
    .upsert(row, { onConflict: 'user_id,type_key' })
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 200, data };
}

// ── Entities ────────────────────────────────────────────────────────────────

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Aggregate the type's metric defs over the returned rows (count/sum/avg).
function computeMetrics(metricDefs, rows) {
  if (!Array.isArray(metricDefs)) return [];
  return metricDefs.map((m) => {
    let value = 0;
    if (m.agg === 'count') {
      value = rows.length;
    } else if (m.field) {
      const vals = rows.map((r) => num(r.data?.[m.field]));
      if (m.agg === 'sum') value = vals.reduce((a, b) => a + b, 0);
      else if (m.agg === 'avg') value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      else if (m.agg === 'min') value = vals.length ? Math.min(...vals) : 0;
      else if (m.agg === 'max') value = vals.length ? Math.max(...vals) : 0;
    }
    return { key: m.key, label: m.label, format: m.format || 'number', value: Math.round(value * 100) / 100 };
  });
}

function matchesFilters(row, filters) {
  for (const [field, wanted] of Object.entries(filters)) {
    const values = Array.isArray(wanted) ? wanted : [wanted];
    if (!values.length) continue;
    const cell = row.data?.[field];
    const cellArr = Array.isArray(cell) ? cell : [cell];
    if (!values.some((w) => cellArr.includes(w))) return false;
  }
  return true;
}

async function handleList(admin, userId, query) {
  const typeKey = String(query?.type_key || '').trim();
  if (!typeKey) return { status: 400, error: 'type_key is required' };

  // Ensure the type configs exist (a deep-link or Overview-first visit may race
  // the types-list call). No demo/sample data is ever seeded — real records only.
  await ensureDefaultTypes(admin, userId);

  const { data: rowsRaw, error } = await admin
    .from('partner_entities')
    .select('*')
    .eq('user_id', userId)
    .eq('entity_type_key', typeKey)
    .order('created_at', { ascending: false });
  if (error) throw error;

  let rows = rowsRaw || [];

  const search = String(query?.search || '').trim().toLowerCase();
  if (search) rows = rows.filter((r) => String(r.name || '').toLowerCase().includes(search));

  let filters = {};
  if (query?.filters) {
    try { filters = JSON.parse(query.filters); } catch { filters = {}; }
  }
  if (filters && Object.keys(filters).length) rows = rows.filter((r) => matchesFilters(r, filters));

  // Metrics computed over the full filtered set (before pagination).
  const { data: typeCfg } = await admin
    .from('partner_entity_types')
    .select('metrics')
    .eq('user_id', userId)
    .eq('type_key', typeKey)
    .maybeSingle();
  const metrics = computeMetrics(typeCfg?.metrics || [], rows);

  const total = rows.length;
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(query?.pageSize, 10) || 100));
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return { status: 200, data: { rows: paged, total, page, pageSize, metrics } };
}

async function handleGet(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { data, error } = await admin
    .from('partner_entities')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: 404, error: 'Entity not found' };
  return { status: 200, data };
}

async function handleCreate(admin, userId, body) {
  const parsed = partnerEntitySchema.safeParse(body || {});
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0]?.message || 'Invalid entity' };
  const e = parsed.data;
  const { data, error } = await admin
    .from('partner_entities')
    .insert({
      user_id: userId,
      entity_type_key: e.entity_type_key,
      name: e.name.trim(),
      status: e.status || 'active',
      tags: e.tags || [],
      data: e.data || {},
      metadata: e.metadata || {},
    })
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

async function handleUpdate(admin, userId, query, body) {
  const id = query?.id || body?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const patch = { updated_at: new Date().toISOString() };
  for (const k of ['name', 'status', 'tags', 'data', 'metadata']) {
    if (body[k] !== undefined) patch[k] = k === 'name' ? String(body[k]).trim() : body[k];
  }
  if (patch.name === '') return { status: 400, error: 'name cannot be empty' };
  const { data, error } = await admin
    .from('partner_entities')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 200, data };
}

async function handleDelete(admin, userId, query, body) {
  const id = query?.id || body?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { error } = await admin
    .from('partner_entities')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
  return { status: 200, data: { deleted: id } };
}

// Transform an entity into another type: clone shared field values into a new
// record of the target type, preserving lineage via source_entity_id.
async function handleTransform(admin, userId, body) {
  const id = body?.id;
  const targetType = String(body?.target_type_key || '').trim();
  if (!id || !targetType) return { status: 400, error: 'id and target_type_key are required' };

  const { data: src } = await admin
    .from('partner_entities')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!src) return { status: 404, error: 'Source entity not found' };

  const { data: targetCfg } = await admin
    .from('partner_entity_types')
    .select('fields')
    .eq('user_id', userId)
    .eq('type_key', targetType)
    .maybeSingle();
  if (!targetCfg) return { status: 400, error: `Unknown target type: ${targetType}` };

  // Keep only field values whose key exists on the target type.
  const allowed = new Set((targetCfg.fields || []).map((f) => f.key));
  const carried = {};
  for (const [k, v] of Object.entries(src.data || {})) if (allowed.has(k)) carried[k] = v;

  const { data, error } = await admin
    .from('partner_entities')
    .insert({
      user_id: userId,
      entity_type_key: targetType,
      name: src.name,
      status: 'active',
      tags: src.tags || [],
      data: carried,
      source_entity_id: src.id,
      metadata: { transformed_from: { id: src.id, type: src.entity_type_key } },
    })
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `partner-entities:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();
  try {
    let result;
    switch (op) {
      case 'types-list':
        result = await handleTypesList(admin, user.id);
        break;
      case 'types-upsert':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleTypesUpsert(admin, user.id, req.body || {});
        break;
      case 'list':
        result = await handleList(admin, user.id, req.query);
        break;
      case 'get':
        result = await handleGet(admin, user.id, req.query);
        break;
      case 'create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreate(admin, user.id, req.body || {});
        break;
      case 'update':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdate(admin, user.id, req.query, req.body || {});
        break;
      case 'delete':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleDelete(admin, user.id, req.query, req.body || {});
        break;
      case 'transform':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleTransform(admin, user.id, req.body || {});
        break;
      default:
        return jsonError(res, 400, `Invalid op: ${op}`);
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'partner-entities');
  }
}
