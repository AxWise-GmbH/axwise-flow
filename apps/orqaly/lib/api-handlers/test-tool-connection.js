/**
 * Test tool connection handler — verifies reachability without full execution.
 * POST /api/test-tool-connection  { toolId } or { connectionType, url, apiKey?, ... }
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
import { testApiConnection } from '../tool-executors/api-executor.js';
import { testWebhookConnection } from '../tool-executors/webhook-executor.js';
import { resolveUserKey } from '../security/resolve-user-key.js';

const log = createLogger('test-tool-connection');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  if (req.method !== 'POST') {
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

  // ── Rate limit: 20 tests / min ────────────────────────────────
  const rlKey = `test-tool:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded. Please retry shortly.');
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return jsonError(res, 400, 'Invalid JSON body');
      }
    }
    body = body || {};

    let toolObj;

    if (body.toolId) {
      // Load from DB
      const userClient = buildSupabaseUserClient(token);
      const { data: tool, error: toolErr } = await userClient
        .from('tools')
        .select('*')
        .eq('id', body.toolId)
        .maybeSingle();

      if (toolErr) {
        done({ status: 500 });
        return jsonError(res, 500, 'Failed to load tool');
      }
      if (!tool) {
        done({ status: 404 });
        return jsonError(res, 404, 'Tool not found');
      }

      const slot = tool.connection_type === 'webhook' ? 'webhook_secret' : 'default';
      const resolved = await resolveUserKey({
        userId: user.id,
        provider: `tool:${body.toolId}`,
        slot,
        reason: 'test-tool-connection',
      });

      toolObj = {
        connectionType: tool.connection_type,
        url: tool.data?.url || '',
        apiKey: tool.connection_type === 'api' ? resolved.key || '' : '',
        webhookSecret: tool.connection_type === 'webhook' ? resolved.key || '' : '',
      };
    } else if (body.connectionType && body.url) {
      // Test with inline values (before saving)
      toolObj = {
        connectionType: body.connectionType,
        url: body.url,
        apiKey: body.apiKey || '',
        webhookSecret: body.webhookSecret || '',
      };
    } else {
      done({ status: 400 });
      return jsonError(res, 400, 'Provide toolId or (connectionType + url)');
    }

    if (!toolObj.url) {
      done({ status: 400 });
      return jsonError(res, 400, 'Tool has no URL configured');
    }

    const connType = toolObj.connectionType || 'internal';
    let result;

    if (connType === 'api') {
      result = await testApiConnection(toolObj);
    } else if (connType === 'webhook') {
      const webhookResult = await testWebhookConnection(toolObj);
      result = {
        reachable: webhookResult.status >= 200 && webhookResult.status < 400,
        status: webhookResult.status,
        statusText: webhookResult.statusText,
        durationMs: webhookResult.durationMs,
      };
    } else {
      // SDK / Internal — can't test remotely
      result = {
        reachable: true,
        status: 200,
        statusText: 'internal',
        durationMs: 0,
        message: `${connType.toUpperCase()} connections are verified at platform runtime.`,
      };
    }

    done({ status: 200, connection_type: connType, reachable: result.reachable });
    return res.status(200).json({
      success: true,
      reachable: result.reachable,
      status: result.status,
      statusText: result.statusText,
      durationMs: result.durationMs,
      message: result.message || undefined,
    });
  } catch (err) {
    // Connection failure is expected — return structured error, not 500
    const isNetworkError =
      err.name === 'AbortError' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ENOTFOUND';

    if (isNetworkError) {
      done({ status: 200, reachable: false });
      return res.status(200).json({
        success: true,
        reachable: false,
        error: err.code || err.name || 'Connection failed',
        message: err.message,
      });
    }

    log.error(req, 'unhandled', err);
    done({ status: 500 });
    return handleApiError(res, err, 'test-tool-connection');
  }
}
