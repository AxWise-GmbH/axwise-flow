/**
 * Concilium criteria handler: CRUD for evaluation criteria with versioning.
 * GET ?conciliumId= (list), GET ?id= (single), POST, PUT, DELETE.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-criteria');

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

    // ── GET ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const id = req.query?.id;
      if (id) {
        const { data, error } = await admin
          .from('concilium_criteria')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        endTimer('criteria:get-one');
        if (error) return handleApiError(res, error, 'criteria:get-one');
        if (!data) return jsonError(res, 404, 'Criterion not found');
        return res.status(200).json({ criterion: data });
      }
      const conciliumId = req.query?.conciliumId;
      if (!conciliumId) return jsonError(res, 400, 'conciliumId query param required');
      const { data, error } = await admin
        .from('concilium_criteria')
        .select('*')
        .eq('concilium_id', conciliumId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      endTimer('criteria:list');
      if (error) return handleApiError(res, error, 'criteria:list');
      return res.status(200).json({ criteria: data || [] });
    }

    // ── POST (create) ───────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const { conciliumId, name, weight, rubric, examples, sort_order } = body;
      if (!conciliumId) return jsonError(res, 400, 'conciliumId is required');
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return jsonError(res, 400, 'name is required');
      }
      if (weight !== undefined && (weight < 0 || weight > 1)) {
        return jsonError(res, 400, 'weight must be between 0 and 1');
      }

      // Verify board ownership
      const { data: board, error: boardErr } = await admin
        .from('concilium')
        .select('id')
        .eq('id', conciliumId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (boardErr) return handleApiError(res, boardErr, 'criteria:verify-board');
      if (!board) return jsonError(res, 404, 'Board not found');

      const row = {
        user_id: user.id,
        concilium_id: conciliumId,
        name: name.trim(),
        weight: weight ?? 1.00,
        rubric: rubric || '',
        examples: Array.isArray(examples) ? examples : [],
        sort_order: sort_order ?? 0,
      };
      const { data, error } = await admin
        .from('concilium_criteria')
        .insert(row)
        .select('*')
        .single();
      endTimer('criteria:create');
      if (error) return handleApiError(res, error, 'criteria:create');
      log.info('Criterion created', { criterionId: data.id, boardId: conciliumId, userId: user.id });
      return res.status(201).json({ criterion: data });
    }

    // ── PUT (update) — creates new version when rubric changes ──────
    if (req.method === 'PUT') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const allowed = ['name', 'weight', 'rubric', 'examples', 'sort_order', 'is_active'];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (updates.weight !== undefined && (updates.weight < 0 || updates.weight > 1)) {
        return jsonError(res, 400, 'weight must be between 0 and 1');
      }
      if (Object.keys(updates).length === 0) return jsonError(res, 400, 'No valid fields to update');

      // If rubric changed, increment version
      if (updates.rubric !== undefined) {
        const { data: current } = await admin
          .from('concilium_criteria')
          .select('version')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (current) updates.version = (current.version || 1) + 1;
      }

      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin
        .from('concilium_criteria')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer('criteria:update');
      if (error) return handleApiError(res, error, 'criteria:update');
      if (!data) return jsonError(res, 404, 'Criterion not found');
      log.info('Criterion updated', { criterionId: id, userId: user.id, fields: Object.keys(updates) });
      return res.status(200).json({ criterion: data });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const { error } = await admin
        .from('concilium_criteria')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      endTimer('criteria:delete');
      if (error) return handleApiError(res, error, 'criteria:delete');
      log.info('Criterion deleted', { criterionId: id, userId: user.id });
      return res.status(200).json({ deleted: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'criteria');
  }
}
