/** Local benchmark adapter around the production router; credentials remain in memory. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createGooseProviderRouter } from '../../apps/orqaly/server/workflow-v2/goose-provider-http.js';
import { createDesktopDecisionService } from '../../apps/orqaly/server/workflow-v2/desktop-decision-service.js';
import { createEngineeringReviewService } from '../../apps/orqaly/server/workflow-v2/engineering-review-service.js';

const requireApp = createRequire(new URL('../../apps/orqaly/package.json', import.meta.url));
const express = requireApp('express');
export const BENCHMARK_MODEL = 'gemini-3.8-flash';
const GOOGLE_CHAT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const TYPESAFE_SYSTEM_ONE = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_CONFIG = '/Applications/Orqanix.app/Contents/Resources/orqaly-runtime/connector/production.config.example.json';
const MAX_JSON = 8 * 1024 * 1024;
const HASH = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code, status = 503) => Object.assign(new Error(code), { code, status });
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const safeCode = (value) => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : null;

function decisionMetadata(path, input, result) {
  const reason = safeCode(result.reason || result.review?.reason);
  return {
    decisionKind: ['lane_triage', 'message_disposition'].includes(input?.kind) ? input.kind : path === '/engineering/review' ? 'engineering_review' : null,
    enabledRequested: typeof input?.enabled === 'boolean' ? input.enabled : null,
    decision: ['quick_info', 'research', 'local_engineering', 'conversation', 'mixed', 'uncertain', 'steer', 'queue'].includes(result.decision) ? result.decision : null,
    reason,
    reviewStatus: ['passed', 'failed', 'not_evaluated'].includes(result.review?.status) ? result.review.status : null,
    advisory: typeof result.advisory === 'boolean' ? result.advisory : result.review?.advisory === true,
    responseModel: safeCode(result.provenance?.model || result.review?.model),
    providerReportedLatencyMs: finite(result.review?.latencyMs) ? result.review.latencyMs : null,
    evaluated: ['classified', 'low_confidence', 'advisory_review'].includes(reason),
  };
}

function numericUsage(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return null;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-z_]{1,64}$/.test(key)) continue;
    if (finite(item)) result[key] = item;
    else if (key.endsWith('_details')) { const child = numericUsage(item, depth + 1); if (child && Object.keys(child).length) result[key] = child; }
  }
  return Object.keys(result).length ? result : null;
}
export function classifyChatRequest(body) {
  return body?.response_format?.type === 'json_schema' && body?.response_format?.json_schema?.name === 'axwise_specialist_artifact'
    ? { source: 'axwise', attribution: 'axwise_specialist_artifact_schema' }
    : { source: 'primary', attribution: 'no_axwise_artifact_schema' };
}
function routeName(path) {
  return ['/session', '/models', '/chat/completions', '/decisions', '/engineering/review'].includes(path) ? path : '/other';
}
function safeLabel(label) {
  if (label !== null && (typeof label !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(label))) throw fail('INVALID_TRIAL_LABEL', 400);
  return label;
}
async function boundedJson(response, limit, signal) {
  if (!response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw fail('UPSTREAM_JSON_REQUIRED', 502);
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw fail('UPSTREAM_RESPONSE_TOO_LARGE', 502);
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { signal?.removeEventListener('abort', onAbort); reader.releaseLock(); }
}

/**
 * Uses the packaged connector's authenticated /session endpoint to verify the real
 * desktop OAuth bearer. No local token, synthetic user, or authentication bypass.
 * JEV uses the current production services when a Typesafe key is supplied, or
 * the signed-in deployed endpoint otherwise. This choice never changes on error.
 * Inference uses the production chat router and a relay-only Google credential.
 */
