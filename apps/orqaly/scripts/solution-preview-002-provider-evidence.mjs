// Independent read-only provider evidence for the exact approved fresh Solution.
// Usage: node scripts/solution-preview-002-provider-evidence.mjs BUILD_UUID WORKFLOW_ID VERSION_ID EXECUTION_ID EXECUTION_ID [...]
// Never invokes/publishes workflows, changes retention, or prints credentials.
// The existing Orqaly API URL v2 and n8n002 DB owner password v1 stay in memory.
// Port 19486 must be free. The script closes only its own proxy/connections.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { expectedSolutionOutput } from '../server/workflow-v2/solution-compiler.js';
import { previewScope, safeTestPayload } from './task-to-solution-preview-evidence.mjs';

const project = 'axwise-v2-preview-001';
const buildId = '8b606adc-91ba-46e5-86da-ece609df9c7d';
const workflowHash = 'b115e3ae3bca9084d3ef2115764ecbeeaa2d7757a68df571e8aa526275f7ab78';
const environmentId = 'orqaly-customer-webhook-preview-002';
const database = 'orqaly_solution_n8n_preview_002';
const databaseRole = 'orqaly_solution_n8n_preview_002_login';
const port = 19486;
const same = (a, b, code) => assert.equal(hash(a), hash(b), code);

export function parseProviderArguments(args) {
  assert(
    args.length >= 5 && args.length <= 9,
    'explicit_build_workflow_version_and_2_to_6_execution_ids_required'
  );
  const [requestedBuildId, workflowId, versionId, ...executionIds] = args;
  assert.equal(requestedBuildId, buildId, 'only_approved_fresh_solution_allowed');
  assert.match(workflowId, /^[A-Za-z0-9_-]{1,128}$/);
  assert.match(versionId, /^[A-Za-z0-9_-]{1,128}$/);
  for (const id of executionIds) assert.match(id, /^[1-9][0-9]{0,30}$/);
  assert.equal(new Set(executionIds).size, executionIds.length, 'duplicate_execution_ids');
  return { buildId, workflowId, versionId, executionIds };
}

