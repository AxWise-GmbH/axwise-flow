/**
 * Dashboards HTTP surface — Phase 1.
 *
 * Routes (via query param `op`):
 *   GET  ?op=list                            — list dashboards for the user (owned + shared)
 *   GET  ?op=get&id=<uuid>                   — single dashboard
 *   POST ?op=create                          — body { title, description?, config?, visibility? }
 *   POST ?op=update&id=<uuid>                — body partial fields
 *   POST ?op=delete&id=<uuid>                — delete (owner only)
 *   POST ?op=duplicate&id=<uuid>             — clone existing dashboard
 *   GET  ?op=templates                       — list seeded templates
 *   POST ?op=fork&id=<uuid>                  — fork a template into the user's library
 *
 * Groups (share_groups + share_group_members):
 *   GET  ?op=groups                          — list groups owned by user + memberships
 *   POST ?op=group-create                    — body { name, description? }
 *   POST ?op=group-update&id=<uuid>          — body partial
 *   POST ?op=group-delete&id=<uuid>          — delete group
 *   POST ?op=group-add-member&id=<uuid>      — body { user_email | user_id, role? }
 *   POST ?op=group-remove-member&id=<uuid>   — body { user_id }
 *
 * Sharing (dashboard_shares):
 *   GET  ?op=shares&id=<uuid>                — list groups a dashboard is shared with
 *   POST ?op=share&id=<uuid>                 — body { group_id, can_edit }
 *   POST ?op=unshare&id=<uuid>               — body { group_id }
 *
 * Schedules (dashboard_schedules):
 *   GET  ?op=schedules&id=<uuid>             — list schedules for a dashboard
 *   POST ?op=schedule-create&id=<uuid>       — body { cron_expr, recipients[], format? }
 *   POST ?op=schedule-update&id=<uuid>       — body partial
 *   POST ?op=schedule-delete&id=<uuid>       — delete schedule (id = schedule_id here)
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  validateDashboardConfig,
  emptyConfig,
} from '../../src/services/dashboardSchema.js';

const log = createLogger('dashboards');

const COLUMNS =
  'id, owner_user_id, title, description, config, visibility, is_template, created_at, updated_at';

async function handleList(admin, userId) {
  // Owned dashboards
  const ownedReq = admin
    .from('saved_dashboards')
    .select(COLUMNS)
    .eq('owner_user_id', userId)
    .eq('is_template', false)
    .order('updated_at', { ascending: false });

  // Shared dashboards: via dashboard_shares → share_group_members
  const sharedIdsReq = admin
    .from('dashboard_shares')
    .select('dashboard_id, can_edit, share_group_members!inner(user_id)')
    .eq('share_group_members.user_id', userId);

  const [owned, sharedIds] = await Promise.all([ownedReq, sharedIdsReq]);
  if (owned.error) throw owned.error;

  let shared = [];
  if (!sharedIds.error && sharedIds.data?.length) {
    const ids = [...new Set(sharedIds.data.map((r) => r.dashboard_id))];
    const editPerm = Object.fromEntries(
      sharedIds.data.map((r) => [r.dashboard_id, r.can_edit])
    );
    const { data, error } = await admin
      .from('saved_dashboards')
      .select(COLUMNS)
      .in('id', ids)
      .neq('owner_user_id', userId)
      .order('updated_at', { ascending: false });
    if (!error) {
      shared = (data || []).map((d) => ({ ...d, can_edit: !!editPerm[d.id] }));
    }
  }

  return {
    status: 200,
    data: {
      owned: owned.data || [],
      shared,
    },
  };
}

async function handleGet(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { data, error } = await admin
    .from('saved_dashboards')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) return { status: 500, error: error.message };
  if (!data) return { status: 404, error: 'Dashboard not found' };

  // Authorize: owner, public, or shared via a group the user belongs to.
  if (data.owner_user_id === userId || data.visibility === 'public') {
    return { status: 200, data: { ...data, can_edit: data.owner_user_id === userId } };
  }
  const { data: shareRow } = await admin
    .from('dashboard_shares')
    .select('can_edit, group_id, share_group_members!inner(user_id)')
    .eq('dashboard_id', id)
    .eq('share_group_members.user_id', userId)
    .maybeSingle();
  if (!shareRow) return { status: 403, error: 'Not authorized' };
  return { status: 200, data: { ...data, can_edit: !!shareRow.can_edit } };
}

async function handleCreate(admin, userId, body) {
  const title = String(body?.title || '').trim();
  if (!title) return { status: 400, error: 'title is required' };

  const config = body?.config ?? emptyConfig();
  const v = validateDashboardConfig(config);
  if (!v.ok) return { status: 400, error: 'Invalid config', details: v.errors };

  const insertBody = {
    owner_user_id: userId,
    title: title.slice(0, 200),
    description: body?.description ? String(body.description).slice(0, 2000) : null,
    config: v.value,
    visibility: ['private', 'group', 'public'].includes(body?.visibility)
      ? body.visibility
      : 'private',
  };

  const { data, error } = await admin
    .from('saved_dashboards')
    .insert(insertBody)
    .select(COLUMNS)
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

async function handleUpdate(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };

  // Authorize: must be owner, or have can_edit via shared group.
  const { data: existing } = await admin
    .from('saved_dashboards')
    .select('id, owner_user_id, is_template')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { status: 404, error: 'Dashboard not found' };
  if (existing.is_template && existing.owner_user_id !== userId) {
    return { status: 403, error: 'Templates are read-only — fork to edit' };
  }

  let canEdit = existing.owner_user_id === userId;
  if (!canEdit) {
    const { data: sr } = await admin
      .from('dashboard_shares')
      .select('can_edit, share_group_members!inner(user_id)')
      .eq('dashboard_id', id)
      .eq('share_group_members.user_id', userId)
      .eq('can_edit', true)
      .maybeSingle();
    canEdit = !!sr;
  }
  if (!canEdit) return { status: 403, error: 'Not authorized to edit' };

  const patch = {};
  if (body?.title !== undefined) patch.title = String(body.title).slice(0, 200);
  if (body?.description !== undefined)
    patch.description = body.description == null ? null : String(body.description).slice(0, 2000);
  if (body?.visibility !== undefined) {
    if (!['private', 'group', 'public'].includes(body.visibility)) {
      return { status: 400, error: 'invalid visibility' };
    }
    patch.visibility = body.visibility;
  }
  if (body?.config !== undefined) {
    const v = validateDashboardConfig(body.config);
    if (!v.ok) return { status: 400, error: 'Invalid config', details: v.errors };
    patch.config = v.value;
  }
  if (Object.keys(patch).length === 0) return { status: 400, error: 'nothing to update' };

  const { data, error } = await admin
    .from('saved_dashboards')
    .update(patch)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 200, data };
}

async function handleDelete(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { error } = await admin
    .from('saved_dashboards')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', userId);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { id } };
}

async function handleDuplicate(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  // Read via get (handles authorization).
  const got = await handleGet(admin, userId, { id });
  if (got.error) return got;
  const src = got.data;
  const { data, error } = await admin
    .from('saved_dashboards')
    .insert({
      owner_user_id: userId,
      title: `${src.title} (copy)`,
      description: src.description,
      config: src.config,
      visibility: 'private',
    })
    .select(COLUMNS)
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

async function handleTemplates(admin) {
  const { data, error } = await admin
    .from('saved_dashboards')
    .select(COLUMNS)
    .eq('is_template', true)
    .order('title', { ascending: true });
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: data || [] };
}

// ─── Groups ───────────────────────────────────────────────────────────────────

async function handleGroupsList(admin, userId) {
  const [owned, mem] = await Promise.all([
    admin.from('share_groups').select('*').eq('owner_user_id', userId).order('name'),
    admin
      .from('share_group_members')
      .select('group_id, role, added_at, share_groups!inner(id, name, owner_user_id)')
      .eq('user_id', userId),
  ]);
  if (owned.error) throw owned.error;
  const memberships = (mem.data || []).filter((m) => m.share_groups?.owner_user_id !== userId);
  // Fetch member counts for owned groups
  let counts = {};
  if ((owned.data || []).length) {
    const ids = owned.data.map((g) => g.id);
    const { data: members } = await admin
      .from('share_group_members')
      .select('group_id')
      .in('group_id', ids);
    counts = (members || []).reduce((acc, m) => {
      acc[m.group_id] = (acc[m.group_id] || 0) + 1;
      return acc;
    }, {});
  }
  return {
    status: 200,
    data: {
      owned: (owned.data || []).map((g) => ({ ...g, member_count: counts[g.id] || 0 })),
      memberships: memberships.map((m) => ({
        group_id: m.group_id,
        name: m.share_groups?.name,
        role: m.role,
        owner_user_id: m.share_groups?.owner_user_id,
      })),
    },
  };
}

async function handleGroupCreate(admin, userId, body) {
  const name = String(body?.name || '').trim();
  if (!name) return { status: 400, error: 'name is required' };
  const { data, error } = await admin
    .from('share_groups')
    .insert({
      owner_user_id: userId,
      name: name.slice(0, 100),
      description: body?.description ? String(body.description).slice(0, 500) : null,
    })
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

async function handleGroupUpdate(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const patch = {};
  if (body?.name !== undefined) patch.name = String(body.name).slice(0, 100);
  if (body?.description !== undefined)
    patch.description = body.description == null ? null : String(body.description).slice(0, 500);
  if (!Object.keys(patch).length) return { status: 400, error: 'nothing to update' };
  const { data, error } = await admin
    .from('share_groups')
    .update(patch)
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  if (!data) return { status: 404, error: 'group not found' };
  return { status: 200, data };
}

async function handleGroupDelete(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { error } = await admin
    .from('share_groups')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', userId);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { id } };
}

async function handleGroupAddMember(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  // Verify ownership
  const { data: group } = await admin
    .from('share_groups')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!group) return { status: 403, error: 'not authorized' };

  let memberId = body?.user_id;
  if (!memberId && body?.user_email) {
    // Look up by email — auth.users is restricted, so we use a public profiles
    // table if it exists, otherwise we surface a friendly error.
    const email = String(body.user_email).trim().toLowerCase();
    // Best-effort: try `profiles` then `user_profiles` table
    let userRow = null;
    const { data: p1 } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userRow = p1;
    if (!userRow) {
      const { data: p2 } = await admin
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      userRow = p2;
    }
    if (!userRow)
      return {
        status: 404,
        error: 'User not found — they need a profile in the platform first',
      };
    memberId = userRow.id;
  }
  if (!memberId) return { status: 400, error: 'user_id or user_email is required' };

  const role = body?.role === 'editor' ? 'editor' : 'viewer';
  const { error } = await admin
    .from('share_group_members')
    .upsert({ group_id: id, user_id: memberId, role });
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { group_id: id, user_id: memberId, role } };
}

async function handleGroupRemoveMember(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const memberId = body?.user_id;
  if (!memberId) return { status: 400, error: 'user_id is required' };
  // Verify ownership
  const { data: group } = await admin
    .from('share_groups')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!group) return { status: 403, error: 'not authorized' };
  const { error } = await admin
    .from('share_group_members')
    .delete()
    .eq('group_id', id)
    .eq('user_id', memberId);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { group_id: id, user_id: memberId } };
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

async function handleSharesList(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  // verify ownership
  const { data: dash } = await admin
    .from('saved_dashboards')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!dash) return { status: 403, error: 'not authorized' };
  const { data, error } = await admin
    .from('dashboard_shares')
    .select('group_id, can_edit, share_groups!inner(id, name)')
    .eq('dashboard_id', id);
  if (error) return { status: 500, error: error.message };
  return {
    status: 200,
    data: (data || []).map((r) => ({
      group_id: r.group_id,
      name: r.share_groups?.name,
      can_edit: r.can_edit,
    })),
  };
}

async function handleShare(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const groupId = body?.group_id;
  if (!groupId) return { status: 400, error: 'group_id is required' };
  const canEdit = body?.can_edit === true;
  // verify dashboard ownership
  const { data: dash } = await admin
    .from('saved_dashboards')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!dash) return { status: 403, error: 'not authorized' };
  const { error } = await admin
    .from('dashboard_shares')
    .upsert({ dashboard_id: id, group_id: groupId, can_edit: canEdit });
  if (error) return { status: 500, error: error.message };
  // also set visibility='group' if currently private
  await admin
    .from('saved_dashboards')
    .update({ visibility: 'group' })
    .eq('id', id)
    .eq('owner_user_id', userId)
    .eq('visibility', 'private');
  return { status: 200, data: { dashboard_id: id, group_id: groupId, can_edit: canEdit } };
}

async function handleUnshare(admin, userId, query, body) {
  const id = query?.id;
  const groupId = body?.group_id;
  if (!id || !groupId) return { status: 400, error: 'id and group_id are required' };
  // verify dashboard ownership
  const { data: dash } = await admin
    .from('saved_dashboards')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!dash) return { status: 403, error: 'not authorized' };
  const { error } = await admin
    .from('dashboard_shares')
    .delete()
    .eq('dashboard_id', id)
    .eq('group_id', groupId);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { dashboard_id: id, group_id: groupId } };
}

// ─── Schedules ────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCron(expr) {
  // Very loose validation: 5 fields, alphanumerics + */,- only
  if (typeof expr !== 'string') return false;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((p) => /^[0-9*,/\-A-Za-z]+$/.test(p));
}

