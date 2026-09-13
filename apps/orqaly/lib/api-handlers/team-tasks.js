/**
 * Team tasks handler — CRUD for team_tasks table.
 * GET/POST/PUT/DELETE /api/app?path=team-tasks
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
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('team-tasks');

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
  const rlKey = `team-tasks:${getRateLimitIdentifier(req, user.id)}`;
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

    // ── GET ────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (id) {
        const { data, error } = await client
          .from('team_tasks')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) {
          done({ status: 500 });
          return jsonError(res, 500, 'Database error');
        }
        if (!data) {
          done({ status: 404 });
          return jsonError(res, 404, 'Task not found');
        }
        done({ status: 200 });
        return res.status(200).json({ task: data });
      }
      let query = client
        .from('team_tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const status = url.searchParams.get('status');
      const assignedTo = url.searchParams.get('assigned_to');
      const agentId = url.searchParams.get('agent_id');
      const jobPoolId = url.searchParams.get('job_pool_id');
      if (status) query = query.eq('status', status);
      if (assignedTo) query = query.eq('assigned_to', assignedTo);
      if (agentId) query = query.eq('agent_id', agentId);
      if (jobPoolId) query = query.eq('job_pool_id', jobPoolId);
      const { data, error } = await query.limit(100);
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, 'Database error');
      }
      done({ status: 200 });
      return res.status(200).json({ tasks: data || [] });
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
      const {
        title,
        description,
        priority,
        status,
        assigned_to,
        deadline,
        estimate,
        job_pool_id,
        category,
        agent_id,
      } = body;
      if (!title) {
        done({ status: 400 });
        return jsonError(res, 400, 'title is required');
      }
      const row = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        ...(description && { description }),
        ...(priority && { priority }),
        ...(status && { status }),
        ...(assigned_to && { assigned_to }),
        ...(deadline && { deadline }),
        ...(estimate && { estimate }),
        ...(job_pool_id && { job_pool_id }),
        ...(category && { category }),
        ...(agent_id && { agent_id }),
        // Last, so a body-supplied user_id cannot spoof the owner.
        user_id: user.id,
      };
      const { data, error } = await client.from('team_tasks').insert(row).select().single();
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, error.message || 'Failed to create task');
      }
      done({ status: 201 });
      return res.status(201).json({ task: data });
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
      const allowed = [
        'title',
        'description',
        'priority',
        'status',
        'assigned_to',
        'deadline',
        'estimate',
        'data',
        'job_pool_id',
        'category',
        'agent_id',
      ];
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
        .from('team_tasks')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, error.message || 'Failed to update task');
      }
      if (!data) {
        done({ status: 404 });
        return jsonError(res, 404, 'Task not found');
      }
      done({ status: 200 });
      return res.status(200).json({ task: data });
    }

    // ── DELETE ─────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!id) {
        done({ status: 400 });
        return jsonError(res, 400, 'id query param is required');
      }
      const { error } = await client
        .from('team_tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) {
        done({ status: 500 });
        return jsonError(res, 500, error.message || 'Failed to delete task');
      }
      done({ status: 200 });
      return res.status(200).json({ deleted: true });
    }
  } catch (err) {
    log.error(req, 'unhandled', err);
    done({ status: 500 });
    return handleApiError(res, err, 'team-tasks');
  }
}
