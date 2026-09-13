// Read-only migration019/runtime-role audit for the fixed existing preview.
// Only existing API/worker SQL secrets are read, into memory. No administrator
// login, role switch, queue claim, model call, workflow invocation, or writes.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { canonicalJsonSha256 } from '../services/agentic-control-plane/src/domain/canonical.js';
import { deterministicUuid } from '../server/workflow-v2/ids.js';

const project = 'axwise-v2-preview-001';
const region = 'europe-west4';
const database = 'orqaly_v2_preview_001';
const instance = `${project}:${region}:orqaly-v2-preview-001-pg`;
const tenantId = 'c1b26d36-721b-5d8c-8d4c-180050ee9b94';
const ownerUserId = 'user_2vHlB9JhH4FazWsgKYENFIeAnMu';
const solutionIds = [
  '2031decc-b21e-48b5-9bd5-3ed3d4dfd024',
  '8b606adc-91ba-46e5-86da-ece609df9c7d',
  '637fcfaf-3864-468b-ad36-47337b80c484',
];
const baseline = {
  customer_solutions: {
    count: 3,
    hash: 'e12f6b34fe0fb04959566b3b5516c28cba3ad0c480af7efeedb40f85001f0dec',
  },
  solution_revisions: {
    count: 5,
    hash: '8631b4d43c24b980ea9ba44081d37f5fa4af5e5bbb413f116041decb0c231f76',
  },
  solution_revision_events: {
    count: 30,
    hash: '2eb826669e68484f7b5ea06400d880a479d42841b27b225e52620ac379def143',
  },
  solution_invocations: {
    count: 11,
    hash: 'a38a525c19101571fc9ddd77b434e7247149e63426fb519267f75ec76b6163b9',
  },
};
const roleConfigs = [
  {
    kind: 'api',
    service: 'orqaly-v2-api-preview',
    env: 'ORQALY_API_DATABASE_URL',
    secret: 'orqaly-v2-preview-001-db-api-url',
    membership: 'orqaly_api',
  },
  {
    kind: 'worker',
    service: 'orqaly-v2-worker-preview',
    env: 'ORQALY_WORKER_DATABASE_URL',
    secret: 'orqaly-v2-preview-001-db-worker-url',
    membership: 'orqaly_worker',
  },
];
const port = 19519;
const root = resolve(import.meta.dirname, '..');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const capture = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  }).trim();

export function parseAuditArgs(args) {
  if (args.length === 0) return { completedTurnId: null };
  assert(
    args.length === 2 &&
      args[0] === '--completed-turn' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(args[1]),
    'only_exact_completed_turn_mode_allowed'
  );
  return { completedTurnId: args[1] };
}

