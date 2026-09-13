/**
 * Tool setup handler — validate credentials and store/update tools.
 *
 * Routes:
 *   GET  /api/app?path=tool-setup&team=Development  — tool status for a team
 *   POST /api/app?path=tool-setup  { toolId, apiKey }  — validate & save credential
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
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { saveUserApiKey } from './_shared/save-user-api-key.js';
import { TOOL_PROVIDER_ALIAS } from '../security/provider-catalog.js';
import { reserveToolCredentialWrite } from './_shared/tool-credential-write-reservation.js';

const log = createLogger('tool-setup');

function credentialSlot(connectionType) {
  return connectionType === 'webhook' ? 'webhook_secret' : 'default';
}

/**
 * Validate an API credential by hitting the tool's test endpoint.
 */
async function testCredential(testEndpoint, apiKey) {
  if (!testEndpoint) return { valid: true, message: 'No test endpoint — assumed valid' };

  try {
    const res = await fetchWithRetry(
      testEndpoint,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      { timeoutMs: 6000, retries: 0 }
    );

    if (res.ok) {
      return { valid: true, status: res.status };
    }
    return { valid: false, status: res.status, message: `Provider returned ${res.status}` };
  } catch {
    return { valid: false, message: 'Credential validation request failed' };
  }
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  // ── Rate limit: 30 req / min ──────────────────────────────────
  const rlKey = `tool-setup:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);

  try {
    if (req.method === 'GET') {
      return await handleGetStatus(req, res, userClient, user, done);
    }
    if (req.method === 'POST') {
      return await handleSaveCredential(req, res, userClient, user, done);
    }
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'tool-setup');
  }
}

/**
 * GET — Return tool status for a team.
 * Each tool shows: id, name, configured (has apiKey), required, connectionType
 */
async function handleGetStatus(req, res, userClient, user, done) {
  const { data: tools, error } = await userClient
    .from('tools')
    .select('id, name, description, status, connection_type, data')
    .eq('user_id', user.id);

  if (error) {
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load tools');
  }

  const providerIds = new Set();
  for (const tool of tools || []) {
    providerIds.add(`tool:${tool.id}`);
    const alias = TOOL_PROVIDER_ALIAS[tool.id];
    if (alias) providerIds.add(alias);
  }
  let currentKeys = [];
  if (providerIds.size > 0) {
    const { data: rows, error: keyError } = await userClient
      .from('user_api_keys')
      .select('provider, slot')
      .eq('user_id', user.id)
      .eq('is_current', true)
      .in('provider', [...providerIds]);
    if (keyError) {
      log.warn(req, 'status.keys_unavailable', { toolCount: tools?.length || 0 });
    } else {
      currentKeys = rows || [];
    }
  }
  const configuredKeys = new Set(currentKeys.map((row) => `${row.provider}:${row.slot}`));
  const isConfigured = (tool) => {
    if (tool.connection_type === 'internal') return true;
    const slot = credentialSlot(tool.connection_type);
    if (configuredKeys.has(`tool:${tool.id}:${slot}`)) return true;
    const alias = TOOL_PROVIDER_ALIAS[tool.id];
    return slot === 'default' && !!alias && configuredKeys.has(`${alias}:default`);
  };

  const statuses = (tools || []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    connectionType: t.connection_type,
    status: t.status,
    configured: isConfigured(t),
    required: t.data?.required ?? false,
    credentials: (t.data?.credentials || []).map((c) => ({
      key: c.key,
      label: c.label,
      helpUrl: c.helpUrl,
      helpText: c.helpText,
      configured: isConfigured(t),
    })),
  }));

  done({ status: 200, toolCount: statuses.length });
  return res.status(200).json({ tools: statuses });
}

/**
 * POST — Validate and save an API credential for a tool.
 * Body: { toolId, apiKey?, webhookSecret?, testEndpoint? }
 */
async function handleSaveCredential(req, res, userClient, user, done) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return jsonError(res, 400, 'Invalid JSON');
    }
  }

  const { toolId } = body || {};
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  const webhookSecret = typeof body?.webhookSecret === 'string' ? body.webhookSecret.trim() : '';
  if (!toolId) return jsonError(res, 400, 'Missing toolId');
  if ((!apiKey && !webhookSecret) || (apiKey && webhookSecret)) {
    return jsonError(res, 400, 'Provide exactly one credential');
  }
  const credential = apiKey || webhookSecret;
  if (credential.length < 8) return jsonError(res, 400, 'Credential is too short');

  // Load the tool to get its test endpoint
  const { data: tool, error: loadErr } = await userClient
    .from('tools')
    .select('id, user_id, name, data, status, connection_type, updated_at')
    .eq('id', toolId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (loadErr) {
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load tool');
  }
  if (!tool) {
    done({ status: 404 });
    return jsonError(res, 404, 'Tool not found');
  }

  // Find the test endpoint from credentials config
  const credentials = tool.data?.credentials || [];
  const credDef = credentials[0]; // Primary credential
  const testEndpoint = body.testEndpoint || credDef?.testEndpoint || null;

  // Validate the credential
  const validation = apiKey
    ? await testCredential(testEndpoint, credential)
    : { valid: true, message: 'Webhook secret accepted' };

  if (!validation.valid) {
    done({ status: 400, valid: false });
    return res.status(400).json({
      success: false,
      error: 'Credential validation failed',
      message: validation.message,
      status: validation.status,
    });
  }

  // The encrypted BYOK row is authoritative. If encryption or Vault storage is
  // unavailable, fail the request and never fall back to tools.data.
  const admin = buildSupabaseAdminClient();
  if (!admin) {
    done({ status: 503, toolId });
    return jsonError(res, 503, 'Encrypted credential storage unavailable');
  }
  const reserved = await reserveToolCredentialWrite({
    admin,
    userId: user.id,
    toolSnapshot: tool,
    source: 'tool-setup',
  });
  if (!reserved.ok) {
    const status = reserved.status === 404 ? 404 : reserved.status === 409 ? 409 : 503;
    done({ status, toolId, code: reserved.code });
    return jsonError(res, status, reserved.message || 'Tool credential write unavailable');
  }

  const slot = webhookSecret ? 'webhook_secret' : 'default';
  const saved = await saveUserApiKey({
    userId: user.id,
    provider: `tool:${toolId}`,
    slot,
    label: tool.name,
    apiKey: credential,
    skipProbe: true, // API keys were validated above; webhook secrets have no probe.
    adminClient: admin,
    toolCredentialReservation: reserved.reservation,
  });
  if (!saved.success) {
    const status =
      saved.status === 409
        ? 409
        : ['BAD_INPUT', 'UNKNOWN_PROVIDER'].includes(saved.code)
          ? 400
          : 503;
    done({ status, toolId, code: saved.code });
    return jsonError(res, status, 'Failed to store encrypted credential');
  }

  log.info(req, 'credential.saved', { toolId, toolName: tool.name, slot });
  done({ status: 200, toolId });

  return res.status(200).json({
    success: true,
    toolId,
    toolName: tool.name,
    status: 'active',
    message: `${tool.name} credential verified and saved`,
  });
}
