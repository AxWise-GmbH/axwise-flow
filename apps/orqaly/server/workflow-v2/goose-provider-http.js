import express from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { ENGINEERING_REVIEW_MAX_BYTES } from './engineering-review-service.js';

export const GOOSE_PROVIDER_MODEL = 'orqaly-gemini';
const GOOGLE_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_DEADLINE_MS = 180_000;
const REQUEST_FIELDS = new Set([
  'model', 'messages', 'tools', 'tool_choice', 'parallel_tool_calls', 'stream',
  'stream_options', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p',
  'stop', 'n', 'seed', 'response_format', 'reasoning_effort', 'frequency_penalty',
  'presence_penalty', 'logprobs', 'top_logprobs', 'store',
]);
const REMOTE_MESSAGE_FIELDS = ['audio', 'attachments', 'image_url', 'file', 'input_audio', 'video', 'video_url', 'file_data', 'inline_data'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

async function abortable(operation, signal) {
  signal.throwIfAborted();
  let abort;
  const cancelled = new Promise((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

function sendError(res, status, code) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) return res.destroy();
  res.set('Cache-Control', 'no-store');
  res.status(status).json({ error: { type: 'orqaly_provider_error', code, message: code } });
}

function validContent(content) {
  return content === undefined || content === null || typeof content === 'string'
    || (Array.isArray(content) && content.every((part) =>
      isObject(part) && part.type === 'text' && typeof part.text === 'string'
      && Object.keys(part).every((key) => ['type', 'text', 'extra_content'].includes(key))));
}

export function validateGooseChatRequest(body) {
  if (!isObject(body) || Object.keys(body).some((key) => !REQUEST_FIELDS.has(key))
    || body.model !== GOOSE_PROVIDER_MODEL
    || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 1000
    || (body.stream !== undefined && typeof body.stream !== 'boolean')) return false;
  if (!body.messages.every((message) => isObject(message)
    && ['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)
    && !REMOTE_MESSAGE_FIELDS.some((key) => Object.hasOwn(message, key))
    && validContent(message.content)
    && (message.role !== 'tool' || typeof message.tool_call_id === 'string')
    && (message.tool_calls === undefined || (message.role === 'assistant'
      && Array.isArray(message.tool_calls) && message.tool_calls.every((call) =>
        isObject(call) && call.type === 'function' && typeof call.id === 'string'
        && isObject(call.function) && typeof call.function.name === 'string'
        && typeof call.function.arguments === 'string'))))) return false;
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 256
    || !body.tools.every((tool) => isObject(tool) && tool.type === 'function'
      && isObject(tool.function) && typeof tool.function.name === 'string'
      && (tool.function.parameters === undefined || isObject(tool.function.parameters))))) return false;
  if (body.tool_choice !== undefined && !['auto', 'none', 'required'].includes(body.tool_choice)
    && !(isObject(body.tool_choice) && body.tool_choice.type === 'function'
      && isObject(body.tool_choice.function) && typeof body.tool_choice.function.name === 'string')) return false;
  for (const name of ['max_tokens', 'max_completion_tokens']) {
    if (body[name] !== undefined && (!Number.isInteger(body[name]) || body[name] < 1 || body[name] > 65_536)) return false;
  }
  for (const name of ['parallel_tool_calls', 'logprobs']) {
    if (body[name] !== undefined && typeof body[name] !== 'boolean') return false;
  }
  if (body.store !== undefined && typeof body.store !== 'boolean') return false;
  for (const name of ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty']) {
    if (body[name] !== undefined && (typeof body[name] !== 'number' || !Number.isFinite(body[name]))) return false;
  }
  if (body.n !== undefined && body.n !== 1) return false;
  if (body.seed !== undefined && !Number.isSafeInteger(body.seed)) return false;
  if (body.top_logprobs !== undefined && (!Number.isInteger(body.top_logprobs) || body.top_logprobs < 0 || body.top_logprobs > 20)) return false;
  if (body.reasoning_effort !== undefined && !['low', 'medium', 'high'].includes(body.reasoning_effort)) return false;
  if (body.response_format !== undefined && (!isObject(body.response_format)
    || !['text', 'json_object', 'json_schema'].includes(body.response_format.type))) return false;
  if (body.stream_options !== undefined && (!isObject(body.stream_options)
    || Object.keys(body.stream_options).some((key) => key !== 'include_usage')
    || (body.stream_options.include_usage !== undefined && typeof body.stream_options.include_usage !== 'boolean'))) return false;
  if (body.stop !== undefined && typeof body.stop !== 'string'
    && !(Array.isArray(body.stop) && body.stop.length <= 4 && body.stop.every((value) => typeof value === 'string'))) return false;
  return true;
}

/** A transport boundary only: Goose, not this router, executes desktop tools. */
export function createGooseProviderRouter({
  commandService,
  verifyDesktopAuth,
  fetchImpl = fetch,
  apiKey,
  model = 'gemini-3.8-flash',
  contextForRequest = null,
  productGuidance = '',
  desktopContextService = null,
  desktopWorkService = null,
  engineeringReviewService = null,
  rateLimiter = (_req, _res, next) => next(),
  timeoutMs = MAX_DEADLINE_MS,
}) {
  if (typeof verifyDesktopAuth !== 'function' || typeof commandService?.session !== 'function')
    throw new Error('GOOSE_PROVIDER_AUTH_REQUIRED');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey))
    throw new Error('GOOSE_PROVIDER_API_KEY_REQUIRED');
  if (typeof model !== 'string' || !/^gemini-[a-z0-9.-]+$/.test(model))
    throw new Error('GOOSE_PROVIDER_MODEL_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_DEADLINE_MS)
    throw new Error('GOOSE_PROVIDER_DEADLINE_INVALID');
  if (contextForRequest !== null && typeof contextForRequest !== 'function')
    throw new Error('GOOSE_PROVIDER_CONTEXT_INVALID');
  if (typeof rateLimiter !== 'function') throw new Error('GOOSE_PROVIDER_RATE_LIMITER_REQUIRED');
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const verified = await verifyDesktopAuth(req);
      if (typeof verified?.userId !== 'string' || !verified.userId)
        return sendError(res, 401, 'UNAUTHENTICATED');
      const accountHash = req.get('X-Orqaly-Account-Hash');
      if (accountHash !== undefined && accountHash !== createHash('sha256').update(verified.userId).digest('hex'))
        return sendError(res, 403, 'ACCOUNT_CHANGED');
      req.authContext = { userId: verified.userId };
      return next();
    } catch (error) {
      const status = [401, 403].includes(error?.status) ? error.status : 503;
      return sendError(res, status, status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'ACCESS_DENIED' : 'IDENTITY_UNAVAILABLE');
    }
  });
  router.use(rateLimiter);
  router.use(async (req, res, next) => {
    try {
      const session = await commandService.session(req.authContext);
      if (session?.userId !== req.authContext.userId || session.tenantBound !== true)
        return sendError(res, 403, 'TENANT_NOT_BOUND');
      req.gooseSession = { userId: session.userId, tenantBound: true };
      return next();
    } catch (error) {
      const status = [401, 403].includes(error?.status) ? error.status : 503;
      return sendError(res, status, status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'ACCESS_DENIED' : 'IDENTITY_UNAVAILABLE');
    }
  });
  router.get('/session', (req, res) => res.json({ ...req.gooseSession, model: GOOSE_PROVIDER_MODEL }));
  router.get('/models', (_req, res) => res.json({
    object: 'list',
    data: [{ id: GOOSE_PROVIDER_MODEL, object: 'model', created: 0, owned_by: 'orqaly' }],
  }));
  const desktopRead = (operation) => async (req, res) => {
    try { res.json(await operation(req)); }
    catch (error) {
      if (error?.name === 'ZodError') return sendError(res, 400, 'INVALID_DESKTOP_REQUEST');
      const status = [400, 401, 403, 404, 409, 413, 429].includes(error?.status) ? error.status : 503;
      const code = typeof error?.code === 'string' && /^[A-Z_]{3,80}$/.test(error.code)
        ? error.code : 'DESKTOP_WORK_UNAVAILABLE';
      sendError(res, status, code);
    }
  };
  if (desktopContextService) {
    router.get('/goals/:runId/context', desktopRead((req) => desktopContextService.read(req.authContext, req.params.runId)));
    router.get('/goals/:runId/artifacts/:artifactId', desktopRead((req) => desktopContextService.artifact(req.authContext, req.params.runId, req.params.artifactId)));
  }
  if (desktopWorkService) {
    router.post('/work', express.json({ limit: '64kb', strict: true }), desktopRead((req) => desktopWorkService.start(req.authContext, req.body)));
    router.get('/work/:conversationId/:requestId', desktopRead((req) => desktopWorkService.read(req.authContext, req.params)));
    router.post('/work/:conversationId/:requestId/cancel', desktopRead((req) => desktopWorkService.cancel(req.authContext, req.params)));
    router.get('/work/:conversationId/:requestId/events', desktopRead((req) => desktopWorkService.events(req.authContext, req.params, Number(req.query.after || 0), Number(req.query.limit || 100))));
  }
  if (engineeringReviewService) {
    router.post('/engineering/review', express.json({ limit: ENGINEERING_REVIEW_MAX_BYTES, strict: true }), async (req, res) => {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      try {
        await desktopRead((request) => engineeringReviewService.review(request.authContext, request.body,
          { signal: controller.signal }))(req, res);
      } finally {
        req.off('aborted', disconnected);
        res.off('close', disconnected);
      }
    });
  }
  router.post('/chat/completions', express.json({ limit: MAX_REQUEST_BYTES, strict: true }), async (req, res) => {
    if (!validateGooseChatRequest(req.body)) return sendError(res, 400, 'INVALID_CHAT_REQUEST');
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    timeout.unref?.();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', disconnected);
    res.once('close', disconnected);
    try {
      // Keep opaque provider extensions (especially Gemini thought signatures)
      // and original function argument strings intact across the entire loop.
      const body = { ...req.body, model };
      // The pinned Gemini runtime does not accept legacy sampling controls.
      delete body.temperature;
      delete body.top_p;
      // OMP explicitly sends the OpenAI persistence preference. Orqanix never
      // persists requests through the upstream compatibility endpoint.
      delete body.store;
      if (productGuidance) {
        const [leading, ...history] = body.messages;
        if (leading.role === 'system') {
          const content = Array.isArray(leading.content)
            ? [...leading.content, { type: 'text', text: productGuidance }]
            : `${leading.content || ''}\n\n${productGuidance}`;
          body.messages = [{ ...leading, content }, ...history];
        } else body.messages = [{ role: 'system', content: productGuidance }, ...body.messages];
      }
      if (contextForRequest) {
        let context;
        try {
          context = await abortable(() => contextForRequest({ request: req, authContext: req.authContext, body: req.body, signal: controller.signal }), controller.signal);
        } catch (error) {
          if ([403, 404].includes(error?.status)) return sendError(res, 403, 'CONTEXT_NOT_AVAILABLE');
          throw error;
        }
        if (context !== null && context !== undefined) {
          if (typeof context !== 'string' || Buffer.byteLength(context, 'utf8') > MAX_REQUEST_BYTES)
            throw new Error('GOOSE_PROVIDER_CONTEXT_INVALID');
          if (context) {
            const [leading, ...history] = body.messages;
            // Gemini's compatible endpoint can replace earlier system messages.
            // Keep Goose's instructions and the reference in the same message.
            if (leading.role === 'system') {
              const content = Array.isArray(leading.content)
                ? [...leading.content, { type: 'text', text: context }]
                : leading.content ? `${leading.content}\n\n${context}` : context;
              body.messages = [{ ...leading, content }, ...history];
            } else body.messages = [{ role: 'system', content: context }, ...body.messages];
          }
        }
      }
      controller.signal.throwIfAborted();
      const upstream = await fetchImpl(GOOGLE_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        return sendError(res, upstream.status === 429 ? 429 : 502, 'PROVIDER_UNAVAILABLE');
      }
      const expectedType = body.stream ? 'text/event-stream' : 'application/json';
      if (!upstream.body || !upstream.headers.get('content-type')?.toLowerCase().startsWith(expectedType)) {
        await upstream.body?.cancel();
        return sendError(res, 502, 'INVALID_PROVIDER_RESPONSE');
      }
      res.status(200).set({
        'Content-Type': `${expectedType}; charset=utf-8`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
      });
      // Native backpressure and abort handling; no SSE reconstruction, no lost
      // tool deltas, no synthetic success event, and no mid-stream replay.
      await pipeline(Readable.fromWeb(upstream.body), res, { signal: controller.signal });
    } catch {
      if (timedOut) sendError(res, 504, 'PROVIDER_TIMEOUT');
      else if (!controller.signal.aborted) sendError(res, 502, 'PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      req.off('aborted', disconnected);
      res.off('close', disconnected);
    }
  });
  router.use((error, req, res, _next) => {
    if (req.path === '/engineering/review') return sendError(res, error?.type === 'entity.too.large' ? 413 : 400,
      error?.type === 'entity.too.large' ? 'ENGINEERING_REVIEW_TOO_LARGE' : 'INVALID_ENGINEERING_REVIEW_REQUEST');
    sendError(res, error?.type === 'entity.too.large' ? 413 : 400,
      error?.type === 'entity.too.large' ? 'CHAT_REQUEST_TOO_LARGE' : 'INVALID_CHAT_REQUEST');
  });
  return router;
}