export function completedTurnEvidence(turn, expectedId, axwiseServiceUrl) {
  assert(turn, 'exact_completed_turn_missing');
  assert.equal(turn.id, expectedId, 'exact_turn_required');
  assert.equal(turn.tenant_id, tenantId, 'turn_tenant_mismatch');
  assert.equal(turn.owner_user_id, ownerUserId, 'turn_owner_mismatch');
  assert.equal(turn.solution_id, solutionIds[2], 'exact_acceptance_solution_required');
  assert.equal(turn.status, 'completed', 'turn_not_completed');
  assert.equal(turn.mode, 'ask', 'read_only_ask_required');
  assert.equal(turn.command?.mode, 'ask', 'ask_command_required');
  assert.equal(turn.command?.turnId, expectedId, 'command_turn_binding_mismatch');
  assert.equal(turn.command?.includeInvocation, undefined, 'invocation_consent_not_expected');
  assert.equal(
    turn.context_snapshot?.selectedInvocation ?? null,
    null,
    'invocation_payload_not_expected'
  );
  assert.equal(turn.target_revision_id, null, 'ask_cannot_target_revision_mutation');
  assert.equal(turn.draft_revision_id, null, 'ask_cannot_create_revision');
  assert.equal(turn.lease_token, null, 'completed_lease_not_cleared');
  assert.equal(turn.lease_expires_at, null, 'completed_lease_expiry_not_cleared');
  assert.equal(turn.error_code, null, 'completed_turn_has_error');
  assert(
    turn.completed_at && Number.isFinite(new Date(turn.completed_at).getTime()),
    'completion_timestamp_required'
  );
  assert.equal(turn.request_hash, canonicalJsonSha256(turn.command), 'command_hash_mismatch');
  assert.equal(
    turn.context_hash,
    canonicalJsonSha256(turn.context_snapshot),
    'context_hash_mismatch'
  );
  assert.equal(turn.context_snapshot.solutionId, solutionIds[2], 'context_solution_mismatch');
  assert.equal(
    turn.operation_id,
    deterministicUuid(tenantId, expectedId, 'solution-conversation-operation'),
    'deterministic_operation_mismatch'
  );
  const envelope = turn.envelope;
  assert.equal(envelope?.operationId, turn.operation_id, 'operation_binding_mismatch');
  assert.equal(envelope?.operationType, 'AssistantTurnV1', 'read_only_model_operation_required');
  assert.equal(envelope?.input?.type, 'AssistantTurnV1', 'read_only_model_input_required');
  assert.equal(envelope?.owner?.tenantId, tenantId, 'operation_tenant_mismatch');
  assert.equal(envelope?.owner?.userId, ownerUserId, 'operation_owner_mismatch');
  assert.equal(
    envelope?.workflow?.runId,
    turn.context_snapshot.source?.runId,
    'source_run_binding_mismatch'
  );
  assert.equal(
    envelope?.canonicalInputHash,
    canonicalJsonSha256(envelope?.input),
    'operation_input_hash_mismatch'
  );
  const statusUrl = new URL(turn.status_url);
  assert.equal(statusUrl.origin, new URL(axwiseServiceUrl).origin, 'status_origin_mismatch');
  assert.equal(statusUrl.protocol, 'https:', 'https_status_url_required');
  assert.equal(
    statusUrl.username + statusUrl.password + statusUrl.hash,
    '',
    'status_url_extra_authority_forbidden'
  );
  assert.equal(
    statusUrl.pathname,
    `/v2/operations/${turn.operation_id}`,
    'status_operation_mismatch'
  );
  assert.deepEqual([...statusUrl.searchParams], [['tenantId', tenantId]], 'status_tenant_mismatch');
  const reply = turn.reply?.markdown;
  assert(typeof reply === 'string' && reply.trim().length > 0, 'persisted_reply_required');
  assert.equal(
    turn.result?.resultType,
    'assistant_turn_completed',
    'actual_answer_result_required'
  );
  assert.equal(turn.result?.response?.markdown, reply, 'reply_result_mismatch');
  assert.deepEqual(turn.model, turn.result?.metrics, 'model_metrics_binding_mismatch');
  assert.equal(turn.model?.provider, 'google', 'actual_google_provider_required');
  assert(
    typeof turn.model?.model === 'string' && /^gemini[-.]/.test(turn.model.model),
    'actual_model_name_required'
  );
  for (const key of ['latencyMs', 'inputTokens', 'outputTokens', 'totalTokens'])
    assert(
      Number.isInteger(turn.model[key]) && turn.model[key] > 0,
      'positive_model_metrics_required'
    );
  return {
    id: turn.id,
    solutionId: turn.solution_id,
    status: turn.status,
    mode: turn.mode,
    includedInvocation: null,
    draftRevisionId: null,
    operationId: turn.operation_id,
    canonicalInputHash: envelope.canonicalInputHash,
    contextHash: turn.context_hash,
    statusUrlBoundToOperationAndTenant: true,
    reply: { sha256: digest(reply), characters: reply.length, utf8Bytes: Buffer.byteLength(reply) },
    model: {
      provider: turn.model.provider,
      model: turn.model.model,
      ...(turn.model.modelVersion ? { modelVersion: turn.model.modelVersion } : {}),
      latencyMs: turn.model.latencyMs,
      inputTokens: turn.model.inputTokens,
      outputTokens: turn.model.outputTokens,
      totalTokens: turn.model.totalTokens,
    },
    completedAt: new Date(turn.completed_at).toISOString(),
  };
}

