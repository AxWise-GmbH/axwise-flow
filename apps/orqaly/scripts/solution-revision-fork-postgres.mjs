// Real PostgreSQL16 + actual revision service. Source releases/execution receipts
// are explicit synthetic fixtures; this script never contacts n8n or a provider.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import {
  createPostgresRepositories,
  verifySolutionRevisionForkReadiness,
} from '../server/workflow-v2/postgres-repository.js';
import {
  createSolutionRevisionService,
  rebaseWorkflowForDraft,
} from '../server/workflow-v2/solution-revision-service.js';
import { nativeOwnedErrorFixture } from '../server/workflow-v2/fixtures/native-owned-error.js';
import {
  nativeBundleHash,
  normalizeNativeBundle,
} from '../server/workflow-v2/native-workflow-bundle.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';

assert.equal(process.argv.length, 2, 'no_arguments_supported');
const suffix = randomBytes(6).toString('hex');
const container = `orqaly-revision-fork-pg-${suffix}`;
const password = randomBytes(24).toString('hex');
const docker = (args, extraEnv = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let started = false,
  admin,
  repository,
  phase = 'start';
const checks = [];
const check = (name) => {
  phase = name;
  checks.push(name);
  process.stdout.write(`check: ${name}\n`);
};
const code = (callback, expected) => assert.rejects(callback, (error) => error.code === expected);
try {
  docker(
    [
      'run',
      '--detach',
      '--name',
      container,
      '--publish',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD',
      'postgres:16',
    ],
    { POSTGRES_PASSWORD: password }
  );
  started = true;
  const port = docker(['port', container, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert(port, 'owned_loopback_port_required');
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch {
      await delay(250);
    }
  }
  admin = new pg.Client({
    connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,
    statement_timeout: 10000,
  });
  await admin.connect();
  check('all_migrations001_through021');
  const migrations = (await readdir('database/workflow-v2/migrations'))
    .filter((file) => /^\d{3}.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 21)
    .sort();
  assert.equal(migrations.length, 21);
  for (const file of migrations) {
    phase = file;
    await admin.query(await readFile(`database/workflow-v2/migrations/${file}`, 'utf8'));
  }
  for (const role of ['identity', 'api', 'worker'])
    await admin.query(
      `CREATE ROLE fork_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE orqaly_${role}`
    );
  const url = (role) => `postgresql://fork_test_${role}:${password}@127.0.0.1:${port}/postgres`;
  repository = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: url('identity'),
    apiDatabaseUrl: url('api'),
  });
  await repository.readiness();
  for (const role of ['api', 'worker']) {
    const probe = new pg.Client({ connectionString: url(role) });
    await probe.connect();
    try {
      await verifySolutionRevisionForkReadiness(probe, { api: role === 'api' });
    } finally {
      await probe.end();
    }
  }
  const auth = { userId: `user_fork${suffix}` },
    roommate = { userId: `user_roommate${suffix}` },
    other = { userId: `user_other${suffix}` };
  const tenantId = await repository.resolveTenant(auth);
  await repository.resolveTenant(other);
  await admin.query(
    "INSERT INTO orqaly.tenant_identity_bindings(tenant_id,environment,subject_type,subject_id) VALUES($1,'preview','user',$2)",
    [tenantId, roommate.userId]
  );
  const scope = { tenantId, userId: auth.userId };
  const tx = (callback) => repository.solutionBuildTransaction(scope, callback);
  const runtime = new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error('runtime_not_authorized_in_pg_proof');
        };
      },
    }
  );
  const service = createSolutionRevisionService({ repository, runtime });
  const solutionId = randomUUID(),
    revisionId = randomUUID();
  const base = nativeOwnedErrorFixture(solutionId);
  const source = nativeOwnedErrorFixture(revisionId, { fail: true });
  const environment = `fixture-${suffix}`;
  await admin.query(
    `INSERT INTO orqaly.customer_solutions(tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash,status,environment_id,deployment,approved_at,tested_at)
    VALUES($1,$2,$3,$4,'Synthetic source','No runtime execution claim',$5,$6,$7,$8,$9,$8,'active',$10,$11,clock_timestamp(),clock_timestamp())`,
    [
      tenantId,
      solutionId,
      auth.userId,
      randomUUID(),
      base.spec,
      { name: 'Synthetic Agent' },
      base.workflow,
      base.workflowHash,
      `fixture_${solutionId}`,
      environment,
      { workflowId: 'fixture-main', versionId: 'fixture-version', workflowHash: base.workflowHash },
    ]
  );
  await admin.query(
    `INSERT INTO orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,workflow,workflow_hash,spec,status,review,environment_id,approved_workflow_hash,approved_at,deployment,tested_at)
    VALUES($1,$2,$3,$4,2,1,$5,$6,$7,$8,$9,'ready',$10,$11,$8,clock_timestamp(),$12,clock_timestamp())`,
    [
      tenantId,
      solutionId,
      revisionId,
      auth.userId,
      base.workflow,
      base.spec,
      source.workflow,
      source.workflowHash,
      source.spec,
      { valid: true, workflowHash: source.workflowHash, bundleHash: source.bundleHash },
      environment,
      {
        workflowId: 'fixture-candidate',
        versionId: 'fixture-candidate-version',
        workflowHash: source.workflowHash,
        bundleHash: source.bundleHash,
      },
    ]
  );
  const invocationId = randomUUID();
  await admin.query(
    `INSERT INTO orqaly.solution_invocations(tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,output,status,execution_id,revision_id,evidence)
    VALUES($1,$2,$3,$4,'test',$5,$6,$7,$8,$9,'failed','17',$10,$11)`,
    [
      tenantId,
      solutionId,
      invocationId,
      auth.userId,
      `fixture_${invocationId}`,
      hash({ fixture: true }),
      source.workflowHash,
      source.spec.acceptanceCases[0].input,
      { synthetic: true },
      revisionId,
      { bundleHash: source.bundleHash, cleanup: { status: 'removed' } },
    ]
  );
  const snapshot = async () =>
    hash({
      parent: (
        await admin.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1', [solutionId])
      ).rows[0],
      source: (
        await admin.query('SELECT * FROM orqaly.solution_revisions WHERE id=$1', [revisionId])
      ).rows[0],
      receipt: (
        await admin.query('SELECT * FROM orqaly.solution_invocations WHERE id=$1', [invocationId])
      ).rows[0],
    });
  const before = await snapshot();
  const command = {
    expectedVersion: 0,
    workflowHash: source.workflowHash,
    bundleHash: source.bundleHash,
  };
  check('exact_owner_tenant_and_bundle_CAS');
  for (const stranger of [roommate, other])
    await code(
      () =>
        service.forkRevision(stranger, solutionId, revisionId, command, `fork_denied_${suffix}`),
      'SOLUTION_NOT_FOUND'
    );
  await code(
    () =>
      service.forkRevision(
        auth,
        solutionId,
        revisionId,
        { ...command, bundleHash: '0'.repeat(64) },
        `fork_stale_${suffix}`
      ),
    'SOLUTION_REVISION_CHANGED'
  );
  check('fork_failed_candidate_resets_authority_preserves_source_receipts');
  const result = await service.forkRevision(
    auth,
    solutionId,
    revisionId,
    command,
    `fork_exact_${suffix}`
  );
  const draft = result.revision;
  assert.equal(draft.status, 'draft');
  assert.equal(draft.rowVersion, 0);
  assert.equal(draft.version, 3);
  for (const key of ['review', 'approvedAt', 'testedAt', 'deployment'])
    assert.equal(draft[key], null);
  const expected = normalizeNativeBundle({
    workflow: rebaseWorkflowForDraft(source.workflow, draft.id),
    spec: source.spec,
    id: draft.id,
  });
  assert.deepEqual(draft.workflow, expected.workflow);
  assert.deepEqual(draft.spec, expected.spec);
  assert.equal(draft.bundleHash, expected.bundleHash);
  assert.notEqual(draft.bundleHash, source.bundleHash);
  assert.equal(await snapshot(), before);
  assert.equal(result.invocations.length, 1);
  assert.equal(result.invocations[0].revisionId, revisionId);
  assert.equal(result.invocations[0].evidence.bundleHash, source.bundleHash);
  assert.equal(
    result.invocations.some((entry) => entry.revisionId === draft.id),
    false
  );
  check('durable_idempotency_after_restart_and_new_key_draft_conflict');
  const restarted = createSolutionRevisionService({ repository, runtime });
  const replay = await restarted.forkRevision(
    auth,
    solutionId,
    revisionId,
    command,
    `fork_exact_${suffix}`
  );
  assert.equal(replay.revision.id, draft.id);
  await code(
    () => restarted.forkRevision(auth, solutionId, revisionId, command, `fork_second_${suffix}`),
    'SOLUTION_EDITABLE_DRAFT_EXISTS'
  );
  await code(
    () =>
      restarted.forkRevision(
        auth,
        solutionId,
        revisionId,
        { ...command, expectedVersion: 1 },
        `fork_exact_${suffix}`
      ),
    'IDEMPOTENCY_CONFLICT'
  );
  check('ledger_RLS_owner_FK_append_only_and_worker_denied');
  assert.equal(
    (
      await repository.solutionBuildTransaction({ tenantId, userId: roommate.userId }, (client) =>
        client.query('SELECT * FROM orqaly.solution_revision_forks')
      )
    ).rowCount,
    0
  );
  await code(
    () =>
      tx((client) =>
        client.query('UPDATE orqaly.solution_revision_forks SET request_hash=$1', ['0'.repeat(64)])
      ),
    '42501'
  );
  await code(
    () => tx((client) => client.query('DELETE FROM orqaly.solution_revision_forks')),
    '42501'
  );
  await code(
    () =>
      tx((client) =>
        client.query(
          `INSERT INTO orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,workflow,workflow_hash,spec,status)
    VALUES($1,$2,$3,$4,99,1,$5,$6,$5,$7,$6,'rejected')`,
          [
            tenantId,
            solutionId,
            randomUUID(),
            roommate.userId,
            base.workflow,
            base.spec,
            base.workflowHash,
          ]
        )
      ),
    '23503'
  );
  const grants = (
    await admin.query(
      "SELECT has_table_privilege('orqaly_worker','orqaly.solution_revision_forks','SELECT') AS worker_read, relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='orqaly.solution_revision_forks'::regclass"
    )
  ).rows[0];
  assert.deepEqual(grants, { worker_read: false, relrowsecurity: true, relforcerowsecurity: true });
  check('frozen_child_bytes_immutable_and_unresolved_receipt_blocks_new_fork');
  await code(
    () =>
      tx((client) =>
        client.query(
          "UPDATE orqaly.solution_revisions SET spec=jsonb_set(spec,'{ownedDependencies,0,spec,requirements,0,description}','\"changed\"'),row_version=row_version+1 WHERE id=$1",
          [revisionId]
        )
      ),
    '42501'
  );
  const uncertainId = randomUUID();
  await admin.query(
    `INSERT INTO orqaly.solution_invocations(tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,status,revision_id,created_at)
    VALUES($1,$2,$3,$4,'test',$5,$6,$7,'{}','outcome_unknown',$8,'2020-01-01')`,
    [
      tenantId,
      solutionId,
      uncertainId,
      auth.userId,
      `uncertain_${suffix}`,
      hash({ uncertainId }),
      source.workflowHash,
      revisionId,
    ]
  );
  await code(
    () => service.forkRevision(auth, solutionId, revisionId, command, `fork_unknown_${suffix}`),
    'SOLUTION_REVISION_FORK_BLOCKED'
  );
  assert.equal(
    (await service.read(auth, solutionId)).revisions.find((entry) => entry.id === revisionId)
      .forkEligibility.allowed,
    false
  );
  assert.equal(nativeBundleHash({ workflow: draft.workflow, spec: draft.spec }), draft.bundleHash);
  const migrationHash = createHash('sha256')
    .update(
      await readFile('database/workflow-v2/migrations/021_solution_revision_dependencies.sql')
    )
    .digest('hex');
  process.stdout.write(
    `${JSON.stringify({ status: 'passed', checks: checks.length, migration021Hash: migrationHash, boundary: 'real_postgres_service_only_synthetic_release_and_receipts_no_runtime' })}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', phase, code: error.code ?? 'FIXTURE_ASSERTION', message: error.code && error.code !== 'ERR_ASSERTION' ? 'Database/service boundary failed' : String(error.message).slice(0, 200) })}\n`
  );
  process.exitCode = 1;
} finally {
  await repository?.close().catch(() => {});
  await admin?.end().catch(() => {});
  if (started) docker(['rm', '--force', container]);
}