async function handleSchedulesList(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { data: dash } = await admin
    .from('saved_dashboards')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!dash) return { status: 403, error: 'not authorized' };
  const { data, error } = await admin
    .from('dashboard_schedules')
    .select('*')
    .eq('dashboard_id', id)
    .order('created_at', { ascending: false });
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: data || [] };
}

async function handleScheduleCreate(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'dashboard id is required' };
  const cron = String(body?.cron_expr || '').trim();
  if (!isValidCron(cron)) return { status: 400, error: 'invalid cron expression (5 fields)' };
  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  if (!recipients.length) return { status: 400, error: 'at least one recipient is required' };
  const invalid = recipients.filter((e) => !isValidEmail(e));
  if (invalid.length) return { status: 400, error: `invalid emails: ${invalid.join(', ')}` };
  // Verify dashboard ownership
  const { data: dash } = await admin
    .from('saved_dashboards')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!dash) return { status: 403, error: 'not authorized' };

  const { data, error } = await admin
    .from('dashboard_schedules')
    .insert({
      dashboard_id: id,
      owner_user_id: userId,
      cron_expr: cron,
      recipients,
      format: body?.format === 'pdf' ? 'pdf' : 'html',
      enabled: body?.enabled !== false,
      next_due_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

async function handleScheduleUpdate(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'schedule id is required' };
  const patch = {};
  if (body?.cron_expr !== undefined) {
    if (!isValidCron(body.cron_expr)) return { status: 400, error: 'invalid cron expression' };
    patch.cron_expr = body.cron_expr;
  }
  if (body?.recipients !== undefined) {
    if (!Array.isArray(body.recipients) || !body.recipients.length)
      return { status: 400, error: 'at least one recipient is required' };
    const invalid = body.recipients.filter((e) => !isValidEmail(e));
    if (invalid.length) return { status: 400, error: `invalid emails: ${invalid.join(', ')}` };
    patch.recipients = body.recipients;
  }
  if (body?.format !== undefined) patch.format = body.format === 'pdf' ? 'pdf' : 'html';
  if (body?.enabled !== undefined) patch.enabled = !!body.enabled;
  if (!Object.keys(patch).length) return { status: 400, error: 'nothing to update' };

  const { data, error } = await admin
    .from('dashboard_schedules')
    .update(patch)
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  if (!data) return { status: 404, error: 'schedule not found' };
  return { status: 200, data };
}

async function handleScheduleDelete(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'schedule id is required' };
  const { error } = await admin
    .from('dashboard_schedules')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', userId);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { id } };
}

