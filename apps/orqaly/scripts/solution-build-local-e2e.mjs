// Real PostgreSQL/RLS lifecycle proof with deterministic AxWise/Agent fixtures.
// This does not claim a live model or native browser acceptance.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createSolutionBuildService } from '../server/workflow-v2/solution-build-service.js';
import { compileSolutionWorkflow } from '../server/workflow-v2/solution-compiler.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';

const suffix = randomBytes(6).toString('hex');
const name = `orqaly-build-e2e-${suffix}`;
const password = randomBytes(24).toString('hex');
const docker = (args, env = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
let started = false,
  admin,
  repository,
  workerRepository,
  phase = 'start';
const check = (name) => {
  phase = name;
  process.stdout.write(`check: ${name}\n`);
};
try {
  docker(
    [
      'run',
      '--detach',
      '--name',
      name,
      '--publish',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD',
      'postgres:17-alpine',
    ],
    { POSTGRES_PASSWORD: password }
  );
  started = true;
  const port = docker(['port', name, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert.ok(port, 'local_pg_port');
  const base = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  for (let n = 0; n < 60; n++) {
    try {
      docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch {
      await delay(250);
    }
  }
  admin = new pg.Client({ connectionString: base });
  await admin.connect();
  check('all additive migrations including013');
  for (const file of (await readdir('database/workflow-v2/migrations'))
    .filter((file) => /^\d{3}.*\.sql$/.test(file))
    .sort()) {
    await admin.query(await readFile(`database/workflow-v2/migrations/${file}`, 'utf8'));
  }
  for (const role of ['identity', 'api', 'worker']) {
    await admin.query(
      `CREATE ROLE build_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE orqaly_${role}`
    );
  }
  const url = (role) => `postgresql://build_test_${role}:${password}@127.0.0.1:${port}/postgres`;
  repository = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: url('identity'),
    apiDatabaseUrl: url('api'),
    workerDatabaseUrl: url('worker'),
    requireSolutionBuilds: true,
  });
  workerRepository = createPostgresRepositories({
    environment: 'preview',
    workerDatabaseUrl: url('worker'),
    requireSolutionBuilds: true,
  });
  await repository.readiness();
  await workerRepository.readiness();
  const auth = { userId: `user_build${suffix}` },
    other = { userId: `user_other${suffix}` };
  const tenantId = await repository.resolveTenant(auth);
  await repository.resolveTenant(other);
  const runId = randomUUID(),
    agentId = randomUUID();
  const task =
    'Research an SMS gateway. This historical task authorizes research only, not external actions.';
  const taskHash = hash({ request: task });
  await admin.query(
    `INSERT INTO orqaly.workflow_runs(tenant_id,id,owner_user_id,mode,status,contract_version,request_hash,request_payload)
    VALUES($1,$2,$3,'simple','completed','orqaly.workflow.v2',$4,$5)`,
    [tenantId, runId, auth.userId, taskHash, JSON.stringify({ request: task })]
  );
  const agentService = {
    read: async (_auth, id) => ({
      body: {
        agent: {
          id,
          status: 'active',
          currentProfile: {
            id: randomUUID(),
            versionNumber: 3,
            contentHash: hash({ version: 3 }),
            profile: {
              displayName: 'Operations Agent',
              roleLabel: 'Workflow designer',
              description: 'Build scoped customer workflows',
              instructions: 'Ask for missing fields; do not perform provider actions.',
            },
          },
        },
      },
    }),
  };
  const spec = {
    kind: 'webhook_transform_v1',
    fields: [
      { source: 'name', target: 'customer_name', transform: 'trim' },
      { source: 'email', target: 'email', transform: 'lowercase' },
    ],
  };
  const calls = [],
    remote = new Map();
  let ambiguous = true,
    mode = 'normal',
    startedDesign,
    releaseDesign;
  function prepared(envelope, outcome) {
    return {
      operationId: envelope.operationId,
      status: 'completed',
      canonicalInputHash: envelope.canonicalInputHash,
      result: {
        resultType: 'solution_prepared',
        response: {
          schemaVersion: 'axwise.solution-preparation.v1',
          buildRequestId: envelope.input.buildRequestId,
          inputVersion: envelope.input.inputVersion,
          outcome,
          name: 'Task-specific intake',
          purpose: 'Normalize explicitly requested name and email fields',
          explanation:
            outcome === 'needs_input'
              ? 'The output name is missing.'
              : 'Typed mappings are ready for review.',
          spec: outcome === 'candidate' ? spec : null,
          partialFields:
            outcome === 'candidate'
              ? spec.fields
              : outcome === 'needs_input'
                ? [{ source: 'name', target: null, transform: 'trim' }, spec.fields[1]]
                : [],
          questions:
            outcome === 'needs_input'
              ? [
                  {
                    id: 'name_output',
                    kind: 'information',
                    prompt: 'Which output field should receive the trimmed name?',
                    reason: 'A named output is required before release.',
                  },
                ]
              : [],
          unsupportedCapabilities: outcome === 'unsupported' ? ['sms_provider'] : [],
        },
      },
    };
  }
  const axwiseClient = {
    submit: async (envelope) => {
      calls.push(structuredClone(envelope));
      if (mode === 'late' && envelope.input.answers.length) {
        startedDesign();
        await new Promise((resolve) => {
          releaseDesign = resolve;
        });
      }
      if (!remote.has(envelope.operationId))
        remote.set(
          envelope.operationId,
          prepared(
            envelope,
            mode === 'unsupported'
              ? 'unsupported'
              : envelope.input.answers.length
                ? 'candidate'
                : 'needs_input'
          )
        );
      if (ambiguous) {
        ambiguous = false;
        throw Object.assign(new Error('test_ambiguous_submit'), {
          retryable: true,
          disposition: 'ambiguous',
        });
      }
      return remote.get(envelope.operationId);
    },
  };
  const makeService = () => ({
    ...createSolutionBuildService({ repository, agentService, axwiseClient }),
    advancePending: createSolutionBuildService({ repository: workerRepository, axwiseClient })
      .advancePending,
  });
  let service = makeService();
  check('source-bound create and idempotency');
  const command = {
    runId,
    agentId,
    instruction:
      'Build a webhook that trims name and lowercases email. Ask which output name to use.',
  };
  let value = (await service.create(auth, command, 'create_primary')).buildRequest;
  const id = value.id;
  assert.equal(value.workflow, null);
  assert.equal(value.source.authority, 'reference_only');
  assert.equal(value.source.taskHash, taskHash);
  assert.equal(value.agent.profileVersion, 3);
  assert.equal(calls.length, 0);
  assert.equal((await service.create(auth, command, 'create_primary')).buildRequest.id, id);
  await assert.rejects(
    service.create(auth, { ...command, instruction: 'Changed' }, 'create_primary'),
    { code: 'IDEMPOTENCY_CONFLICT' }
  );
  check('crash lease recovery and ambiguous idempotent dispatch');
  const claim = await repository.claimSolutionBuildAttempt('crashed-process', randomUUID(), 10);
  assert.equal(claim.buildRequestId, id);
  await admin.query(
    "UPDATE orqaly.solution_build_attempts SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND build_request_id=$2",
    [tenantId, id]
  );
  await service.advancePending();
  assert.equal((await service.read(auth, id)).buildRequest.status, 'preparing');
  await admin.query(
    'UPDATE orqaly.solution_build_attempts SET next_at=clock_timestamp() WHERE tenant_id=$1 AND build_request_id=$2',
    [tenantId, id]
  );
  service = makeService();
  await service.advancePending();
  assert.equal(calls[0].operationId, calls[1].operationId);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(remote.size, 1);
  value = (await service.read(auth, id)).buildRequest;
  assert.equal(value.status, 'needs_input');
  assert.equal(value.workflow.nodes.length, 3);
  assert.equal(value.questions.length, 1);
  assert.equal(value.workflow.nodes[1].parameters.jsonOutput.includes('customer_name'), false);
  check('required question blocks review and persists through restart');
  await assert.rejects(service.review(auth, id, { expectedVersion: value.rowVersion }), {
    code: 'BUILD_INPUT_REQUIRED',
  });
  await assert.rejects(
    service.confirm(
      auth,
      id,
      { expectedVersion: value.rowVersion, workflowHash: value.workflowHash },
      'no_input_confirm'
    ),
    { code: 'BUILD_NOT_REVIEWED' }
  );
  await assert.rejects(
    service.answer(
      auth,
      id,
      {
        expectedVersion: value.rowVersion,
        questionId: 'name_output',
        value: 'api_key=abcdefghijklmnop',
      },
      'secret_answer'
    )
  );
  const answer = {
    expectedVersion: value.rowVersion,
    questionId: 'name_output',
    value: 'customer_name',
  };
  value = (await service.answer(auth, id, answer, 'answer_primary')).buildRequest;
  assert.equal(value.status, 'preparing');
  assert.equal(value.answers[0].value, 'customer_name');
  assert.equal(value.questions.length, 0);
  const versionAfterAnswer = value.rowVersion;
  assert.equal(
    (await service.answer(auth, id, answer, 'answer_primary')).buildRequest.rowVersion,
    versionAfterAnswer
  );
  await assert.rejects(
    service.answer(auth, id, { ...answer, value: 'different' }, 'answer_primary'),
    { code: 'IDEMPOTENCY_CONFLICT' }
  );
  service = makeService();
  await service.advancePending();
  value = (await service.read(auth, id)).buildRequest;
  assert.equal(value.status, 'draft');
  assert.deepEqual(value.spec, spec);
  assert.equal(remote.size, 2);
  check('predeployment native edit, exact review and immutable atomic handoff');
  value = (await service.review(auth, id, { expectedVersion: value.rowVersion })).buildRequest;
  const reviewedHash = value.workflowHash,
    reviewedVersion = value.rowVersion;
  const changed = structuredClone(value.workflow);
  changed.nodes[1].parameters.jsonOutput = changed.nodes[1].parameters.jsonOutput.replace(
    '.trim()',
    '.toUpperCase()'
  );
  changed.nodes[1].position = [350, 170];
  value = (
    await service.saveDraft(auth, id, {
      expectedVersion: value.rowVersion,
      workflowHash: value.workflowHash,
      workflow: changed,
    })
  ).buildRequest;
  assert.equal(value.status, 'draft');
  assert.equal(value.review, null);
  await assert.rejects(
    service.confirm(
      auth,
      id,
      { expectedVersion: reviewedVersion, workflowHash: reviewedHash },
      'old_review_confirm'
    ),
    { code: 'BUILD_VERSION_CONFLICT' }
  );
  value = (await service.review(auth, id, { expectedVersion: value.rowVersion })).buildRequest;
  assert.ok(value.review.changes.some((change) => change.message.includes('uppercase')));
  const finalWorkflow = structuredClone(value.workflow),
    finalHash = value.workflowHash;
  const confirm = { expectedVersion: value.rowVersion, workflowHash: finalHash };
  value = (await service.confirm(auth, id, confirm, 'confirm_primary')).buildRequest;
  assert.equal(value.status, 'completed');
  assert.equal(value.solutionId, id);
  assert.equal(
    (await service.confirm(auth, id, confirm, 'confirm_primary')).buildRequest.solutionId,
    id
  );
  const solution = (
    await admin.query('SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND id=$2', [
      tenantId,
      id,
    ])
  ).rows[0];
  assert.deepEqual(solution.workflow, finalWorkflow);
  assert.equal(solution.workflow_hash, finalHash);
  assert.equal(solution.status, 'draft');
  assert.equal(solution.deployment, null);
  assert.equal(solution.environment_id, null);
  assert.equal(solution.approved_at, null);
  assert.equal(solution.build_request_id, id);
  check('tenant+owner RLS, forbidden snapshot changes and append-only history');
  await assert.rejects(service.read(other, id), { code: 'BUILD_NOT_FOUND' });
  for (const table of [
    'solution_build_requests',
    'solution_build_attempts',
    'solution_build_events',
  ]) {
    const count = await repository.solutionBuildTransaction(
      { tenantId, userId: 'user_sameTenantOther' },
      async (client) =>
        (await client.query(`SELECT count(*)::int AS n FROM orqaly.${table}`)).rows[0].n
    );
    assert.equal(count, 0);
  }
  await assert.rejects(
    repository.solutionBuildTransaction({ tenantId, userId: auth.userId }, (client) =>
      client.query("UPDATE orqaly.solution_build_requests SET source_snapshot='{}' WHERE id=$1", [
        id,
      ])
    ),
    { code: '42501' }
  );
  await assert.rejects(
    repository.solutionBuildTransaction({ tenantId, userId: auth.userId }, (client) =>
      client.query('DELETE FROM orqaly.solution_build_events WHERE build_request_id=$1', [id])
    ),
    { code: '42501' }
  );
  await assert.rejects(
    repository.solutionBuildTransaction({ tenantId, userId: auth.userId }, (client) =>
      client.query(
        "UPDATE orqaly.solution_build_requests SET status='draft',row_version=row_version+1 WHERE id=$1",
        [id]
      )
    ),
    { code: '42501' }
  );
  check('late model result cannot overwrite newer native input version');
  mode = 'late';
  let late = (await service.create(auth, command, 'create_late')).buildRequest;
  await service.advancePending();
  late = (await service.read(auth, late.id)).buildRequest;
  late = (
    await service.answer(
      auth,
      late.id,
      { expectedVersion: late.rowVersion, questionId: 'name_output', value: 'customer_name' },
      'answer_late'
    )
  ).buildRequest;
  const dispatched = new Promise((resolve) => {
    startedDesign = resolve;
  });
  const processing = service.advancePending();
  await dispatched;
  const native = compileSolutionWorkflow({
    id: late.id,
    spec: {
      ...spec,
      fields: spec.fields.map((field) =>
        field.source === 'name' ? { ...field, transform: 'uppercase' } : field
      ),
    },
  }).workflow;
  late = (
    await service.saveDraft(auth, late.id, {
      expectedVersion: late.rowVersion,
      workflowHash: late.workflowHash,
      workflow: native,
    })
  ).buildRequest;
  const nativeHash = late.workflowHash;
  releaseDesign();
  await processing;
  late = (await service.read(auth, late.id)).buildRequest;
  assert.equal(late.workflowHash, nativeHash);
  assert.equal(late.status, 'draft');
  assert.equal(late.spec.fields[0].transform, 'uppercase');
  check('unsupported task has no fabricated workflow');
  mode = 'unsupported';
  let unsupported = (
    await service.create(
      auth,
      { ...command, instruction: 'Build a real SMS provider gateway' },
      'create_unsupported'
    )
  ).buildRequest;
  await service.advancePending();
  unsupported = (await service.read(auth, unsupported.id)).buildRequest;
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.workflow, null);
  assert.deepEqual(unsupported.unsupportedCapabilities, ['sms_provider']);
  assert.equal(
    (
      await admin.query(
        'SELECT request_hash FROM orqaly.workflow_runs WHERE tenant_id=$1 AND id=$2',
        [tenantId, runId]
      )
    ).rows[0].request_hash,
    taskHash
  );
  check('complete: real PostgreSQL17 lifecycle/RLS; AxWise and Agent are fixtures');
} catch (error) {
  const code = /^[A-Za-z0-9_]+$/.test(String(error.code || '')) ? error.code : 'CHECK_FAILED';
  process.stderr.write(`solution_build_local_e2e_failed phase=${phase} code=${code}\n`);
  process.exitCode = 1;
} finally {
  await repository?.close();
  await workerRepository?.close();
  await admin?.end().catch(() => {});
  if (started) {
    try {
      docker(['rm', '--force', name]);
    } catch {
      process.stderr.write('local_test_container_cleanup_failed\n');
      process.exitCode = 1;
    }
  }
}
