// Read-only audit of the single approved native n8n preview release. The existing
// API credential stays in memory; no runtime, mutation, grant, or role switch is used.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { canonicalJsonSha256 } from '../services/agentic-control-plane/src/domain/canonical.js';
import {
  compileSolutionWorkflow,
  expectedSolutionOutput,
} from '../server/workflow-v2/solution-compiler.js';

const project = 'axwise-v2-preview-001';
const tenantId = 'c1b26d36-721b-5d8c-8d4c-180050ee9b94';
const ownerUserId = 'user_2vHlB9JhH4FazWsgKYENFIeAnMu';
const solutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const sourceRun = '837fdcaf-3536-5901-b044-94faf03d7a7b';
const originalHash = 'd2bab7be7a2cff3f3826e9eb8ba1fce8ddd54630dc8e9dabac17faf3215a31f0';
const rejectedHash = '4ba1b8080602229e2b6d6c8d3d049210b6c60ed5b46857dfe7b359c568091504';
const activeHash = 'cc0090502d6e4c1a96371a16890c7ded3bd7d5a727e7d66ace0cc7637e3fb499';
const artifactHash = '3d88e4bd299f1a1f3560aa705664fb46f9bf1cb93463c86522cc0c61feeecf5a';
let proxy;
let proxyFailed = false;
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
  // The stored pg URL uses a Unix-socket host; replace it only in memory for the
  // owned local proxy. Never log URL parser/database/child-process exceptions.
  const url = new URL(secret.replace('@/', '@localhost/'));
  url.hostname = '127.0.0.1';
  url.port = '19481';
  url.searchParams.delete('host');
  url.searchParams.delete('sslmode');
  proxy = spawn(
    'cloud-sql-proxy',
    [
      `${project}:europe-west4:orqaly-v2-preview-001-pg`,
      '--gcloud-auth',
      '--address=127.0.0.1',
      '--port=19481',
    ],
    { stdio: 'ignore' }
  );
  proxy.once('error', () => {
    proxyFailed = true;
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    assert(!proxyFailed && proxy.exitCode === null, 'native_audit_proxy_failed');
    const candidate = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 1000 });
    try {
      await candidate.connect();
      client = candidate;
      break;
    } catch {
      await candidate.end().catch(() => {});
      await delay(500);
    }
  }
  assert(client, 'native_audit_database_unavailable');

  async function readOnly(scope, fn) {
    let readError;
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SELECT set_config('orqaly.tenant_id',$1,true)", [scope]);
      return await fn(client);
    } catch (error) {
      readError = error;
      throw error;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        if (!readError) throw error;
      }
    }
  }

  const evidence = await readOnly(tenantId, async (db) => {
    stage = 'api_role_read_only_transaction';
    const boundary = (
      await db.query(
        "SELECT pg_has_role(current_user,'orqaly_api','member') AS api_member, current_setting('transaction_read_only') AS read_only"
      )
    ).rows[0];
    assert.equal(boundary.api_member, true, 'audit_requires_existing_api_role');
    assert.equal(boundary.read_only, 'on', 'audit_requires_read_only');

    stage = 'immutable_original_v1';
    const solution = (
      await db.query(
        `SELECT id,status,environment_id,active_revision_id,workflow_hash,workflow,spec,deployment
       FROM orqaly.customer_solutions
       WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3`,
        [tenantId, ownerUserId, solutionId]
      )
    ).rows[0];
    assert(solution, 'native_audit_solution_missing');
    assert.equal(solution.status, 'active', 'native_audit_solution_not_active');
    assert.equal(solution.workflow_hash, originalHash, 'native_audit_v1_hash_changed');
    assert.equal(
      canonicalJsonSha256(solution.workflow),
      originalHash,
      'native_audit_v1_snapshot_changed'
    );
    assert.equal(
      compileSolutionWorkflow({ id: solutionId, spec: solution.spec }).workflowHash,
      originalHash,
      'native_audit_v1_spec_changed'
    );
    assert.equal(
      solution.deployment.workflowId,
      'HJy9MlaOleeP8Kj4',
      'native_audit_v1_provider_changed'
    );
    assert.equal(solution.deployment.workflowHash, originalHash);

    stage = 'rejected_v2_and_active_v3';
    const revisions = (
      await db.query(
        `SELECT id,version,status,workflow_hash,workflow,spec,approved_workflow_hash,
              review->>'valid' AS review_valid,review->>'workflowHash' AS review_hash,
              base_revision_id,approved_at,tested_at,deployment
       FROM orqaly.solution_revisions
       WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3
       ORDER BY version LIMIT 100`,
        [tenantId, ownerUserId, solutionId]
      )
    ).rows;
    const rejected = revisions.find((value) => value.version === 2);
    const active = revisions.find((value) => value.version === 3);
    assert(rejected && active, 'native_audit_release_records_missing');
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.workflow_hash, rejectedHash);
    assert.equal(canonicalJsonSha256(rejected.workflow), rejectedHash);
    assert.equal(rejected.approved_at, null);
    assert.equal(rejected.deployment, null, 'native_audit_rejected_revision_deployed');
    assert.equal(active.status, 'active');
    assert.equal(solution.active_revision_id, active.id, 'native_audit_active_pointer_mismatch');
    assert.equal(revisions.filter((value) => value.status === 'active').length, 1);
    assert.equal(active.workflow_hash, activeHash);
    assert.equal(canonicalJsonSha256(active.workflow), activeHash);
    assert.equal(active.approved_workflow_hash, activeHash);
    assert.equal(active.review_hash, activeHash);
    assert.equal(active.review_valid, 'true');
    assert(active.approved_at && active.tested_at, 'native_audit_missing_approval_or_test');
    assert.equal(active.base_revision_id, null, 'native_audit_v3_base_changed');
    assert.equal(active.deployment.workflowHash, activeHash);
    assert.equal(active.deployment.workflowId, 'C4F8IAhej7UFWnsB');
    assert.equal(active.deployment.versionId, '98c4201c-040d-4e3b-ad1f-02ada1a81711');

    stage = 'release_events';
    const events = (
      await db.query(
        `SELECT id,revision_id,kind,workflow_hash,created_at,
              details->>'executionId' AS execution_id,
              details->>'invocationId' AS invocation_id
       FROM orqaly.solution_revision_events
       WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3
       ORDER BY created_at,id LIMIT 500`,
        [tenantId, ownerUserId, solutionId]
      )
    ).rows;
    const rejectedEvents = events.filter((value) => value.revision_id === rejected.id);
    assert(
      rejectedEvents.some(
        (value) => value.kind === 'rejected' && value.workflow_hash === rejectedHash
      )
    );
    assert(
      !rejectedEvents.some((value) =>
        ['approved', 'deploying', 'deployed', 'tested', 'activated'].includes(value.kind)
      ),
      'native_audit_rejected_revision_executed'
    );
    const activeEvents = events.filter((value) => value.revision_id === active.id);
    let previousIndex = -1;
    for (const kind of ['reviewed', 'approved', 'deploying', 'deployed', 'tested', 'activated']) {
      const index = activeEvents.findIndex(
        (value, position) =>
          position > previousIndex && value.kind === kind && value.workflow_hash === activeHash
      );
      assert(index > previousIndex, 'native_audit_release_event_order_mismatch');
      previousIndex = index;
    }

    stage = 'preserved_history_and_actual_receipts';
    const history = (
      await db.query(
        `SELECT id,revision_id,mode,status,workflow_hash,input,output,execution_id,error_code,created_at
       FROM orqaly.solution_invocations
       WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3
       ORDER BY created_at,id LIMIT 100`,
        [tenantId, ownerUserId, solutionId]
      )
    ).rows;
    assert.equal(history.length, 6, 'native_audit_history_changed_from_checkpoint');
    const receipts = history.filter((value) => value.status === 'succeeded');
    assert.deepEqual(
      receipts.map((value) => value.execution_id),
      ['1', '2', '3', '4', '5']
    );
    for (const invocation of receipts) {
      const original = ['1', '2', '3'].includes(invocation.execution_id);
      assert.equal(invocation.workflow_hash, original ? originalHash : activeHash);
      assert.equal(invocation.revision_id, original ? null : active.id);
      assert.deepEqual(
        invocation.output,
        expectedSolutionOutput(original ? solution.spec : active.spec, invocation.input)
      );
    }
    const test = receipts.find((value) => value.execution_id === '4');
    const production = receipts.find((value) => value.execution_id === '5');
    assert.equal(test.mode, 'test');
    assert.equal(production.mode, 'production');
    for (const [invocation, name] of [
      [test, 'ALICE'],
      [production, 'BOB'],
    ]) {
      assert.equal(invocation.output.customer_name.trim(), name);
      assert(
        /^ +[A-Z]+ +$/.test(invocation.output.customer_name),
        'native_audit_uppercase_must_preserve_spaces'
      );
      assert.equal(invocation.output.email, invocation.input.email.toLowerCase());
    }
    assert(
      activeEvents.some(
        (value) =>
          value.kind === 'tested' && value.execution_id === '4' && value.invocation_id === test.id
      )
    );
    const unknown = history.filter((value) => value.status === 'outcome_unknown');
    assert.equal(unknown.length, 1, 'native_audit_unknown_history_changed');
    assert.equal(unknown[0].execution_id, null);
    assert.equal(unknown[0].output, null);
    assert.equal(unknown[0].workflow_hash, originalHash);
    assert(unknown[0].created_at < test.created_at, 'native_audit_unknown_is_not_preexisting');

    stage = 'original_sms_artifact';
    const artifact = (
      await db.query(
        `SELECT a.content_hash,a.canonical_content FROM orqaly.workflow_runs r
       JOIN orqaly.artifacts a ON a.tenant_id=r.tenant_id AND a.run_id=r.id AND a.id=r.final_artifact_id
       WHERE r.tenant_id=$1 AND r.owner_user_id=$2 AND r.id=$3`,
        [tenantId, ownerUserId, sourceRun]
      )
    ).rows[0];
    assert(artifact?.canonical_content, 'native_audit_sms_artifact_missing');
    const hash = createHash('sha256').update(artifact.canonical_content).digest('hex');
    assert.equal(hash, artifact.content_hash);
    assert.equal(hash, artifactHash, 'native_audit_sms_artifact_changed');

    return {
      solutionId,
      status: solution.status,
      activeVersion: active.version,
      originalWorkflowHash: solution.workflow_hash,
      rejectedRevision: {
        id: rejected.id,
        version: rejected.version,
        status: rejected.status,
        workflowHash: rejected.workflow_hash,
      },
      activeRevision: {
        id: active.id,
        version: active.version,
        status: active.status,
        workflowHash: active.workflow_hash,
        workflowId: active.deployment.workflowId,
        providerVersionId: active.deployment.versionId,
      },
      history: history.map((value) => ({
        id: value.id,
        status: value.status,
        mode: value.mode,
        executionId: value.execution_id,
        revisionId: value.revision_id,
      })),
      releaseEventKinds: activeEvents.map((value) => value.kind),
      originalSmsArtifactHash: hash,
    };
  });

  stage = 'cross_tenant_rls_denial';
  const denied = await readOnly(randomUUID(), async (db) => {
    const params = [tenantId, ownerUserId, solutionId];
    const solution = await db.query(
      'SELECT id FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
      params
    );
    const revisions = await db.query(
      'SELECT id FROM orqaly.solution_revisions WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3',
      params
    );
    return { solution: solution.rowCount, revisions: revisions.rowCount };
  });
  assert.deepEqual(denied, { solution: 0, revisions: 0 }, 'native_audit_cross_tenant_rls_leak');
  console.log(
    JSON.stringify(
      {
        verified: true,
        readOnly: true,
        ...evidence,
        checks: [
          'existing_api_role_read_only_transactions',
          'original_v1_snapshot_unchanged',
          'v2_rejected_without_deployment',
          'v3_approval_deployment_test_activation_bound_to_hash',
          'receipts_1_to_5_verified_against_their_exact_specifications',
          'one_preexisting_unknown_preserved',
          'cross_tenant_solution_and_revision_reads_denied',
          'original_sms_artifact_unchanged',
        ],
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
      code:
        typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
          ? error.code
          : 'NATIVE_AUDIT_FAILED',
      message: 'Native release audit failed; no credentials or raw database errors logged.',
    })
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  proxy?.kill('SIGTERM');
}
