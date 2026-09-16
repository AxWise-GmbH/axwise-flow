/**
 * Concilium agents handler: AI agent lifecycle management.
 * GET (list/single), POST (register), PUT (update), DELETE (terminate).
 * POST ?action=accept/pause/resume/terminate for lifecycle transitions.
 * POST ?action=check-in for agent heartbeat with token verification.
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

const log = createLogger('concilium-agents');

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'cagt_';
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function buildInstructionPacket(agent) {
  return {
    platform: 'Orqaly',
    version: '1.0',
    rules: {
      task_manager:
        'Create subtasks via POST /api/app?path=tasks with fields: title, description, status, assignedAgentId. Always create a task before starting work.',
      reports:
        'Submit activity reports via POST /api/concilium?path=agent-reports with report_type: activity|completion|error. Include summary and details. Submit at minimum every check-in interval.',
      job_pool:
        'When assigned a job, update status to running immediately. On completion, set status to done with result. Never leave jobs running beyond max execution time.',
      tools:
        'Use only tools assigned to your board. Access registry via GET /api/app?path=tools. Log every tool invocation.',
      workflows:
        'For multi-step tasks, run an owned workflow via POST /api/app?path=workflows&action=execute with workflowId and triggerData. Do not attempt multi-step operations without a workflow.',
      projects:
        'When working on project-linked tasks, add progress notes via the task relatedProjects field. Do not modify project status directly.',
    },
    constraints: {
      max_requests_per_hour: agent.max_requests_per_hour || 60,
      max_cost_per_day_usd: Number.parseFloat(agent.max_cost_per_day_usd) || 5,
      check_in_interval_ms: agent.check_in_interval_ms || 300000,
      tracking_token: agent.tracking_token || null,
    },
  };
}

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

    // ── Lifecycle actions ────────────────────────────────────────────
    if (action && req.method === 'POST') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');

      const transitions = {
        accept: {
          status: 'accepted',
          fields: { accepted_at: new Date().toISOString(), tracking_token: generateToken() },
        },
        pause: { status: 'paused', fields: { paused_at: new Date().toISOString() } },
        resume: { status: 'active', fields: { paused_at: null } },
        terminate: { status: 'terminated', fields: { terminated_at: new Date().toISOString() } },
      };

      if (action === 'check-in') {
        const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
        const { data, error } = await admin
          .from('concilium_agents')
          .update({
            last_check_in: new Date().toISOString(),
            missed_check_ins: 0,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .select('*')
          .single();
        endTimer('agents:check-in');
        if (error) return handleApiError(res, error, 'agents:check-in');
        if (!data) return jsonError(res, 404, 'Agent not found');

        // Optionally insert a report
        if (body.summary || body.details) {
          await admin.from('concilium_agent_reports').insert({
            user_id: user.id,
            agent_id: id,
            board_id: data.board_id,
            report_type: 'check_in',
            summary: body.summary || '',
            details: body.details || {},
            requests_made: body.requests_made || 0,
            tokens_used: body.tokens_used || 0,
            cost_usd: body.cost_usd || 0,
            verified: true,
          });
        }
        return res.status(200).json({ agent: data });
      }

      const transition = transitions[action];
      if (!transition) return jsonError(res, 400, `Invalid action: ${action}`);

      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const updates = {
        status: transition.status,
        ...transition.fields,
        updated_at: new Date().toISOString(),
      };
      if (action === 'terminate' && body.reason) {
        updates.termination_reason = body.reason;
      }

      const { data, error } = await admin
        .from('concilium_agents')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer(`agents:${action}`);
      if (error) return handleApiError(res, error, `agents:${action}`);
      if (!data) return jsonError(res, 404, 'Agent not found');
      log.info(`Agent ${action}ed`, { agentId: id, userId: user.id });

      // On accept: build and store onboarding instruction packet
      if (action === 'accept') {
        const instructions = buildInstructionPacket(data);
        await admin
          .from('concilium_agents')
          .update({ metadata: instructions })
          .eq('id', id)
          .eq('user_id', user.id);
        return res.status(200).json({ agent: data, instructions });
      }

      return res.status(200).json({ agent: data });
    }

    // ── GET ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const id = req.query?.id;
      if (id) {
        const { data, error } = await admin
          .from('concilium_agents')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        endTimer('agents:get-one');
        if (error) return handleApiError(res, error, 'agents:get-one');
        if (!data) return jsonError(res, 404, 'Agent not found');
        return res.status(200).json({ agent: data });
      }
      const boardId = req.query?.boardId;
      let query = admin.from('concilium_agents').select('*').eq('user_id', user.id);
      if (boardId) query = query.eq('board_id', boardId);
      const { data, error } = await query.order('created_at', { ascending: false });
      endTimer('agents:list');
      if (error) return handleApiError(res, error, 'agents:list');
      return res.status(200).json({ agents: data || [] });
    }

    // ── POST (register) ─────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const {
        name,
        description,
        board_id,
        agent_type,
        check_in_interval_ms,
        max_requests_per_hour,
        max_cost_per_day_usd,
      } = body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return jsonError(res, 400, 'name is required');
      }
      const row = {
        user_id: user.id,
        name: name.trim(),
        description: description || '',
        board_id: board_id || null,
        agent_type: agent_type || 'external',
        check_in_interval_ms: check_in_interval_ms || 300000,
        max_requests_per_hour: max_requests_per_hour || 60,
        max_cost_per_day_usd: max_cost_per_day_usd || 5.0,
      };
      const { data, error } = await admin.from('concilium_agents').insert(row).select('*').single();
      endTimer('agents:register');
      if (error) return handleApiError(res, error, 'agents:register');
      log.info('Agent registered', { agentId: data.id, userId: user.id });
      return res.status(201).json({ agent: data });
    }

    // ── PUT (update) ────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const allowed = [
        'name',
        'description',
        'board_id',
        'check_in_interval_ms',
        'max_requests_per_hour',
        'max_cost_per_day_usd',
        'allowed_actions',
        'metadata',
      ];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return jsonError(res, 400, 'No valid fields');
      updates.updated_at = new Date().toISOString();

      const { data, error } = await admin
        .from('concilium_agents')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer('agents:update');
      if (error) return handleApiError(res, error, 'agents:update');
      if (!data) return jsonError(res, 404, 'Agent not found');
      return res.status(200).json({ agent: data });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');
      const { error } = await admin
        .from('concilium_agents')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      endTimer('agents:delete');
      if (error) return handleApiError(res, error, 'agents:delete');
      return res.status(200).json({ deleted: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'agents');
  }
}
