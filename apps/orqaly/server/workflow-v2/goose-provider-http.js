import express from 'express';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { ENGINEERING_REVIEW_MAX_BYTES } from './engineering-review-service.js';
import { DesktopWorkReadQuerySchema } from './desktop-work-service.js';

export const GOOSE_PROVIDER_MODEL = 'orqaly-gemini';
const GOOGLE_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MAX_REQUEST_BYTES = 18 * 1024 * 1024;
const MAX_UPSTREAM_REQUEST_BYTES = 18 * 1024 * 1024;
const MAX_CONTEXT_BYTES = 2 * 1024 * 1024;
const MAX_NON_IMAGE_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const MAX_IMAGES_PER_MESSAGE = 10;
const MAX_INLINE_IMAGES = 3_600;
const MAX_CONTENT_PARTS_PER_MESSAGE = 128;
const MAX_DEADLINE_MS = 180_000;
const INPUT_MODALITIES = Object.freeze(['text', 'image']);
const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
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

function hasImageSignature(mime, bytes) {
  if (mime === 'image/jpeg') return bytes.length >= 3
    && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

function inspectImagePart(part, state) {
  if (!isObject(part) || part.type !== 'image_url'
    || Object.keys(part).length !== 2 || !Object.hasOwn(part, 'image_url')
    || !isObject(part.image_url) || Object.keys(part.image_url).length !== 1
    || typeof part.image_url.url !== 'string') return 'invalid';
  const match = IMAGE_DATA_URL.exec(part.image_url.url);
  if (!match) return 'invalid';
  const [, mime, encoded] = match;
  if (encoded.length % 4 !== 0) return 'invalid';
  if (encoded.length > MAX_IMAGE_BASE64_LENGTH) return 'too_large';
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || !hasImageSignature(mime, bytes)) return 'invalid';
  if (bytes.length > MAX_IMAGE_BYTES || state.imageBytes + bytes.length > MAX_INLINE_IMAGE_BYTES
    || state.imageCount >= MAX_INLINE_IMAGES) return 'too_large';
  state.imageCount += 1;
  state.imageBytes += bytes.length;
  state.inlineImageContainers.add(part.image_url);
  return 'valid';
}

function inspectContent(content, role, state) {
  if (content === undefined || content === null || typeof content === 'string') return 'valid';
  if (!Array.isArray(content) || content.length > MAX_CONTENT_PARTS_PER_MESSAGE) return 'invalid';
  let imageCount = 0;
  for (const part of content) {
    if (isObject(part) && part.type === 'text' && typeof part.text === 'string'
      && Object.keys(part).every((key) => ['type', 'text', 'extra_content'].includes(key))) continue;
    if (role !== 'user') return 'invalid';
    imageCount += 1;
    if (imageCount > MAX_IMAGES_PER_MESSAGE) return 'too_large';
    const result = inspectImagePart(part, state);
    if (result !== 'valid') return result;
  }
  return 'valid';
}

