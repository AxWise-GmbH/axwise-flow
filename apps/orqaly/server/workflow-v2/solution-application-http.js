import express from 'express';
import { z } from 'zod';
import { SolutionError } from './solution-service.js';

// Cheap, bounded pre-authentication defense only. Cross-instance execution
// quotas are independently enforced under the Solution's database lock.
export function createApplicationRequestLimiter({
  limit = 240,
  maxBuckets = 2048,
  now = Date.now,
} = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [id, bucket] of buckets) if (bucket.until <= time) buckets.delete(id);
    const id = req.ip || 'unknown';
    let bucket = buckets.get(id);
    if (!bucket && buckets.size < maxBuckets) {
      bucket = { count: 0, until: time + 60_000 };
      buckets.set(id, bucket);
    }
    if (!bucket || ++bucket.count > limit)
      return res
        .set('Retry-After', '60')
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: 'Try again later.' } });
    next();
  };
}

export function createSolutionApplicationRouter({
  service,
  limiter = createApplicationRequestLimiter(),
}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    // Server-to-server access deliberately has no cookie/CORS authority. A
    // browser with an embedded key is not a supported application client.
    if (req.headers.origin !== undefined || req.headers.cookie !== undefined)
      return res
        .status(403)
        .json({
          error: {
            code: 'APPLICATION_CLIENT_REQUIRED',
            message: 'Use this endpoint from your application server without browser cookies.',
          },
        });
    if (!service)
      return res
        .status(503)
        .json({
          error: {
            code: 'APPLICATION_ACCESS_UNAVAILABLE',
            message: 'Application access is unavailable.',
          },
        });
    if (!['GET', 'POST'].includes(req.method))
      return res
        .status(405)
        .json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
    return next();
  });
  router.use(limiter);
  router.use(express.json({ limit: '24kb', strict: true }));
  const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.post(
    '/solutions/:solutionId',
    route(async (req, res) => {
      if (!req.is('application/json'))
        throw new SolutionError('CONTENT_TYPE_REQUIRED', 'Use application/json.', 415);
      if (Object.keys(req.query).length)
        throw new SolutionError('INVALID_COMMAND', 'Query parameters are not accepted.', 400);
      const result = await service.invoke(
        req.get('authorization'),
        req.params.solutionId,
        req.body,
        req.get('idempotency-key')
      );
      return res.status(result.invocation.status === 'running' ? 202 : 200).json(result);
    })
  );
  router.get(
    '/solutions/:solutionId/invocations/:invocationId',
    route(async (req, res) => {
      if (Object.keys(req.query).length)
        throw new SolutionError('INVALID_COMMAND', 'Query parameters are not accepted.', 400);
      return res.json(
        await service.readInvocation(
          req.get('authorization'),
          req.params.solutionId,
          req.params.invocationId
        )
      );
    })
  );
  router.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Application endpoint not found.' } })
  );
  router.use((error, _req, res, _next) => {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    if (error instanceof SolutionError)
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error instanceof z.ZodError || error.type === 'entity.parse.failed')
      return res
        .status(400)
        .json({ error: { code: 'INVALID_COMMAND', message: 'Request validation failed.' } });
    if (error.type === 'entity.too.large')
      return res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
    return res
      .status(500)
      .json({
        error: {
          code: 'APPLICATION_REQUEST_FAILED',
          message: 'Request could not be completed. Check its receipt before sending again.',
        },
      });
  });
  return router;
}
