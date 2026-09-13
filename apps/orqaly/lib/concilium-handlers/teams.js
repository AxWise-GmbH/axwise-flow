/**
 * Concilium teams handler: CRUD for teams + member management.
 * GET (list/single), POST (create), PUT (update), DELETE.
 * POST ?action=add-member / remove-member for team membership.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-teams');

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const endTimer = log.startTimer();
    const action = req.query?.action;

    // ── Member management actions ───────────────────────────────────
    if (action && req.method === 'POST') {
      const teamId = req.query?.id;
      if (!teamId) return jsonError(res, 400, 'id query param required');
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};

      if (action === 'add-member') {
        if (!body.memberId) return jsonError(res, 400, 'memberId is required');
        const { data, error } = await admin
          .from('concilium_team_members')
          .insert({ team_id: teamId, member_id: body.memberId, user_id: user.id })
          .select('*')
          .single();
        endTimer('teams:add-member');
        if (error) return handleApiError(res, error, 'teams:add-member');
        return res.status(201).json({ teamMember: data });
      }

      if (action === 'remove-member') {
        if (!body.memberId) return jsonError(res, 400, 'memberId is required');
        const { error } = await admin
          .from('concilium_team_members')
          .delete()
          .eq('team_id', teamId)
          .eq('member_id', body.memberId)
          .eq('user_id', user.id);
        endTimer('teams:remove-member');
        if (error) return handleApiError(res, error, 'teams:remove-member');
        return res.status(200).json({ removed: true });
      }

      if (action === 'set-leader') {
        if (!body.leaderId) return jsonError(res, 400, 'leaderId is required');
        const { data, error } = await admin
          .from('concilium_teams')
          .update({ leader_id: body.leaderId, updated_at: new Date().toISOString() })
          .eq('id', teamId)
          .eq('user_id', user.id)
          .select('*')
          .single();
        endTimer('teams:set-leader');
        if (error) return handleApiError(res, error, 'teams:set-leader');
        if (!data) return jsonError(res, 404, 'Team not found');
        return res.status(200).json({ team: data });
      }

      return jsonError(res, 400, `Invalid action: ${action}`);
    }

    // ── GET ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const id = req.query?.id;
      if (id) {
        const { data, error } = await admin
          .from('concilium_teams')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        endTimer('teams:get-one');
        if (error) return handleApiError(res, error, 'teams:get-one');
        if (!data) return jsonError(res, 404, 'Team not found');

        // Also fetch members
        const { data: members } = await admin
          .from('concilium_team_members')
          .select('*, member:concilium_members(*)')
          .eq('team_id', id)
          .eq('user_id', user.id);
        return res.status(200).json({ team: data, members: members || [] });
      }
      const { data, error } = await admin
        .from('concilium_teams')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      endTimer('teams:list');
      if (error) return handleApiError(res, error, 'teams:list');
      return res.status(200).json({ teams: data || [] });
    }

    // ── POST (create) ───────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return jsonError(res, 400, 'name is required');
      }
      const row = {
        user_id: user.id,
        name: body.name.trim(),
        description: body.description || '',
        leader_id: body.leaderId || null,
      };
      const { data, error } = await admin
        .from('concilium_teams')
        .insert(row)
        .select('*')
        .single();
      endTimer('teams:create');
      if (error) return handleApiError(res, error, 'teams:create');
      log.info('Team created', { teamId: data.id, userId: user.id });
      return res.status(201).json({ team: data });
    }

    // ── PUT (update) ────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const allowed = ['name', 'description', 'is_active', 'leader_id'];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return jsonError(res, 400, 'No valid fields');
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin
        .from('concilium_teams')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer('teams:update');
      if (error) return handleApiError(res, error, 'teams:update');
      if (!data) return jsonError(res, 404, 'Team not found');
      return res.status(200).json({ team: data });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const { error } = await admin
        .from('concilium_teams')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      endTimer('teams:delete');
      if (error) return handleApiError(res, error, 'teams:delete');
      return res.status(200).json({ deleted: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'teams');
  }
}
