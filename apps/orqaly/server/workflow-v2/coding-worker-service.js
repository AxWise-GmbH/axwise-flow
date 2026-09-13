import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CodingScopeSchema, CodingHashSchema, CodingKeySchema, CodingWorkerError, codingHash, prepareCodingSpec, publicCodingJob } from './coding-worker-contracts.js';
import { validateCodingReceipt } from './coding-worker-receipt.js';

const commandSchema = z.object({ runId: z.uuid(), expectedVersion: z.number().int().min(0), specHash: CodingHashSchema }).strict();
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'cancelled', 'outcome_unknown']);
export function createCodingWorkerService({ repository, store, sandbox, signingKey, launcher = null, now = Date.now }) {
  if (!Buffer.isBuffer(signingKey) || signingKey.length < 32) throw new Error('coding_dispatch_signing_key_required');
  const mac = (body) => createHmac('sha256', signingKey).update(body).digest('base64url');
  async function scopeFor(auth, solutionId, runId) {
    if (!auth?.userId) throw new CodingWorkerError('UNAUTHENTICATED', 401);
    return CodingScopeSchema.parse({ tenantId: await repository.resolveTenant({ userId: auth.userId }), userId: auth.userId, solutionId, runId });
  }
  function encode(scope, job) {
    const body = Buffer.from(JSON.stringify({ v: 1, scope, jobId: job.id, specHash: job.spec_hash, expiresAt: now() + 300000 })).toString('base64url');
    return `${body}.${mac(body)}`;
  }
  function decode(token, jobId, specHash) {
    if (typeof token !== 'string' || token.length > 3000) throw new CodingWorkerError('CODING_DISPATCH_DENIED', 401);
    const [body, signature, extra] = token.split('.'); const expected = Buffer.from(mac(body || '')); const actual = Buffer.from(signature || '');
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new CodingWorkerError('CODING_DISPATCH_DENIED', 401);
    let claim;
    try { claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw new CodingWorkerError('CODING_DISPATCH_DENIED', 401); }
    if (claim.v !== 1 || claim.jobId !== jobId || claim.specHash !== specHash || !Number.isSafeInteger(claim.expiresAt) || claim.expiresAt <= now())
      throw new CodingWorkerError('CODING_DISPATCH_DENIED', 401);
    claim.scope = CodingScopeSchema.parse(claim.scope); return claim;
  }
  return {
    enabled: true,
    async create(auth, solutionId, command, key) {
      const scope = await scopeFor(auth, solutionId, command.runId); CodingKeySchema.parse(key);
      const spec = prepareCodingSpec(command.proposal, sandbox.descriptor);
      const saved = await store.insert(scope, { id: randomUUID(), spec, specHash: codingHash(spec), key });
      return { job: publicCodingJob(saved, { includeSource: true }) };
    },
    async list(auth, solutionId, { runId }) {
      const scope = await scopeFor(auth, solutionId, runId);
      return { jobs: (await store.list(scope)).map((job) => publicCodingJob(job)) };
    },
    async read(auth, solutionId, jobId, { runId }) {
      const scope = await scopeFor(auth, solutionId, runId);
      return { job: publicCodingJob(await store.read(scope, z.uuid().parse(jobId)), { includeSource: true }) };
    },
    async approve(auth, solutionId, jobId, command, key) {
      const parsed = commandSchema.parse(command); CodingKeySchema.parse(key);
      const scope = await scopeFor(auth, solutionId, parsed.runId); const job = await store.read(scope, z.uuid().parse(jobId));
      if (job.spec_hash !== parsed.specHash) throw new CodingWorkerError('CODING_SPEC_CONFLICT');
      if (job.status === 'approved') return { job: publicCodingJob(job) };
      const result = await store.transition(scope, jobId, { from: ['proposed'], status: 'approved', expectedVersion: parsed.expectedVersion,
        specHash: parsed.specHash, approvalId: randomUUID() });
      if (!result.changed) throw new CodingWorkerError('CODING_APPROVAL_STATE_CONFLICT');
      return { job: publicCodingJob(result.job) };
    },
    async cancel(auth, solutionId, jobId, command) {
      const parsed = commandSchema.parse(command); const scope = await scopeFor(auth, solutionId, parsed.runId);
      const result = await store.transition(scope, z.uuid().parse(jobId), { from: ['proposed', 'approved', 'queued'], status: 'cancelled', expectedVersion: parsed.expectedVersion, specHash: parsed.specHash });
      if (!result.changed) throw new CodingWorkerError('CODING_CANNOT_CANCEL_RUNNING');
      return { job: publicCodingJob(result.job) };
    },
    async dispatchCapability(auth, solutionId, jobId, { runId, specHash }) {
      const scope = await scopeFor(auth, solutionId, runId); const job = await store.read(scope, z.uuid().parse(jobId));
      if (job.spec_hash !== CodingHashSchema.parse(specHash) || !['approved', 'queued', 'running', 'succeeded', 'failed', 'timed_out'].includes(job.status))
        throw new CodingWorkerError('CODING_DISPATCH_NOT_APPROVED');
      return { token: encode(scope, job), jobId, specHash: job.spec_hash, expiresAt: new Date(now() + 300000).toISOString() };
    },
    async dispatch(token, jobId, specHash) {
      const claim = decode(token, z.uuid().parse(jobId), CodingHashSchema.parse(specHash));
      const scope = claim.scope; const current = await store.read(scope, jobId);
      if (current.spec_hash !== specHash) throw new CodingWorkerError('CODING_SPEC_CONFLICT');
      if (['queued', 'running'].includes(current.status) || terminal.has(current.status)) return { job: publicCodingJob(current), replayed: true };
      const result = await store.transition(scope, jobId, { from: ['approved'], status: 'queued', specHash });
      if (!result.changed) throw new CodingWorkerError('CODING_DISPATCH_NOT_APPROVED');
      return { job: publicCodingJob(result.job), replayed: false };
    },
    async runReviewed(auth, solutionId, jobId, command, key) {
      const parsed = commandSchema.parse(command); CodingKeySchema.parse(key);
      if (!launcher) throw new CodingWorkerError('CODING_N8N_NOT_CONFIGURED', 503);
      const scope = await scopeFor(auth, solutionId, parsed.runId); const job = await store.read(scope, z.uuid().parse(jobId));
      const prior = await store.readDispatch?.(scope, jobId);
      if (prior && job.spec_hash === parsed.specHash && prior.request_key === key)
        return { job: publicCodingJob(job), orchestration: { ...prior.evidence, status: prior.status, replayed: true } };
      if (prior) throw new CodingWorkerError('CODING_RUN_STATE_CONFLICT');
      if (job.spec_hash !== parsed.specHash || job.row_version !== parsed.expectedVersion || job.status !== 'approved')
        throw new CodingWorkerError('CODING_RUN_STATE_CONFLICT');
      const orchestration = await launcher.queue(scope, { job, token: encode(scope, job), key });
      return { job: publicCodingJob(await store.read(scope, jobId)), orchestration };
    },
    async advanceOne() {
      const claim = await store.claim(randomUUID());
      if (!claim) return { processed: false };
      const { jobId, executionId, ...claimedScope } = claim; const scope = CodingScopeSchema.parse(claimedScope);
      const job = await store.read(scope, jobId); const specHash = job.spec_hash;
      if (job.status !== 'running' || job.execution_id !== executionId) throw new CodingWorkerError('CODING_CLAIM_CHANGED');
      let receipt;
      try { receipt = await sandbox.run(scope, job); }
      catch { receipt = { status: 'outcome_unknown', evidence: { specHash, executionId,
        failureCode: 'CODING_RUNTIME_OUTCOME_UNKNOWN', cleanup: { status: 'pending' } }, artifacts: [] }; }
      const { actual, bound } = validateCodingReceipt(scope, job, receipt);
      const saved = await store.transition(scope, jobId, { from: ['running'], status: actual ? receipt.status : 'outcome_unknown',
        specHash, evidence: bound ? receipt.evidence : { specHash, executionId, cleanup: { status: 'pending' }, failureCode: 'CODING_RECEIPT_UNVERIFIED' }, artifacts: actual ? receipt.artifacts : [] });
      return { processed: true, jobId, status: saved.job.status };
    },
    async reconcile(auth, solutionId, jobId, command) {
      const parsed = commandSchema.parse(command); const scope = await scopeFor(auth, solutionId, parsed.runId);
      const job = await store.read(scope, z.uuid().parse(jobId));
      if (job.row_version !== parsed.expectedVersion || job.spec_hash !== parsed.specHash) throw new CodingWorkerError('CODING_VERSION_CONFLICT');
      const dispatch = await store.readDispatch?.(scope, jobId);
      if (launcher?.reconcile && dispatch && ['initiating', 'outcome_unknown'].includes(dispatch.status) &&
        (dispatch.evidence?.workflowCleanup !== 'removed' || dispatch.evidence?.credentialCleanup !== 'removed')) {
        const orchestration = await launcher.reconcile(scope, { job, dispatch });
        return { job: publicCodingJob(await store.read(scope, jobId)), orchestration };
      }
      const pendingUnknown = job.status === 'outcome_unknown' && job.evidence?.cleanup?.status !== 'removed';
      if ((!pendingUnknown && (job.status !== 'running' || new Date(job.execution_deadline).getTime() > now())) ||
        job.row_version !== parsed.expectedVersion || job.spec_hash !== parsed.specHash)
        throw new CodingWorkerError('CODING_RECONCILE_NOT_READY');
      const cleanup = await sandbox.reconcile(scope, job);
      if (pendingUnknown && cleanup.status !== 'removed') return { job: publicCodingJob(job) };
      const result = await store.transition(scope, jobId, { from: [job.status], status: 'outcome_unknown', expectedVersion: parsed.expectedVersion,
        specHash: parsed.specHash, evidence: pendingUnknown ? { ...job.evidence, cleanup: { status: 'removed' } } :
          { specHash: job.spec_hash, executionId: job.execution_id, cleanup, failureCode: 'CODING_INTERRUPTED_OUTCOME_UNKNOWN' }, artifacts: job.artifacts || [] });
      return { job: publicCodingJob(result.job) };
    },
  };
}
