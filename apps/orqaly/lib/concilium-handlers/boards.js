/**
 * Concilium boards handler: CRUD for v2 board configuration.
 * Supports GET (list / single), POST (create), PUT (update), DELETE.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { randomUUID } from 'node:crypto';
import { withAxwiseTracked, buildConsiliumCreateContext } from '../integrations/axwise/index.js';

const log = createLogger('concilium-boards');

// Orqaly enforces its own consensus-rules CHECK constraints; AxWise governance
// suggestions are only applied when they fall inside the allowed sets.
const AX_CONSENSUS_TYPES = new Set(['unanimous', 'majority', 'weighted', 'custom']);
const AX_SPLIT_STRATEGIES = new Set(['chairman_decides', 'reject', 'escalate_to_human', 're_evaluate']);

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

    if (req.method === 'GET') {
      const id = req.query?.id;
      if (id) {
        const { data, error } = await admin
          .from('concilium')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        endTimer('boards:get-one');
        if (error) return handleApiError(res, error, 'boards:get-one');
        if (!data) return jsonError(res, 404, 'Board not found');
        return res.status(200).json({ board: data });
      }
      const { data, error } = await admin
        .from('concilium')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      endTimer('boards:list');
      if (error) return handleApiError(res, error, 'boards:list');
      return res.status(200).json({ boards: data || [] });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const { name, purpose, description, security_level, approval_threshold, confidence_threshold } = body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return jsonError(res, 400, 'name is required');
      }

      // Advisory cognition from AxWise (shadow-safe: no-op unless AXWISE_ENABLE).
      // Local user-provided values always win over AxWise suggestions.
      const reqId = randomUUID();
      const tenant = { userId: user.id, orgId: body.orgId || body.org_id || null };
      const ax = await withAxwiseTracked(
        buildConsiliumCreateContext({ requestId: reqId, tenant, board: { name, purpose, description, security_level } }),
        () => ({ processedOutputs: {} }),
        { posture: 'open', admin, consiliumId: null },
      );
      const gov = (!ax.degraded && ax.processedOutputs?.governance) || {};

      const row = {
        id: `concilium-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user_id: user.id,
        name: name.trim(),
        purpose: purpose || '',
        description: description || '',
        security_level: security_level || 'standard',
        approval_threshold: approval_threshold ?? gov.approval_threshold ?? 0.60,
        confidence_threshold: confidence_threshold ?? gov.confidence_threshold ?? 0.70,
        axwise: ax.skipped ? null : { requestId: reqId, applicableConditions: ax.applicableConditions || [], processedOutputs: ax.processedOutputs || {} },
      };
      const { data, error } = await admin
        .from('concilium')
        .insert(row)
        .select('*')
        .single();
      endTimer('boards:create');
      if (error) return handleApiError(res, error, 'boards:create');

      // Seed governance consensus rules from AxWise when it supplied valid,
      // in-constraint values. Best-effort: board creation never fails on this.
      if (!ax.degraded && (gov.consensus_type || gov.quorum || gov.split_decision_strategy)) {
        try {
          const consensusRow = { user_id: user.id, concilium_id: data.id, updated_at: new Date().toISOString() };
          if (AX_CONSENSUS_TYPES.has(gov.consensus_type)) consensusRow.consensus_type = gov.consensus_type;
          if (Number.isInteger(gov.quorum) && gov.quorum > 0) consensusRow.quorum = gov.quorum;
          if (typeof gov.approval_threshold === 'number') consensusRow.approval_threshold = gov.approval_threshold;
          if (AX_SPLIT_STRATEGIES.has(gov.split_decision_strategy)) consensusRow.split_decision_strategy = gov.split_decision_strategy;
          await admin.from('concilium_consensus_rules').upsert(consensusRow, { onConflict: 'concilium_id' });
        } catch (e) {
          log.info('Board created: AxWise consensus seed skipped', { boardId: data.id, error: e?.message });
        }
      }

      log.info('Board created', { boardId: data.id, userId: user.id, axwise: !!row.axwise });
      return res.status(201).json({ board: data });
    }

    if (req.method === 'PUT') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const allowed = ['name', 'purpose', 'description', 'status', 'security_level',
        'approval_threshold', 'confidence_threshold', 'auto_quarantine_on_violation', 'quantity'];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return jsonError(res, 400, 'No valid fields to update');
      updates.updated_at = new Date().toISOString();

      const { data, error } = await admin
        .from('concilium')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer('boards:update');
      if (error) return handleApiError(res, error, 'boards:update');
      if (!data) return jsonError(res, 404, 'Board not found');
      log.info('Board updated', { boardId: id, userId: user.id, fields: Object.keys(updates) });
      return res.status(200).json({ board: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const { error } = await admin
        .from('concilium')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      endTimer('boards:delete');
      if (error) return handleApiError(res, error, 'boards:delete');
      log.info('Board deleted', { boardId: id, userId: user.id });
      return res.status(200).json({ deleted: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'boards');
  }
}
