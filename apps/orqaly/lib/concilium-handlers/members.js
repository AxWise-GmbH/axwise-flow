/**
 * Concilium members handler: CRUD for board members + permissions + quarantine.
 * GET ?conciliumId= (list), GET ?id= (single), POST, PUT, DELETE.
 * POST ?action=quarantine&id= / POST ?action=unquarantine&id= for quarantine toggle.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';

const log = createLogger('concilium-members');

const VALID_PROVIDERS = ['groq', 'openai', 'anthropic', 'deepseek', 'glm', 'gemini'];
const VALID_ROLES = ['chairman', 'evaluator', 'auditor', 'specialist', 'observer'];

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

    // ── Quarantine actions ──────────────────────────────────────────
    const action = req.query?.action;
    if (action === 'quarantine' || action === 'unquarantine') {
      if (req.method !== 'POST') return jsonError(res, 405, 'POST required for quarantine actions');
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const isQuarantine = action === 'quarantine';
      const updates = {
        quarantined: isQuarantine,
        quarantine_reason: isQuarantine ? body.reason || 'Manual quarantine' : null,
        quarantined_at: isQuarantine ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin
        .from('concilium_members')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer(`members:${action}`);
      if (error) return handleApiError(res, error, `members:${action}`);
      if (!data) return jsonError(res, 404, 'Member not found');
      log.info(`Member ${action}d`, { memberId: id, userId: user.id });
      return res.status(200).json({ member: data });
    }

    // ── GET ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const id = req.query?.id;
      if (id) {
        const { data, error } = await admin
          .from('concilium_members')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        endTimer('members:get-one');
        if (error) return handleApiError(res, error, 'members:get-one');
        if (!data) return jsonError(res, 404, 'Member not found');
        return res.status(200).json({ member: data });
      }
      const conciliumId = req.query?.conciliumId;
      if (!conciliumId) return jsonError(res, 400, 'conciliumId query param required');
      const { data, error } = await admin
        .from('concilium_members')
        .select('*')
        .eq('concilium_id', conciliumId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      endTimer('members:list');
      if (error) return handleApiError(res, error, 'members:list');
      return res.status(200).json({ members: data || [] });
    }

    // ── POST (create) ───────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const {
        conciliumId,
        name,
        role,
        provider,
        model,
        resume,
        skills,
        comments,
        temperature,
        max_tokens,
      } = body;
      if (!conciliumId) return jsonError(res, 400, 'conciliumId is required');
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return jsonError(res, 400, 'name is required');
      }
      if (provider && !VALID_PROVIDERS.includes(provider)) {
        return jsonError(res, 400, `Invalid provider. Must be: ${VALID_PROVIDERS.join(', ')}`);
      }
      if (role && !VALID_ROLES.includes(role)) {
        return jsonError(res, 400, `Invalid role. Must be: ${VALID_ROLES.join(', ')}`);
      }

      // Verify board ownership
      const { data: board, error: boardErr } = await admin
        .from('concilium')
        .select('id')
        .eq('id', conciliumId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (boardErr) return handleApiError(res, boardErr, 'members:verify-board');
      if (!board) return jsonError(res, 404, 'Board not found');

      const row = {
        user_id: user.id,
        concilium_id: conciliumId,
        name: name.trim(),
        role: role || 'evaluator',
        provider: provider || defaultProvider(),
        model: model || (provider ? '' : defaultModel()),
        resume: resume || '',
        skills: Array.isArray(skills) ? skills : [],
        comments: Array.isArray(comments) ? comments : [],
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 4096,
      };
      const { data, error } = await admin
        .from('concilium_members')
        .insert(row)
        .select('*')
        .single();
      endTimer('members:create');
      if (error) return handleApiError(res, error, 'members:create');
      log.info('Member created', { memberId: data.id, boardId: conciliumId, userId: user.id });
      return res.status(201).json({ member: data });
    }

    // ── PUT (update) ────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const allowed = [
        'name',
        'role',
        'provider',
        'model',
        'resume',
        'skills',
        'comments',
        'temperature',
        'max_tokens',
        'active',
      ];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (updates.provider && !VALID_PROVIDERS.includes(updates.provider)) {
        return jsonError(res, 400, `Invalid provider. Must be: ${VALID_PROVIDERS.join(', ')}`);
      }
      if (updates.role && !VALID_ROLES.includes(updates.role)) {
        return jsonError(res, 400, `Invalid role. Must be: ${VALID_ROLES.join(', ')}`);
      }
      if (Object.keys(updates).length === 0)
        return jsonError(res, 400, 'No valid fields to update');
      updates.updated_at = new Date().toISOString();

      const { data, error } = await admin
        .from('concilium_members')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer('members:update');
      if (error) return handleApiError(res, error, 'members:update');
      if (!data) return jsonError(res, 404, 'Member not found');
      log.info('Member updated', { memberId: id, userId: user.id, fields: Object.keys(updates) });
      return res.status(200).json({ member: data });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const { error } = await admin
        .from('concilium_members')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      endTimer('members:delete');
      if (error) return handleApiError(res, error, 'members:delete');
      log.info('Member deleted', { memberId: id, userId: user.id });
      return res.status(200).json({ deleted: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'members');
  }
}