export async function startBenchmarkRelay({
  onEvent = () => {},
  connectorConfigPath = DEFAULT_CONFIG,
  environment = process.env,
  fetchImpl = fetch,
  port = 0,
  authCacheMs = 5000,
  upstreamTimeoutMs = 30000,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof onEvent !== 'function') throw fail('INVALID_RELAY_CALLBACK');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw fail('INVALID_RELAY_PORT');
  if (!Number.isInteger(authCacheMs) || authCacheMs < 0 || authCacheMs > 10000) throw fail('INVALID_AUTH_CACHE_TTL');
  if (!Number.isInteger(upstreamTimeoutMs) || upstreamTimeoutMs < 1 || upstreamTimeoutMs > 180000) throw fail('INVALID_UPSTREAM_TIMEOUT');
  if (environment.ORQALY_LOCAL_TEST_MODE === 'true' || environment.ORQALY_LOCAL_TEST_TOKEN) throw fail('SYNTHETIC_AUTH_FORBIDDEN');
  const apiKey = environment.GEMINI_API_KEY || environment.ORQALY_GOOSE_GEMINI_API_KEY;
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw fail('GEMINI_API_KEY_REQUIRED');
  const typesafeKey = environment.TYPESAFE_API_KEY;
  if (typesafeKey !== undefined && (typeof typesafeKey !== 'string' || !typesafeKey.trim() || /[\r\n]/.test(typesafeKey))) throw fail('INVALID_TYPESAFE_API_KEY');
  const localJev = typeof typesafeKey === 'string';
  const configBytes = await readFile(connectorConfigPath);
  const config = JSON.parse(configBytes);
  const remote = new URL(config.apiUrl);
  const issuer = new URL(config.issuer);
  if (remote.protocol !== 'https:' || remote.username || remote.password || !['', '/'].includes(remote.pathname) || remote.search || remote.hash || issuer.protocol !== 'https:' || !/^[a-zA-Z0-9_-]{8,200}$/.test(config.clientId || '')) throw fail('INVALID_PACKAGED_CONNECTOR_CONFIG');

  const context = new AsyncLocalStorage();
  const records = [], cache = new Map(), pendingIdentity = new Map(), controllers = new Set();
  let activeTrial = null, sequence = 0, closed = false;
  const event = (value) => { try { onEvent(structuredClone(value)); } catch { /* observers cannot mutate request behavior */ } };
  const startRecord = (kind, fields = {}) => {
    const record = { id: ++sequence, trial: context.getStore() ? context.getStore().trial : activeTrial, kind, startedAt: new Date().toISOString(), status: 'pending', ...fields };
    const started = performance.now(); records.push(record); let finished = false;
    return { record, finish(status, fields = {}) { if (finished) return; finished = true; Object.assign(record, fields, { status, elapsedMs: Math.round(performance.now() - started) }); event({ event: 'relay_request_finished', record }); } };
  };
  const authenticatedHeaders = (req) => {
    const authorization = req?.get('Authorization');
    if (typeof authorization !== 'string' || !/^Bearer [^\s]{16,16384}$/.test(authorization)) throw fail('UNAUTHENTICATED', 401);
    const headers = { Authorization: authorization, 'Content-Type': 'application/json' };
    const accountHash = req.get('X-Orqaly-Account-Hash');
    if (accountHash !== undefined) {
      if (!/^[a-f0-9]{64}$/.test(accountHash)) throw fail('INVALID_ACCOUNT_HASH', 403);
      headers['X-Orqaly-Account-Hash'] = accountHash;
    }
    return headers;
  };
  async function remoteJson(path, req, body, kind) {
    const tracked = startRecord(kind, { route: path, authMethod: 'packaged_authenticated_endpoint' });
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), upstreamTimeoutMs);
    try {
      const response = await fetchImpl(`${remote.origin}/desktop/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers: authenticatedHeaders(req), ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: controller.signal });
      tracked.record.httpStatus = response.status;
      if (!response.ok) {
        // Only a bounded machine-readable code survives; never retain a remote
        // error message, response body, credentials, or supplied request data.
        try {
          const failure = await boundedJson(response, 16384, controller.signal);
          tracked.record.remoteErrorCode = safeCode(failure?.error?.code || failure?.code);
        } catch { void response.body?.cancel().catch(() => {}); }
        throw fail('AUTHENTICATED_ENDPOINT_REJECTED', response.status);
      }
      const result = await boundedJson(response, path === '/session' ? 32768 : 256 * 1024, controller.signal);
      if (kind === 'jev_http') {
        Object.assign(tracked.record, decisionMetadata(path, body, result), { providerHttpVisibility: 'deployed_service_only', effectiveMode: safeCode(result.effectiveMode || result.effective_mode) });
      }
      tracked.finish('completed'); return result;
    } catch (error) {
      tracked.finish(controller.signal.aborted ? 'cancelled_or_timed_out' : 'failed', { error: controller.signal.aborted ? 'UPSTREAM_CANCELLED_OR_TIMEOUT' : safeCode(error.code) || 'UPSTREAM_REQUEST_FAILED' });
      throw fail(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : safeCode(error.code) || 'UPSTREAM_REQUEST_FAILED', controller.signal.aborted ? 504 : error.status || 502);
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }

  // Observes the exact production service's provider request and response bytes.
  // Service validation, decision thresholds and deadlines remain in that service.
  async function tracedJevFetch(url, options) {
    if (url !== TYPESAFE_SYSTEM_ONE) throw fail('UNEXPECTED_JEV_ENDPOINT', 502);
    const body = JSON.parse(options.body);
    const tracked = startRecord('jev_provider_http', {
      serviceRecordId: context.getStore()?.jevServiceId ?? null,
      requestedModel: safeCode(body.model), responseModel: null, usage: null,
      questionNames: Object.keys(body.questions || {}).map(safeCode).filter(Boolean),
      providerHttpVisibility: 'direct',
    });
    const controller = new AbortController(); controllers.add(controller);
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    let reader;
    const cleanup = () => { controllers.delete(controller); signal.removeEventListener('abort', aborted); };
    const aborted = () => {
      tracked.finish('cancelled_or_timed_out', { error: 'JEV_CANCELLED_OR_TIMEOUT' });
      void reader?.cancel().catch(() => {}); cleanup();
    };
    signal.addEventListener('abort', aborted, { once: true });
    let response;
    try {
      signal.throwIfAborted();
      response = await fetchImpl(url, { ...options, signal });
      tracked.record.httpStatus = response.status;
      if (!response.ok || !response.body) {
        tracked.finish('failed', { error: response.ok ? 'JEV_BODY_MISSING' : 'JEV_HTTP_ERROR' });
        cleanup(); return response;
      }
    } catch {
      tracked.finish(signal.aborted ? 'cancelled_or_timed_out' : 'failed', { error: signal.aborted ? 'JEV_CANCELLED_OR_TIMEOUT' : 'JEV_CONNECTION_FAILED' });
      cleanup(); throw fail('JEV_CONNECTION_FAILED', 502);
    }
    reader = response.body.getReader(); const chunks = []; let bytes = 0;
    const wrapped = new ReadableStream({
      async pull(output) {
        try {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) {
            if (bytes <= 16384) {
              try {
                const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                tracked.record.responseModel = safeCode(result.model);
                tracked.record.usage = numericUsage(result.usage);
              } catch { tracked.record.metadataParseError = 'INVALID_JEV_JSON'; }
            } else tracked.record.metadataParseError = 'JEV_METADATA_LIMIT';
            tracked.finish('completed', { responseBytes: bytes }); cleanup(); output.close(); return;
          }
          bytes += value.byteLength;
          if (bytes <= 16384) chunks.push(Buffer.from(value));
          output.enqueue(value);
        } catch {
          tracked.finish(signal.aborted ? 'cancelled_or_timed_out' : 'failed', { error: signal.aborted ? 'JEV_CANCELLED_OR_TIMEOUT' : 'JEV_STREAM_FAILED' });
          void reader.cancel().catch(() => {}); cleanup(); output.error(fail('JEV_STREAM_FAILED', 502));
        }
      },
      async cancel() { tracked.finish('cancelled', { responseBytes: bytes }); cleanup(); await reader.cancel().catch(() => {}); },
    });
    return new Response(wrapped, { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  const localDecisionService = localJev ? createDesktopDecisionService({ apiKey: typesafeKey, fetchImpl: tracedJevFetch }) : null;
  const localReviewService = localJev ? createEngineeringReviewService({ apiKey: typesafeKey, fetchImpl: tracedJevFetch }) : null;
  async function runLocalJev(path, input, operation) {
    const tracked = startRecord('jev_service', { route: path, effectiveMode: 'current_local_service', providerHttpVisibility: 'direct', evaluated: false });
    try {
      const result = await context.run({ ...context.getStore(), jevServiceId: tracked.record.id }, operation);
      tracked.finish('completed', decisionMetadata(path, input, result)); return result;
    } catch (error) {
      tracked.finish('failed', { error: safeCode(error.code) || (error.name === 'ZodError' ? 'INVALID_DESKTOP_REQUEST' : 'JEV_SERVICE_FAILED') });
      throw error;
    }
  }
  async function verifyDesktopAuth(req) {
    const headers = authenticatedHeaders(req);
    const key = HASH(`${headers.Authorization}\n${headers['X-Orqaly-Account-Hash'] || ''}`);
    const cached = cache.get(key);
    if (cached?.expiresAt > Date.now()) return { userId: cached.userId };
    if (pendingIdentity.has(key)) return pendingIdentity.get(key);
    const promise = (async () => {
      const identity = await remoteJson('/session', req, undefined, 'identity_http');
      if (identity?.accountScoped !== true || typeof identity.userId !== 'string' || !identity.userId || identity.userId.length > 200 || identity.model !== 'orqaly-gemini') throw fail('AUTHENTICATED_SESSION_INVALID', 401);
      if (cache.size >= 256) cache.delete(cache.keys().next().value);
      cache.set(key, { userId: identity.userId, expiresAt: Date.now() + authCacheMs });
      return { userId: identity.userId };
    })();
    pendingIdentity.set(key, promise);
    try { return await promise; } finally { pendingIdentity.delete(key); }
  }

  async function tracedModelFetch(url, options) {
    if (url !== GOOGLE_CHAT) throw fail('UNEXPECTED_MODEL_ENDPOINT', 502);
    const state = context.getStore();
    const body = JSON.parse(options.body);
    const classification = classifyChatRequest(state?.req?.body);
    const tracked = startRecord('model_http', { ...classification, route: '/chat/completions', requestedAlias: safeCode(state?.req?.body?.model), requestedModel: body.model === BENCHMARK_MODEL ? body.model : 'unexpected', requestedEffort: safeCode(body.reasoning_effort), toolNames: Array.isArray(body.tools) ? body.tools.slice(0, 512).map((tool) => safeCode(tool?.function?.name)).filter(Boolean) : [], streamed: body.stream === true, responseModels: [], usage: null, usageSnapshots: [], modelIdentity: 'pending' });
    if (body.model !== BENCHMARK_MODEL) { tracked.finish('failed', { error: 'REQUEST_MODEL_MISMATCH' }); throw fail('REQUEST_MODEL_MISMATCH', 502); }
    let response;
    try { response = await fetchImpl(url, options); }
    catch { tracked.finish(options.signal?.aborted ? 'cancelled' : 'failed', { error: options.signal?.aborted ? 'MODEL_REQUEST_CANCELLED' : 'MODEL_CONNECTION_FAILED' }); throw fail('MODEL_CONNECTION_FAILED', 502); }
    tracked.record.httpStatus = response.status;
    if (!response.ok) { tracked.record.modelIdentity = 'not_generated'; tracked.finish('failed', { error: 'MODEL_HTTP_ERROR' }); return response; }
    if (!response.body) { tracked.finish('failed', { error: 'MODEL_BODY_MISSING' }); throw fail('MODEL_BODY_MISSING', 502); }
    const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '', bytes = 0;
    const inspect = (line) => {
      if (!line || line.startsWith(':') || line.trim() === 'data: [DONE]') return;
      let value; try { value = JSON.parse(line.replace(/^data:\s*/, '')); } catch { return; }
      if (typeof value.model === 'string') {
        if (!tracked.record.responseModels.includes(value.model)) tracked.record.responseModels.push(/^gemini-[a-z0-9.-]{1,100}$/.test(value.model) ? value.model : 'invalid_model_identifier');
        if (value.model !== BENCHMARK_MODEL) { tracked.record.modelIdentity = 'mismatch'; throw fail('RESPONSE_MODEL_MISMATCH', 502); }
        tracked.record.modelIdentity = 'verified';
      }
      const usage = numericUsage(value.usage);
      if (usage) { tracked.record.usage = usage; if (tracked.record.usageSnapshots.length < 128) tracked.record.usageSnapshots.push(usage); }
    };
    const wrapped = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            pending += decoder.decode(); inspect(pending);
            if (tracked.record.modelIdentity !== 'verified') throw fail('RESPONSE_MODEL_MISSING', 502);
            tracked.finish('completed', { responseBytes: bytes }); controller.close(); return;
          }
          bytes += value.byteLength; pending += decoder.decode(value, { stream: true });
          if (body.stream) { const lines = pending.split('\n'); pending = lines.pop(); for (const line of lines) inspect(line); }
          if (pending.length > MAX_JSON) throw fail('MODEL_METADATA_BUFFER_LIMIT', 502);
          controller.enqueue(value);
        } catch (error) {
          tracked.finish(options.signal?.aborted ? 'cancelled' : 'failed', { error: safeCode(error.code) || 'MODEL_STREAM_FAILED', responseBytes: bytes });
          void reader.cancel().catch(() => {}); controller.error(fail(safeCode(error.code) || 'MODEL_STREAM_FAILED', 502));
        }
      },
      async cancel() { tracked.finish('cancelled', { responseBytes: bytes }); await reader.cancel().catch(() => {}); },
    });
    return new Response(wrapped, { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  const app = express(); app.disable('x-powered-by');
  app.use('/desktop/v1', (req, res, next) => {
    const state = { trial: activeTrial, req };
    context.run(state, () => {
      const tracked = startRecord('inbound_http', { route: routeName(req.path), method: req.method });
      res.once('finish', () => tracked.finish('completed', { httpStatus: res.statusCode }));
      res.once('close', () => { if (!res.writableEnded) tracked.finish('cancelled', { httpStatus: res.statusCode }); });
      next();
    });
  });
  app.use('/desktop/v1', createGooseProviderRouter({ verifyDesktopAuth, apiKey: apiKey.trim(), model: BENCHMARK_MODEL, fetchImpl: tracedModelFetch,
    decisionService: { decide: async (auth, input) => localJev
      ? runLocalJev('/decisions', input, () => localDecisionService.decide(auth, input))
      : remoteJson('/decisions', context.getStore().req, input, 'jev_http') },
    engineeringReviewService: { review: async (auth, input, options) => localJev
      ? runLocalJev('/engineering/review', input, () => localReviewService.review(auth, input, options))
      : remoteJson('/engineering/review', context.getStore().req, input, 'jev_http') },
  }));
  app.use((_req, res) => res.status(404).json({ error: { code: 'BENCHMARK_ROUTE_NOT_AVAILABLE' } }));
  const server = await new Promise((resolve, reject) => { const running = app.listen(port, '127.0.0.1', () => resolve(running)); running.once('error', reject); });
  const provenance = { schemaVersion: 'orqanix.benchmark-relay.v2', model: BENCHMARK_MODEL, authMethod: 'packaged_authenticated_session_endpoint', oauthClientId: config.clientId, issuer: issuer.origin, authenticatedApiOrigin: remote.origin, connectorConfigSha256: HASH(configBytes), authCacheMs, providerRouter: 'apps/orqaly/server/workflow-v2/goose-provider-http.js', jevMethod: localJev ? 'current_local_production_services' : 'forwarded_authenticated_packaged_endpoint', jevProviderHttpVisible: localJev, jevFallbackOnError: false, ...(localJev ? { jevServices: ['apps/orqaly/server/workflow-v2/desktop-decision-service.js', 'apps/orqaly/server/workflow-v2/engineering-review-service.js'], jevResearchReferenceVerification: 'unavailable_local_service' } : {}), legacyCloudAxwiseRoutes: false, chatAttribution: 'axwise_specialist_artifact response-format marker; remaining chat requests primary' };
  return {
    url: `http://127.0.0.1:${server.address().port}`, provenance,
    setTrial(label) { if (closed) throw fail('RELAY_CLOSED'); activeTrial = safeLabel(label); },
    snapshot(label = activeTrial) {
      safeLabel(label); const selected = structuredClone(records.filter((record) => record.trial === label));
      const modelRequests = selected.filter((record) => record.kind === 'model_http');
      const jevRequests = selected.filter((record) => ['jev_http', 'jev_service'].includes(record.kind));
      const jevProviderRequests = selected.filter((record) => record.kind === 'jev_provider_http');
      return { trial: label, provenance: structuredClone(provenance), records: selected, modelRequests, jevRequests, jevProviderRequests, pending: selected.filter((record) => record.status === 'pending').length, primaryHttpAttempts: modelRequests.filter((record) => record.source === 'primary').length, axwiseHttpAttempts: modelRequests.filter((record) => record.source === 'axwise').length, jevHttpAttempts: localJev ? jevProviderRequests.length : jevRequests.length };
    },
    async close() {
      if (closed) return; closed = true;
      for (const controller of controllers) controller.abort();
      server.closeAllConnections(); await new Promise((done) => server.close(done)); cache.clear(); pendingIdentity.clear();
    },
  };
}
