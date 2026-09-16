/**
 * Replicators handler — multiplexes the replicator subroutes by sub-path.
 *
 * Routes:
 *   POST /api/app?path=replicators&sub=discover       { toolId }        -> DiscoveredEndpoint[]
 *   POST /api/app?path=replicators&sub=create         { blueprint }     -> { replicatorId }   [admin only]
 *   POST /api/app?path=replicators&sub=run-action     { phaseId, input } -> { status, output, runId, latency_ms, http_status? }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  buildSupabaseUserClient,
  buildSupabaseAdminClient,
} from '../../api/_lib/supabase-server.js';
import { isComposioConfigured } from '../composio/client.js';
import { executeComposioAction } from '../composio/executor.js';
import { introspectComposioApp } from '../replicator/introspect-composio.js';
import { introspectOpenApiJson } from '../replicator/introspect-openapi.js';
import { introspectManualRows } from '../replicator/introspect-manual.js';
import {
  validateExternalUrl,
  isAllowedContentType,
  MAX_OPENAPI_BYTES,
} from '../replicator/url-safety.js';
import { classifyFetchError, classifyHttpResponse } from '../replicator/error-classifier.js';

const log = createLogger('replicators');

const ADMIN_ROLE_IDS = new Set(['role-super-admin', 'role-manager']);

async function requireAdmin(userId) {
  const admin = buildSupabaseAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role_id ? ADMIN_ROLE_IDS.has(data.role_id) : false;
}

function classifyHttpError(httpStatus, errText) {
  if (httpStatus === 401 || httpStatus === 403) return 'auth_error';
  if (httpStatus === 429) return 'rate_limited';
  if (httpStatus >= 500) return 'server_error';
  if (httpStatus >= 400) return 'client_error';
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(errText || '')) return 'network_unreachable';
  if (/timeout/i.test(errText || '')) return 'timeout';
  return 'server_error';
}

async function handleDiscover(req, res, user, done) {
  const { toolId } = req.body || {};
  if (!toolId) {
    done({ status: 400 });
    return jsonError(res, 400, 'toolId is required');
  }
  const token = getBearerToken(req);
  const db = buildSupabaseUserClient(token);
  if (!db) {
    done({ status: 500 });
    return jsonError(res, 500, 'Supabase client unavailable');
  }
  const { data: tool, error: toolErr } = await db
    .from('tools')
    .select('id, user_id, connection_type, data')
    .eq('id', toolId)
    .maybeSingle();
  if (toolErr || !tool) {
    done({ status: 404 });
    return jsonError(res, 404, 'Tool not found');
  }
  if (tool.user_id !== user.id) {
    done({ status: 403 });
    return jsonError(res, 403, 'Not your tool');
  }

  if (tool.connection_type === 'composio') {
    if (!isComposioConfigured()) {
      done({ status: 503 });
      return jsonError(res, 503, 'Composio is not configured');
    }
    const appName = tool.data?.composioApp || tool.data?.app || toolId.replace(/^mcp-/, '');
    const endpoints = await introspectComposioApp(appName);
    done({ status: 200, count: endpoints.length });
    return res.status(200).json({ integrationType: 'composio', appName, endpoints });
  }

  if (tool.connection_type === 'api') {
    const source = String(req.body?.source || '').toLowerCase();
    const payload = req.body?.payload;
    try {
      if (source === 'openapi') {
        const endpoints = introspectOpenApiJson(payload);
        done({ status: 200, count: endpoints.length });
        return res.status(200).json({ integrationType: 'api', source: 'openapi', endpoints });
      }
      if (source === 'url') {
        const allowLocalhost = !!req.body?.allowLocalhost;
        const check = validateExternalUrl(payload, { allowLocalhost });
        if (!check.ok) {
          done({ status: 400, reason: check.reason });
          return jsonError(res, 400, check.reason);
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        let fetchRes;
        try {
          fetchRes = await fetch(check.url, {
            method: 'GET',
            headers: { accept: 'application/json' },
            signal: ctrl.signal,
          });
        } catch (err) {
          clearTimeout(timer);
          done({ status: 502, error: err.message });
          return jsonError(res, 502, `Fetch failed: ${err.message}`);
        }
        clearTimeout(timer);
        if (!fetchRes.ok) {
          done({ status: 502, httpStatus: fetchRes.status });
          return jsonError(res, 502, `Remote returned ${fetchRes.status}`);
        }
        const ct = fetchRes.headers.get('content-type');
        if (!isAllowedContentType(ct)) {
          done({ status: 415, contentType: ct });
          return jsonError(res, 415, `Unsupported content-type: ${ct || 'unknown'}`);
        }
        const buf = await fetchRes.arrayBuffer();
        if (buf.byteLength > MAX_OPENAPI_BYTES) {
          done({ status: 413 });
          return jsonError(res, 413, 'OpenAPI document is too large (max 2MB).');
        }
        const text = new TextDecoder().decode(buf);
        const endpoints = introspectOpenApiJson(text);
        done({ status: 200, count: endpoints.length });
        return res.status(200).json({ integrationType: 'api', source: 'url', endpoints });
      }
      if (source === 'manual') {
        const endpoints = introspectManualRows(Array.isArray(payload) ? payload : []);
        done({ status: 200, count: endpoints.length });
        return res.status(200).json({ integrationType: 'api', source: 'manual', endpoints });
      }
      done({ status: 400 });
      return jsonError(res, 400, `Unsupported discovery source: ${source || '(empty)'}`);
    } catch (err) {
      done({ status: 400, error: err.message });
      return jsonError(res, 400, err.message);
    }
  }

  // Other integration types (mcp/webhook/sdk) land in the next pass.
  done({ status: 400 });
  return jsonError(res, 400, `Discovery for ${tool.connection_type} is not yet implemented`);
}

async function handleCreate(req, res, user, done) {
  const isAdmin = await requireAdmin(user.id);
  if (!isAdmin) {
    done({ status: 403 });
    return jsonError(res, 403, 'Admin role required to create replicators');
  }
  const { blueprint } = req.body || {};
  if (!blueprint || !blueprint.slug || !blueprint.source_tool_id) {
    done({ status: 400 });
    return jsonError(res, 400, 'blueprint.slug and blueprint.source_tool_id are required');
  }
  const token = getBearerToken(req);
  const db = buildSupabaseUserClient(token);
  if (!db) {
    done({ status: 500 });
    return jsonError(res, 500, 'Supabase client unavailable');
  }

  const { data: replicator, error: insertErr } = await db
    .from('replicators')
    .insert({
      user_id: user.id,
      source_tool_id: blueprint.source_tool_id,
      slug: blueprint.slug,
      display_name: blueprint.display_name || blueprint.slug,
      icon_name: blueprint.icon_name || null,
      icon_url: blueprint.icon_url || null,
      integration_type: blueprint.integration_type,
      status: blueprint.status || 'active',
      docs_source: blueprint.docs_source || {},
    })
    .select('id')
    .single();
  if (insertErr) {
    done({ status: 400, error: insertErr.message });
    return jsonError(res, 400, insertErr.message);
  }
  const replicatorId = replicator.id;

  const pages = Array.isArray(blueprint.pages) ? blueprint.pages : [];
  for (let pi = 0; pi < pages.length; pi += 1) {
    const page = pages[pi];
    const { data: pageRow, error: pageErr } = await db
      .from('replicator_pages')
      .insert({
        replicator_id: replicatorId,
        slug: page.slug,
        title: page.title,
        description: page.description || null,
        position: pi,
      })
      .select('id')
      .single();
    if (pageErr) {
      done({ status: 400, error: pageErr.message });
      return jsonError(res, 400, `Page insert failed: ${pageErr.message}`);
    }
    const phases = Array.isArray(page.phases) ? page.phases : [];
    for (let phi = 0; phi < phases.length; phi += 1) {
      const phase = phases[phi];
      const { error: phaseErr } = await db.from('replicator_phases').insert({
        page_id: pageRow.id,
        position: phi,
        name: phase.name,
        description: phase.description || null,
        action_kind: phase.action_kind,
        action_config: phase.action_config || {},
        input_schema: phase.input_schema || {},
        output_hint: phase.output_hint || {},
        timeout_ms: phase.timeout_ms || 30000,
        docs_excerpt: phase.docs_excerpt || null,
      });
      if (phaseErr) {
        done({ status: 400, error: phaseErr.message });
        return jsonError(res, 400, `Phase insert failed: ${phaseErr.message}`);
      }
    }
  }

  done({ status: 200, replicatorId });
  return res.status(200).json({ replicatorId });
}

async function handleRunAction(req, res, user, done) {
  const { phaseId, input } = req.body || {};
  if (!phaseId) {
    done({ status: 400 });
    return jsonError(res, 400, 'phaseId is required');
  }
  const token = getBearerToken(req);
  const db = buildSupabaseUserClient(token);
  if (!db) {
    done({ status: 500 });
    return jsonError(res, 500, 'Supabase client unavailable');
  }

  const { data: phase, error: phaseErr } = await db
    .from('replicator_phases')
    .select(
      'id, page_id, name, action_kind, action_config, timeout_ms, replicator_pages!inner(replicator_id, replicators!inner(id, user_id, source_tool_id, integration_type))'
    )
    .eq('id', phaseId)
    .maybeSingle();
  if (phaseErr || !phase) {
    done({ status: 404 });
    return jsonError(res, 404, 'Phase not found');
  }
  const replicator = phase.replicator_pages?.replicators;
  if (!replicator || replicator.user_id !== user.id) {
    done({ status: 403 });
    return jsonError(res, 403, 'Not your replicator');
  }

  const start = Date.now();
  let status = 'success';
  let errorClass = null;
  let errorMessage = null;
  let httpStatus = null;
  let requestUrl = null;
  let output = null;

  try {
    if (phase.action_kind === 'composio_action') {
      const actionName = phase.action_config?.actionName;
      if (!actionName) throw new Error('Missing actionName in action_config');
      const r = await executeComposioAction(actionName, input || {}, user.id);
      if (!r.success) {
        status = 'error';
        errorMessage = r.error || 'Composio action failed';
        errorClass = classifyHttpError(500, errorMessage);
      } else {
        output = tryParseJson(r.result);
      }
    } else if (phase.action_kind === 'http') {
      const httpResult = await executeHttp({
        db,
        toolId: replicator.source_tool_id,
        userId: user.id,
        actionConfig: phase.action_config,
        input: input || {},
        timeoutMs: phase.timeout_ms || 30000,
      });
      status = httpResult.status;
      errorClass = httpResult.errorClass;
      errorMessage = httpResult.errorMessage;
      httpStatus = httpResult.httpStatus;
      requestUrl = httpResult.requestUrl;
      output = httpResult.output;
    } else {
      throw new Error(`action_kind ${phase.action_kind} is not yet implemented`);
    }
  } catch (err) {
    status = 'error';
    errorMessage = err.message || String(err);
    errorClass = classifyHttpError(null, errorMessage);
  }

  const latency = Date.now() - start;
  const { data: run } = await db
    .from('replicator_runs')
    .insert({
      phase_id: phase.id,
      user_id: user.id,
      input_json: input || {},
      output_json: output,
      status,
      error_class: errorClass,
      error_message: errorMessage,
      http_status: httpStatus,
      latency_ms: latency,
      duration_ms: latency,
      request_url: requestUrl,
    })
    .select('id')
    .single();

  done({ status: 200, runStatus: status, latency });
  return res.status(200).json({
    runId: run?.id || null,
    status,
    errorClass,
    errorMessage,
    httpStatus,
    requestUrl,
    latencyMs: latency,
    output,
  });
}

async function executeHttp({ db, toolId, userId, actionConfig, input, timeoutMs }) {
  const { data: tool } = await db
    .from('tools')
    .select('id, user_id, data, connection_type')
    .eq('id', toolId)
    .maybeSingle();
  if (!tool || tool.user_id !== userId) {
    return {
      status: 'error',
      errorClass: 'client_error',
      errorMessage: 'Source tool not found.',
      httpStatus: null,
      requestUrl: null,
      output: null,
    };
  }
  const baseUrl = String(tool.data?.url || '').replace(/\/+$/, '');
  if (!baseUrl) {
    return {
      status: 'error',
      errorClass: 'client_error',
      errorMessage: 'Source tool has no base URL configured.',
      httpStatus: null,
      requestUrl: null,
      output: null,
    };
  }

  const method = String(actionConfig?.method || 'GET').toUpperCase();
  const pathTemplate = String(actionConfig?.path || '');
  const paramLocations = actionConfig?.paramLocations || {};

  // Partition inputs by location.
  const pathParams = {};
  const queryParams = {};
  const headerParams = {};
  const bodyParams = {};
  for (const [k, v] of Object.entries(input || {})) {
    const loc = paramLocations[k] || (pathTemplate.includes(`{${k}}`) ? 'path' : 'query');
    if (loc === 'path') pathParams[k] = v;
    else if (loc === 'header') headerParams[k] = v;
    else if (loc === 'body') bodyParams[k] = v;
    else queryParams[k] = v;
  }

  let path = pathTemplate;
  for (const [k, v] of Object.entries(pathParams)) {
    path = path.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(String(v ?? '')));
  }

  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }

  const headers = { accept: 'application/json', ...(tool.data?.apiHeaders || {}), ...headerParams };
  // Never read legacy plaintext credentials from tools.data. Authenticated
  // replicator actions remain fail-closed until their destination-scoped Vault
  // consent flow can authorize releasing a credential to this endpoint.
  let body;
  if (['POST', 'PUT', 'PATCH'].includes(method) && Object.keys(bodyParams).length > 0) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    body = JSON.stringify(bodyParams);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const requestUrl = url.toString();
  let output = null;
  try {
    const r = await fetch(requestUrl, { method, headers, body, signal: ctrl.signal });
    clearTimeout(timer);
    const text = await r.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    const responseErrClass = classifyHttpResponse(r.status, text);
    if (responseErrClass) {
      return {
        status: 'error',
        errorClass: responseErrClass,
        errorMessage:
          typeof parsed === 'string'
            ? parsed.slice(0, 500)
            : parsed?.message || parsed?.error || `HTTP ${r.status}`,
        httpStatus: r.status,
        requestUrl,
        output: parsed,
      };
    }
    output = parsed;
    return {
      status: 'success',
      errorClass: null,
      errorMessage: null,
      httpStatus: r.status,
      requestUrl,
      output,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      status: err?.name === 'AbortError' ? 'timeout' : 'error',
      errorClass: classifyFetchError(err),
      errorMessage: err.message || String(err),
      httpStatus: null,
      requestUrl,
      output: null,
    };
  }
}

function tryParseJson(v) {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rlKey = `replicators:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  if (req.method !== 'POST') {
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  }

  const sub = (req.query?.sub || '').trim().toLowerCase();
  if (sub === 'discover') return handleDiscover(req, res, user, done);
  if (sub === 'create') return handleCreate(req, res, user, done);
  if (sub === 'run-action') return handleRunAction(req, res, user, done);

  done({ status: 404 });
  return jsonError(res, 404, `Unknown sub-route: ${sub}`);
}
