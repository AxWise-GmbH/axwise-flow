// Release audit for the single customer-approved preview solution. Secrets stay
// in memory. Database probes always roll back; no outbound execution is allowed.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createSolutionService } from '../server/workflow-v2/solution-service.js';

const project = 'axwise-v2-preview-001';
const tenantId = 'c1b26d36-721b-5d8c-8d4c-180050ee9b94';
const userId = 'user_2vHlB9JhH4FazWsgKYENFIeAnMu';
const solutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const sourceRun = '837fdcaf-3536-5901-b044-94faf03d7a7b';
let proxy;
let client;
let stage = 'connect';
try {
  const secret = execFileSync(
    'gcloud',
    [
      'secrets',
      'versions',
      'access',
      '2',
      '--secret=orqaly-v2-preview-001-db-api-url',
      `--project=${project}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  // pg accepts an empty hostname for Unix sockets; WHATWG URL does not.
  const url = new URL(secret.replace('@/', '@localhost/'));
  url.hostname = '127.0.0.1';
  url.port = '19479';
  url.searchParams.delete('host');
  url.searchParams.delete('sslmode');
  proxy = spawn(
    'cloud-sql-proxy',
    [
      `${project}:europe-west4:orqaly-v2-preview-001-pg`,
      '--gcloud-auth',
      '--address=127.0.0.1',
      '--port=19479',
    ],
    { stdio: 'ignore' }
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    if (proxy.exitCode !== null) throw new Error('evidence_proxy_failed');
    const candidate = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 1000 });
    try {
      await candidate.connect();
      client = candidate;
      break;
    } catch {
      await candidate.end();
      await delay(500);
    }
  }
  assert(client, 'evidence_database_unavailable');
  async function transaction(scope, fn) {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('orqaly.tenant_id',$1,true)", [scope]);
      return await fn(client);
    } finally {
      await client.query('ROLLBACK');
    }
  }
  const baseline = await transaction(tenantId, async (db) => {
    stage = 'solution_exists_and_paused';
    const solution = (
      await db.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1 AND owner_user_id=$2', [
        solutionId,
        userId,
      ])
    ).rows[0];
    assert(solution, 'solution_missing');
    assert.equal(solution.status, 'paused', 'audit_requires_paused_endpoint');
    stage = 'history_count_and_execution_ids';
    const history = (
      await db.query(
        'SELECT * FROM orqaly.solution_invocations WHERE solution_id=$1 ORDER BY created_at',
        [solutionId]
      )
    ).rows;
    assert.equal(history.length, 3);
    assert.deepEqual(
      history.map((value) => value.execution_id),
      ['1', '2', '3']
    );
    assert(history.every((value) => value.status === 'succeeded'));
    stage = 'history_outputs';
    assert.equal(history[0].output.customer_name, 'Alice');
    assert.equal(history[1].output.customer_name, 'Bob');
    stage = 'original_checklist_exists';
    const artifact = (
      await db.query(
        `SELECT a.markdown,a.content_hash,a.canonical_content FROM orqaly.workflow_runs r JOIN orqaly.artifacts a
       ON a.tenant_id=r.tenant_id AND a.run_id=r.id AND a.id=r.final_artifact_id
       WHERE r.id=$1`,
        [sourceRun]
      )
    ).rows[0];
    assert(artifact?.markdown, 'original_checklist_missing');
    // The previous release attested the full canonical artifact, not raw Markdown.
    const artifactHash = createHash('sha256').update(artifact.canonical_content).digest('hex');
    stage = 'original_checklist_hash';
    assert.equal(artifactHash, artifact.content_hash);
    assert.equal(artifactHash, '3d88e4bd299f1a1f3560aa705664fb46f9bf1cb93463c86522cc0c61feeecf5a');
    return { solution, history, artifactHash };
  });
  let outboundCalls = 0;
  const service = createSolutionService({
    repository: {
      resolveTenant: async ({ userId: caller }) => (caller === userId ? tenantId : randomUUID()),
      solutionTransaction: transaction,
    },
    runtime: {
      select: () => null,
      describe: (id) => ({ id }),
      invoke: async () => {
        outboundCalls++;
        throw new Error('audit_forbids_execution');
      },
    },
  });
  const prior = baseline.history[1];
  stage = 'same_key_replay';
  const replay = await service.invoke(
    { userId },
    solutionId,
    {
      mode: prior.mode,
      input: prior.input,
    },
    prior.idempotency_key
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.invocation.executionId, '2');
  stage = 'paused_call_denial';
  await assert.rejects(
    service.invoke(
      { userId },
      solutionId,
      {
        mode: 'production',
        input: prior.input,
      },
      randomUUID()
    ),
    { code: 'SOLUTION_NOT_ACTIVE' }
  );
  stage = 'other_owner_denial';
  await assert.rejects(service.read({ userId: 'user_release_audit_other' }, solutionId), {
    code: 'SOLUTION_NOT_FOUND',
  });
  stage = 'rls_isolation';
  const hidden = await transaction(randomUUID(), (db) =>
    db.query('SELECT id FROM orqaly.customer_solutions WHERE id=$1', [solutionId])
  );
  assert.equal(hidden.rowCount, 0, 'cross_tenant_rls_leak');
  assert.equal(outboundCalls, 0);
  console.log(
    JSON.stringify(
      {
        verified: true,
        solutionId,
        status: baseline.solution.status,
        environmentId: baseline.solution.environment_id,
        deployment: baseline.solution.deployment,
        workflowHash: baseline.solution.workflow_hash,
        history: baseline.history.map((value) => ({
          id: value.id,
          mode: value.mode,
          status: value.status,
          executionId: value.execution_id,
          output: value.output,
        })),
        checks: [
          'same_key_replay_no_dispatch',
          'paused_production_denied',
          'other_owner_read_denied',
          'live_api_role_cross_tenant_rls_denied',
          'original_sms_checklist_hash_unchanged',
        ],
        originalChecklistArtifactHash: baseline.artifactHash,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify({
      verified: false,
      stage,
      code: error.code || 'evidence_failed',
      message: 'Release audit failed; no credentials or raw database errors logged.',
    })
  );
  process.exitCode = 1;
} finally {
  await client?.end();
  proxy?.kill('SIGTERM');
}
