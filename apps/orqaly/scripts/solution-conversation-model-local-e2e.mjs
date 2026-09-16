// Real current AxWise adapters + existing Gemini model, disposable PostgreSQL16.
// At most three synthetic operations (auto answer, auto route, draft). No deployed HTTP, browser,
// production database, n8n or customer workflow is exercised or modified.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createSolutionConversationService } from '../server/workflow-v2/solution-conversation-service.js';
import {
  nativeOrderSpec,
  nativeOrderWorkflow,
} from '../server/workflow-v2/fixtures/native-order-routing.js';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import {
  reviewNativeWorkflow,
  REQUEST_AUTOMATION_POLICY,
} from '../server/workflow-v2/native-workflow-review.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
assert.deepEqual(process.argv.slice(2), ['--three-synthetic-auto-model-operations']);
const axwise = '/private/tmp/axwise-prepare-solution';
const axwiseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: axwise,
  encoding: 'utf8',
}).trim();
assert.equal(
  axwiseCommit,
  '3b48287c934314f96c58a81e9a67757d836a3fee',
  'reviewed_axwise_source_required'
);
const reviewedFiles = {
  'backend/domain/workflow_v2/contracts.py': 'c68b4c7b2d80fc6c1d7cead4d6a39d8135965fb26cf3c0a4c8a090a50d71c339',
  'backend/services/workflow_v2/solution_preparation.py': '5590a3663398b0ccf1cbd4ee5173ad09fae4f39b3a6d3693419b16e78a3a398f',
  'backend/tests/workflow_v2/test_owned_workflow_dependencies.py': '5fad07125c7d4ae88455e5f4ccdbfbdd7d82fc9af6e5077466d995b951b17460',
};
const changedFiles = execFileSync('git', ['status', '--porcelain'], { cwd: axwise, encoding: 'utf8' })
  .trimEnd().split('\n').filter(Boolean).map((line) => line.slice(3));
assert.deepEqual(changedFiles, [], 'clean_reviewed_axwise_commit_required');
for (const [file, digest] of Object.entries(reviewedFiles))
  assert.equal(createHash('sha256').update(await readFile(`${axwise}/${file}`)).digest('hex'), digest, `reviewed_bytes:${file}`);
const suffix = randomBytes(6).toString('hex'),
  container = `orqaly-conversation-model-${suffix}`,
  password = randomBytes(24).toString('hex');
