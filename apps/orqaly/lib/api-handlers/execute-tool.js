/**
 * Execute tool handler — runs a connected tool using its stored credentials.
 * POST /api/execute-tool  { toolId, payload? }
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
import { executeApiTool } from '../tool-executors/api-executor.js';
import { executeWebhookTool } from '../tool-executors/webhook-executor.js';
import { resolveUserKey } from '../security/resolve-user-key.js';
import { resolveToolCredential } from '../agent-handlers/tool-credentials.js';
import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';

const log = createLogger('execute-tool');

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

  // ── Rate limit: 30 executions / min ───────────────────────────
  const rlKey = `execute-tool:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded. Please retry shortly.');
  }

  try {
    // ── Parse body ──────────────────────────────────────────────
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return jsonError(res, 400, 'Invalid JSON body');
      }
    }
    body = body || {};

    const { toolId, payload } = body;
    if (!toolId) {
      done({ status: 400 });
      return jsonError(res, 400, 'toolId is required');
    }

    // ── Load tool (user-scoped) ─────────────────────────────────
    const userClient = buildSupabaseUserClient(token);
    const { data: tool, error: toolErr } = await userClient
      .from('tools')
      .select('*')
      .eq('id', toolId)
      .maybeSingle();

    if (toolErr) {
      done({ status: 500 });
      return jsonError(res, 500, 'Failed to load tool');
    }
    if (!tool) {
      done({ status: 404 });
      return jsonError(res, 404, 'Tool not found');
    }

    // Resolve the credential exactly the way an agent would, so this button and
    // the autonomous path can never disagree about whether a tool is configured.
    // Precedence lives in one place: encrypted tool:<id> -> catalog alias.
    // Plaintext fields in tools.data are never a credential source.
    let effectiveCredential = '';
    try {
      const def = PREDEFINED_TOOLS.find((d) => d.id === toolId);
      if (def) {
        const cred = await resolveToolCredential({ def, userId: user.id });
        effectiveCredential = cred.apiKey || '';
      } else {
        // Custom Tool-Hub tool: no catalog def, so no alias to consult.
        const resolved = await resolveUserKey({
          userId: user.id,
          provider: `tool:${toolId}`,
          slot: tool.connection_type === 'webhook' ? 'webhook_secret' : 'default',
          reason: 'execute-tool',
        });
        effectiveCredential = (resolved.source === 'user' && resolved.key) || '';
      }
    } catch (err) {
      log.warn(req, 'resolve.error', { toolId, err: err.message });
      effectiveCredential = '';
    }

    // Map DB row to tool object (data JSONB spread)
    const toolObj = {
      id: tool.id,
      name: tool.name,
      connectionType: tool.connection_type,
      url: tool.data?.url || '',
      apiKey: tool.connection_type === 'api' ? effectiveCredential : '',
      apiHeaders: tool.data?.apiHeaders || '',
      apiMethod: tool.data?.apiMethod || 'POST',
      webhookSecret: tool.connection_type === 'webhook' ? effectiveCredential : '',
      webhookEvents: tool.data?.webhookEvents || '',
      sdkPackage: tool.data?.sdkPackage || '',
      sdkVersion: tool.data?.sdkVersion || '',
      modulePath: tool.data?.modulePath || '',
      entryFunction: tool.data?.entryFunction || '',
    };

    const connType = toolObj.connectionType || 'internal';

    // ── Execute based on connection type ────────────────────────
    let result;
    const execStart = Date.now();

    if (connType === 'api') {
      result = await executeApiTool(toolObj, { payload });
    } else if (connType === 'webhook') {
      result = await executeWebhookTool(toolObj, { payload });
    } else {
      // SDK and Internal not supported in serverless
      result = {
        status: 200,
        statusText: 'stub',
        body: {
          message: `${connType.toUpperCase()} tools run within the platform runtime. Execution is handled internally.`,
        },
        durationMs: 0,
      };
    }

    const durationMs = Date.now() - execStart;
    const execStatus = result.status >= 200 && result.status < 400 ? 'success' : 'failed';

    // ── Record execution (admin client bypasses RLS) ────────────
    const admin = buildSupabaseAdminClient();
    await admin
      .from('tool_executions')
      .insert({
        user_id: user.id,
        tool_id: toolId,
        tool_name: toolObj.name,
        connection_type: connType,
        status: execStatus,
        request_summary: {
          method: toolObj.apiMethod || 'POST',
          url: toolObj.url,
          hasPayload: !!payload,
        },
        response_summary: {
          status: result.status,
          statusText: result.statusText,
          bodyPreview:
            typeof result.body === 'string'
              ? result.body.slice(0, 500)
              : JSON.stringify(result.body).slice(0, 500),
        },
        error: execStatus === 'failed' ? `HTTP ${result.status} ${result.statusText}` : null,
        duration_ms: result.durationMs || durationMs,
      })
      .catch((err) => {
        log.warn(req, 'execution.log.failed', { error: err.message });
      });

    done({ status: 200, tool_id: toolId, exec_status: execStatus });
    return res.status(200).json({
      success: execStatus === 'success',
      result: {
        status: result.status,
        statusText: result.statusText,
        body: result.body,
        durationMs: result.durationMs || durationMs,
      },
    });
  } catch (err) {
    log.error(req, 'unhandled', err);
    done({ status: 500 });
    return handleApiError(res, err, 'execute-tool');
  }
}
