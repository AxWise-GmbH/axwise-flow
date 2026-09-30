import express from 'express';
import { ZodError } from 'zod';
import { createGooseProviderRouter } from './goose-provider-http.js';
import { DESKTOP_PRODUCT_GUIDANCE } from './desktop-context-service.js';
import { AgentEvaluationError } from './agent-evaluation-service.js';

function safeError(res, status, code) {
  if (res.headersSent || res.writableEnded) return;
  res.set('Cache-Control', 'no-store').status(status).json({ error: { code, message: code } });
}

function bearer(req) {
  const custom = req.get('X-Orqaly-Evaluation-Authorization');
  const value = custom;
  const match = typeof value === 'string' && value.length <= 8192 ? /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value) : null;
  if (!match) throw Object.assign(new Error('missing evaluation authorization'), { status: 401 });
  return match[1];
}

export function createAgentEvaluationRouter({
  config,
  service,
  commandService,
  oidcVerifier,
  geminiApiKey,
  engineeringReviewService,
  rateLimiter = (_req, _res, next) => next(),
  fetchImpl = fetch,
}) {
  if (!config?.userId || typeof service?.execute !== 'function' || typeof service?.judge !== 'function'
    || typeof commandService?.session !== 'function' || typeof oidcVerifier !== 'function')
    throw new Error('agent evaluation router configuration is incomplete');
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const identity = await oidcVerifier(bearer(req));
      if (identity?.email !== config.serviceAccount) return safeError(res, 403, 'ACCESS_DENIED');
      req.agentEvaluationIdentity = identity;
      req.authContext = { userId: config.userId };
      return next();
    } catch (error) {
      return safeError(res, [400, 401, 403].includes(error?.status) ? error.status : 503,
        error?.status === 400 ? 'INVALID_AUTHORIZATION' : error?.status === 403 ? 'ACCESS_DENIED'
          : error?.status === 401 ? 'UNAUTHENTICATED' : 'IDENTITY_UNAVAILABLE');
    }
  });
  router.use(rateLimiter);
  router.use(async (req, res, next) => {
    try {
      const session = await commandService.session(req.authContext);
      if (session?.userId !== config.userId || session.tenantBound !== true)
        return safeError(res, 403, 'TENANT_NOT_BOUND');
      return next();
    } catch (error) {
      return safeError(res, [401, 403].includes(error?.status) ? error.status : 503,
        error?.status === 401 ? 'UNAUTHENTICATED' : error?.status === 403 ? 'ACCESS_DENIED' : 'IDENTITY_UNAVAILABLE');
    }
  });

  // Reuse the production desktop provider validation and streaming transport, but only expose
  // the two endpoints used by evaluation clients under this separately authenticated router.
  const provider = createGooseProviderRouter({
    commandService,
    verifyDesktopAuth: async (req) => req.agentEvaluationIdentity ? { userId: config.userId } : null,
    fetchImpl,
    apiKey: geminiApiKey,
    productGuidance: DESKTOP_PRODUCT_GUIDANCE,
    engineeringReviewService,
  });
  router.use((req, res, next) => {
    if (req.path === '/chat/completions' || req.path === '/engineering/review')
      return provider(req, res, next);
    return next();
  });

  router.post('/execute', express.json({ limit: '256kb', strict: true }), async (req, res, next) => {
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', disconnected);
    res.once('close', disconnected);
    try { res.status(200).json(await service.execute(req.body, { signal: controller.signal })); }
    catch (error) { next(error); }
    finally { req.off('aborted', disconnected); res.off('close', disconnected); }
  });
  router.post('/judge', express.json({ limit: '640kb', strict: true }), async (req, res, next) => {
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', disconnected);
    res.once('close', disconnected);
    try { res.status(200).json(await service.judge(req.body, { signal: controller.signal })); }
    catch (error) { next(error); }
    finally { req.off('aborted', disconnected); res.off('close', disconnected); }
  });
  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return safeError(res, 413, 'EVALUATION_REQUEST_TOO_LARGE');
    if (error instanceof ZodError) return safeError(res, 400, 'INVALID_EVALUATION_REQUEST');
    if (error instanceof AgentEvaluationError)
      return safeError(res, error.status, /^[A-Z_]{3,80}$/.test(error.code) ? error.code : 'EVALUATION_FAILED');
    return safeError(res, [401, 403, 409, 429].includes(error?.status) ? error.status : 503,
      typeof error?.code === 'string' && /^[A-Z_]{3,80}$/.test(error.code) ? error.code : 'EVALUATION_UNAVAILABLE');
  });
  return router;
}