const docker = (args, env = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let admin,
  api,
  worker,
  started = false,
  phase = 'start',
  modelCalls = 0;
const evidence = [];
const log = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
function realModel(envelope) {
  assert(++modelCalls <= 3, 'three_model_operations_maximum');
  return new Promise((resolve, reject) => {
    const child = spawn(
      '/private/tmp/axwise-prepare-solution-venv/bin/python',
      ['scripts/solution-conversation-model-bridge.py', '--synthetic-preview-model'],
      { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'ignore'] }
    );
    let out = '';
    const deadline = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('model_bridge_deadline_no_retry'));
    }, 210000);
    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
      if (Buffer.byteLength(out) > 250000) {
        child.kill('SIGTERM');
        reject(new Error('model_bridge_output_bound'));
      }
    });
    child.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(deadline);
      if (code !== 0) {
        let reason = 'model_bridge_failed';
        try {
          reason = JSON.parse(out).bridgeError ?? reason;
        } catch {}
        reject(new Error(reason));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error('model_bridge_invalid_output'));
      }
    });
    child.stdin.end(JSON.stringify(envelope));
  });
}
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
  assert(port);
  for (let i = 0; i < 60; i++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch {
      await delay(250);
    }
  }
  admin = new pg.Client({
    connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,
  });
  await admin.connect();
  for (const file of (await readdir('database/workflow-v2/migrations'))
    .filter((file) => /^\d{3}.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 21)
    .sort())
    await admin.query(await readFile(`database/workflow-v2/migrations/${file}`, 'utf8'));
  for (const role of ['identity', 'api', 'worker'])
    await admin.query(
      `CREATE ROLE model_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE orqaly_${role}`
    );
  const url = (role) => `postgresql://model_test_${role}:${password}@127.0.0.1:${port}/postgres`;
  api = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: url('identity'),
    apiDatabaseUrl: url('api'),
    requireSolutionConversations: true,
  });
  worker = createPostgresRepositories({
    environment: 'preview',
    workerDatabaseUrl: url('worker'),
    requireSolutionConversations: true,
  });
  await api.readiness();
  await worker.readiness();
  const auth = { userId: `user_modelacceptance${suffix}` },
    tenantId = await api.resolveTenant(auth),
    id = randomUUID(),
    runId = randomUUID(),
    agentId = randomUUID();
  const taskText =
    'Synthetic conversation model acceptance: accept orders with amount at least 100 and trim the customer name. Below threshold returns422. No external providers or effects.';
  const source = {
    runId,
    title: 'Synthetic conversation model acceptance',
    taskText,
    taskHash: hash(taskText),
    contextHash: hash({ taskText }),
  };
  const profile = {
    id: agentId,
    name: 'Synthetic model acceptance',
    profileVersion: 1,
    roleLabel: 'Workflow designer',
    description: 'Disposable local database only',
    instructions: 'Explain or propose a draft only; never execute',
    profileHash: hash({ agentId }),
  };
  const spec = nativeOrderSpec(),
    artifact = normalizeNativeWorkflow({ workflow: nativeOrderWorkflow(), id });
  await admin.query(
    `INSERT INTO orqaly.workflow_runs(tenant_id,id,owner_user_id,mode,status,contract_version,request_hash,request_payload) VALUES($1,$2,$3,'simple','completed','orqaly.workflow.v2',$4,$5)`,
    [tenantId, runId, auth.userId, hash({ request: taskText }), { request: taskText }]
  );
  await admin.query(
    `INSERT INTO orqaly.solution_build_requests(tenant_id,id,owner_user_id,agent_id,run_id,instruction,source_snapshot,agent_snapshot,name,purpose,status,workflow,workflow_hash,spec,create_key,create_hash,preparation_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Synthetic conversation model acceptance','Disposable fixture','draft',$9,$10,$11,$12,$10,2)`,
    [
      tenantId,
      id,
      auth.userId,
      agentId,
      runId,
      taskText,
      source,
      profile,
      artifact.workflow,
      artifact.workflowHash,
      spec,
      `fixture_${id}`,
    ]
  );
  await admin.query(
    `INSERT INTO orqaly.customer_solutions(tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash,status,environment_id,deployment,approved_at,tested_at,build_request_id) VALUES($1,$2,$3,$4,'Synthetic conversation model acceptance','Synthetic local release, not deployed',$5,$6,$7,$8,$9,$8,'active','synthetic-runtime',$10,clock_timestamp(),clock_timestamp(),$2)`,
    [
      tenantId,
      id,
      auth.userId,
      agentId,
      spec,
      profile,
      artifact.workflow,
      artifact.workflowHash,
      `fixture_${id}`,
      {
        workflowId: 'not-deployed',
        versionId: randomUUID(),
        workflowHash: artifact.workflowHash,
        verifiedAt: new Date().toISOString(),
      },
    ]
  );
  const baseline = hash((await admin.query('SELECT * FROM orqaly.customer_solutions')).rows);
  const publicService = createSolutionConversationService({ repository: api, enabled: true });
  const workerService = createSolutionConversationService({
    repository: worker,
    enabled: true,
    axwiseClient: {
      submit: realModel,
      poll: () => {
        throw new Error('unexpected_poll_no_retry');
      },
    },
  });
  for (const mode of ['ask', 'change']) {
    phase = mode;
    const snapshot = await publicService.read(auth, id),
      turnId = randomUUID();
    const command = {
      turnId,
      mode: 'auto',
      message:
        mode === 'ask'
          ? 'Explain the threshold and response status branches of this workflow. Do not claim any real execution result.'
          : 'Change the order acceptance threshold from 100 to 150. Exactly150 must be accepted. Preserve all other input/output behavior, node types, trimmed customer mapping and the HTTP422 rejection branch. Update the requirements and synthetic acceptance cases accordingly. This is an unapproved draft; do not run anything.',
      expectedSolutionVersion: snapshot.context.solutionVersion,
      workflowHash: snapshot.context.workflowHash,
    };
    const before = modelCalls;
    const queued = await publicService.send(auth, id, command, `model_${mode}_${turnId}`);
    assert.equal(queued.turns.at(-1).status, 'queued');
    assert.equal(modelCalls, before);
    log({ phase, stage: 'queued', turnId });
    await workerService.advanceOne();
    let completed = (await publicService.read(auth, id)).turns.find((turn) => turn.id === turnId);
    if (mode === 'change' && ['queued', 'running'].includes(completed.status)) {
      log({ phase, stage: 'intent_resolved', resolvedMode: completed.resolvedMode });
      await workerService.advanceOne();
      completed = (await publicService.read(auth, id)).turns.find((turn) => turn.id === turnId);
    }
    assert.equal(
      completed.status,
      'completed',
      `real_${mode}_${completed.errorCode ?? completed.status}`
    );
    assert(completed.reply?.markdown);
    assert.equal(completed.resolvedMode, mode, 'model_resolved_actual_intent');
    assert((completed.model?.inputTokens ?? 0) > 0);
    assert(completed.model.modelVersion);
    const item = {
      mode,
      turnId,
      operationId: completed.operationId,
      status: completed.status,
      model: completed.model,
      reply: completed.reply.markdown,
      draftRevisionId: completed.draftRevisionId,
    };
    if (mode === 'change') {
      const revision = (
        await admin.query('SELECT * FROM orqaly.solution_revisions WHERE id=$1', [
          completed.draftRevisionId,
        ])
      ).rows[0];
      assert.equal(revision.status, 'draft');
      assert.equal(revision.approved_at, null);
      assert.equal(revision.tested_at, null);
      const review = reviewNativeWorkflow({
        workflow: revision.workflow,
        spec: revision.spec,
        runtimePolicy: REQUEST_AUTOMATION_POLICY,
      });
      assert(review.valid, 'real_candidate_structural_validation');
      assert(review.execution.allowed, 'real_candidate_static_execution_policy');
      assert.equal(revision.spec.connections.length, 0);
      assert(JSON.stringify(revision.spec.requirements).includes('150'));
      assert(
        revision.spec.acceptanceCases.some(
          (test) => test.input?.order?.amount === 150 && test.expectedOutput?.accepted === true
        )
      );
      const conditional = revision.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.if');
      assert(
        conditional.parameters.conditions.conditions.some(
          (condition) => condition.rightValue === 150
        )
      );
      item.workflowHash = revision.workflow_hash;
      item.nodeCount = revision.workflow.nodes.length;
      item.staticExecutionEligible = review.execution.allowed;
    }
    assert.equal(
      hash((await admin.query('SELECT * FROM orqaly.customer_solutions')).rows),
      baseline,
      'source_release_untouched'
    );
    assert.equal(
      (await admin.query('SELECT count(*)::int AS count FROM orqaly.solution_invocations')).rows[0]
        .count,
      0,
      'no_runtime_calls'
    );
    evidence.push(item);
    log({
      phase,
      stage: 'persisted',
      operationId: item.operationId,
      model: item.model,
      workflowHash: item.workflowHash ?? null,
    });
    const replay = await publicService.send(auth, id, command, `model_${mode}_${turnId}`);
    assert(replay.replayed);
    assert.equal(modelCalls, before + (mode === 'change' ? 2 : 1));
  }
  log({
    passed: true,
    axwiseCommit,
    reviewedFiles,
    modelCalls,
    evidence,
    boundary:
      'Real product AxWise/Gemini adapters and disposable PostgreSQL. Not deployed internal HTTP, browser or n8n execution. Customer workflows unchanged.',
  });
} catch (error) {
  log({
    passed: false,
    phase,
    modelCalls,
    errorCode: error.code ?? error.name,
    reason: String(error.message).slice(0, 200),
  });
  process.exitCode = 1;
} finally {
  await api?.close().catch(() => {});
  await worker?.close().catch(() => {});
  await admin?.end().catch(() => {});
  if (started)
    try {
      docker(['rm', '--force', container]);
    } catch {
      log({ cleanup: 'owned_container_requires_cleanup', container });
    }
}