export function verifyOrqalyReceiptSelection({ expected, solution, receipts }) {
  assert(solution, 'orqaly_solution_missing');
  assert.equal(solution.tenant_id, previewScope.tenantId);
  assert.equal(solution.owner_user_id, previewScope.ownerUserId);
  assert.equal(solution.id, buildId);
  assert.equal(solution.build_request_id, buildId);
  assert.equal(solution.environment_id, environmentId);
  assert.equal(solution.active_revision_id, null, 'first_release_only');
  assert.equal(solution.workflow_hash, workflowHash);
  assert.equal(hash(solution.workflow), workflowHash);
  assert.equal(solution.workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(solution.workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(solution.deployment.workflowId, expected.workflowId);
  assert.equal(solution.deployment.versionId, expected.versionId);
  assert.equal(solution.deployment.workflowHash, workflowHash);
  assert.equal(
    receipts.length,
    expected.executionIds.length,
    'requested_canonical_receipt_missing'
  );
  assert.equal(new Set(receipts.map((item) => item.execution_id)).size, receipts.length);
  assert(
    receipts.some((item) => item.mode === 'test') &&
      receipts.some((item) => item.mode === 'production')
  );
  for (const receipt of receipts) {
    assert.equal(receipt.tenant_id, previewScope.tenantId);
    assert.equal(receipt.owner_user_id, previewScope.ownerUserId);
    assert.equal(receipt.solution_id, buildId);
    assert.equal(receipt.workflow_hash, workflowHash);
    assert.equal(receipt.revision_id, null);
    assert.equal(receipt.status, 'succeeded', 'canonical_receipt_not_successful');
    assert.equal(receipt.error_code, null);
    assert(expected.executionIds.includes(receipt.execution_id));
    same(
      receipt.output,
      expectedSolutionOutput(solution.spec, receipt.input),
      'canonical_receipt_output_mismatch'
    );
  }
  return receipts;
}

export function verifyProviderRecords({
  expected,
  desiredWorkflow,
  providerWorkflow,
  executions,
  dataAvailability,
  receipts,
}) {
  assert(providerWorkflow, 'provider_workflow_missing');
  assert.equal(providerWorkflow.id, expected.workflowId);
  assert.equal(providerWorkflow.versionId, expected.versionId, 'provider_version_changed');
  assert.equal(
    providerWorkflow.activeVersionId,
    expected.versionId,
    'provider_version_not_published'
  );
  assert.equal(providerWorkflow.active, true, 'provider_workflow_not_published');
  assert.equal(providerWorkflow.isArchived, false);
  // The live reader has already pinned desiredWorkflow to the exact immutable
  // Orqaly Solution hash in verifyOrqalyReceiptSelection, before opening002.
  const approvedWorkflowHash = hash(desiredWorkflow);
  const inertDefaults = { callerPolicy: 'workflowsFromSameOwner', availableInMCP: false };
  for (const [key, value] of Object.entries(providerWorkflow.settings || {})) {
    if (!Object.hasOwn(desiredWorkflow.settings, key)) {
      assert(Object.hasOwn(inertDefaults, key), 'unexpected_provider_setting');
      assert.equal(value, inertDefaults[key], 'provider_setting_drift');
    }
  }
  const snapshot = {
    name: providerWorkflow.name,
    nodes: providerWorkflow.nodes,
    connections: providerWorkflow.connections,
    settings: Object.fromEntries(
      Object.keys(desiredWorkflow.settings).map((key) => [key, providerWorkflow.settings?.[key]])
    ),
  };
  assert.equal(hash(snapshot), approvedWorkflowHash, 'provider_workflow_snapshot_drift');
  assert.equal(new Set(executions.map((item) => item.id)).size, executions.length);
  for (const execution of executions) {
    assert(expected.executionIds.includes(execution.id), 'unrequested_provider_execution');
    assert.equal(execution.workflowId, expected.workflowId, 'provider_execution_wrong_workflow');
    if (execution.workflowVersionId !== null)
      assert.equal(
        execution.workflowVersionId,
        expected.versionId,
        'provider_execution_wrong_version'
      );
    assert(
      ['new', 'running', 'success', 'error', 'canceled', 'crashed', 'waiting', 'unknown'].includes(
        execution.status
      ),
      'unexpected_provider_status'
    );
    assert.equal(execution.mode, 'webhook', 'unexpected_provider_execution_mode');
  }
  for (const record of dataAvailability) assert(expected.executionIds.includes(record.executionId));
  const metadata = expected.executionIds.map((id) => {
    const row = executions.find((item) => item.id === id);
    const data = dataAvailability.find((item) => item.executionId === id);
    // save-none can soft-delete an in-flight row before a final success update,
    // or hard-delete it immediately. Neither is independent success evidence.
    return row
      ? {
          executionId: id,
          found: true,
          workflowId: row.workflowId,
          providerVersionId: row.workflowVersionId,
          versionMatched: row.workflowVersionId === expected.versionId,
          status: row.status,
          finished: row.finished,
          startedAt: row.startedAt,
          stoppedAt: row.stoppedAt,
          deletedAt: row.deletedAt,
          retentionState: row.deletedAt ? 'soft_deleted_pending_prune' : 'metadata_present',
          finalSuccessRecorded:
            row.status === 'success' && row.finished === true && Boolean(row.stoppedAt),
          payloadRowPresent: Boolean(data),
          payloadBytes: data?.payloadBytes ?? null,
          providerPayloadRead: false,
        }
      : {
          executionId: id,
          found: false,
          retentionState: 'not_found_with_save_none',
          finalSuccessRecorded: false,
          payloadRowPresent: Boolean(data),
          providerPayloadRead: false,
        };
  });
  return {
    verified: true,
    auditScope: 'provider_workflow_and_execution_metadata_availability',
    readOnly: true,
    buildRequestId: buildId,
    solutionId: buildId,
    environmentId,
    providerWorkflowVerified: true,
    provider: {
      workflowId: expected.workflowId,
      versionId: expected.versionId,
      workflowHash: approvedWorkflowHash,
      published: true,
    },
    retention: {
      saveDataSuccessExecution: 'none',
      saveDataErrorExecution: 'none',
      unchanged: true,
    },
    providerExecutionIdsFound: metadata
      .filter((item) => item.found)
      .map((item) => item.executionId),
    providerFinalSuccessRecordsVerified: metadata.every(
      (item) => item.finalSuccessRecorded && item.versionMatched
    ),
    executionMetadata: metadata,
    canonicalOrqalyReceipts: receipts.map((item) => ({
      invocationId: item.id,
      executionId: item.execution_id,
      mode: item.mode,
      status: item.status,
      workflowHash: item.workflow_hash,
      inputHash: hash(item.input),
      outputHash: hash(item.output),
      input: safeTestPayload(item.input),
      output: safeTestPayload(item.output),
      payloadSource: 'Orqaly canonical response receipt; not duplicated n8n payload',
    })),
    evidenceBoundary:
      'Exact published n8n workflow/version is independently checked in database002. Requested execution metadata is reported only if retained. save-none can leave transient soft-deleted in-flight metadata or no row; neither proves final provider success. Actual response outputs are Orqaly canonical receipts, not recovered n8n execution payloads. No retention changes or new executions occurred.',
  };
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error('owned_proxy_port_not_free')));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

export async function runProviderEvidence(expected) {
  parseProviderArguments([
    expected.buildId,
    expected.workflowId,
    expected.versionId,
    ...expected.executionIds,
  ]);
  let proxy,
    api,
    provider,
    proxyFailed = false;
  let stage = 'owned_read_only_connections';
  const secret = (name, version) =>
    execFileSync(
      'gcloud',
      ['secrets', 'versions', 'access', version, `--secret=${name}`, `--project=${project}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  async function readOnly(client, fn) {
    let primary;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      assert.equal(
        (await client.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0]
          .read_only,
        'on'
      );
      return await fn(client);
    } catch (error) {
      primary = error;
      throw error;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        if (!primary) throw error;
      }
    }
  }
  try {
    await freePort();
    const url = new URL(
      secret('orqaly-v2-preview-001-db-api-url', '2').replace('@/', '@localhost/')
    );
    url.hostname = '127.0.0.1';
    url.port = String(port);
    url.searchParams.delete('host');
    url.searchParams.delete('sslmode');
    const password = secret('orqaly-solution-preview-002-db-password', '1');
    proxy = spawn(
      'cloud-sql-proxy',
      [
        `${project}:europe-west4:orqaly-v2-preview-001-pg`,
        '--gcloud-auth',
        '--address=127.0.0.1',
        `--port=${port}`,
      ],
      { stdio: 'ignore' }
    );
    proxy.once('error', () => {
      proxyFailed = true;
    });
    for (let n = 0; n < 40; n++) {
      await delay(250);
      assert(!proxyFailed && proxy.exitCode === null);
      const candidate = new pg.Client({
        connectionString: url.href,
        connectionTimeoutMillis: 1000,
        statement_timeout: 5000,
      });
      try {
        await candidate.connect();
        api = candidate;
        break;
      } catch {
        await candidate.end().catch(() => {});
      }
    }
    assert(api && !proxyFailed && proxy.exitCode === null);
    const canonical = await readOnly(api, async (db) => {
      stage = 'exact_orqaly_receipt_selection';
      await db.query("SELECT set_config('orqaly.tenant_id',$1,true)", [previewScope.tenantId]);
      assert.equal(
        (await db.query("SELECT pg_has_role(current_user,'orqaly_api','member') AS member")).rows[0]
          .member,
        true
      );
      const params = [previewScope.tenantId, previewScope.ownerUserId, buildId];
      const solution = (
        await db.query(
          'SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
          params
        )
      ).rows[0];
      const receipts = (
        await db.query(
          `SELECT * FROM orqaly.solution_invocations
        WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND execution_id=ANY($4::text[]) ORDER BY created_at,id`,
          [...params, expected.executionIds]
        )
      ).rows;
      verifyOrqalyReceiptSelection({ expected, solution, receipts });
      return { solution, receipts };
    });
    await api.end();
    api = undefined;
    provider = new pg.Client({
      host: '127.0.0.1',
      port,
      database,
      user: databaseRole,
      password,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    await provider.connect();
    return await readOnly(provider, async (db) => {
      stage = 'provider_database_owner_scope';
      const identity = (
        await db.query(`SELECT current_database() AS database,current_user AS user,
        pg_get_userbyid(d.datdba) AS owner,r.rolsuper AS superuser,r.rolbypassrls AS bypassrls
        FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`)
      ).rows[0];
      same(
        identity,
        { database, user: databaseRole, owner: databaseRole, superuser: false, bypassrls: false },
        'provider_database_identity_mismatch'
      );
      stage = 'bounded_provider_catalog';
      const columns = (
        await db.query(
          `SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=ANY($1::text[])`,
          [['workflow_entity', 'execution_entity', 'execution_data']]
        )
      ).rows;
      for (const [table, required] of Object.entries({
        workflow_entity: [
          'id',
          'name',
          'nodes',
          'connections',
          'settings',
          'versionId',
          'activeVersionId',
          'active',
          'isArchived',
        ],
        execution_entity: [
          'id',
          'workflowId',
          'workflowVersionId',
          'mode',
          'status',
          'finished',
          'startedAt',
          'stoppedAt',
          'deletedAt',
        ],
        execution_data: ['executionId', 'data'],
      }))
        for (const column of required)
          assert(
            columns.some((item) => item.table_name === table && item.column_name === column),
            'pinned_provider_schema_mismatch'
          );
      stage = 'exact_provider_workflow_and_execution_ids';
      const providerWorkflow = (
        await db.query(
          `SELECT id,name,nodes,connections,settings,"versionId","activeVersionId",active,"isArchived"
        FROM public.workflow_entity WHERE id=$1`,
          [expected.workflowId]
        )
      ).rows[0];
      const executions = (
        await db.query(
          `SELECT id::text AS id,"workflowId","workflowVersionId",mode,status,finished,"startedAt","stoppedAt","deletedAt"
        FROM public.execution_entity WHERE "workflowId"=$1 AND id::text=ANY($2::text[])`,
          [expected.workflowId, expected.executionIds]
        )
      ).rows;
      // Retention availability only. Do not load arbitrary request headers or raw
      // flattened payloads; canonical approved test outputs are already scoped.
      const dataAvailability = (
        await db.query(
          `SELECT d."executionId"::text AS "executionId",octet_length(d.data) AS "payloadBytes"
        FROM public.execution_data d JOIN public.execution_entity e ON e.id=d."executionId"
        WHERE e."workflowId"=$1 AND e.id::text=ANY($2::text[])`,
          [expected.workflowId, expected.executionIds]
        )
      ).rows;
      stage = 'provider_snapshot_and_metadata_verification';
      return verifyProviderRecords({
        expected,
        desiredWorkflow: canonical.solution.workflow,
        providerWorkflow,
        executions,
        dataAvailability,
        receipts: canonical.receipts,
      });
    });
  } catch (error) {
    throw Object.assign(new Error('read_only_provider_audit_failed'), {
      stage,
      safeCode:
        typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
          ? error.code
          : 'PROVIDER_AUDIT_FAILED',
    });
  } finally {
    await api?.end().catch(() => {});
    await provider?.end().catch(() => {});
    proxy?.kill('SIGTERM');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(
      JSON.stringify(
        await runProviderEvidence(parseProviderArguments(process.argv.slice(2))),
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        verified: false,
        readOnly: true,
        stage: error.stage || 'explicit_target_ids',
        code: error.safeCode || 'PROVIDER_AUDIT_FAILED',
        credentialsLogged: false,
      })
    );
    process.exitCode = 1;
  }
}