function inspectGooseChatRequest(body) {
  const invalid = { valid: false, status: 400, code: 'INVALID_CHAT_REQUEST' };
  const imagesTooLarge = { valid: false, status: 413, code: 'CHAT_IMAGES_TOO_LARGE' };
  const requestTooLarge = { valid: false, status: 413, code: 'CHAT_REQUEST_TOO_LARGE' };
  const state = { imageCount: 0, imageBytes: 0, inlineImageContainers: new WeakSet() };
  if (!isObject(body) || Object.keys(body).some((key) => !REQUEST_FIELDS.has(key))
    || body.model !== GOOSE_PROVIDER_MODEL
    || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 1000
    || (body.stream !== undefined && typeof body.stream !== 'boolean')) return invalid;
  for (const message of body.messages) {
    if (!isObject(message) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)
      || REMOTE_MESSAGE_FIELDS.some((key) => Object.hasOwn(message, key))
      || (message.role === 'tool' && typeof message.tool_call_id !== 'string')
      || (message.tool_calls !== undefined && (message.role !== 'assistant'
        || !Array.isArray(message.tool_calls) || !message.tool_calls.every((call) =>
          isObject(call) && call.type === 'function' && typeof call.id === 'string'
          && isObject(call.function) && typeof call.function.name === 'string'
          && typeof call.function.arguments === 'string')))) return invalid;
    const content = inspectContent(message.content, message.role, state);
    if (content === 'invalid') return invalid;
    if (content === 'too_large') return imagesTooLarge;
  }
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 256
    || !body.tools.every((tool) => isObject(tool) && tool.type === 'function'
      && isObject(tool.function) && typeof tool.function.name === 'string'
      && (tool.function.parameters === undefined || isObject(tool.function.parameters))))) return invalid;
  if (body.tool_choice !== undefined && !['auto', 'none', 'required'].includes(body.tool_choice)
    && !(isObject(body.tool_choice) && body.tool_choice.type === 'function'
      && isObject(body.tool_choice.function) && typeof body.tool_choice.function.name === 'string')) return invalid;
  for (const name of ['max_tokens', 'max_completion_tokens']) {
    if (body[name] !== undefined && (!Number.isInteger(body[name]) || body[name] < 1 || body[name] > 65_536)) return invalid;
  }
  for (const name of ['parallel_tool_calls', 'logprobs']) {
    if (body[name] !== undefined && typeof body[name] !== 'boolean') return invalid;
  }
  if (body.store !== undefined && typeof body.store !== 'boolean') return invalid;
  for (const name of ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty']) {
    if (body[name] !== undefined && (typeof body[name] !== 'number' || !Number.isFinite(body[name]))) return invalid;
  }
  if (body.n !== undefined && body.n !== 1) return invalid;
  if (body.seed !== undefined && !Number.isSafeInteger(body.seed)) return invalid;
  if (body.top_logprobs !== undefined && (!Number.isInteger(body.top_logprobs) || body.top_logprobs < 0 || body.top_logprobs > 20)) return invalid;
  if (body.reasoning_effort !== undefined && !['low', 'medium', 'high'].includes(body.reasoning_effort)) return invalid;
  if (body.response_format !== undefined && (!isObject(body.response_format)
    || !['text', 'json_object', 'json_schema'].includes(body.response_format.type))) return invalid;
  if (body.stream_options !== undefined && (!isObject(body.stream_options)
    || Object.keys(body.stream_options).some((key) => key !== 'include_usage')
    || (body.stream_options.include_usage !== undefined && typeof body.stream_options.include_usage !== 'boolean'))) return invalid;
  if (body.stop !== undefined && typeof body.stop !== 'string'
    && !(Array.isArray(body.stop) && body.stop.length <= 4 && body.stop.every((value) => typeof value === 'string'))) return invalid;
  let nonImageRequest;
  try {
    nonImageRequest = JSON.stringify(body, function omitInlineImageData(key, value) {
      return key === 'url' && state.inlineImageContainers.has(this) ? '[inline image]' : value;
    });
  } catch {
    return invalid;
  }
  if (Buffer.byteLength(nonImageRequest, 'utf8') > MAX_NON_IMAGE_REQUEST_BYTES) return requestTooLarge;
  return { valid: true };
}

