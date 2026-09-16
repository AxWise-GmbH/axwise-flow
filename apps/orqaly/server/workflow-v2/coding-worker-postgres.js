import { CodingWorkerError } from './coding-worker-contracts.js';

export function createPostgresCodingStore(repository) {
  const transaction = (scope, callback) => repository.solutionBuildTransaction(scope, callback);
  async function owned(client, scope) {
    const result = await client.query(`SELECT solution.id FROM orqaly.customer_solutions solution
      JOIN orqaly.tenants tenant ON tenant.id=solution.tenant_id AND tenant.status='active'
      JOIN orqaly.workflow_runs run ON run.tenant_id=solution.tenant_id AND run.id=$4 AND run.owner_user_id=$2
      WHERE solution.tenant_id=$1 AND solution.owner_user_id=$2 AND solution.id=$3`,
    [scope.tenantId, scope.userId, scope.solutionId, scope.runId]);
    if (!result.rows[0]) throw new CodingWorkerError('CODING_SCOPE_NOT_FOUND', 404);
  }
  async function read(client, scope, id, lock = false) {
    const result = await client.query(`SELECT * FROM orqaly.solution_coding_jobs WHERE tenant_id=$1 AND owner_user_id=$2
      AND solution_id=$3 AND run_id=$4 AND id=$5 ${lock ? 'FOR UPDATE' : ''}`,
    [scope.tenantId, scope.userId, scope.solutionId, scope.runId, id]);
    if (!result.rows[0]) throw new CodingWorkerError('CODING_JOB_NOT_FOUND', 404);
    const job = result.rows[0];
    job.orchestration = (await client.query(`SELECT id,status,environment_id,evidence,created_at,updated_at
      FROM orqaly.solution_coding_dispatches WHERE tenant_id=$1 AND owner_user_id=$2 AND job_id=$3`,
    [scope.tenantId, scope.userId, id])).rows[0] || null;
    return job;
  }
  return {
    claim: (executionId) => repository.claimCodingJob(executionId),
    readDispatch: (scope, jobId) => transaction(scope, async (client) => {
      await owned(client, scope); await read(client, scope, jobId);
      return (await client.query('SELECT * FROM orqaly.solution_coding_dispatches WHERE tenant_id=$1 AND owner_user_id=$2 AND job_id=$3', [scope.tenantId, scope.userId, jobId])).rows[0] || null;
    }),
    async beginDispatch(scope, jobId, { id, key, expectedVersion, environmentId }) {
      return transaction(scope, async (client) => {
        await owned(client, scope); const job = await read(client, scope, jobId, true);
        const previous = (await client.query('SELECT * FROM orqaly.solution_coding_dispatches WHERE tenant_id=$1 AND job_id=$2', [scope.tenantId, jobId])).rows[0];
        if (previous) return { created: false, dispatch: previous };
        if (job.status !== 'approved' || job.row_version !== expectedVersion) throw new CodingWorkerError('CODING_RUN_STATE_CONFLICT');
        const result = await client.query(`INSERT INTO orqaly.solution_coding_dispatches
          (tenant_id,id,owner_user_id,solution_id,run_id,job_id,request_key,environment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [scope.tenantId, id, scope.userId, scope.solutionId, scope.runId, jobId, key, environmentId]);
        return { created: true, dispatch: result.rows[0] };
      });
    },
    async updateDispatch(scope, id, { status = 'initiating', credentialId = null, evidence = null, cleanupOnly = false }) {
      return transaction(scope, async (client) => {
        await owned(client, scope);
        const result = await client.query(`UPDATE orqaly.solution_coding_dispatches SET status=$6,credential_id=COALESCE($7,credential_id),
          evidence=COALESCE($8::jsonb,evidence),row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND run_id=$4 AND id=$5 AND (status='initiating' OR ($9 AND status='outcome_unknown')) RETURNING *`,
        [scope.tenantId, scope.userId, scope.solutionId, scope.runId, id, status, credentialId, evidence ? JSON.stringify(evidence) : null, cleanupOnly]);
        if (!result.rows[0]) throw new CodingWorkerError('CODING_DISPATCH_STATE_CONFLICT');
        return result.rows[0];
      });
    },
    async insert(scope, value) {
      return transaction(scope, async (client) => {
        await owned(client, scope);
        const result = await client.query(`INSERT INTO orqaly.solution_coding_jobs
          (tenant_id,id,owner_user_id,solution_id,run_id,spec,spec_hash,request_key) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
          ON CONFLICT(tenant_id,owner_user_id,solution_id,request_key) DO NOTHING RETURNING *`,
        [scope.tenantId, value.id, scope.userId, scope.solutionId, scope.runId, JSON.stringify(value.spec), value.specHash, value.key]);
        const saved = result.rows[0] || (await client.query(`SELECT * FROM orqaly.solution_coding_jobs
          WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND request_key=$4`,
        [scope.tenantId, scope.userId, scope.solutionId, value.key])).rows[0];
        if (saved.spec_hash !== value.specHash || saved.run_id !== scope.runId) throw new CodingWorkerError('CODING_IDEMPOTENCY_CONFLICT');
        return saved;
      });
    },
    read: (scope, id) => transaction(scope, async (client) => { await owned(client, scope); return read(client, scope, id); }),
    list: (scope) => transaction(scope, async (client) => { await owned(client, scope); return (await client.query(`SELECT * FROM orqaly.solution_coding_jobs
      WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND run_id=$4 ORDER BY created_at DESC LIMIT 50`,
    [scope.tenantId, scope.userId, scope.solutionId, scope.runId])).rows; }),
    async transition(scope, id, change) {
      return transaction(scope, async (client) => {
        await owned(client, scope); const current = await read(client, scope, id, true);
        if (!change.from.includes(current.status)) return { changed: false, job: current };
        if (change.expectedVersion !== undefined && current.row_version !== change.expectedVersion)
          throw new CodingWorkerError('CODING_VERSION_CONFLICT');
        if (change.specHash && current.spec_hash !== change.specHash) throw new CodingWorkerError('CODING_SPEC_CONFLICT');
        const result = await client.query(`UPDATE orqaly.solution_coding_jobs SET status=$6,
          approval_id=COALESCE($7,approval_id),approved_at=CASE WHEN $7::uuid IS NOT NULL THEN clock_timestamp() ELSE approved_at END,
          execution_id=COALESCE($8,execution_id),execution_deadline=COALESCE($9,execution_deadline),evidence=$10::jsonb,artifacts=$11::jsonb,
          row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND run_id=$4 AND id=$5 RETURNING *`,
        [scope.tenantId, scope.userId, scope.solutionId, scope.runId, id, change.status, change.approvalId || null,
          change.executionId || null, change.deadline || null, JSON.stringify(change.evidence ?? current.evidence), JSON.stringify(change.artifacts ?? current.artifacts)]);
        return { changed: true, job: result.rows[0] };
      });
    },
  };
}
