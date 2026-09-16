/**
 * Workflows handler — CRUD for workflows table.
 * GET/POST/PUT/DELETE /api/app?path=workflows
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  buildSupabaseAdminClient,
  buildSupabaseUserClient,
} from '../../api/_lib/supabase-server.js';
import { enqueueAgentJob } from '../goal-handlers/_helpers.js';
import { checkQuotas } from '../security/user-quotas.js';
import { normalizeWorkflowTriggerData } from '../workflow-engine/runner.js';

const log = createLogger('workflows');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  }

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
  }

  // ── Rate limit: 30 / min ──────────────────────────────────────
  const rlKey = `workflows:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded. Please retry shortly.');
  }

  try {
    const client = buildSupabaseUserClient(token);
    if (!client) {
      done({ status: 503 });
      return jsonError(res, 503, 'Database not configured');
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.searchParams.get('id');
    const action = url.searchParams.get('action');

    if (req.method === 'POST' && action === 'execute') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const workflowId = typeof body.workflowId === 'string' ? body.workflowId.trim() : '';
      if (!workflowId) {
        done({ status: 400 });
        return jsonError(res, 400, 'workflowId is required');
      }
      const admin = buildSupabaseAdminClient();
      if (!admin) {
        done({ status: 503 });
        return jsonError(res, 503, 'Agent jobs not configured');
      }
      const { data: workflow, error: workflowError } = await admin
        .from('workflows')
        .select('id, user_id')
        .eq('id', workflowId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (workflowError) throw workflowError;
      if (!workflow) {
        done({ status: 404 });
        return jsonError(res, 404, 'Workflow not found');
      }

      let triggerData;
      try {
        triggerData = normalizeWorkflowTriggerData(body.triggerData);
      } catch (triggerError) {
        done({ status: 400 });
        return jsonError(res, 400, triggerError.message);
      }
      if (triggerData.goalId) {
        const { data: goal, error: goalError } = await admin
          .from('goals')
          .select('id')
          .eq('id', triggerData.goalId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (goalError) throw goalError;
        if (!goal) {
          done({ status: 404 });
          return jsonError(res, 404, 'Workflow goal not found');
        }
      }
      const quota = await checkQuotas(admin, user.id, { jobType: 'execute-workflow' });
      if (!quota.allowed) {
        done({ status: 429 });
        return res.status(429).json({
          error: quota.message,
          code: quota.code,
          quotas: quota.quotas,
          usage: quota.usage,
        });
      }
      const job = await enqueueAgentJob(admin, {
        user_id: user.id,
        payload: {
          type: 'execute-workflow',
          workflowId: workflow.id,
          triggerData,
          _userId: user.id,
          userId: user.id,
          user_id: user.id,
          _ts: Date.now(),
        },
      });
      done({ status: 202 });
      return res.status(202).json({
        job_id: job.id,
        status: job.status,
        created_at: job.created_at || null,
      });
    }

    // ── GET ────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (id) {
        const { data, error } = await client
          .from('workflows')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) {
          done({ status: 500 });
          return jsonError(res, 500, 'Database error');
        }
        if (!data) {
          done({ status: 404 });
          return jsonError(res, 404, 'Workflow not found');
        }
        done({ status: 200 });
        return res.status(200).json({ workflow: data });
      }
      const { data, error } = await client
        .from('workflows')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, 'Database error');
      }
      done({ status: 200 });
      return res.status(200).json({ workflows: data || [] });
    }

    // ── POST ───────────────────────────────────────────────────
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return jsonError(res, 400, 'Invalid JSON body');
        }
      }
      body = body || {};
      const { name, data: wfData, enabled } = body;
      if (!name) {
        done({ status: 400 });
        return jsonError(res, 400, 'name is required');
      }
      const row = {
        id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: user.id,
        name,
        data: wfData || {},
        enabled: enabled !== undefined ? enabled : true,
      };
      const { data, error } = await client.from('workflows').insert(row).select().single();
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, error.message || 'Failed to create workflow');
      }
      done({ status: 201 });
      return res.status(201).json({ workflow: data });
    }

    // ── PUT ────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      if (!id) {
        done({ status: 400 });
        return jsonError(res, 400, 'id query param is required');
      }
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return jsonError(res, 400, 'Invalid JSON body');
        }
      }
      body = body || {};
      const allowed = ['name', 'data', 'enabled'];
      const patch = {};
      for (const k of allowed) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (Object.keys(patch).length === 0) {
        done({ status: 400 });
        return jsonError(res, 400, 'No valid fields to update');
      }
      patch.updated_at = new Date().toISOString();
      const { data, error } = await client
        .from('workflows')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, error.message || 'Failed to update workflow');
      }
      if (!data) {
        done({ status: 404 });
        return jsonError(res, 404, 'Workflow not found');
      }
      done({ status: 200 });
      return res.status(200).json({ workflow: data });
    }

    // ── DELETE ─────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!id) {
        done({ status: 400 });
        return jsonError(res, 400, 'id query param is required');
      }
      const { error } = await client.from('workflows').delete().eq('id', id);
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, error.message || 'Failed to delete workflow');
      }
      done({ status: 200 });
      return res.status(200).json({ deleted: true });
    }
  } catch (err) {
    log.error(req, 'unhandled', err);
    done({ status: 500 });
    return handleApiError(res, err, 'workflows');
  }
}