export function validateGooseChatRequest(body) {
  return inspectGooseChatRequest(body).valid;
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
  decisionService = null,
  informationService = null,
  searchService = null,
  imageService = null,
  transcribeService = null,
  speechService = null,
  userQuotaService = null,
  clerkUserLookup = null,
  adminUserIds = [],
  resolveAdminUser = null,
  rateLimiter = (_req, _res, next) => next(),
  timeoutMs = MAX_DEADLINE_MS,
}) {
  if (typeof verifyDesktopAuth !== 'function')
    throw new Error('GOOSE_PROVIDER_AUTH_REQUIRED');
  if (commandService !== undefined && typeof commandService?.session !== 'function')
    throw new Error('GOOSE_PROVIDER_LEGACY_SESSION_REQUIRED');
  if (!commandService && (desktopContextService || desktopWorkService
    || informationService || contextForRequest || productGuidance))
    throw new Error('GOOSE_PROVIDER_LEGACY_SESSION_REQUIRED');
  if (engineeringReviewService !== null && typeof engineeringReviewService?.review !== 'function')
    throw new Error('GOOSE_PROVIDER_ENGINEERING_REVIEW_SERVICE_INVALID');
  if (searchService !== null && typeof searchService?.search !== 'function')
    throw new Error('GOOSE_PROVIDER_SEARCH_SERVICE_INVALID');
  if (imageService !== null && typeof imageService?.generate !== 'function')
    throw new Error('GOOSE_PROVIDER_IMAGE_SERVICE_INVALID');
  if (transcribeService !== null && typeof transcribeService?.transcribe !== 'function')
    throw new Error('GOOSE_PROVIDER_TRANSCRIBE_SERVICE_INVALID');
  if (speechService !== null && typeof speechService?.synthesize !== 'function')
    throw new Error('GOOSE_PROVIDER_SPEECH_SERVICE_INVALID');
  if (userQuotaService !== null && (typeof userQuotaService?.checkQuota !== 'function' || typeof userQuotaService?.recordUsage !== 'function'))
    throw new Error('GOOSE_PROVIDER_USER_QUOTA_SERVICE_INVALID');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey))
    throw new Error('GOOSE_PROVIDER_API_KEY_REQUIRED');
  if (typeof model !== 'string' || !/^gemini-[a-z0-9.-]+$/.test(model))
    throw new Error('GOOSE_PROVIDER_MODEL_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_DEADLINE_MS)
    throw new Error('GOOSE_PROVIDER_DEADLINE_INVALID');
  if (contextForRequest !== null && typeof contextForRequest !== 'function')
    throw new Error('GOOSE_PROVIDER_CONTEXT_INVALID');
  if (typeof rateLimiter !== 'function') throw new Error('GOOSE_PROVIDER_RATE_LIMITER_REQUIRED');
  if (resolveAdminUser !== null && typeof resolveAdminUser !== 'function') throw new Error('GOOSE_PROVIDER_ADMIN_RESOLVER_INVALID');
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
      req.gooseIsAdmin = adminUserIds.includes(verified.userId) ||
        (resolveAdminUser !== null && await resolveAdminUser(verified.userId) === true);
      return next();
    } catch (error) {
      const status = [401, 403].includes(error?.status) ? error.status : 503;
      return sendError(res, status, status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'ACCESS_DENIED' : 'IDENTITY_UNAVAILABLE');
    }
  });
  router.use((req, res, next) => req.gooseIsAdmin ? next() : rateLimiter(req, res, next));
  router.use(async (req, res, next) => {
    if (!commandService) {
      req.gooseSession = { userId: req.authContext.userId, accountScoped: true };
      return next();
    }
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
  router.get('/session', (req, res) => res.json({
    ...req.gooseSession, model: GOOSE_PROVIDER_MODEL, input_modalities: INPUT_MODALITIES,
    ...(req.gooseIsAdmin ? { isAdmin: true } : {}),
  }));
  router.get('/models', (_req, res) => res.json({
    object: 'list',
    data: [{ id: GOOSE_PROVIDER_MODEL, object: 'model', created: 0, owned_by: 'orqaly',
      input_modalities: INPUT_MODALITIES }],
  }));
  const desktopRead = (operation) => async (req, res) => {
    try {
      const result = await operation(req);
      if (!res.destroyed && !res.writableEnded) res.json(result);
    }
    catch (error) {
      if (error?.name === 'ZodError') return sendError(res, 400, 'INVALID_DESKTOP_REQUEST');
      const status = [400, 401, 403, 404, 409, 413, 429, 502, 504].includes(error?.status) ? error.status : 503;
      const code = typeof error?.code === 'string' && /^[A-Z_]{3,80}$/.test(error.code)
        ? error.code : 'DESKTOP_WORK_UNAVAILABLE';
      sendError(res, status, code);
    }
  };
  router.get('/usage', desktopRead(async (req) => {
    if (!userQuotaService) {
      return {
        enabled: false,
        userId: req.authContext.userId,
        spendCents: 0,
        limitCents: 500,
        remainingCents: 500,
        spendUsd: 0,
        limitUsd: 5.0,
        remainingUsd: 5.0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        callCount: 0,
        pricing: [],
      };
    }
    return { ...await userQuotaService.getUsageSummary(req.authContext.userId), isAdmin: req.gooseIsAdmin };
  }));
  router.get('/admin/users', async (req, res) => {
    if (!userQuotaService) return sendError(res, 503, 'QUOTA_SERVICE_UNAVAILABLE');
    if (!req.gooseIsAdmin) return sendError(res, 403, 'ADMIN_REQUIRED');
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const month = req.query.month || 'current';
      const data = await userQuotaService.listUsers({ limit, offset, month });
      if (clerkUserLookup && Array.isArray(data.users)) {
        data.users = await clerkUserLookup.enrichUsers(data.users);
      }
      res.json(data);
    } catch {
      sendError(res, 500, 'USERS_LIST_FAILED');
    }
  });
  router.get('/admin/users/daily', async (req, res) => {
    if (!userQuotaService) return sendError(res, 503, 'QUOTA_SERVICE_UNAVAILABLE');
    if (!req.gooseIsAdmin) return sendError(res, 403, 'ADMIN_REQUIRED');
    try {
      const month = req.query.month || 'current';
      const userId = req.query.userId || null;
      const data = await userQuotaService.getDailyUsage({ month, userId });
      if (clerkUserLookup && Array.isArray(data.daily)) {
        data.daily = await clerkUserLookup.enrichUsers(data.daily);
      }
      res.json(data);
    } catch {
      sendError(res, 500, 'DAILY_USAGE_FAILED');
    }
  });
  router.patch('/admin/users/:userId/quota', express.json({ limit: '16kb', strict: true }), async (req, res) => {
    if (!userQuotaService) return sendError(res, 503, 'QUOTA_SERVICE_UNAVAILABLE');
    if (!req.gooseIsAdmin) return sendError(res, 403, 'ADMIN_REQUIRED');
    try {
      const { monthlyLimitCents, planTier, isBlocked } = req.body || {};
      const updated = await userQuotaService.updateUserQuota(req.params.userId, {
        monthlyLimitCents,
        planTier,
        isBlocked,
      });
      res.json(updated);
    } catch (error) {
      if (['TARGET_USER_ID_REQUIRED', 'NO_VALID_QUOTA_UPDATES'].includes(error?.message)) {
        return sendError(res, 400, 'INVALID_QUOTA_UPDATE');
      }
      sendError(res, 500, 'QUOTA_UPDATE_FAILED');
    }
  });
  if (desktopContextService) {
    router.get('/goals/:runId/context', desktopRead((req) => desktopContextService.read(req.authContext, req.params.runId)));
    router.get('/goals/:runId/artifacts/:artifactId', desktopRead((req) => desktopContextService.artifact(req.authContext, req.params.runId, req.params.artifactId)));
  }
  if (decisionService) {
    router.post('/decisions', express.json({ limit: '32kb', strict: true }),
      desktopRead((req) => decisionService.decide(req.authContext, req.body)));
  }
  if (searchService) {
    router.post('/search', express.json({ limit: '16kb', strict: true }), async (req, res) => {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      try {
        await desktopRead((request) => searchService.search(request.authContext, request.body,
          { signal: controller.signal }))(req, res);
      } finally {
        req.off('aborted', disconnected);
        res.off('close', disconnected);
      }
    });
  }
  if (imageService) {
    router.post('/image', express.json({ limit: '64kb', strict: true }), async (req, res) => {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      try {
        await desktopRead((request) => imageService.generate(request.authContext, request.body,
          { signal: controller.signal }))(req, res);
      } finally {
        req.off('aborted', disconnected);
        res.off('close', disconnected);
      }
    });
  }
  if (transcribeService) {
    router.post('/transcribe', express.json({ limit: '20mb', strict: true }), async (req, res) => {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      try {
        await desktopRead((request) => transcribeService.transcribe(request.authContext, request.body,
          { signal: controller.signal }))(req, res);
      } finally {
        req.off('aborted', disconnected);
        res.off('close', disconnected);
      }
    });
  }
  if (speechService) {
    router.post('/speech', express.json({ limit: '64kb', strict: true }), async (req, res) => {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      try {
        await desktopRead((request) => speechService.synthesize(request.authContext, request.body,
          { signal: controller.signal }))(req, res);
      } finally {
        req.off('aborted', disconnected);
        res.off('close', disconnected);
      }
    });
  }
  if (informationService) {
    router.post('/information', express.json({ limit: '32kb', strict: true }), async (req, res) => {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      try { await desktopRead((request) => informationService.lookup(request.authContext, request.body,
        { signal: controller.signal }))(req, res); }
      finally { req.off('aborted', disconnected); res.off('close', disconnected); }
    });
  }
  if (desktopWorkService) {
    router.post('/work', express.json({ limit: '64kb', strict: true }), desktopRead((req) => desktopWorkService.start(req.authContext, req.body)));
    router.get('/work/:conversationId/:requestId', async (req, res) => {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected);
      res.once('close', disconnected);
      try {
        await desktopRead((request) => {
          const { waitMs = 0 } = DesktopWorkReadQuerySchema.parse(request.query);
          return desktopWorkService.read(request.authContext, request.params, { waitMs, signal: controller.signal });
        })(req, res);
      } finally {
        req.off('aborted', disconnected);
        res.off('close', disconnected);
      }
    });
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
    const validation = inspectGooseChatRequest(req.body);
    if (!validation.valid) return sendError(res, validation.status, validation.code);
    if (userQuotaService) {
      try {
        const quota = await userQuotaService.checkQuota(req.authContext.userId);
        if (!quota.allowed) return sendError(res, 402, 'QUOTA_EXCEEDED');
      } catch {
        return sendError(res, 503, 'QUOTA_UNAVAILABLE');
      }
    }
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
      // Clients may send the OpenAI persistence preference. Orqanix never
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
          if (typeof context !== 'string' || Buffer.byteLength(context, 'utf8') > MAX_CONTEXT_BYTES)
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
      if (body.stream && (body.stream_options === undefined || body.stream_options.include_usage !== false)) {
        body.stream_options = { include_usage: true };
      }
      const upstreamBody = JSON.stringify(body);
      if (Buffer.byteLength(upstreamBody, 'utf8') > MAX_UPSTREAM_REQUEST_BYTES)
        return sendError(res, 413, 'CHAT_REQUEST_TOO_LARGE');
      const upstream = await fetchImpl(GOOGLE_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: upstreamBody,
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
      const streams = [Readable.fromWeb(upstream.body)];
      if (userQuotaService) {
        let streamBuffer = '';
        const tapStream = new Transform({
          transform(chunk, encoding, callback) {
            if (streamBuffer.length < 250_000) {
              streamBuffer += chunk.toString('utf8');
            }
            callback(null, chunk);
          },
          flush(callback) {
            try {
              if (streamBuffer.includes('"usage"')) {
                const lines = streamBuffer.split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                  const line = lines[i].trim();
                  if (line.includes('"usage"')) {
                    const dataText = line.startsWith('data: ') ? line.slice(6) : line;
                    const parsed = JSON.parse(dataText);
                    if (parsed.usage) {
                      const promptTokens = parsed.usage.prompt_tokens || 0;
                      const completionTokens = parsed.usage.completion_tokens || 0;
                      const cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens
                        || parsed.usage.cached_tokens
                        || parsed.usage.prompt_tokens_details?.cached_tokens_count
                        || 0;
                      userQuotaService.recordUsage({
                        userId: req.authContext.userId,
                        model: body.model || model,
                        promptTokens,
                        completionTokens,
                        cachedTokens,
                      }).catch(() => {});
                      break;
                    }
                  }
                }
              }
            } catch {}
            callback();
          },
        });
        streams.push(tapStream);
      }
      streams.push(res);
      await pipeline(...streams, { signal: controller.signal });
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
    if (req.path === '/search') return sendError(res, error?.type === 'entity.too.large' ? 413 : 400,
      error?.type === 'entity.too.large' ? 'SEARCH_REQUEST_TOO_LARGE' : 'INVALID_SEARCH_REQUEST');
    if (req.path === '/engineering/review') return sendError(res, error?.type === 'entity.too.large' ? 413 : 400,
      error?.type === 'entity.too.large' ? 'ENGINEERING_REVIEW_TOO_LARGE' : 'INVALID_ENGINEERING_REVIEW_REQUEST');
    sendError(res, error?.type === 'entity.too.large' ? 413 : 400,
      error?.type === 'entity.too.large' ? 'CHAT_REQUEST_TOO_LARGE' : 'INVALID_CHAT_REQUEST');
  });
  return router;
}
