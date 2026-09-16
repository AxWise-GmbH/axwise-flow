import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { bootstrapSolutionOwner } from '../infra/n8n/bootstrap-solution-owner.mjs';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { createSolutionService } from '../server/workflow-v2/solution-service.js';
import { createSolutionRevisionService } from '../server/workflow-v2/solution-revision-service.js';
import { createSolutionApplicationKeyService } from '../server/workflow-v2/solution-application-key-service.js';
import { createWorkflowHttpApp } from '../server/workflow-v2/http-app.js';
import { verifySolutionApplicationAccess } from './solution-app-access-local-e2e.mjs';

const suffix = randomBytes(5).toString('hex');
const postgresArgument =
  process.argv.find((arg) => arg.startsWith('--postgres-major=')) ?? '--postgres-major=16';
assert.match(postgresArgument, /^--postgres-major=(16|17)$/);
const postgresMajor = Number(postgresArgument.split('=')[1]);
const resources = [];
const password = randomBytes(24).toString('hex');
const image =
  'docker.io/n8nio/n8n:2.37.10@sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec';
function docker(args, env = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
async function eventually(fn) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      return await fn();
    } catch {
      await delay(500);
    }
  }
  throw new Error('local_dependency_startup_timeout');
}
if (process.argv[2] !== 'inside') {
  try {
    const network = `orqaly-solutions-test-${suffix}`;
    docker(['network', 'create', '--internal', network]);
    resources.push(['network', 'rm', network]);
    const dbName = `${network}-pg`;
    const n8nName = `${network}-n8n`;
    for (const name of [dbName, n8nName]) resources.push(['rm', '--force', name]);
    docker(
      [
        'run',
        '--detach',
        '--name',
        dbName,
        '--network',
        network,
        '-e',
        'POSTGRES_PASSWORD',
        `postgres:${postgresMajor}-alpine`,
      ],
      { POSTGRES_PASSWORD: password }
    );
    await eventually(async () =>
      docker(['exec', dbName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'])
    );
    execFileSync(
      'docker',
      ['exec', '-i', dbName, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      {
        input: `CREATE ROLE solution_n8n LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;\nCREATE DATABASE solution_n8n OWNER solution_n8n;\nREVOKE CONNECT ON DATABASE postgres FROM PUBLIC;`,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    docker(
      [
        'run',
        '--detach',
        '--name',
        n8nName,
        '--network',
        network,
        '--mount',
        `type=bind,source=${process.cwd()},target=/work,readonly`,
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--memory=1g',
        '--cpus=1',
        '-e',
        'DB_TYPE=postgresdb',
        '-e',
        `DB_POSTGRESDB_HOST=${dbName}`,
        '-e',
        'DB_POSTGRESDB_DATABASE=solution_n8n',
        '-e',
        'DB_POSTGRESDB_USER=solution_n8n',
        '-e',
        'DB_POSTGRESDB_PASSWORD',
        '-e',
        'N8N_ENCRYPTION_KEY',
        '-e',
        'N8N_DISABLE_UI=true',
        '-e',
        'N8N_SECURE_COOKIE=false',
        '-e',
        'N8N_DIAGNOSTICS_ENABLED=false',
        '-e',
        'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
        '-e',
        'N8N_TEMPLATES_ENABLED=false',
        '-e',
        'N8N_BLOCK_ENV_ACCESS_IN_NODE=true',
        '-e',
        'NODES_INCLUDE=["n8n-nodes-base.webhook","n8n-nodes-base.set","n8n-nodes-base.respondToWebhook"]',
        '-e',
        'EXECUTIONS_DATA_SAVE_ON_SUCCESS=none',
        '-e',
        'EXECUTIONS_DATA_SAVE_ON_ERROR=none',
        image,
      ],
      { DB_POSTGRESDB_PASSWORD: password, N8N_ENCRYPTION_KEY: randomBytes(32).toString('hex') }
    );
    execFileSync(
      'docker',
      [
        'exec',
        '--workdir',
        '/work',
        n8nName,
        'node',
        'scripts/solution-local-e2e.mjs',
        'inside',
        postgresArgument,
      ],
      { stdio: 'inherit' }
    );
  } catch (error) {
    process.stderr.write(
      `${error.name}: local solution acceptance failed (${error.code || error.status || 'unknown'}): ${error.message}\n`
    );
    process.exitCode = 1;
  } finally {
    for (const args of resources.reverse()) {
      try {
        docker(args);
      } catch {
        /* test-only resource */
      }
    }
  }
  process.exit(process.exitCode || 0);
}
let admin;
let repository;
try {
  const testPassword = process.env.DB_POSTGRESDB_PASSWORD;
  const baseUrl = `postgresql://postgres:${testPassword}@${process.env.DB_POSTGRESDB_HOST}:5432/postgres`;
  admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  const postgresVersion = Number(
    (await admin.query('SHOW server_version_num')).rows[0].server_version_num
  );
  assert.equal(Math.floor(postgresVersion / 10000), postgresMajor, 'PostgreSQL version parity');
  for (const filename of (await readdir('database/workflow-v2/migrations'))
    .filter((name) => /^\d{3}.*\.sql$/.test(name))
    .sort()) {
    await admin.query(await readFile(`database/workflow-v2/migrations/${filename}`, 'utf8'));
  }
  const origin = 'http://127.0.0.1:5678';
  await eventually(async () => {
    assert.equal((await fetch(`${origin}/healthz/readiness`)).status, 200);
  });
  const apiKey = await bootstrapSolutionOwner({
    origin,
    email: 'solution-test@example.com',
    password: `TestA${testPassword}1`,
  });
  const roleUrl = (role) => {
    const url = new URL(baseUrl);
    url.searchParams.set('options', `-c role=${role}`);
    return url.href;
  };
  repository = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: roleUrl('orqaly_identity'),
    apiDatabaseUrl: roleUrl('orqaly_api'),
    workerDatabaseUrl: null,
  });
  const auth = { userId: `user_solution${suffix}` };
  const otherAuth = { userId: `user_other${suffix}` };
  const tenantId = await repository.resolveTenant(auth);
  const agentId = randomUUID();
  const runtime = createSolutionRuntime({
    bindings: [
      {
        id: `solution-test-${suffix}`,
        tenantId,
        userId: auth.userId,
        name: 'Isolated local acceptance environment',
        region: 'local',
        origin,
        apiKey,
        useIdToken: false,
      },
    ],
    allowLocalHttp: true,
  });
  const service = createSolutionService({
    repository,
    runtime,
    agentService: {
      read: async () => ({
        body: { agent: { id: agentId, state: 'active', display_name: 'Acceptance Agent' } },
      }),
    },
  });
  const command = {
    agentId,
    name: 'Contact normalization',
    purpose: 'Return cleaned contact fields',
    spec: {
      kind: 'webhook_transform_v1',
      fields: [
        { source: 'name', target: 'customer', transform: 'trim' },
        { source: 'email', target: 'email', transform: 'lowercase' },
        { source: 'count', target: 'count', transform: 'copy' },
      ],
    },
  };
  const key = randomUUID();
  const created = await service.create(auth, command, key);
  assert.equal((await service.create(auth, command, key)).solution.id, created.solution.id);
  await assert.rejects(service.read(otherAuth, created.solution.id), {
    code: 'SOLUTION_NOT_FOUND',
  });
  const decision = (solution, action) =>
    service.decide(
      auth,
      solution.id,
      {
        action,
        workflowHash: solution.workflowHash,
        environmentId: solution.environment?.id ?? null,
      },
      solution.rowVersion
    );
  await assert.rejects(decision(created.solution, 'activate'), { code: 'SOLUTION_TEST_REQUIRED' });
  const deployed = await decision(created.solution, 'deploy');
  assert.equal(deployed.solution.status, 'ready', JSON.stringify(deployed.solution));
  await assert.rejects(
    service.invoke(
      auth,
      created.solution.id,
      { mode: 'production', input: { name: ' Alice ', email: 'ALICE@EXAMPLE.COM', count: 3 } },
      randomUUID()
    ),
    { code: 'SOLUTION_NOT_ACTIVE' }
  );
  const firstInput = { name: ' Alice ', email: 'ALICE@EXAMPLE.COM', count: 3 };
  const runKey = randomUUID();
  const first = await service.invoke(
    auth,
    created.solution.id,
    { mode: 'test', input: firstInput },
    runKey
  );
  assert.equal(first.invocation.status, 'succeeded', JSON.stringify(first));
  assert.deepEqual(first.invocation.output, {
    customer: 'Alice',
    email: 'alice@example.com',
    count: 3,
  });
  assert.ok(first.invocation.executionId);
  const duplicate = await service.invoke(
    auth,
    created.solution.id,
    { mode: 'test', input: firstInput },
    runKey
  );
  assert.equal(duplicate.replayed, true);
  assert.equal(duplicate.invocation.id, first.invocation.id);
  await assert.rejects(
    service.invoke(
      auth,
      created.solution.id,
      { mode: 'test', input: { ...firstInput, count: 5 } },
      runKey
    ),
    { code: 'IDEMPOTENCY_CONFLICT' }
  );
  const tested = await service.read(auth, created.solution.id);
  const active = await decision(tested.solution, 'activate');
  const second = await service.invoke(
    auth,
    created.solution.id,
    { mode: 'production', input: { name: ' Bob ', email: 'BOB@EXAMPLE.COM', count: 7 } },
    randomUUID()
  );
  assert.equal(second.invocation.status, 'succeeded');
  assert.deepEqual(second.invocation.output, {
    customer: 'Bob',
    email: 'bob@example.com',
    count: 7,
  });
  await decision(active.solution, 'pause');
  await assert.rejects(
    service.invoke(
      auth,
      created.solution.id,
      { mode: 'production', input: firstInput },
      randomUUID()
    ),
    { code: 'SOLUTION_NOT_ACTIVE' }
  );
  await assert.rejects(
    service.invoke(
      otherAuth,
      created.solution.id,
      { mode: 'test', input: firstInput },
      randomUUID()
    ),
    { code: 'SOLUTION_NOT_FOUND' }
  );
  const history = await service.read(auth, created.solution.id);
  assert.equal(history.invocations.length, 2);
  const otherTenant = await repository.resolveTenant(otherAuth);
  assert.equal(
    (
      await repository.solutionTransaction(otherTenant, (client) =>
        client.query('SELECT * FROM orqaly.customer_solutions')
      )
    ).rowCount,
    0
  );
  await assert.rejects(
    repository.solutionTransaction(tenantId, (client) =>
      client.query('UPDATE orqaly.customer_solutions SET workflow = $1', [{}])
    ),
    { code: '42501' }
  );
  const revisions = createSolutionRevisionService({ repository, runtime });
  const originalHash = created.solution.workflowHash;
  const originalWorkflow = structuredClone(created.solution.workflow);
  const resumed = await decision(
    (await service.read(auth, created.solution.id)).solution,
    'activate'
  );
  const firstDraft = await revisions.createDraft(auth, created.solution.id, {
    expectedVersion: resumed.solution.rowVersion,
  });
  assert.equal(
    (await revisions.createDraft(auth, created.solution.id, { expectedVersion: 0 })).revision.id,
    firstDraft.revision.id
  );
  await assert.rejects(revisions.read(otherAuth, created.solution.id), {
    code: 'SOLUTION_NOT_FOUND',
  });
  await assert.rejects(
    revisions.saveDraft(otherAuth, created.solution.id, firstDraft.revision.id, {
      workflow: firstDraft.revision.workflow,
      expectedVersion: 0,
    }),
    { code: 'SOLUTION_NOT_FOUND' }
  );
  const revise = (revision, action) =>
    revisions.decide(auth, created.solution.id, revision.id, {
      action,
      workflowHash: revision.workflowHash,
      expectedVersion: revision.rowVersion,
    });
  const dangerous = structuredClone(firstDraft.revision.workflow);
  dangerous.nodes.push({
    id: 'unknown',
    name: 'Unapproved HTTP',
    type: 'n8n-nodes-base.httpRequest',
    parameters: { url: 'https://example.com' },
    position: [800, 0],
    typeVersion: 4,
  });
  const savedInvalid = await revisions.saveDraft(
    auth,
    created.solution.id,
    firstDraft.revision.id,
    { workflow: dangerous, expectedVersion: firstDraft.revision.rowVersion }
  );
  await assert.rejects(
    revisions.saveDraft(auth, created.solution.id, firstDraft.revision.id, {
      workflow: firstDraft.revision.workflow,
      expectedVersion: firstDraft.revision.rowVersion,
    }),
    { code: 'SOLUTION_REVISION_CHANGED' }
  );
  const invalidReview = await revisions.review(auth, created.solution.id, firstDraft.revision.id, {
    expectedVersion: savedInvalid.revision.rowVersion,
  });
  assert.equal(invalidReview.revision.review.valid, false);
  await assert.rejects(revise(invalidReview.revision, 'approve'), {
    code: 'SOLUTION_REVIEW_REQUIRED',
  });
  await revise(invalidReview.revision, 'reject');
  assert.equal((await service.read(auth, created.solution.id)).solution.workflowHash, originalHash);

  const nextDraft = await revisions.createDraft(auth, created.solution.id, {
    expectedVersion: resumed.solution.rowVersion,
  });
  const changed = structuredClone(nextDraft.revision.workflow);
  changed.nodes.find((node) => node.id === 'transform').parameters.jsonOutput = changed.nodes
    .find((node) => node.id === 'transform')
    .parameters.jsonOutput.replace('.trim()', '.toUpperCase()');
  const savedDraft = await revisions.saveDraft(auth, created.solution.id, nextDraft.revision.id, {
    workflow: changed,
    expectedVersion: nextDraft.revision.rowVersion,
  });
  const reviewed = await revisions.review(auth, created.solution.id, nextDraft.revision.id, {
    expectedVersion: savedDraft.revision.rowVersion,
  });
  assert.equal(reviewed.revision.review.valid, true, JSON.stringify(reviewed.revision.review));
  assert.ok(reviewed.revision.review.changes.length);
  const approved = await revise(reviewed.revision, 'approve');
  await assert.rejects(
    revisions.saveDraft(auth, created.solution.id, approved.revision.id, {
      workflow: changed,
      expectedVersion: approved.revision.rowVersion,
    }),
    { code: 'SOLUTION_REVISION_IMMUTABLE' }
  );
  await assert.rejects(
    repository.solutionTransaction(tenantId, (client) =>
      client.query(
        `UPDATE orqaly.solution_revisions SET status='draft',row_version=row_version+1 WHERE id=$1`,
        [approved.revision.id]
      )
    ),
    { code: '42501' }
  );
  await assert.rejects(
    repository.solutionTransaction(tenantId, (client) =>
      client.query(
        `UPDATE orqaly.solution_revisions SET workflow='{}',row_version=row_version+1 WHERE id=$1`,
        [approved.revision.id]
      )
    ),
    { code: '42501' }
  );
  const deployedRevision = await revise(approved.revision, 'deploy');
  assert.equal(
    deployedRevision.revision.status,
    'ready',
    JSON.stringify(deployedRevision.revision)
  );
  assert.notEqual(
    deployedRevision.revision.deployment.workflowId,
    deployed.solution.deployment.workflowId
  );
  assert.equal((await service.read(auth, created.solution.id)).solution.version, 1);

  // A late v1 test may write only v1 evidence. It must not satisfy v3's test gate.
  let releaseOldTest;
  let oldTestReachedRuntime;
  const releasePromise = new Promise((resolve) => {
    releaseOldTest = resolve;
  });
  const reachedPromise = new Promise((resolve) => {
    oldTestReachedRuntime = resolve;
  });
  const delayedService = createSolutionService({
    repository,
    runtime: {
      ...runtime,
      invoke: async (...args) => {
        const result = await runtime.invoke(...args);
        oldTestReachedRuntime();
        await releasePromise;
        return result;
      },
    },
  });
  const lateTest = delayedService.invoke(
    auth,
    created.solution.id,
    { mode: 'test', input: firstInput },
    randomUUID()
  );
  await reachedPromise;
  const beforeRevisionTest = (await revisions.read(auth, created.solution.id)).revisions.find(
    (value) => value.id === deployedRevision.revision.id
  );
  assert.equal(beforeRevisionTest.testedAt, null);
  await assert.rejects(revise(beforeRevisionTest, 'activate'), { code: 'SOLUTION_TEST_REQUIRED' });
  const revisionTest = await revisions.invoke(
    auth,
    created.solution.id,
    beforeRevisionTest.id,
    { input: firstInput },
    randomUUID()
  );
  assert.equal(revisionTest.invocation.status, 'succeeded', JSON.stringify(revisionTest));
  assert.deepEqual(revisionTest.invocation.output, {
    customer: ' ALICE ',
    email: 'alice@example.com',
    count: 3,
  });
  const ready = (await revisions.read(auth, created.solution.id)).revisions.find(
    (value) => value.id === beforeRevisionTest.id
  );
  await revise(ready, 'activate');
  const current = (await service.read(auth, created.solution.id)).solution;
  releaseOldTest();
  assert.equal((await lateTest).invocation.status, 'succeeded');
  assert.equal(
    (await service.read(auth, created.solution.id)).solution.rowVersion,
    current.rowVersion
  );
  assert.equal(current.version, ready.version);
  assert.equal(current.revisionId, ready.id);
  assert.equal(current.workflowHash, ready.workflowHash);
  const revisedOutput = await service.invoke(
    auth,
    created.solution.id,
    { mode: 'production', input: firstInput },
    randomUUID()
  );
  assert.deepEqual(revisedOutput.invocation.output, revisionTest.invocation.output);
  assert.equal(revisedOutput.invocation.revisionId, ready.id);
  await decision((await service.read(auth, created.solution.id)).solution, 'pause');
  const persisted = rowFirst(
    await admin.query('SELECT workflow,workflow_hash FROM orqaly.customer_solutions WHERE id=$1', [
      created.solution.id,
    ])
  );
  assert.deepEqual(persisted.workflow, originalWorkflow);
  assert.equal(persisted.workflow_hash, originalHash);
  assert.equal(
    (
      await repository.solutionTransaction(otherTenant, (client) =>
        client.query('SELECT * FROM orqaly.solution_revisions')
      )
    ).rowCount,
    0
  );
  assert.equal(
    (
      await repository.solutionTransaction(otherTenant, (client) =>
        client.query('SELECT * FROM orqaly.solution_revision_events')
      )
    ).rowCount,
    0
  );
  const n8nAccess = new pg.Client({
    connectionString: baseUrl.replace('postgres:', 'solution_n8n:'),
  });
  await assert.rejects(n8nAccess.connect(), { code: '42501' });
  await n8nAccess.end();
  let humanAuthCalls = 0;
  const applicationKeys = createSolutionApplicationKeyService({
    repository,
    solutionService: service,
    environment: 'preview',
  });
  const appAccess = await verifySolutionApplicationAccess({
    app: createWorkflowHttpApp({
      commandService: {},
      solutionService: service,
      solutionApplicationKeyService: applicationKeys,
      auth: {
        middleware: (_req, _res, next) => {
          humanAuthCalls += 1;
          next();
        },
        context: (req) => (req.get('x-local-acceptance-user') === auth.userId ? auth : null),
      },
    }),
    service,
    revisions,
    repository,
    auth,
    tenantId,
    solutionId: created.solution.id,
    humanHeader: { 'x-local-acceptance-user': auth.userId },
    authMiddlewareCalls: () => humanAuthCalls,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        verified: true,
        runtime: 'real n8n 2.37.10',
        database: `real PostgreSQL ${postgresMajor}`,
        outputs: [first.invocation.output, second.invocation.output],
        executionIds: [first.invocation.executionId, second.invocation.executionId],
        applicationAccess: appAccess,
        checks: [
          'isolated database',
          'cross-tenant read/invoke/RLS denial',
          'activation gate',
          'pause gate',
          'idempotent replay',
          'input-bound key',
          'persisted history',
          'native draft capture and optimistic concurrency',
          'unsupported candidate saved but cannot be approved',
          'rejection leaves v1 unchanged',
          'approved snapshot and deployment immutable in PostgreSQL',
          'new provider workflow per approved revision',
          'late v1 test cannot authorize a new revision',
          'explicit tested revision activation and versioned production output',
          'revision/event RLS isolation',
        ],
        limitation: 'Agent profile source is a test fixture; Clerk/browser tested separately',
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await repository?.close();
  await admin?.end();
  for (const args of resources.reverse()) {
    try {
      docker(args);
    } catch {
      /* preserve original test failure */
    }
  }
}

function rowFirst(result) {
  return result.rows[0];
}
