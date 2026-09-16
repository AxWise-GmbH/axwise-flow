// Real PostgreSQL16 + pinned n8n: full native build/test/repair/handoff proof.
// AxWise/Agent are deterministic fixtures: this does not claim a live model or browser test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import express from 'express';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createSolutionBuildService } from '../server/workflow-v2/solution-build-service.js';
import {
  nativeOrderSpec,
  nativeOrderWorkflow,
} from '../server/workflow-v2/fixtures/native-order-routing.js';
import { startNativeLocalRuntime } from './native-local-runtime.mjs';
import { createSolutionService } from '../server/workflow-v2/solution-service.js';
import { createSolutionScheduleService } from '../server/workflow-v2/solution-schedule-service.js';
import { createSolutionRevisionService } from '../server/workflow-v2/solution-revision-service.js';
import { createSolutionApplicationKeyService } from '../server/workflow-v2/solution-application-key-service.js';
import { createSolutionApplicationRouter } from '../server/workflow-v2/solution-application-http.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { runNativeOutboundBuildAcceptance } from './native-outbound-build-local-e2e.mjs';

const suffix = randomBytes(6).toString('hex');
const name = `orqaly-native-build-${suffix}`;
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
  localRuntime,
  applicationServer,
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
      'postgres:16',
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
  check('all additive migrations including015');
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
    requireNativeWorkflowBuilds: true,
  });
  workerRepository = createPostgresRepositories({
    environment: 'preview',
    workerDatabaseUrl: url('worker'),
    requireSolutionBuilds: true,
    requireNativeWorkflowBuilds: true,
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

  check('isolated actual n8n runtime');
  localRuntime = await startNativeLocalRuntime({ tenantId, userId: auth.userId });
  const modelCalls = [];
  let changeAcceptance = false;
  const axwiseClient = {
    submit: async (envelope) => {
      modelCalls.push(structuredClone(envelope));
      assert.equal(envelope.input.type, 'PrepareSolutionV2');
      assert.ok(envelope.input.knowledge.skills.length >= 5);
      assert.ok(envelope.input.knowledge.nodes.some((n) => n.type === 'n8n-nodes-base.if'));
      const spec = nativeOrderSpec();
      if (changeAcceptance && envelope.input.phase === 'repair')
        spec.acceptanceCases[0].expectedOutput.accepted = false;
      return {
        operationId: envelope.operationId,
        status: 'completed',
        canonicalInputHash: envelope.canonicalInputHash,
        result: {
          resultType: 'solution_prepared',
          response: {
            schemaVersion: 'axwise.solution-preparation.v2',
            buildRequestId: envelope.input.buildRequestId,
            inputVersion: envelope.input.inputVersion,
            outcome: 'candidate',
            name: 'Route customer orders',
            purpose: 'Validate the order size and normalize customer names',
            explanation:
              'A native conditional graph with exact positive and negative acceptance cases.',
            workflow: nativeOrderWorkflow({ broken: envelope.input.phase !== 'repair' }),
            spec,
            questions: [],
            dependencies: [],
            baseWorkflowHash: envelope.input.draft?.workflowHash ?? null,
            semanticReview: {
              advisory: true,
              summary: 'The task and expected outcomes are covered.',
              concerns: [],
            },
          },
        },
      };
    },
  };
  const service = createSolutionBuildService({
    repository,
    agentService,
    axwiseClient,
    runtime: localRuntime.runtime,
    enableNativeWorkflows: true,
  });
  const worker = createSolutionBuildService({
    repository: workerRepository,
    axwiseClient,
    runtime: localRuntime.runtime,
    enableNativeWorkflows: true,
  });
  const command = {
    runId,
    agentId,
    instruction:
      'Create a native n8n order intake: trim customer names, accept amount >= 100 and reject smaller orders with HTTP422. Use nested order JSON.',
  };
  let value = (await service.create(auth, command, 'native_create_primary')).buildRequest;
  const id = value.id;
  check('durable V2 generation with pinned product skills and node versions');
  await worker.advancePending();
  value = (await service.read(auth, id)).buildRequest;
  assert.equal(value.preparationVersion, 2);
  assert.equal(value.workflow.nodes.length, 5);
  assert.equal(value.spec.kind, 'n8n_workflow_v2');
  assert.equal(value.testEligibility.allowed, true, value.testEligibility.reason);
  assert.equal(
    value.workflow.nodes.find((n) => n.id === 'route').parameters.conditions.conditions[0]
      .rightValue,
    200
  );
  const criteria = structuredClone(value.spec.acceptanceCases);
  check('user-authorized test is queued durably without a browser request holding runtime work');
  value = (
    await service.test(
      auth,
      id,
      {
        expectedVersion: value.rowVersion,
        workflowHash: value.workflowHash,
        allowExternalEffects: false,
        repairOnFailure: true,
      },
      'native_first_test'
    )
  ).buildRequest;
  assert.equal(value.testEvidence.status, 'queued');
  assert.equal(
    (
      await admin.query(
        'SELECT count(*)::int AS count FROM orqaly.solution_build_tests WHERE tenant_id=$1 AND build_request_id=$2',
        [tenantId, id]
      )
    ).rows[0].count,
    0,
    'API queue admission must not start a runtime test'
  );
  const initialTestWorker = createSolutionBuildService({
    repository: workerRepository,
    axwiseClient,
    runtime: localRuntime.runtime,
    enableNativeWorkflows: true,
  });
  assert.equal((await initialTestWorker.advancePending()).processed, true);
  value = (await service.read(auth, id)).buildRequest;
  check('actual failed n8n test keeps its response and enqueues bounded model repair');
  assert.equal(value.testEvidence.status, 'failed');
  assert.equal(value.testEvidence.caseResults[0].responseStatus, 422);
  assert.equal(value.testEvidence.caseResults[0].output.accepted, false);
  assert.match(value.testEvidence.caseResults[0].executionId, /^[1-9][0-9]*$/);
  assert.equal(value.status, 'preparing');
  check('repair preserves original criteria and retest survives worker recreation');
  await worker.advancePending();
  value = (await service.read(auth, id)).buildRequest;
  assert.equal(value.status, 'draft');
  assert.deepEqual(value.spec.acceptanceCases, criteria);
  assert.equal(
    value.workflow.nodes.find((n) => n.id === 'route').parameters.conditions.conditions[0]
      .rightValue,
    100
  );
  const restarted = createSolutionBuildService({
    repository: workerRepository,
    axwiseClient,
    runtime: localRuntime.runtime,
    enableNativeWorkflows: true,
  });
  const retest = await restarted.advancePending();
  assert.equal(retest.kind, 'native_retest');
  value = (await service.read(auth, id)).buildRequest;
  assert.equal(value.testEvidence.status, 'succeeded', JSON.stringify(value.testEvidence));
  assert.equal(value.testEvidence.caseResults.length, 2);
  assert.deepEqual(
    value.testEvidence.caseResults.map((c) => c.responseStatus),
    [200, 422]
  );
  assert.ok(
    value.testEvidence.caseResults.every((c) => c.passed && /^[1-9][0-9]*$/.test(c.executionId))
  );
  assert.equal(modelCalls.length, 2);
  assert.equal(modelCalls[1].input.phase, 'repair');
  assert.deepEqual(modelCalls[1].input.frozenAcceptanceCases, criteria);
  assert.ok(modelCalls[1].input.diagnostics.length > 0);
  check('exact review and native handoff preserve the graph and assigned environment');
  value = (await service.review(auth, id, { expectedVersion: value.rowVersion })).buildRequest;
  assert.equal(value.review.valid, true);
  value = (
    await service.confirm(
      auth,
      id,
      { expectedVersion: value.rowVersion, workflowHash: value.workflowHash },
      'native_confirm_primary'
    )
  ).buildRequest;
  assert.equal(value.status, 'completed');
  const solution = (
    await admin.query('SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND id=$2', [
      tenantId,
      id,
    ])
  ).rows[0];
  assert.equal(solution.spec.kind, 'n8n_workflow_v2');
  assert.equal(solution.workflow.nodes.length, 5);
  assert.equal(solution.environment_id, localRuntime.environmentId);
  assert.equal(solution.status, 'draft');
  check('actual Solution staging, full acceptance coverage and activation');
  const solutions = createSolutionService({
    repository,
    agentService,
    runtime: localRuntime.runtime,
  });
  const revisions = createSolutionRevisionService({ repository, runtime: localRuntime.runtime });
  let live = (await solutions.read(auth, id)).solution;
  live = (
    await solutions.decide(
      auth,
      id,
      {
        action: 'deploy',
        workflowHash: live.workflowHash,
        environmentId: localRuntime.environmentId,
      },
      live.rowVersion
    )
  ).solution;
  assert.equal(live.status, 'ready');
  assert.equal(live.deployment.active, false);
  await assert.rejects(
    solutions.decide(
      auth,
      id,
      {
        action: 'activate',
        workflowHash: live.workflowHash,
        environmentId: localRuntime.environmentId,
      },
      live.rowVersion
    )
  );
  for (const test of criteria) {
    const result = await solutions.invoke(
      auth,
      id,
      { mode: 'test', input: test.input },
      `native_solution_${test.id}`
    );
    assert.equal(result.invocation.status, 'succeeded', JSON.stringify(result.invocation));
  }
  live = (await solutions.read(auth, id)).solution;
  live = (
    await solutions.decide(
      auth,
      id,
      {
        action: 'activate',
        workflowHash: live.workflowHash,
        environmentId: localRuntime.environmentId,
      },
      live.rowVersion
    )
  ).solution;
  assert.equal(live.status, 'active');
  const production = await solutions.invoke(
    auth,
    id,
    { mode: 'production', input: { order: { amount: 250, customer: ' Grace ' } } },
    'native_production_first'
  );
  assert.equal(production.invocation.status, 'succeeded');
  assert.deepEqual(production.invocation.output, { accepted: true, customer: 'Grace' });
  check('durable schedules: explicit approval, actual n8n execution, restart and pause');
  const scheduleApi = createSolutionScheduleService({
    repository,
    solutionService: solutions,
    enabled: true,
  });
  const scheduleWorker = () =>
    createSolutionScheduleService({
      repository: workerRepository,
      solutionService: createSolutionService({
        repository: workerRepository,
        runtime: localRuntime.runtime,
      }),
      enabled: true,
    });
  const scheduleCommand = {
    label: 'Order processing',
    workflowHash: live.workflowHash,
    timing: { kind: 'interval', minutes: 5 },
    input: { order: { amount: 250, customer: ' Scheduled ' } },
  };
  const schedule = (await scheduleApi.create(auth, id, scheduleCommand, 'scheduled_order_once'))
    .schedule;
  assert.equal(
    (await scheduleApi.create(auth, id, scheduleCommand, 'scheduled_order_once')).replayed,
    true
  );
  assert.equal(
    (await scheduleWorker().advanceOne()).processed,
    false,
    'nothing runs before due time'
  );
  await admin.query(
    "UPDATE orqaly.solution_schedules SET next_run_at=clock_timestamp()-interval '1 second',row_version=row_version+1 WHERE tenant_id=$1 AND id=$2",
    [tenantId, schedule.id]
  );
  const [scheduledFirst, concurrentTick] = await Promise.all([
    scheduleWorker().advanceOne(),
    scheduleWorker().advanceOne(),
  ]);
  const actualTick = [scheduledFirst, concurrentTick].find((tick) => tick.processed);
  assert.equal(actualTick.status, 'succeeded');
  assert.equal([scheduledFirst, concurrentTick].filter((tick) => tick.processed).length, 1);
  const scheduledReceipt = (await solutions.read(auth, id)).invocations.find(
    (invocation) => invocation.id === actualTick.invocationId
  );
  assert.deepEqual(scheduledReceipt.output, { accepted: true, customer: 'Scheduled' });
  assert.ok(scheduledReceipt.executionId);
  assert.equal(scheduledReceipt.actor.kind, 'schedule');
  assert.equal(
    (await scheduleWorker().advanceOne()).processed,
    false,
    'recreated worker does not replay tick'
  );
  await assert.rejects(scheduleApi.list(other, id), (error) => error.code === 'SOLUTION_NOT_FOUND');
  await assert.rejects(
    repository.solutionBuildTransaction({ tenantId, userId: auth.userId }, (client) =>
      client.query('SELECT orqaly.claim_solution_schedule($1)', [randomUUID()])
    ),
    /permission denied/
  );
  await assert.rejects(
    admin.query(
      "UPDATE orqaly.solution_schedules SET input='{}',row_version=row_version+1 WHERE tenant_id=$1 AND id=$2",
      [tenantId, schedule.id]
    ),
    /immutable/
  );
  await scheduleApi.pause(auth, id, schedule.id);
  assert.equal((await scheduleApi.list(auth, id)).schedules[0].status, 'paused');
  assert.equal((await scheduleWorker().advanceOne()).processed, false);
  const replacementSchedule = (
    await scheduleApi.create(auth, id, scheduleCommand, 'scheduled_release_change')
  ).schedule;
  check('native edit, exact revision approval, real tests and promotion');
  let draft = (await revisions.createDraft(auth, id, { expectedVersion: live.rowVersion }))
    .revision;
  const nextGraph = structuredClone(draft.workflow);
  nextGraph.nodes.find(
    (node) => node.id === 'route'
  ).parameters.conditions.conditions[0].rightValue = 50;
  draft = (
    await revisions.saveDraft(auth, id, draft.id, {
      expectedVersion: draft.rowVersion,
      workflow: nextGraph,
    })
  ).revision;
  draft = (await revisions.review(auth, id, draft.id, { expectedVersion: draft.rowVersion }))
    .revision;
  assert.equal(draft.review.valid, true, JSON.stringify(draft.review));
  for (const action of ['approve', 'deploy'])
    draft = (
      await revisions.decide(auth, id, draft.id, {
        action,
        workflowHash: draft.workflowHash,
        expectedVersion: draft.rowVersion,
      })
    ).revision;
  assert.equal(draft.status, 'ready');
  for (const test of criteria) {
    const result = await revisions.invoke(
      auth,
      id,
      draft.id,
      { input: test.input },
      `native_revision_${test.id}`
    );
    assert.equal(result.invocation.status, 'succeeded', JSON.stringify(result.invocation));
  }
  draft = (await revisions.readRevision(auth, id, draft.id)).revision;
  draft = (
    await revisions.decide(auth, id, draft.id, {
      action: 'activate',
      workflowHash: draft.workflowHash,
      expectedVersion: draft.rowVersion,
    })
  ).revision;
  assert.equal(draft.status, 'active');
  assert.equal(
    (await scheduleApi.list(auth, id)).schedules.find(
      (entry) => entry.id === replacementSchedule.id
    ).status,
    'paused',
    'release replacement revokes recurring authority'
  );
  const revisedProduction = await solutions.invoke(
    auth,
    id,
    { mode: 'production', input: { order: { amount: 75, customer: ' Grace ' } } },
    'native_production_revised'
  );
  assert.equal(revisedProduction.invocation.status, 'succeeded');
  assert.deepEqual(revisedProduction.invocation.output, { accepted: true, customer: 'Grace' });
  const frozen = (
    await admin.query(
      'SELECT workflow_hash,workflow FROM orqaly.customer_solutions WHERE tenant_id=$1 AND id=$2',
      [tenantId, id]
    )
  ).rows[0];
  assert.equal(frozen.workflow_hash, solution.workflow_hash);
  assert.deepEqual(frozen.workflow, solution.workflow);
  check('real authenticated application endpoint uses native nested JSON and idempotent receipts');
  const applicationKeys = createSolutionApplicationKeyService({
    repository,
    solutionService: solutions,
    environment: 'preview',
  });
  live = (await solutions.read(auth, id)).solution;
  const applicationKey = await applicationKeys.create(
    auth,
    id,
    { label: 'Synthetic native acceptance', workflowHash: live.workflowHash, expiresInDays: 30 },
    live.rowVersion,
    'native_application_key'
  );
  const application = express();
  application.use('/v2/apps', createSolutionApplicationRouter({ service: applicationKeys }));
  applicationServer = await new Promise((resolve) => {
    const server = application.listen(0, '127.0.0.1', () => resolve(server));
  });
  const endpoint = `http://127.0.0.1:${applicationServer.address().port}/v2/apps/solutions/${id}`;
  const request = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${applicationKey.token}`,
      'idempotency-key': 'native_client_request',
    },
    body: JSON.stringify({ input: { order: { amount: 80, customer: ' Client ' } } }),
  };
  const httpResult = await fetch(endpoint, request);
  const received = await httpResult.json();
  assert.equal(httpResult.status, 200, JSON.stringify(received));
  assert.equal(received.invocation.status, 'succeeded');
  assert.deepEqual(received.invocation.output, { accepted: true, customer: 'Client' });
  const replayed = await (await fetch(endpoint, request)).json();
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.invocation.id, received.invocation.id);
  assert.equal(replayed.invocation.executionId, received.invocation.executionId);
  assert.equal(
    (
      await fetch(endpoint, {
        ...request,
        headers: { ...request.headers, origin: 'https://untrusted.example' },
      })
    ).status,
    403
  );
  await applicationKeys.revoke(auth, id, applicationKey.key.id, applicationKey.key.rowVersion);
  assert.equal((await fetch(endpoint, request)).status, 401);
  await assert.rejects(service.read(other, id), { code: 'BUILD_NOT_FOUND' });
  const tests = (
    await admin.query(
      'SELECT * FROM orqaly.solution_build_tests WHERE tenant_id=$1 AND build_request_id=$2 ORDER BY created_at',
      [tenantId, id]
    )
  ).rows;
  assert.deepEqual(
    tests.map((t) => t.status),
    ['failed', 'succeeded']
  );
  assert.notEqual(tests[0].workflow_hash, tests[1].workflow_hash);
  assert.equal(tests[1].candidate_fingerprint, value.testEvidence.candidateFingerprint);
  await assert.rejects(
    repository.solutionBuildTransaction({ tenantId, userId: auth.userId }, (client) =>
      client.query(
        "UPDATE orqaly.solution_build_tests SET status='failed' WHERE tenant_id=$1 AND id=$2",
        [tenantId, tests[1].id]
      )
    ),
    { code: '42501' }
  );
  await assert.rejects(
    repository.solutionBuildTransaction({ tenantId, userId: auth.userId }, (client) =>
      client.query('SELECT orqaly.claim_native_workflow_retest($1)', [randomUUID()])
    ),
    { code: '42501' }
  );
  check('scheduled tenant suspension and fault-injected unknown receipt stop repeat dispatch');
  const suspendedSchedule = (
    await scheduleApi.create(
      auth,
      id,
      { ...scheduleCommand, workflowHash: live.workflowHash },
      'schedule_suspended_tenant'
    )
  ).schedule;
  await admin.query(
    "UPDATE orqaly.solution_schedules SET next_run_at=clock_timestamp()-interval '1 second',row_version=row_version+1 WHERE tenant_id=$1 AND id=$2",
    [tenantId, suspendedSchedule.id]
  );
  await admin.query("UPDATE orqaly.tenants SET status='suspended' WHERE id=$1", [tenantId]);
  assert.equal((await scheduleWorker().advanceOne()).status, 'not_dispatched');
  await admin.query("UPDATE orqaly.tenants SET status='active' WHERE id=$1", [tenantId]);
  assert.equal(
    (await scheduleApi.list(auth, id)).schedules.find((item) => item.id === suspendedSchedule.id)
      .status,
    'needs_attention'
  );
  const interruptedSchedule = (
    await scheduleApi.create(
      auth,
      id,
      { ...scheduleCommand, workflowHash: live.workflowHash },
      'schedule_fault_injection'
    )
  ).schedule;
  await admin.query(
    "UPDATE orqaly.solution_schedules SET next_run_at=clock_timestamp()-interval '1 second',row_version=row_version+1 WHERE tenant_id=$1 AND id=$2",
    [tenantId, interruptedSchedule.id]
  );
  let uncertainDispatchCount = 0;
  const faultWorker = createSolutionScheduleService({
    repository: workerRepository,
    enabled: true,
    solutionService: {
      executeClaimedInvocation: async () => {
        uncertainDispatchCount++;
        throw new Error('synthetic process interruption after durable admission');
      },
    },
  });
  assert.equal((await faultWorker.advanceOne()).status, 'outcome_unknown');
  assert.equal(uncertainDispatchCount, 1);
  const interruptedState = await scheduleApi.list(auth, id);
  assert.equal(
    interruptedState.schedules.find((item) => item.id === interruptedSchedule.id).status,
    'needs_attention'
  );
  assert.equal(
    interruptedState.ticks.find((item) => item.schedule_id === interruptedSchedule.id).status,
    'outcome_unknown'
  );
  assert.equal(
    (await scheduleWorker().advanceOne()).processed,
    false,
    'a restarted worker cannot resend the fault-injected unknown'
  );
  assert.equal(uncertainDispatchCount, 1);
  check('unknown execution barrier survives native edits and blocks repairs');
  let second = (await service.create(auth, command, 'native_second_build')).buildRequest;
  await worker.advancePending();
  second = (await service.read(auth, second.id)).buildRequest;
  await admin.query(
    `INSERT INTO orqaly.solution_build_tests
    (tenant_id,build_request_id,id,owner_user_id,input_version,workflow_hash,candidate_fingerprint,test_artifact_hash,
     environment_id,request_key,request_hash,configuration,status,evidence,completed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,'synthetic_unknown',$7,'{}','outcome_unknown','{"status":"outcome_unknown"}',clock_timestamp())`,
    [
      tenantId,
      second.id,
      randomUUID(),
      auth.userId,
      second.inputVersion,
      second.workflowHash,
      hash({ synthetic: true }),
      localRuntime.environmentId,
    ]
  );
  const edited = structuredClone(second.workflow);
  edited.nodes[0].position = [42, 42];
  second = (
    await service.saveDraft(auth, second.id, {
      expectedVersion: second.rowVersion,
      workflowHash: second.workflowHash,
      workflow: edited,
    })
  ).buildRequest;
  assert.equal(second.testEvidence.status, 'outcome_unknown');
  assert.equal(second.repairEligibility.allowed, false);
  await assert.rejects(
    service.repair(
      auth,
      second.id,
      { expectedVersion: second.rowVersion, workflowHash: second.workflowHash },
      'native_repair_unknown'
    ),
    { code: 'BUILD_TEST_UNRECONCILED' }
  );
  check(
    'complete: PostgreSQL16 RLS + real n8n 5-node execution + durable repair/retest; model remains a deterministic fixture'
  );
  await runNativeOutboundBuildAcceptance({
    repository,
    workerRepository,
    admin,
    auth,
    agentId,
    runId,
    agentService,
  });
  process.stdout.write(
    JSON.stringify({
      nodes: 5,
      actualExecutions: 11,
      testSuites: tests.map((t) => t.status),
      model: 'deterministic_fixture',
      cloudResourcesChanged: false,
    }) + '\n'
  );
} catch (error) {
  process.stderr.write(
    JSON.stringify({ phase, error: error.message, code: error.code, stack: error.stack }) + '\n'
  );
  process.exitCode = 1;
} finally {
  if (applicationServer) await new Promise((resolve) => applicationServer.close(resolve));
  await localRuntime?.close();
  await repository?.close();
  await workerRepository?.close();
  await admin?.end();
  if (started) docker(['rm', '-f', name]);
}
