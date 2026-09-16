import express from 'express';
import { ZodError, z } from 'zod';
import { CodingWorkerError, CodingProposalSchema } from './coding-worker-contracts.js';

const errorHandler = (error, _req, res, _next) => res.status(error instanceof ZodError ? 400 : error instanceof CodingWorkerError ? error.status : 503)
  .json({ error: { code: error instanceof ZodError ? 'CODING_REQUEST_INVALID' : error instanceof CodingWorkerError ? error.code : 'CODING_UNAVAILABLE' } });
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
export function createCodingWorkerRouter({ service }) {
  const router = express.Router({ mergeParams: true });
  // Mount AFTER existing Clerk auth + Origin/rate-limit middleware. Never take
  // user/tenant IDs from request bodies or dispatch capabilities on this router.
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use((req, res, next) => req.authContext?.userId ? next() : res.status(401).json({ error: { code: 'UNAUTHENTICATED' } }));
  router.get('/', route(async (req, res) => res.json(await service.list(req.authContext, req.params.solutionId, { runId: req.query.runId }))));
  router.post('/', route(async (req, res) => {
    const body = z.object({ runId: z.uuid(), proposal: CodingProposalSchema }).strict().parse(req.body);
    res.status(201).json(await service.create(req.authContext, req.params.solutionId, body, req.get('Idempotency-Key')));
  }));
  router.get('/:jobId', route(async (req, res) => res.json(await service.read(req.authContext, req.params.solutionId, req.params.jobId, { runId: req.query.runId }))));
  for (const action of ['approve', 'cancel', 'reconcile', 'runReviewed']) {
    const path = action === 'runReviewed' ? 'run' : action;
    router.post(`/:jobId/${path}`, route(async (req, res) => res.json(await service[action](req.authContext, req.params.solutionId,
      req.params.jobId, req.body, req.get('Idempotency-Key')))));
  }
  router.use(errorHandler); return router;
}

export function createCodingDispatchRouter({ service }) {
  const router = express.Router();
  router.use(express.json({ limit: '4kb', strict: true }));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Machine endpoint: no ambient browser authority, cookies or cross-origin
    // capability use. Tokens are purpose-specific and only authorize one job.
    if (req.get('Origin') || req.get('Cookie')) return res.status(403).json({ error: { code: 'CODING_MACHINE_ONLY' } });
    next();
  });
  router.post('/jobs/:jobId/dispatch', route(async (req, res) => {
    const body = z.object({ specHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(req.body);
    const authorization = req.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) throw new CodingWorkerError('CODING_DISPATCH_DENIED', 401);
    res.status(202).json(await service.dispatch(authorization.slice(7), req.params.jobId, body.specHash));
  }));
  router.use(errorHandler); return router;
}