async function runAudit(args) {
  let proxy;
  let proxyFailed = false;
  let stage = 'source';
  const clients = [];
  const repositories = [];

  async function connect(connectionString) {
    for (let attempt = 0; attempt < 60; attempt++) {
      assert(proxy && !proxyFailed && proxy.exitCode === null, 'owned_proxy_unavailable');
      const client = new pg.Client({
        connectionString,
        connectionTimeoutMillis: 1000,
        statement_timeout: 10000,
        application_name: 'orqaly-preview-conversation-readiness-audit',
      });
      try {
        await client.connect();
        clients.push(client);
        return client;
      } catch {
        await client.end().catch(() => {});
        await delay(500);
      }
    }
    throw new Error('runtime_role_database_unavailable');
  }

  async function readOnly(client, callback) {
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query(
        "SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)",
        [tenantId, ownerUserId]
      );
      return await callback(client);
    } finally {
      await client.query('ROLLBACK');
    }
  }

  try {
    const { completedTurnId } = parseAuditArgs(args);
    const migrationHash = digest(
      readFileSync(resolve(root, 'database/workflow-v2/migrations/019_solution_conversations.sql'))
    );
    assert.equal(
      migrationHash,
      'ebdbe15fe3ac9895bfb753c035ef8c174d24c6c638b4bee607753b400cb03ac0',
      'reviewed_019_source_required'
    );
    const sourceCommit = capture('git', ['rev-parse', 'HEAD']);

    stage = 'owned_loopback_proxy';
    const probe = net.createServer();
    await new Promise((done, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', done);
    });
    await new Promise((done) => probe.close(done));
    proxy = spawn(
      'cloud-sql-proxy',
      [instance, '--gcloud-auth', '--address=127.0.0.1', `--port=${port}`],
      { stdio: 'ignore' }
    );
    proxy.once('error', () => {
      proxyFailed = true;
    });

    const evidence = { sourceCommit, migration: 19, migrationHash, roles: [], preservation: null };
    let apiClient;
    let axwiseServiceUrl;
    for (const config of roleConfigs) {
      stage = `${config.kind}_deployed_secret_reference`;
      const service = JSON.parse(
        capture('gcloud', [
          'run',
          'services',
          'describe',
          config.service,
          `--region=${region}`,
          `--project=${project}`,
          '--format=json',
        ])
      );
      assert.equal(service.metadata?.name, config.service, 'exact_service_required');
      const containers = service.spec?.template?.spec?.containers;
      assert.equal(containers?.length, 1, 'single_runtime_container_required');
      const entries = (containers[0].env || []).filter((entry) => entry.name === config.env);
      if (completedTurnId && config.kind === 'worker') {
        const axwiseEntries = (containers[0].env || []).filter(
          (entry) => entry.name === 'AXWISE_SERVICE_URL'
        );
        assert.equal(axwiseEntries.length, 1, 'single_axwise_service_url_required');
        axwiseServiceUrl = axwiseEntries[0].value;
        assert(typeof axwiseServiceUrl === 'string', 'non_secret_service_origin_required');
      }
      assert.equal(entries.length, 1, 'single_database_secret_reference_required');
      assert.equal(entries[0].value, undefined, 'inline_database_value_not_permitted');
      const ref = entries[0].valueFrom?.secretKeyRef;
      assert.equal(ref?.name, config.secret, 'exact_runtime_secret_required');
      assert(/^[1-9][0-9]*$/.test(ref.key), 'pinned_secret_version_required');
      stage = `${config.kind}_read_existing_secret_in_memory`;
      const secret = capture('gcloud', [
        'secrets',
        'versions',
        'access',
        ref.key,
        `--secret=${ref.name}`,
        `--project=${project}`,
      ]);
      const url = new URL(secret.replace('@/', '@localhost/'));
      assert(['postgres:', 'postgresql:'].includes(url.protocol), 'postgres_url_required');
      assert.equal(url.pathname, `/${database}`, 'exact_database_required');
      assert(
        url.username && url.password && url.username !== 'postgres',
        'non_admin_login_required'
      );
      const socket = url.searchParams.get('host');
      assert.equal(socket, `/cloudsql/${instance}`, 'exact_cloudsql_socket_required');
      url.hostname = '127.0.0.1';
      url.port = String(port);
      url.searchParams.delete('host');
      url.searchParams.delete('sslmode');
      // Also protects implicit readiness transactions, not just explicit snapshots.
      url.searchParams.set('options', '-c default_transaction_read_only=on');
      stage = `${config.kind}_read_only_role_identity`;
      const client = await connect(url.href);
      const identity = (
        await client.query(
          `SELECT current_database() AS database,current_user AS role,
       current_setting('server_version_num')::integer AS version,
       current_setting('default_transaction_read_only') AS default_read_only,
       current_setting('transaction_read_only') AS read_only,
       pg_has_role(current_user,$1,'member') AS expected_member,
       rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
       FROM pg_roles WHERE rolname=current_user`,
          [config.membership]
        )
      ).rows[0];
      assert.equal(identity?.database, database, 'runtime_database_scope_mismatch');
      assert.equal(Math.floor(identity.version / 10000), 16, 'postgres16_required');
      assert.equal(identity.expected_member, true, 'runtime_role_membership_required');
      assert.equal(identity.default_read_only, 'on', 'default_read_only_required');
      assert.equal(identity.read_only, 'on', 'read_only_required');
      for (const key of ['rolsuper', 'rolbypassrls', 'rolcreatedb', 'rolcreaterole'])
        assert.equal(identity[key], false, 'restricted_runtime_role_required');

      stage = `${config.kind}_actual_repository_readiness`;
      const repository = createPostgresRepositories({
        environment: 'preview',
        ...(config.kind === 'api' ? { apiDatabaseUrl: url.href } : { workerDatabaseUrl: url.href }),
        requireSolutionConversations: true,
      });
      repositories.push(repository);
      assert.deepEqual(await repository.readiness(), { database: 'ok', environment: 'preview' });
      evidence.roles.push({
        kind: config.kind,
        service: config.service,
        traffic: (service.status?.traffic || [])
          .filter((item) => item.percent > 0)
          .map(({ revisionName, percent }) => ({ revisionName, percent })),
        secret: { name: ref.name, version: ref.key },
        role: identity.role,
        postgresVersion: identity.version,
        readOnly: true,
        repositoryReadiness: 'passed',
        conversationForceRlsAndLeastPrivilege: 'passed',
      });
      if (config.kind === 'api') apiClient = client;
    }

    stage = 'owner_scoped_preservation_snapshot';
    await readOnly(apiClient, async (db) => {
      evidence.preservation = {};
      for (const [table, expected] of Object.entries(baseline)) {
        // Query and JSON serialization deliberately match the migration operator.
        // Sensitive row content is only hashed in memory, never printed or saved.
        const rows = (
          await db.query(
            `SELECT to_jsonb(t)-'evidence' AS value FROM orqaly.${table} t
         WHERE tenant_id=$1 AND owner_user_id=$2
         AND ${table === 'customer_solutions' ? 'id' : 'solution_id'}=ANY($3::uuid[]) ORDER BY id`,
            [tenantId, ownerUserId, solutionIds]
          )
        ).rows;
        const observed = { count: rows.length, hash: digest(JSON.stringify(rows)) };
        evidence.preservation[table] = observed;
        assert.deepEqual(observed, expected, 'protected_customer_snapshot_changed');
      }
      if (completedTurnId) {
        stage = 'exact_completed_ask_evidence';
        const turn = (
          await db.query(
            `SELECT id,tenant_id,owner_user_id,solution_id,status,mode,command,context_snapshot,
          request_hash,context_hash,operation_id,envelope,target_revision_id,draft_revision_id,
          status_url,reply,result,model,completed_at,error_code,lease_token,lease_expires_at
         FROM orqaly.solution_conversation_turns
         WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4`,
            [tenantId, ownerUserId, solutionIds[2], completedTurnId]
          )
        ).rows[0];
        evidence.completedTurn = completedTurnEvidence(turn, completedTurnId, axwiseServiceUrl);
        return;
      }
      stage = 'before_live_ask_metadata_only';
      const turns = (
        await db.query(
          `SELECT id,solution_id AS "solutionId",status,operation_id AS "operationId"
       FROM orqaly.solution_conversation_turns
       WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=ANY($3::uuid[])
       ORDER BY created_at,id LIMIT 101`,
          [tenantId, ownerUserId, solutionIds]
        )
      ).rows;
      evidence.conversations = { count: turns.length, turns, beforeLiveAsk: turns.length === 0 };
      assert.equal(turns.length, 0, 'conversation_baseline_no_longer_empty');
    });
    console.log(
      JSON.stringify({ status: 'passed', cloudWrites: 0, providerCalls: 0, ...evidence })
    );
  } catch (error) {
    // Never emit child-process output, connection strings, SQL payloads, or the
    // raw error object. Stage + a SQLSTATE (when available) suffice for diagnosis.
    const sqlState = /^[0-9A-Z]{5}$/.test(error?.code || '') ? error.code : undefined;
    console.error(JSON.stringify({ status: 'failed', stage, ...(sqlState ? { sqlState } : {}) }));
    process.exitCode = 1;
  } finally {
    await Promise.all(repositories.map((repository) => repository.close().catch(() => {})));
    await Promise.all(clients.map((client) => client.end().catch(() => {})));
    if (proxy && proxy.exitCode === null) proxy.kill('SIGTERM');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runAudit(process.argv.slice(2));
