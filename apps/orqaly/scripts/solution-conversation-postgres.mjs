// Disposable PostgreSQL16 acceptance for the real Solution conversation service.
// Source/release/model are explicit synthetic fixtures: no Gemini, n8n, browser
// or cloud acceptance claim. No external effects or credentials are requested.
// Usage: node scripts/solution-conversation-postgres.mjs [--with-local-axwise-store]
// Optional cross-service check uses the existing sibling AxWise source/venv,
// its actual SQL migrations and PostgresOperationStore. It never runs a model.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import {
  createSolutionConversationService,
  makeSolutionConversationEnvelope,
} from '../server/workflow-v2/solution-conversation-service.js';
import { createSolutionConversationStore } from '../server/workflow-v2/solution-conversation-store.js';
import { createSolutionRevisionService } from '../server/workflow-v2/solution-revision-service.js';
import {
  describeNativeConnection,
  bindNativeConnections,
} from '../server/workflow-v2/native-workflow-connections.js';
import { nativeOutboundFixture } from './fixtures/native-outbound-workflow.mjs';
import {
  nativeOrderWorkflow,
  nativeOrderSpec,
} from '../server/workflow-v2/fixtures/native-order-routing.js';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';

const withAxwiseStore = process.argv.includes('--with-local-axwise-store');
assert.deepEqual(process.argv.slice(2), withAxwiseStore ? ['--with-local-axwise-store'] : []);
const axwiseRoot = '/private/tmp/axwise-prepare-solution';
const axwisePython = '/private/tmp/axwise-prepare-solution-venv/bin/python';
const suffix = randomBytes(6).toString('hex');
const container = `orqaly-conversation-pg-${suffix}`;
const password = randomBytes(24).toString('hex');
const docker = (args, env = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let started = false,
  admin,
  repository,
  workerRepository,
  phase = 'start';
const checks = [];
const check = (name) => {
  phase = name;
  checks.push(name);
  process.stdout.write(`check: ${name}\n`);
};
const expectCode = (run, code) => assert.rejects(run, (error) => error.code === code);
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
    statement_timeout: 10000,
  });
  await admin.connect();
  const serverVersion = Number(
    (await admin.query("SELECT current_setting('server_version_num') AS version")).rows[0].version
  );
  assert.equal(Math.floor(serverVersion / 10000), 16);
  check('all_migrations001_through021_on_postgresql16');
  const migrations = (await readdir('database/workflow-v2/migrations'))
    .filter((file) => /^\d{3}.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 21)
    .sort();
  assert(migrations.includes('019_solution_conversations.sql'));
  assert(migrations.includes('020_solution_conversation_planning.sql'));
  assert(migrations.includes('021_solution_revision_dependencies.sql'));
  for (const file of migrations) {
    phase = file;
    const sql = await readFile(`database/workflow-v2/migrations/${file}`, 'utf8');
    try {
      await admin.query(sql);
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({ migration: file, code: error.code, position: error.position ?? null })}\n`
      );
      throw error;
    }
  }
  let axwiseStoreUrl = null;
  if (withAxwiseStore) {
    check('actual_axwise_migrations001_through007_and_restricted_api_store');
    const axwiseMigrations = (await readdir(`${axwiseRoot}/backend/database/workflow_v2`))
      .filter((file) => /^00[1-7]_.*\.sql$/.test(file))
      .sort();
    assert.equal(axwiseMigrations.length, 7);
    for (const file of axwiseMigrations)
      await admin.query(
        await readFile(`${axwiseRoot}/backend/database/workflow_v2/${file}`, 'utf8')
      );
    await admin.query(
      `CREATE ROLE conversation_axwise_api LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE axwise_v2_api`
    );
    axwiseStoreUrl = `postgresql+psycopg2://conversation_axwise_api:${password}@127.0.0.1:${port}/postgres`;
  }
  function adoptInActualAxwiseStore(envelope) {
    assert(withAxwiseStore && axwiseStoreUrl);
    // Fresh Python process/SQLAlchemy engine on every call proves restart
    // persistence. The local disposable password and synthetic envelope stay
    // in stdin/memory, never command arguments or output.
    let result;
    try {
      result = execFileSync(
        axwisePython,
        [
          '-c',
          `
import json, sys
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
payload = json.load(sys.stdin)
sys.path.insert(0, payload["source"])
from backend.domain.workflow_v2.contracts import AxWiseOperationEnvelope
from backend.services.workflow_v2.operation_store import PostgresOperationStore, OperationConflict
engine = None
try:
    url = make_url(payload["url"])
    assert url.host == "127.0.0.1" and url.database == "postgres" and url.username == "conversation_axwise_api"
    engine = create_engine(url)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user")).scalar_one()
    store = PostgresOperationStore(engine)
    assert store.ready()
    envelope = AxWiseOperationEnvelope.model_validate(payload["envelope"])
    try:
        adopted = store.adopt_or_create(envelope)
        persisted = store.get(envelope.owner.tenant_id, envelope.operation_id)
        assert adopted == persisted
        print(json.dumps({"conflict": False, "operationId": str(persisted.operation_id), "inputHash": persisted.canonical_input_hash, "status": persisted.status}))
    except OperationConflict:
        print(json.dumps({"conflict": True}))
except Exception as error:
    print(json.dumps({"storeCheckFailed": type(error).__name__, "validationIssues": [{"type": item["type"], "location": list(item["loc"])} for item in error.errors(include_input=False, include_context=False)] if type(error).__name__ == "ValidationError" else []}))
    sys.exit(1)
finally:
    if engine is not None:
        engine.dispose()
`,
        ],
        {
          cwd: axwiseRoot,
          input: JSON.stringify({ source: axwiseRoot, url: axwiseStoreUrl, envelope }),
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30000,
        }
      );
    } catch (error) {
      // The bridge emits only class/schema-location metadata. Do not include
      // the process exception (which contains its source) or stderr/inputs.
      const diagnostic = JSON.parse(error.stdout || '{}');
      process.stdout.write(`${JSON.stringify({ actualStoreDiagnostic: diagnostic })}\n`);
      throw new Error('actual_axwise_store_check_failed');
    }
    return JSON.parse(result);
  }
  for (const role of ['identity', 'api', 'worker'])
    await admin.query(
      `CREATE ROLE conversation_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE orqaly_${role}`
    );
  const url = (role) =>
    `postgresql://conversation_test_${role}:${password}@127.0.0.1:${port}/postgres`;
  repository = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: url('identity'),
    apiDatabaseUrl: url('api'),
    requireSolutionConversations: true,
  });
  workerRepository = createPostgresRepositories({
    environment: 'preview',
    workerDatabaseUrl: url('worker'),
    requireSolutionConversations: true,
  });
  await repository.readiness();
  await workerRepository.readiness();
  const auth = { userId: `user_conversation${suffix}` },
    other = { userId: `user_other${suffix}` },
    roommate = { userId: `user_roommate${suffix}` };
  const tenantId = await repository.resolveTenant(auth),
    otherTenant = await repository.resolveTenant(other);
  await admin.query(
    "INSERT INTO orqaly.tenant_identity_bindings(tenant_id,environment,subject_type,subject_id) VALUES($1,'preview','user',$2)",
    [tenantId, roommate.userId]
  );
  assert.equal(await repository.resolveTenant(roommate), tenantId);
  const scope = { tenantId, userId: auth.userId };
  const tx = (callback) => repository.solutionBuildTransaction(scope, callback);
  const store = createSolutionConversationStore(workerRepository);
  const revisions = createSolutionRevisionService({ repository, runtime: {} });

  async function fixture({ connected = false, activeRevision = false, handler = false } = {}) {
    const id = randomUUID(),
      runId = randomUUID(),
      agentId = randomUUID();
    const taskText = 'Research the order intake. Research is not permission for external actions.';
    const source = {
      runId,
      title: 'Order intake research',
      taskText,
      taskHash: hash(taskText),
      contextHash: hash({ taskText }),
    };
    const agent = {
      id: agentId,
      name: 'Local fixture Agent',
      profileVersion: 1,
      roleLabel: 'Workflow designer',
      description: 'Synthetic database acceptance only',
      instructions: 'Explain or propose a draft; never execute',
      profileHash: hash({ agentId }),
    };
    const { spec, workflow } = connected
      ? nativeOutboundFixture()
      : { spec: nativeOrderSpec(), workflow: nativeOrderWorkflow() };
    const connectionId = connected ? randomUUID() : null;
    if (connected) {
      const node = workflow.nodes.find((item) => item.id === 'deliver');
      // Explicit nonexecuted, already-bound connection metadata fixture. No
      // credential material exists and no native credential is provisioned.
      node.credentials = {
        orqalyBoundedHttp: {
          id: 'opaque-provider-reference',
          name: `Orqaly connection ${connectionId}`,
        },
      };
    }
    if (handler) {
      const child = nativeOutboundFixture();
      child.workflow.nodes = child.workflow.nodes.slice(0, 2);
      Object.assign(child.workflow.nodes[0], {
        type: 'n8n-nodes-base.errorTrigger',
        typeVersion: 1,
        parameters: {},
      });
      delete child.workflow.connections['Deliver event'];
      child.workflow.nodes[1].credentials = {
        orqalyBoundedHttp: {
          id: 'fixture-child-opaque-selector',
          name: 'Synthetic child connection',
        },
      };
      workflow.settings.errorWorkflow = 'orqaly:error:alerts';
      spec.ownedDependencies = [{ id: 'alerts', kind: 'error_handler', ...child }];
    }
    const artifact = normalizeNativeWorkflow({ workflow, id });
    await admin.query(
      `INSERT INTO orqaly.workflow_runs(tenant_id,id,owner_user_id,mode,status,contract_version,request_hash,request_payload)
      VALUES($1,$2,$3,'simple','completed','orqaly.workflow.v2',$4,$5)`,
      [tenantId, runId, auth.userId, hash({ request: taskText }), { request: taskText }]
    );
    await admin.query(
      `INSERT INTO orqaly.solution_build_requests(tenant_id,id,owner_user_id,agent_id,run_id,instruction,source_snapshot,agent_snapshot,name,purpose,status,workflow,workflow_hash,spec,create_key,create_hash,preparation_version)
      VALUES($1,$2,$3,$4,$5,'Prepare an order workflow',$6,$7,'Local order workflow','Synthetic source fixture','draft',$8,$9,$10,$11,$9,2)`,
      [
        tenantId,
        id,
        auth.userId,
        agentId,
        runId,
        source,
        agent,
        artifact.workflow,
        artifact.workflowHash,
        spec,
        `fixture_${id}`,
      ]
    );
    await admin.query(
      `INSERT INTO orqaly.customer_solutions(tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash,status,environment_id,deployment,approved_at,tested_at,build_request_id)
      VALUES($1,$2,$3,$4,'Local order workflow','Synthetic active release fixture',$5,$6,$7,$8,$9,$8,'active',$10,$11,clock_timestamp(),clock_timestamp(),$2)`,
      [
        tenantId,
        id,
        auth.userId,
        agentId,
        spec,
        agent,
        artifact.workflow,
        artifact.workflowHash,
        `fixture_${id}`,
        `fixture_runtime_${id}`,
        {
          workflowId: `fixture${id.replaceAll('-', '')}`,
          versionId: randomUUID(),
          workflowHash: artifact.workflowHash,
          verifiedAt: new Date().toISOString(),
        },
      ]
    );
    await admin.query(
      `UPDATE orqaly.solution_build_requests SET status='completed',solution_id=id,review=$3,row_version=row_version+1 WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id, { valid: true, workflowHash: artifact.workflowHash }]
    );
    if (connected) {
      const environmentId = `fixture_runtime_${id}`;
      const described = describeNativeConnection({
        requirement: spec.connections[0],
        workflow: artifact.workflow,
        environmentId,
      });
      assert(described.scope, 'genuine_bounded_connector_scope_required');
      await admin.query(
        `INSERT INTO orqaly.solution_connections
        (tenant_id,build_request_id,id,owner_user_id,requirement_id,environment_id,credential_type,provider_credential_id,scope,request_key,request_hash,status,verified_at)
        VALUES($1,$2,$3,$4,$5,$6,'orqalyBoundedHttp','opaque-provider-reference',$7,$8,$9,'verified',clock_timestamp())`,
        [
          tenantId,
          id,
          connectionId,
          auth.userId,
          spec.connections[0].id,
          environmentId,
          described.scope,
          `connection_fixture_${connectionId}`,
          hash(described.scope),
        ]
      );
    }
    if (activeRevision) {
      const revisionId = randomUUID();
      const active = normalizeNativeWorkflow({ workflow: artifact.workflow, id: revisionId });
      await admin.query(
        `INSERT INTO orqaly.solution_revisions
        (tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,workflow,workflow_hash,spec,status,review,environment_id,approved_workflow_hash,approved_at,deployment,tested_at)
        VALUES($1,$2,$3,$4,2,1,$5,$6,$7,$8,$6,'active',$9,$10,$8,clock_timestamp(),$11,clock_timestamp())`,
        [
          tenantId,
          id,
          revisionId,
          auth.userId,
          artifact.workflow,
          spec,
          active.workflow,
          active.workflowHash,
          { valid: true, workflowHash: active.workflowHash },
          `fixture_runtime_${id}`,
          {
            workflowId: `fixture${revisionId.replaceAll('-', '')}`,
            versionId: randomUUID(),
            workflowHash: active.workflowHash,
            verifiedAt: new Date().toISOString(),
          },
        ]
      );
      await admin.query(
        'UPDATE orqaly.customer_solutions SET active_revision_id=$2,row_version=row_version+1 WHERE id=$1',
        [id, revisionId]
      );
    }
    return { id, runId, agentId, spec, ...artifact };
  }
  const original = await fixture({ activeRevision: true });
  const baseline = await admin.query('SELECT * FROM orqaly.customer_solutions ORDER BY id');
  assert(baseline.rows[0].active_revision_id, 'existing_nonnull_active_pointer_required');
  const activeBaseline = await admin.query(
    "SELECT * FROM orqaly.solution_revisions WHERE status='active'"
  );
  const sourceBaseline = await admin.query('SELECT * FROM orqaly.workflow_runs ORDER BY id');
  const submitted = [],
    polled = [];
  let behavior = 'answer',
    deferred;
  let actualStoreRunId = null;
  const responseFor = (envelope) => {
    const result =
      envelope.operationType === 'AssistantTurnV1'
        ? {
            resultType: 'assistant_turn_completed',
            response: {
              schemaVersion: 'axwise.assistant-turn.v1',
              markdown: behavior.startsWith('auto_')
                ? JSON.stringify({
                    intent: behavior === 'auto_answer' ? 'answer' : 'change',
                    reply: 'A synthetic structured intent result; nothing ran.',
                    request:
                      behavior === 'auto_answer'
                        ? null
                        : 'Uppercase the trimmed customer name in the selected draft.',
                    questions: [],
                    proposals: [
                      {
                        id: 'option_2',
                        title: 'Uppercase customer names',
                        request:
                          'Uppercase the trimmed customer name, preserving the amount boundary.',
                        requirements: {
                          nodeTypes: ['n8n-nodes-base.set'],
                          newConnection: false,
                          separateWorkflow: false,
                        },
                      },
                    ],
                  })
                : behavior === 'consent_answer'
                  ? 'The explicitly selected result contains CONSENT_ONLY_OUTPUT.'
                  : 'The saved workflow trims the name and checks the amount. No execution was requested.',
            },
          }
        : {
            resultType: 'solution_prepared',
            response: {
              schemaVersion: 'axwise.solution-preparation.v2',
              buildRequestId: envelope.input.buildRequestId,
              inputVersion: 1,
              outcome: 'candidate',
              name: 'Revised order workflow',
              purpose: 'Add uppercase normalization',
              explanation: 'A proposed unapproved draft only.',
              workflow: structuredClone(envelope.input.draft.workflow),
              spec: structuredClone(envelope.input.draft.spec),
              questions: [],
              dependencies: [],
              baseWorkflowHash: envelope.input.draft.workflowHash,
              semanticReview: {
                advisory: true,
                summary: 'Fixture design response; not model or runtime evidence.',
                concerns: [],
              },
            },
          };
    if (result.resultType === 'solution_prepared') {
      if (result.response.spec.connections.length) {
        const respond = result.response.workflow.nodes.find((node) => node.id === 'respond');
        respond.position[1] += 10;
        respond.parameters.responseBody =
          '={{ { delivery: $json.delivery, statusCode: $json.statusCode, responseBytes: $json.responseBytes, connectionId: $json.connectionId, observed: true } }}';
        result.response.spec.outputSchema.properties.observed = { type: 'boolean' };
        if (!result.response.spec.outputSchema.required.includes('observed'))
          result.response.spec.outputSchema.required.push('observed');
        for (const item of result.response.spec.acceptanceCases)
          if (!item.assertions.some((value) => value.path === '/observed'))
            item.assertions.push({ path: '/observed', operator: 'equals', value: true });
      } else {
        result.response.workflow.nodes.find(
          (node) => node.id === 'normalize'
        ).parameters.jsonOutput =
          '={{ { "amount": $json.body.order.amount, "customer": $json.body.order.customer.trim().toUpperCase() } }}';
        result.response.spec.requirements[0].description += ' Uppercase the trimmed customer.';
        for (const item of result.response.spec.acceptanceCases)
          item.expectedOutput.customer = item.expectedOutput.customer.toUpperCase();
      }
      if (behavior === 'connection_change')
        result.response.spec.connections[0].purpose = 'Broader destination scope';
      if (behavior === 'invent_credential')
        result.response.workflow.nodes[1].credentials = {
          httpHeaderAuth: { id: 'invented-model-reference' },
        };
    }
    return {
      operationId: envelope.operationId,
      canonicalInputHash: envelope.canonicalInputHash,
      status: 'completed',
      result,
    };
  };
  const axwise = {
    submit: async (envelope) => {
      submitted.push(structuredClone(envelope));
      if (withAxwiseStore && envelope.workflow.runId === actualStoreRunId) {
        const stored = adoptInActualAxwiseStore(envelope);
        assert.equal(stored.conflict, false, 'real_axwise_store_accepts_distinct_phase_attempt');
        assert.equal(stored.operationId, envelope.operationId);
        assert.equal(stored.inputHash, envelope.canonicalInputHash);
      }
      if (behavior === 'deferred')
        return new Promise((resolve) => {
          deferred = () => resolve(responseFor(envelope));
        });
      if (behavior === 'lost_submit') {
        const error = new Error('Synthetic lost response');
        error.retryable = true;
        throw error;
      }
      return responseFor(envelope);
    },
    deterministicStatusUrl: (operationId) =>
      `https://model-fixture.invalid/operations/${operationId}`,
    poll: async (statusUrl, operationId, tenant) => {
      polled.push({ statusUrl, operationId, tenant });
      return responseFor(submitted.find((item) => item.operationId === operationId));
    },
  };
  const service = createSolutionConversationService({ repository, enabled: true });
  const worker = () =>
    createSolutionConversationService({
      repository: workerRepository,
      enabled: true,
      axwiseClient: axwise,
    });
  async function commandFor(id, mode = 'ask', draft) {
    const current = await service.read(auth, id, draft ? { draftId: draft.id } : {});
    return {
      turnId: randomUUID(),
      mode,
      message:
        mode === 'ask'
          ? 'What does this workflow do?'
          : 'Uppercase the trimmed customer name in a new unapproved draft.',
      expectedSolutionVersion: current.context.solutionVersion,
      workflowHash: current.context.workflowHash,
      ...(draft ? { draft } : {}),
    };
  }
  const rawTurn = async (id) =>
    (await admin.query('SELECT * FROM orqaly.solution_conversation_turns WHERE id=$1', [id]))
      .rows[0];

  async function legacyAskFixture(reference) {
    // Explicit pre020 request shape. No model/runtime call and no modification
    // of an existing request: insert a separately addressed synthetic API row.
    const command = { ...reference.command, turnId: randomUUID() };
    const context = structuredClone(reference.context_snapshot);
    for (const key of [
      'changeRequestId',
      'continuationCount',
      'referencedRequest',
      'continuationNeedsRouting',
    ])
      delete context[key];
    const envelope = makeSolutionConversationEnvelope({
      scope,
      turnId: command.turnId,
      command,
      context,
      history: [],
    });
    await tx((client) =>
      client.query(
        `INSERT INTO orqaly.solution_conversation_turns(tenant_id,solution_id,id,owner_user_id,mode,message,request_key,request_hash,command,context_snapshot,context_hash,operation_id,envelope,target_revision_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL)`,
        [
          tenantId,
          reference.solution_id,
          command.turnId,
          auth.userId,
          'ask',
          command.message,
          `legacy_fixture_${command.turnId}`,
          hash(command),
          command,
          context,
          hash(context),
          envelope.operationId,
          envelope,
        ]
      )
    );
    return command.turnId;
  }

  check('force_rls_and_restricted_role_grants');
  const table = (
    await admin.query(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='orqaly.solution_conversation_turns'::regclass"
    )
  ).rows[0];
  assert.equal(table.relrowsecurity, true);
  assert.equal(table.relforcerowsecurity, true);
  await expectCode(
    () =>
      tx((client) =>
        client.query('SELECT orqaly.claim_solution_conversation_turn($1)', [randomUUID()])
      ),
    '42501'
  );
  await expectCode(
    () =>
      tx((client) =>
        client.query('SELECT orqaly.claim_solution_conversation_turn_v2($1)', [randomUUID()])
      ),
    '42501'
  );
  await expectCode(() => workerRepository.claimSolutionConversationTurnV2(null), '42501');
  await expectCode(
    () =>
      tx((client) =>
        client.query('SELECT orqaly.complete_solution_conversation_turn($1,$2,$3)', [
          randomUUID(),
          randomUUID(),
          { status: 'completed' },
        ])
      ),
    '42501'
  );

  check('durable_api_queue_idempotency_and_no_model_on_send');
  const ask = await commandFor(original.id);
  const first = await service.send(auth, original.id, ask, `ask_${ask.turnId}`);
  assert.equal(first.turns.at(-1).status, 'queued');
  assert.equal(submitted.length, 0);
  assert.equal((await service.send(auth, original.id, ask, `ask_${ask.turnId}`)).replayed, true);
  await expectCode(
    () =>
      service.send(
        auth,
        original.id,
        { ...ask, message: 'Different message' },
        `ask_${ask.turnId}`
      ),
    'IDEMPOTENCY_CONFLICT'
  );
  await expectCode(
    () => service.send(auth, original.id, { ...ask, turnId: randomUUID() }, 'another_pending_turn'),
    'SOLUTION_CONVERSATION_PENDING'
  );
  const raw = await rawTurn(ask.turnId);
  assert.equal(raw.context_hash, hash(raw.context_snapshot));
  assert.equal(raw.envelope.canonicalInputHash, hash(raw.envelope.input));
  assert.equal(raw.envelope.workflow.runId, original.runId);

  check('cross_tenant_and_same_tenant_other_owner_are_hidden');
  for (const foreign of [other, roommate]) {
    await expectCode(() => service.read(foreign, original.id), 'SOLUTION_NOT_FOUND');
    await expectCode(
      () =>
        service.send(
          foreign,
          original.id,
          { ...ask, turnId: randomUUID() },
          'foreign_owner_request'
        ),
      'SOLUTION_NOT_FOUND'
    );
  }
  for (const foreignScope of [
    { tenantId: otherTenant, userId: other.userId },
    { tenantId, userId: roommate.userId },
  ]) {
    const rows = await repository.solutionBuildTransaction(foreignScope, (client) =>
      client.query('SELECT id FROM orqaly.solution_conversation_turns')
    );
    assert.equal(rows.rowCount, 0);
  }

  check('api_cannot_change_requests_reply_status_or_terminal_columns');
  for (const column of [
    "message='tampered'",
    "status='completed'",
    "reply='{}'::jsonb",
    'lease_token=NULL',
  ]) {
    await expectCode(
      () =>
        tx((client) =>
          client.query(`UPDATE orqaly.solution_conversation_turns SET ${column} WHERE id=$1`, [
            ask.turnId,
          ])
        ),
      '42501'
    );
  }
  await expectCode(
    () =>
      tx((client) =>
        client.query('DELETE FROM orqaly.solution_conversation_turns WHERE id=$1', [ask.turnId])
      ),
    '42501'
  );
  await expectCode(
    () =>
      tx((client) =>
        client.query(
          `INSERT INTO orqaly.solution_conversation_turns(tenant_id,solution_id,id,owner_user_id,status) VALUES($1,$2,$3,$4,'completed')`,
          [tenantId, original.id, randomUUID(), auth.userId]
        )
      ),
    '42501'
  );
  await expectCode(
    () =>
      admin.query("UPDATE orqaly.solution_conversation_turns SET message='changed' WHERE id=$1", [
        ask.turnId,
      ]),
    '42501'
  );

  check('actual_worker_ask_completion_is_durable_and_nonexecuting');
  assert.equal(
    await workerRepository.claimSolutionConversationTurn(randomUUID()),
    null,
    'legacy_worker_cannot_claim_new_explicit_ask'
  );
  assert.deepEqual(await rawTurn(ask.turnId), raw, 'old_claim_does_not_mutate_new_request');
  const askCompleted = await worker().advanceOne();
  assert.equal(askCompleted.status, 'completed');
  const asked = await service.read(auth, original.id);
  assert.match(asked.turns.at(-1).reply.markdown, /No execution was requested/);
  assert.equal(asked.turns.at(-1).operationId, raw.operation_id);
  assert.equal(asked.context.availableDraft, null);
  await expectCode(
    () =>
      admin.query("UPDATE orqaly.solution_conversation_turns SET reply='{}' WHERE id=$1", [
        ask.turnId,
      ]),
    '42501'
  );
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.customer_solutions ORDER BY id')).rows,
    baseline.rows
  );

  check('legacy_claim_remains_compatible_but_never_claims_new_lifecycle_rows');
  const legacyId = await legacyAskFixture(raw);
  const legacyLeaseToken = randomUUID();
  const legacyLease = await workerRepository.claimSolutionConversationTurn(legacyLeaseToken);
  assert.deepEqual(legacyLease, {
    tenantId,
    userId: auth.userId,
    turnId: legacyId,
    leaseToken: legacyLeaseToken,
  });
  assert.equal(await store.claim(randomUUID()), null, 'versioned_claim_cannot_steal_legacy_lease');
  await store.finish(scope, legacyId, legacyLeaseToken, {
    status: 'completed',
    reply: { markdown: 'Explicit legacy claim fixture; no model or runtime called.' },
  });
  const legacyForNewWorker = await legacyAskFixture(raw);
  const newLease = await store.claim(randomUUID());
  assert.equal(newLease.turnId, legacyForNewWorker, 'new_worker_can_finish_old_request_shape');
  await store.finish(scope, legacyForNewWorker, newLease.leaseToken, { status: 'completed' });
  const lifecycleFixtureId = await legacyAskFixture(raw);
  // Explicit local-only phase fixture exercises the independent lifecycle
  // exclusion even when an older request has no new-context marker.
  await admin.query('UPDATE orqaly.solution_conversation_turns SET lifecycle=$2 WHERE id=$1', [
    lifecycleFixtureId,
    { phase: 'fixture_new_phase' },
  ]);
  const lifecycleBefore = await rawTurn(lifecycleFixtureId);
  assert.equal(await workerRepository.claimSolutionConversationTurn(randomUUID()), null);
  assert.deepEqual(await rawTurn(lifecycleFixtureId), lifecycleBefore);
  const lifecycleLease = await store.claim(randomUUID());
  assert.equal(lifecycleLease.turnId, lifecycleFixtureId);
  await store.finish(scope, lifecycleFixtureId, lifecycleLease.leaseToken, {
    status: 'failed',
    errorCode: 'LOCAL_FIXTURE_STOPPED',
  });

  check('change_creates_only_new_unapproved_draft_with_exact_provenance');
  behavior = 'candidate';
  const change = await commandFor(original.id, 'change');
  await service.send(auth, original.id, change, `change_${change.turnId}`);
  assert.equal(
    await workerRepository.claimSolutionConversationTurn(randomUUID()),
    null,
    'legacy_worker_cannot_claim_new_explicit_change'
  );
  const changed = await worker().advanceOne();
  assert.equal(changed.status, 'completed');
  let snapshot = await service.read(auth, original.id);
  let draft = snapshot.context.availableDraft;
  assert(draft?.id);
  assert.equal(snapshot.turns.at(-1).draftRevisionId, draft.id);
  let revision = (await revisions.readRevision(auth, original.id, draft.id)).revision;
  assert.equal(revision.status, 'draft');
  assert.equal(revision.version, 3);
  assert.equal(revision.approvedAt, null);
  assert.equal(revision.testedAt, null);
  assert.equal(revision.deployment, null);
  assert.equal(revision.workflowHash, hash(revision.workflow));
  assert(
    revision.workflow.nodes
      .find((node) => node.id === 'normalize')
      .parameters.jsonOutput.includes('toUpperCase')
  );
  assert.equal(
    (
      await admin.query('SELECT details FROM orqaly.solution_revision_events WHERE id=$1', [
        change.turnId,
      ])
    ).rows[0].details.conversationTurnId,
    change.turnId
  );
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.customer_solutions ORDER BY id')).rows,
    baseline.rows
  );

  check('existing_draft_requires_explicit_binding_and_rejects_stale_hash');
  const noDraft = await commandFor(original.id, 'change');
  await expectCode(
    () => service.send(auth, original.id, noDraft, 'missing_draft_selection'),
    'DRAFT_SELECTION_REQUIRED'
  );
  const stale = await commandFor(original.id, 'change', draft);
  await expectCode(
    () =>
      service.send(
        auth,
        original.id,
        { ...stale, draft: { ...draft, workflowHash: 'f'.repeat(64) } },
        'stale_draft_hash'
      ),
    'SOLUTION_CONVERSATION_CONFLICT'
  );

  check('native_edit_during_model_work_blocks_late_candidate_without_overwrite');
  const pending = await commandFor(original.id, 'change', draft);
  await service.send(auth, original.id, pending, `edit_${pending.turnId}`);
  behavior = 'deferred';
  const inFlight = worker().advanceOne();
  for (let n = 0; n < 50 && !deferred; n++) await delay(10);
  assert(deferred, 'model_fixture_dispatched');
  const editedGraph = structuredClone(revision.workflow);
  editedGraph.nodes[0].position[0] += 20;
  revision = (
    await revisions.saveDraft(auth, original.id, draft.id, {
      expectedVersion: draft.rowVersion,
      workflow: editedGraph,
    })
  ).revision;
  const editedHash = revision.workflowHash;
  deferred();
  const conflict = await inFlight;
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.errorCode, 'SOLUTION_CONVERSATION_CONFLICT');
  assert.equal(
    (await revisions.readRevision(auth, original.id, draft.id)).revision.workflowHash,
    editedHash
  );

  check('explicit_selected_draft_can_be_updated_without_activating_it');
  snapshot = await service.read(auth, original.id);
  draft = snapshot.context.availableDraft;
  behavior = 'candidate';
  const selected = await commandFor(original.id, 'change', draft);
  await service.send(auth, original.id, selected, `selected_${selected.turnId}`);
  assert.equal((await worker().advanceOne()).status, 'completed');
  snapshot = await service.read(auth, original.id);
  assert.equal(snapshot.context.availableDraft.id, draft.id);
  assert.equal(snapshot.context.availableDraft.rowVersion, draft.rowVersion + 1);
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.customer_solutions ORDER BY id')).rows,
    baseline.rows
  );

  check('lost_submit_response_polls_same_operation_after_restart_without_duplicate_submit');
  behavior = 'lost_submit';
  const lost = await commandFor(original.id);
  await service.send(auth, original.id, lost, `lost_${lost.turnId}`);
  assert.equal((await worker().advanceOne()).status, 'running');
  const lostRaw = await rawTurn(lost.turnId);
  assert.equal(lostRaw.status_url, axwise.deterministicStatusUrl(lostRaw.operation_id));
  assert.equal(lostRaw.lease_token, null);
  assert.equal(lostRaw.lease_expires_at, null);
  assert.equal(
    (await store.finish(scope, lost.turnId, null, { status: 'completed' })).stale,
    true,
    'unleased_waiting_turn_cannot_be_completed'
  );
  assert.deepEqual(
    await rawTurn(lost.turnId),
    lostRaw,
    'no_lease_completion_leaves_waiting_turn_unchanged'
  );
  const countBefore = submitted.length;
  await delay(2100);
  behavior = 'answer';
  assert.equal((await worker().advanceOne()).status, 'completed');
  assert.equal(submitted.length, countBefore);
  assert.equal(polled.at(-1).operationId, lostRaw.operation_id);
  assert.equal(polled.at(-1).tenant, tenantId);

  check('stale_expired_and_foreign_owner_worker_leases_cannot_complete');
  const leaseMessage = await commandFor(original.id);
  await service.send(auth, original.id, leaseMessage, `lease_${leaseMessage.turnId}`);
  const lease = await store.claim(randomUUID());
  assert.equal(lease.turnId, leaseMessage.turnId);
  assert.equal(
    (await store.finish(scope, lease.turnId, randomUUID(), { status: 'completed' })).stale,
    true
  );
  await expectCode(
    () =>
      store.finish({ tenantId, userId: roommate.userId }, lease.turnId, lease.leaseToken, {
        status: 'completed',
      }),
    '42501'
  );
  // Deliberate local-only lease expiry fixture; no provider calls occurred.
  await admin.query(
    "UPDATE orqaly.solution_conversation_turns SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [lease.turnId]
  );
  assert.equal(
    (await store.finish(scope, lease.turnId, lease.leaseToken, { status: 'completed' })).stale,
    true
  );
  const replacement = await store.claim(randomUUID());
  assert.equal(replacement.turnId, lease.turnId);
  assert.notEqual(replacement.leaseToken, lease.leaseToken);
  assert.equal(
    (
      await store.finish(scope, lease.turnId, replacement.leaseToken, {
        status: 'failed',
        errorCode: 'LOCAL_FIXTURE_STOPPED',
      })
    ).status,
    'failed'
  );

  check('connection_references_redacted_and_model_cannot_expand_connection_grants');
  const connected = await fixture({ connected: true });
  const connectedBaseline = (
    await admin.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1', [connected.id])
  ).rows;
  const connectionAsk = await commandFor(connected.id);
  await service.send(auth, connected.id, connectionAsk, `connection_${connectionAsk.turnId}`);
  const connectionRaw = await rawTurn(connectionAsk.turnId);
  assert(!JSON.stringify(connectionRaw.envelope).includes('opaque-provider-reference'));
  assert(
    !JSON.stringify(connectionRaw.context_snapshot.workflow).includes('opaque-provider-reference')
  );
  assert(
    !JSON.stringify(await service.read(auth, connected.id)).includes('opaque-provider-reference')
  );
  assert.equal((await worker().advanceOne()).status, 'completed');
  behavior = 'connection_change';
  const setupTarget = await fixture({ connected: true });
  const connectionChange = await commandFor(setupTarget.id, 'change');
  await service.send(
    auth,
    setupTarget.id,
    connectionChange,
    `connection_change_${connectionChange.turnId}`
  );
  const pendingSetup = await worker().advanceOne();
  assert.equal(pendingSetup.status, 'completed');
  const setupSnapshot = await service.read(auth, setupTarget.id);
  assert.equal(setupSnapshot.turns.at(-1).phase, 'needs_setup');
  assert.equal(setupSnapshot.turns.at(-1).setupRef.revisionId, pendingSetup.draftRevisionId);
  const unbound = (
    await admin.query('SELECT workflow FROM orqaly.solution_revisions WHERE id=$1', [
      pendingSetup.draftRevisionId,
    ])
  ).rows[0];
  assert(unbound.workflow.nodes.every((node) => !node.credentials));
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1', [connected.id])).rows,
    connectedBaseline
  );

  check('narrow_worker_rpc_rejects_connected_node_changes_and_credential_selectors');
  const connectedCommand = await commandFor(connected.id, 'change');
  await service.send(auth, connected.id, connectedCommand, `rpc_${connectedCommand.turnId}`);
  const connectedLease = await store.claim(randomUUID());
  assert.equal(connectedLease.turnId, connectedCommand.turnId);
  const connectedTurn = await store.readClaim(
    scope,
    connectedLease.turnId,
    connectedLease.leaseToken
  );
  const originalCandidate = normalizeNativeWorkflow({
    workflow: connectedTurn.context_snapshot.authoritativeWorkflow,
    id: connectedTurn.target_revision_id,
  });
  const candidate = {
    ...originalCandidate,
    spec: connectedTurn.context_snapshot.spec,
    validated: true,
  };
  const credentialCandidate = structuredClone(candidate);
  credentialCandidate.workflow.nodes[1].credentials.orqalyBoundedHttp.id = 'forged-selector';
  await expectCode(
    () =>
      store.finish(scope, connectedLease.turnId, connectedLease.leaseToken, {
        status: 'completed',
        candidate: credentialCandidate,
      }),
    '42501'
  );
  const changedConnection = structuredClone(candidate);
  changedConnection.workflow.nodes.find((node) => node.id === 'deliver').parameters.url =
    'https://changed.example/unauthorized';
  changedConnection.workflowHash = hash(changedConnection.workflow);
  const rpcBlocked = await store.finish(scope, connectedLease.turnId, connectedLease.leaseToken, {
    status: 'completed',
    candidate: changedConnection,
  });
  assert.equal(rpcBlocked.status, 'blocked');
  assert.equal(rpcBlocked.errorCode, 'CONVERSATION_CONNECTION_SETUP_REQUIRED');
  assert.equal((await service.read(auth, connected.id)).context.availableDraft, null);

  check('unchanged_owned_connection_survives_new_and_selected_draft_without_model_exposure');
  const connectionBaseline = (
    await admin.query('SELECT * FROM orqaly.solution_connections ORDER BY id')
  ).rows;
  behavior = 'candidate';
  let connectedDraft;
  for (let i = 0; i < 2; i++) {
    const safeChange = {
      ...(await commandFor(connected.id, 'change', connectedDraft)),
      message:
        'Add observed:true to the returned acknowledgement without changing the existing connector or its authority.',
    };
    await service.send(auth, connected.id, safeChange, `preserve_connector_${safeChange.turnId}`);
    const queued = await rawTurn(safeChange.turnId);
    assert(!JSON.stringify(queued.envelope).includes('opaque-provider-reference'));
    assert(!JSON.stringify(queued.context_snapshot.workflow).includes('opaque-provider-reference'));
    assert(
      JSON.stringify(queued.context_snapshot.authoritativeWorkflow).includes(
        'opaque-provider-reference'
      )
    );
    const completed = await worker().advanceOne();
    assert.equal(completed.status, 'completed');
    connectedDraft = (await service.read(auth, connected.id)).context.availableDraft;
    const saved = (await revisions.readRevision(auth, connected.id, connectedDraft.id)).revision;
    assert.equal(saved.status, 'draft');
    assert.equal(saved.approvedAt, null);
    assert.equal(saved.deployment, null);
    assert.equal(saved.testedAt, null);
    assert.deepEqual(
      saved.workflow.nodes.find((node) => node.id === 'deliver').credentials,
      connected.workflow.nodes.find((node) => node.id === 'deliver').credentials
    );
    assert.equal(saved.workflowHash, hash(saved.workflow));
    assert.deepEqual(
      bindNativeConnections(
        saved.workflow,
        saved.spec,
        connectionBaseline.filter((record) => record.build_request_id === connected.id),
        `fixture_runtime_${connected.id}`
      ),
      saved.workflow
    );
    const rawRevision = (
      await admin.query('SELECT base_workflow FROM orqaly.solution_revisions WHERE id=$1', [
        connectedDraft.id,
      ])
    ).rows[0];
    assert.deepEqual(
      rawRevision.base_workflow.nodes.find((node) => node.id === 'deliver').credentials,
      connected.workflow.nodes.find((node) => node.id === 'deliver').credentials
    );
    assert(
      !JSON.stringify((await rawTurn(safeChange.turnId)).result).includes(
        'opaque-provider-reference'
      )
    );
  }
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.solution_connections ORDER BY id')).rows,
    connectionBaseline
  );
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1', [connected.id])).rows,
    connectedBaseline
  );

  check('model_invented_credential_is_rejected_without_persisting_result');
  behavior = 'invent_credential';
  const invented = await commandFor(
    original.id,
    'change',
    (await service.read(auth, original.id)).context.availableDraft
  );
  await service.send(auth, original.id, invented, `invented_${invented.turnId}`);
  assert.equal((await worker().advanceOne()).status, 'failed');
  assert.equal((await rawTurn(invented.turnId)).result, null);
  assert(
    !JSON.stringify(await service.read(auth, original.id)).includes('invented-model-reference')
  );

  check('concurrent_identical_admission_creates_one_turn_and_replay_survives_completion');
  behavior = 'answer';
  const concurrent = await commandFor(original.id);
  const admissions = await Promise.all([
    service.send(auth, original.id, concurrent, `concurrent_${concurrent.turnId}`),
    service.send(auth, original.id, concurrent, `concurrent_${concurrent.turnId}`),
  ]);
  assert.deepEqual(admissions.map((item) => item.replayed).sort(), [false, true]);
  assert.equal(
    Number(
      (
        await admin.query(
          'SELECT count(*) AS count FROM orqaly.solution_conversation_turns WHERE id=$1',
          [concurrent.turnId]
        )
      ).rows[0].count
    ),
    1
  );
  assert.equal((await worker().advanceOne()).status, 'completed');
  assert.equal(
    (await service.send(auth, original.id, concurrent, `concurrent_${concurrent.turnId}`)).replayed,
    true
  );

  check('selected_run_consent_is_exact_owner_solution_scoped_and_metadata_only_by_default');
  async function receiptFixture(solution, input, output, owner = auth.userId) {
    const id = randomUUID();
    const current = await service.read(auth, solution.id);
    await admin.query(
      `INSERT INTO orqaly.solution_invocations(tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,output,status,execution_id,completed_at)
      VALUES($1,$2,$3,$4,'test',$5,$6,$7,$8,$9,'succeeded',$10,clock_timestamp())`,
      [
        tenantId,
        solution.id,
        id,
        owner,
        `receipt_fixture_${id}`,
        hash(input),
        current.context.workflowHash,
        input,
        output,
        `explicit-local-fixture-${id}`,
      ]
    );
    return id;
  }
  const safeReceipt = await receiptFixture(
    original,
    { order: { customer: 'ConsentOnlyCustomerName', amount: 100 } },
    { customer: 'CONSENT_ONLY_OUTPUT' }
  );
  const sensitiveReceipt = await receiptFixture(
    original,
    { auth: 'do-not-forward-context', order: { amount: 100 } },
    { customer: 'OMITTED_INPUT_SAFE_OUTPUT' }
  );
  const differentSolutionReceipt = await receiptFixture(
    connected,
    { customer: 'OtherSolutionValue' },
    {}
  );
  const differentOwnerReceipt = await receiptFixture(
    original,
    { customer: 'OtherOwnerValue' },
    {},
    roommate.userId
  );
  const receiptBaseline = (
    await admin.query('SELECT * FROM orqaly.solution_invocations ORDER BY id')
  ).rows;
  const options = await service.read(auth, original.id);
  assert(options.availableInvocations.some((item) => item.id === safeReceipt));
  assert(!options.availableInvocations.some((item) => item.id === differentOwnerReceipt));
  assert(!JSON.stringify(options).includes('ConsentOnlyCustomerName'));
  assert(!JSON.stringify(options).includes('CONSENT_ONLY_OUTPUT'));
  for (const id of [differentSolutionReceipt, differentOwnerReceipt, randomUUID()]) {
    const invalid = {
      ...(await commandFor(original.id)),
      includeInvocation: { id, inputOutput: true },
    };
    await expectCode(
      () => service.send(auth, original.id, invalid, `invalid_receipt_${invalid.turnId}`),
      'SOLUTION_INVOCATION_NOT_FOUND'
    );
  }
  behavior = 'answer';
  const withoutConsent = await commandFor(original.id);
  await service.send(auth, original.id, withoutConsent, `metadata_only_${withoutConsent.turnId}`);
  assert(
    !JSON.stringify((await rawTurn(withoutConsent.turnId)).envelope).includes(
      'ConsentOnlyCustomerName'
    )
  );
  assert.equal((await worker().advanceOne()).status, 'completed');

  check('consent_forwards_one_bounded_safe_receipt_for_one_message_only');
  const consent = {
    ...(await commandFor(original.id)),
    includeInvocation: { id: safeReceipt, inputOutput: true },
  };
  await service.send(auth, original.id, consent, `consent_${consent.turnId}`);
  const consentTurn = await rawTurn(consent.turnId);
  assert.deepEqual(consentTurn.command.includeInvocation, consent.includeInvocation);
  assert.equal(consentTurn.context_snapshot.selectedInvocation.id, safeReceipt);
  assert.equal(
    consentTurn.context_snapshot.selectedInvocation.input.value.order.customer,
    'ConsentOnlyCustomerName'
  );
  assert.equal(
    consentTurn.context_snapshot.selectedInvocation.output.value.customer,
    'CONSENT_ONLY_OUTPUT'
  );
  assert(JSON.stringify(consentTurn.envelope).includes('ConsentOnlyCustomerName'));
  assert(!JSON.stringify(consentTurn.envelope).includes('OtherSolutionValue'));
  assert(!JSON.stringify(consentTurn.envelope).includes('OtherOwnerValue'));
  behavior = 'consent_answer';
  assert.equal((await worker().advanceOne()).status, 'completed');
  const following = await commandFor(original.id);
  await service.send(auth, original.id, following, `following_${following.turnId}`);
  const followingEnvelope = JSON.stringify((await rawTurn(following.turnId)).envelope);
  assert(!followingEnvelope.includes('ConsentOnlyCustomerName'));
  assert(
    !followingEnvelope.includes('CONSENT_ONLY_OUTPUT'),
    'prior_consented_answer_not_reused_without_new_consent'
  );
  behavior = 'answer';
  assert.equal((await worker().advanceOne()).status, 'completed');

  check('consent_does_not_authorize_secret_fields_and_omission_is_explicit');
  const sensitive = {
    ...(await commandFor(original.id)),
    includeInvocation: { id: sensitiveReceipt, inputOutput: true },
  };
  await service.send(auth, original.id, sensitive, `sensitive_${sensitive.turnId}`);
  const sensitiveTurn = await rawTurn(sensitive.turnId);
  assert.equal(
    sensitiveTurn.context_snapshot.selectedInvocation.input.omitted,
    'credential_or_sensitive_content'
  );
  assert.equal(
    sensitiveTurn.context_snapshot.selectedInvocation.output.value.customer,
    'OMITTED_INPUT_SAFE_OUTPUT'
  );
  assert(!JSON.stringify(sensitiveTurn.envelope).includes('do-not-forward-context'));
  assert.equal((await worker().advanceOne()).status, 'completed');
  const publicSensitive = (await service.read(auth, original.id)).turns.find(
    (item) => item.id === sensitive.turnId
  );
  assert(
    publicSensitive.includedInvocation.omissionReasons.some(
      (item) => item.field === 'input' && item.reason === 'credential_or_sensitive_content'
    )
  );

  check('suspended_tenant_after_admission_blocks_before_any_model_dispatch');
  behavior = 'answer';
  const suspension = await commandFor(original.id);
  await service.send(auth, original.id, suspension, `suspension_${suspension.turnId}`);
  const modelCount = submitted.length,
    pollCount = polled.length;
  // Local-only tenant lifecycle fixture; restore after proving the queued guard.
  await admin.query("UPDATE orqaly.tenants SET status='suspended' WHERE id=$1", [tenantId]);
  const suspended = await worker().advanceOne();
  assert.equal(suspended.status, 'blocked');
  assert.equal(suspended.errorCode, 'TENANT_SUSPENDED');
  assert.equal(submitted.length, modelCount);
  assert.equal(polled.length, pollCount);
  await admin.query("UPDATE orqaly.tenants SET status='active' WHERE id=$1", [tenantId]);

  check('auto_intent_is_persisted_then_restarted_worker_designs_exactly_one_unapproved_draft');
  behavior = 'auto_change';
  const autoTarget = await fixture();
  const autoCommand = await commandFor(autoTarget.id, 'auto');
  const submitsBeforeAuto = submitted.length;
  await service.send(auth, autoTarget.id, autoCommand, `auto_${autoCommand.turnId}`);
  assert.equal(submitted.length, submitsBeforeAuto, 'admission_does_not_call_model');
  const autoQueued = await rawTurn(autoCommand.turnId);
  if (withAxwiseStore) actualStoreRunId = autoQueued.envelope.workflow.runId;
  assert.equal(
    await workerRepository.claimSolutionConversationTurn(randomUUID()),
    null,
    'old_worker_cannot_steal_auto_router_phase'
  );
  assert.deepEqual(await rawTurn(autoCommand.turnId), autoQueued);
  const routed = await worker().advanceOne();
  assert.equal(routed.phase, 'designing');
  const routedRow = await rawTurn(autoCommand.turnId);
  assert.equal(routedRow.lifecycle.resolvedMode, 'change');
  assert.notEqual(routedRow.operation_id, routedRow.lifecycle.envelope.operationId);
  assert.notEqual(
    routedRow.envelope.workflow.stageAttemptId,
    routedRow.lifecycle.envelope.workflow.stageAttemptId,
    'routing_and_design_require_distinct_axwise_attempt_slots'
  );
  assert.equal(routedRow.envelope.workflow.stageId, routedRow.lifecycle.envelope.workflow.stageId);
  if (withAxwiseStore) {
    check('actual_axwise_store_reproduces_old_collision_and_preserves_router_on_replay');
    const oldCollision = structuredClone(routedRow.lifecycle.envelope);
    oldCollision.workflow.stageAttemptId = routedRow.envelope.workflow.stageAttemptId;
    assert.deepEqual(adoptInActualAxwiseStore(oldCollision), { conflict: true });
    assert.equal(adoptInActualAxwiseStore(routedRow.envelope).operationId, routedRow.operation_id);
  }
  assert.equal(
    await workerRepository.claimSolutionConversationTurn(randomUUID()),
    null,
    'old_worker_cannot_steal_persisted_design_phase'
  );
  assert.deepEqual(await rawTurn(autoCommand.turnId), routedRow);
  assert.equal(
    routedRow.lifecycle.envelope.input.draft.workflowHash,
    hash(routedRow.context_snapshot.workflow)
  );
  assert.equal(
    (
      await admin.query('SELECT count(*) FROM orqaly.solution_revisions WHERE solution_id=$1', [
        autoTarget.id,
      ])
    ).rows[0].count,
    '0'
  );
  await expectCode(
    () =>
      repository.solutionBuildTransaction(scope, (client) =>
        client.query("UPDATE orqaly.solution_conversation_turns SET lifecycle='{}' WHERE id=$1", [
          autoCommand.turnId,
        ])
      ),
    '42501'
  );
  const autoCompleted = await worker().advanceOne();
  assert.equal(autoCompleted.status, 'completed');
  assert(autoCompleted.draftRevisionId);
  assert.equal(submitted.length, submitsBeforeAuto + 2);
  if (withAxwiseStore) {
    check('actual_axwise_store_accepts_design_and_replays_both_after_process_restart');
    for (const envelope of [routedRow.envelope, routedRow.lifecycle.envelope]) {
      const replay = adoptInActualAxwiseStore(envelope);
      assert.equal(replay.conflict, false);
      assert.equal(replay.operationId, envelope.operationId);
      assert.equal(replay.inputHash, envelope.canonicalInputHash);
    }
    assert.equal(
      (
        await admin.query(
          'SELECT count(*) FROM axwise.cognitive_operations WHERE tenant_id=$1 AND run_id=$2',
          [tenantId, actualStoreRunId]
        )
      ).rows[0].count,
      '2',
      'one_persisted_operation_per_phase_no_duplicate_on_restart'
    );
    actualStoreRunId = null;
  }
  assert.equal(
    (
      await admin.query('SELECT active_revision_id FROM orqaly.customer_solutions WHERE id=$1', [
        autoTarget.id,
      ])
    ).rows[0].active_revision_id,
    null
  );
  assert.equal(
    (await service.send(auth, autoTarget.id, autoCommand, `auto_${autoCommand.turnId}`)).replayed,
    true
  );
  assert.equal((await worker().advanceOne()).processed, false);

  check('auto_existing_draft_continuation_retains_logical_request_and_exact_fresh_draft_binding');
  const needSelection = await commandFor(autoTarget.id, 'auto');
  await service.send(auth, autoTarget.id, needSelection, `select_${needSelection.turnId}`);
  assert.equal((await worker().advanceOne()).status, 'blocked');
  const waiting = await service.read(auth, autoTarget.id);
  assert.equal(waiting.turns.at(-1).draftSelectionRequired, true);
  const continueCommand = {
    ...(await commandFor(autoTarget.id, 'change', waiting.context.availableDraft)),
    message: 'Update existing draft',
    continuation: { turnId: needSelection.turnId, kind: 'answer' },
  };
  await service.send(auth, autoTarget.id, continueCommand, `continue_${continueCommand.turnId}`);
  assert.equal(
    await workerRepository.claimSolutionConversationTurn(randomUUID()),
    null,
    'old_worker_cannot_steal_explicit_change_continuation'
  );
  const continued = await rawTurn(continueCommand.turnId);
  assert.equal(continued.context_snapshot.changeRequestId, needSelection.turnId);
  assert(continued.envelope.input.instruction.includes('Uppercase the trimmed customer name'));
  assert.equal((await worker().advanceOne()).status, 'completed');

  check('structured_proposal_survives_live_to_draft_selection_and_requires_exact_saved_hash');
  behavior = 'auto_answer';
  const proposalCommand = await commandFor(autoTarget.id, 'auto');
  await service.send(auth, autoTarget.id, proposalCommand, `proposal_${proposalCommand.turnId}`);
  assert.equal((await worker().advanceOne()).status, 'completed');
  const proposalSnapshot = await service.read(auth, autoTarget.id);
  const option = proposalSnapshot.turns.at(-1).proposals[0];
  assert.equal(option.id, 'option_2');
  const selectProposal = {
    ...(await commandFor(autoTarget.id, 'change', proposalSnapshot.context.availableDraft)),
    message: 'Option 2 is good, implement it',
    proposalRef: {
      turnId: proposalCommand.turnId,
      proposalId: option.id,
      proposalHash: option.contentHash,
    },
  };
  await expectCode(
    () =>
      service.send(
        auth,
        autoTarget.id,
        {
          ...selectProposal,
          proposalRef: { ...selectProposal.proposalRef, proposalHash: 'f'.repeat(64) },
        },
        `bad_proposal_${selectProposal.turnId}`
      ),
    'CONVERSATION_PROPOSAL_CHANGED'
  );
  await service.send(
    auth,
    autoTarget.id,
    selectProposal,
    `select_proposal_${selectProposal.turnId}`
  );
  assert.equal(
    await workerRepository.claimSolutionConversationTurn(randomUUID()),
    null,
    'old_worker_cannot_steal_explicit_proposal_change'
  );
  assert(
    (await rawTurn(selectProposal.turnId)).envelope.input.instruction.includes(option.request)
  );
  assert.equal((await worker().advanceOne()).status, 'completed');

  check('owned_child_credentials_never_reach_model_and_sql_rejects_forged_child_selectors');
  const childTarget = await fixture({ handler: true });
  const childCommand = await commandFor(childTarget.id, 'change');
  behavior = 'candidate';
  await service.send(auth, childTarget.id, childCommand, `child_${childCommand.turnId}`);
  const childTurn = await rawTurn(childCommand.turnId);
  assert(!JSON.stringify(childTurn.envelope).includes('fixture-child-opaque-selector'));
  assert(
    JSON.stringify(childTurn.context_snapshot.authoritativeSpec).includes(
      'fixture-child-opaque-selector'
    )
  );
  const childCompleted = await worker().advanceOne();
  assert.equal(childCompleted.status, 'completed');
  const childSaved = (
    await revisions.readRevision(auth, childTarget.id, childCompleted.draftRevisionId)
  ).revision;
  assert.equal(
    childSaved.spec.ownedDependencies[0].workflow.nodes[1].credentials.orqalyBoundedHttp.id,
    'fixture-child-opaque-selector'
  );
  const childNext = await commandFor(
    childTarget.id,
    'change',
    (await service.read(auth, childTarget.id)).context.availableDraft
  );
  await service.send(auth, childTarget.id, childNext, `child_forge_${childNext.turnId}`);
  const childLease = await store.claim(randomUUID());
  assert.equal(childLease.turnId, childNext.turnId);
  const childClaimed = await store.readClaim(scope, childLease.turnId, childLease.leaseToken);
  const forged = {
    workflow: childClaimed.context_snapshot.authoritativeWorkflow,
    spec: structuredClone(childClaimed.context_snapshot.authoritativeSpec),
    validated: true,
    connectionSetupRequired: false,
  };
  forged.workflowHash = hash(forged.workflow);
  forged.spec.ownedDependencies[0].workflow.nodes[1].credentials.orqalyBoundedHttp.id =
    'foreign-child-selector';
  await expectCode(
    () =>
      store.finish(scope, childLease.turnId, childLease.leaseToken, {
        status: 'completed',
        candidate: forged,
        reply: { markdown: 'Synthetic forged selector test' },
      }),
    '42501'
  );
  await store.finish(scope, childLease.turnId, childLease.leaseToken, {
    status: 'failed',
    errorCode: 'LOCAL_FIXTURE_STOPPED',
  });
  assert.deepEqual(
    (await revisions.readRevision(auth, childTarget.id, childCompleted.draftRevisionId)).revision,
    childSaved
  );

  check('historical_research_original_release_and_existing_receipts_preserved_without_new_effects');
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1', [original.id])).rows,
    baseline.rows
  );
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.workflow_runs WHERE id=$1', [original.runId])).rows,
    sourceBaseline.rows
  );
  assert.deepEqual(
    (await admin.query("SELECT * FROM orqaly.solution_revisions WHERE status='active'")).rows,
    activeBaseline.rows
  );
  for (const table of ['solution_schedules', 'solution_coding_jobs'])
    assert.equal(
      Number((await admin.query(`SELECT count(*) AS count FROM orqaly.${table}`)).rows[0].count),
      0,
      `${table}_has_no_execution_or_connection_effects`
    );
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.solution_invocations ORDER BY id')).rows,
    receiptBaseline
  );
  assert.deepEqual(
    (await admin.query('SELECT * FROM orqaly.solution_connections ORDER BY id')).rows,
    connectionBaseline
  );
  process.stdout.write(
    `${JSON.stringify({ status: 'passed', engine: serverVersion, checks: checks.length, fixtureBoundary: 'real_postgres_and_service_with_explicit_model_release_fixtures_no_runtime_calls', sourceSolutionId: original.id, turns: Number((await admin.query('SELECT count(*) AS count FROM orqaly.solution_conversation_turns')).rows[0].count) }, null, 2)}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', phase, code: error.code ?? error.name, message: error.message?.slice(0, 700) })}\n`
  );
  process.exitCode = 1;
} finally {
  await repository?.close().catch(() => {});
  await workerRepository?.close().catch(() => {});
  await admin?.end().catch(() => {});
  if (started) docker(['rm', '-f', container]);
}
