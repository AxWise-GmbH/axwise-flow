/**
 * Agent Blueprints CRUD handler.
 * GET (list/single), POST (create), PUT (update), DELETE.
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

const log = createLogger('agent-blueprints');

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
          .from('agent_blueprints')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        endTimer('blueprints:get-one');
        if (error) return handleApiError(res, error, 'blueprints:get-one');
        if (!data) return jsonError(res, 404, 'Blueprint not found');
        return res.status(200).json({ blueprint: data });
      }

      let query = admin.from('agent_blueprints').select('*').eq('user_id', user.id);
      const status = req.query?.status;
      if (status) query = query.eq('status', status);
      const category = req.query?.category;
      if (category) query = query.eq('category', category);
      if (req.query?.templates === 'true') query = query.eq('is_template', true);

      const { data, error } = await query.order('updated_at', { ascending: false });
      endTimer('blueprints:list');
      if (error) return handleApiError(res, error, 'blueprints:list');
      return res.status(200).json({ blueprints: data || [] });
    }

    // ── POST ────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const {
        name,
        description,
        category,
        system_prompt,
        provider,
        model,
        temperature,
        max_tokens,
        tools,
        constraints,
        workflow_id,
        is_template,
      } = body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return jsonError(res, 400, 'name is required');
      }
      if (!system_prompt || typeof system_prompt !== 'string' || system_prompt.trim().length < 10) {
        return jsonError(res, 400, 'system_prompt is required (min 10 chars)');
      }

      const row = {
        user_id: user.id,
        name: name.trim(),
        description: description || '',
        category: category || 'general',
        system_prompt: system_prompt.trim(),
        provider: provider || defaultProvider(),
        model: model || (provider ? '' : defaultModel()),
        temperature: temperature ?? 0.3,
        max_tokens: max_tokens || 3000,
        tools: tools || [],
        constraints: constraints || {},
        workflow_id: workflow_id || null,
        is_template: is_template || false,
        status: 'draft',
      };

      const { data, error } = await admin.from('agent_blueprints').insert(row).select('*').single();
      endTimer('blueprints:create');
      if (error) return handleApiError(res, error, 'blueprints:create');
      log.info('Blueprint created', { id: data.id, userId: user.id });
      return res.status(201).json({ blueprint: data });
    }

    // ── PUT ──────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');

      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const allowed = [
        'name',
        'description',
        'category',
        'system_prompt',
        'provider',
        'model',
        'temperature',
        'max_tokens',
        'tools',
        'constraints',
        'workflow_id',
        'is_template',
        'status',
      ];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return jsonError(res, 400, 'No valid fields');

      // Bump version on significant changes
      if (updates.system_prompt || updates.tools || updates.model || updates.provider) {
        const { data: current } = await admin
          .from('agent_blueprints')
          .select('version')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (current) updates.version = (current.version || 1) + 1;
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await admin
        .from('agent_blueprints')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer('blueprints:update');
      if (error) return handleApiError(res, error, 'blueprints:update');
      if (!data) return jsonError(res, 404, 'Blueprint not found');
      return res.status(200).json({ blueprint: data });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');

      const { error } = await admin
        .from('agent_blueprints')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      endTimer('blueprints:delete');
      if (error) return handleApiError(res, error, 'blueprints:delete');
      return res.status(200).json({ deleted: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'blueprints');
  }
}
