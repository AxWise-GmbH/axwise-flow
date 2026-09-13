import express from 'express';
import { access } from 'node:fs/promises';
import { z } from 'zod';
import { CodingScopeSchema, CodingWorkerError, codingHash, prepareCodingSpec } from './coding-worker-contracts.js';
import { CLOUD_RUN_SANDBOX_BIN, createCloudRunCodingSandbox, runSandboxCommand } from './coding-worker-cloud-run.js';

const proposalKeys = ['kind', 'title', 'source', 'changes', 'tests', 'outputs', 'timeoutMs'];
export function createCodingWorkerApp({ sandbox, previewAcceptance = false }) {
  const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit: '1000kb', strict: true }));
  const receipts = new Map();
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/readyz', async (_req, res) => {
    try { await access(CLOUD_RUN_SANDBOX_BIN); await access('/opt/coding-rootfs/usr/local/bin/node'); await access('/opt/coding-rootfs/usr/bin/prlimit');
      res.json({ status: 'ready', runtime: sandbox.descriptor, isolationVerified: false }); }
    catch { res.status(503).json({ status: 'sandbox_unavailable' }); }
  });
  const validated = (body, reconcile = false) => {
    const scope = CodingScopeSchema.parse(body?.scope); const job = body?.job;
    z.uuid().parse(job?.id); z.uuid().parse(job?.execution_id); z.uuid().parse(job?.approval_id);
    if (job.status !== 'running' && !(reconcile && job.status === 'outcome_unknown')) throw new CodingWorkerError('CODING_JOB_NOT_CLAIMED');
    const proposal = Object.fromEntries(proposalKeys.map((key) => [key, job.spec?.[key]]));
    const prepared = prepareCodingSpec(proposal, sandbox.descriptor);
    if (codingHash(prepared) !== job.spec_hash || codingHash(job.spec) !== job.spec_hash)
      throw new CodingWorkerError('CODING_SPEC_CONFLICT');
    if (job.tenant_id !== scope.tenantId || job.owner_user_id !== scope.userId || job.solution_id !== scope.solutionId || job.run_id !== scope.runId)
      throw new CodingWorkerError('CODING_SCOPE_CONFLICT', 403);
    return { scope, job };
  };
  app.post('/v1/execute', async (req, res, next) => {
    try {
      const { scope, job } = validated(req.body); const key = `${codingHash(scope)}:${job.id}:${job.spec_hash}`;
      if (receipts.has(key)) return res.json(await receipts.get(key));
      if (receipts.size > 30) throw new CodingWorkerError('CODING_INSTANCE_RECEIPT_LIMIT', 429);
      const running = sandbox.run(scope, job); receipts.set(key, running);
      res.json(await running);
    } catch (error) { next(error); }
  });
  app.post('/v1/reconcile', async (req, res, next) => { try { const { scope, job } = validated(req.body, true); res.json(await sandbox.reconcile(scope, job)); } catch (error) { next(error); } });
  if (previewAcceptance) {
    app.post('/acceptance/outbound', (req, res, next) => {
      try { z.object({ source: z.literal('orqaly-preview'), message: z.string().max(1000) }).strict().parse(req.body); res.status(204).end(); } catch (error) { next(error); }
    });
    app.get('/diagnostics/sandbox-help', async (_req, res, next) => {
      try { const result = await runSandboxCommand(['run', '--help']); res.json({ code: result.code, help: result.stdout.slice(0, 12000) }); } catch (error) { next(error); }
    });
  }
  app.use((error, _req, res, _next) => res.status(error instanceof z.ZodError ? 400 : error instanceof CodingWorkerError ? error.status : 503)
    .json({ error: { code: error instanceof z.ZodError ? 'CODING_REQUEST_INVALID' : error instanceof CodingWorkerError ? error.code : 'CODING_RUNTIME_UNAVAILABLE' } }));
  return app;
}

if (process.argv[1]?.endsWith('/coding-worker-main.js')) {
  const sandbox = createCloudRunCodingSandbox({ image: process.env.ORQALY_CODING_WORKER_IMAGE_SHA256 });
  createCodingWorkerApp({ sandbox, previewAcceptance: process.env.ORQALY_CODING_PREVIEW_ACCEPTANCE === 'true' })
    .listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