async function handleFork(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { data: tpl } = await admin
    .from('saved_dashboards')
    .select(COLUMNS)
    .eq('id', id)
    .eq('is_template', true)
    .maybeSingle();
  if (!tpl) return { status: 404, error: 'Template not found' };
  const { data, error } = await admin
    .from('saved_dashboards')
    .insert({
      owner_user_id: userId,
      title: tpl.title,
      description: tpl.description,
      config: tpl.config,
      visibility: 'private',
      is_template: false,
    })
    .select(COLUMNS)
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `dashboards:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();
  try {
    let result;
    switch (op) {
      case 'list':
        result = await handleList(admin, user.id);
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
        result = await handleDelete(admin, user.id, req.query);
        break;
      case 'duplicate':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleDuplicate(admin, user.id, req.query);
        break;
      case 'templates':
        result = await handleTemplates(admin);
        break;
      case 'fork':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleFork(admin, user.id, req.query);
        break;
      case 'groups':
        result = await handleGroupsList(admin, user.id);
        break;
      case 'group-create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleGroupCreate(admin, user.id, req.body || {});
        break;
      case 'group-update':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleGroupUpdate(admin, user.id, req.query, req.body || {});
        break;
      case 'group-delete':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleGroupDelete(admin, user.id, req.query);
        break;
      case 'group-add-member':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleGroupAddMember(admin, user.id, req.query, req.body || {});
        break;
      case 'group-remove-member':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleGroupRemoveMember(admin, user.id, req.query, req.body || {});
        break;
      case 'shares':
        result = await handleSharesList(admin, user.id, req.query);
        break;
      case 'share':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleShare(admin, user.id, req.query, req.body || {});
        break;
      case 'unshare':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUnshare(admin, user.id, req.query, req.body || {});
        break;
      case 'schedules':
        result = await handleSchedulesList(admin, user.id, req.query);
        break;
      case 'schedule-create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleScheduleCreate(admin, user.id, req.query, req.body || {});
        break;
      case 'schedule-update':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleScheduleUpdate(admin, user.id, req.query, req.body || {});
        break;
      case 'schedule-delete':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleScheduleDelete(admin, user.id, req.query);
        break;
      default:
        return jsonError(res, 400, `Invalid op: ${op}`);
    }
    if (result.error) {
      if (result.details) return res.status(result.status).json({ error: result.error, details: result.details });
      return jsonError(res, result.status, result.error);
    }
    return res.status(result.status).json(result.data);
  } catch (err) {
    log.warn(req, 'handler.error', { op, error: err?.message });
    return handleApiError(res, err, 'dashboards');
  }
}
