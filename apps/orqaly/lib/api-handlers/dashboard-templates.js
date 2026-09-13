/**
 * Dashboard layout templates handler — per-user CRUD for named block-layout
 * snapshots (which blocks show/hide + their order). Built-in presets live in the
 * frontend; these are the user's saved "Custom" templates.
 *
 * Routes (via query param `op`):
 *   GET  ?op=list[&surface=home]   — List the user's templates
 *   POST ?op=create                — Create a template
 *   POST ?op=update&id=<id>        — Update name/hidden/block_order
 *   POST ?op=delete&id=<id>        — Delete a template
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { dashboardTemplateSchema, dashboardTemplateUpdateSchema } from '../../api/_lib/validate.js';

const log = createLogger('dashboard-templates');

const MAX_TEMPLATES_PER_USER = 50;

function firstZodMessage(error) {
  return error?.issues?.[0]?.message || error?.errors?.[0]?.message || 'Invalid request';
}

async function handleList(admin, userId, query) {
  const surface = (query?.surface || 'home').trim() || 'home';
  const { data, error } = await admin
    .from('dashboard_layout_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('surface', surface)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleCreate(admin, userId, body, req) {
  const parsed = dashboardTemplateSchema.safeParse(body || {});
  if (!parsed.success) return { status: 400, error: firstZodMessage(parsed.error) };
  const { name, surface, hidden, block_order, widths } = parsed.data;

  const { count, error: countErr } = await admin
    .from('dashboard_layout_templates')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('surface', surface);
  if (countErr) throw countErr;
  if ((count || 0) >= MAX_TEMPLATES_PER_USER) {
    return { status: 400, error: `Template limit reached (${MAX_TEMPLATES_PER_USER}). Delete one and retry.` };
  }

  const { data, error } = await admin
    .from('dashboard_layout_templates')
    .insert({ user_id: userId, surface, name, hidden, block_order, widths })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { status: 409, error: 'A template with that name already exists' };
    throw error;
  }
  log.info(req, 'dashboard_template.created', { id: data.id, surface });
  return { status: 200, data };
}

async function handleUpdate(admin, userId, body, query, req) {
  const id = (query?.id || body?.id || '').trim();
  if (!id) return { status: 400, error: 'ID is required' };

  const parsed = dashboardTemplateUpdateSchema.safeParse(body || {});
  if (!parsed.success) return { status: 400, error: firstZodMessage(parsed.error) };

  const patch = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.hidden !== undefined) patch.hidden = parsed.data.hidden;
  if (parsed.data.block_order !== undefined) patch.block_order = parsed.data.block_order;
  if (parsed.data.widths !== undefined) patch.widths = parsed.data.widths;

  const { data, error } = await admin
    .from('dashboard_layout_templates')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { status: 409, error: 'A template with that name already exists' };
    throw error;
  }
  if (!data) return { status: 404, error: 'Template not found' };
  log.info(req, 'dashboard_template.updated', { id });
  return { status: 200, data };
}

async function handleDelete(admin, userId, body, query, req) {
  const id = (query?.id || body?.id || '').trim();
  if (!id) return { status: 400, error: 'ID is required' };

  const { error } = await admin
    .from('dashboard_layout_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
  log.info(req, 'dashboard_template.deleted', { id });
  return { status: 200, data: { deleted: id } };
}

// ── Main handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  const rlKey = `dashboard-templates:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();

  try {
    let result;

    if (req.method === 'GET' && op === 'list') {
      result = await handleList(admin, user.id, req.query);
    } else if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : {};
      if (op === 'create') result = await handleCreate(admin, user.id, body, req);
      else if (op === 'update') result = await handleUpdate(admin, user.id, body, req.query, req);
      else if (op === 'delete') result = await handleDelete(admin, user.id, body, req.query, req);
    }

    if (!result) return jsonError(res, 400, 'Invalid op. Use: list, create, update, delete');
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'dashboard-templates');
  }
}
