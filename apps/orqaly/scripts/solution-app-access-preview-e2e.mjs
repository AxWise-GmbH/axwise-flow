// Bounded, effectful acceptance for the already-approved preview002 Solution.
// Usage: node scripts/solution-app-access-preview-e2e.mjs run 8b606adc-91ba-46e5-86da-ece609df9c7d
// Creates/revokes one operator-issued key through the production key service
// with the existing restricted API DB role; this is NOT Clerk UI issuance proof.
// Makes at most one new synthetic production dispatch, plus idempotent replay.
// No workflow edits, new environments, provider actions, or credentials in logs.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createSolutionApplicationKeyService } from '../server/workflow-v2/solution-application-key-service.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';

const project = 'axwise-v2-preview-001';
const tenantId = 'c1b26d36-721b-5d8c-8d4c-180050ee9b94';
const userId = 'user_2vHlB9JhH4FazWsgKYENFIeAnMu';
const solutionId = '8b606adc-91ba-46e5-86da-ece609df9c7d';
const oldSolutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const workflowHash = 'b115e3ae3bca9084d3ef2115764ecbeeaa2d7757a68df571e8aa526275f7ab78';
const origin = 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app';
const endpoint = `/invoke/v1/solutions/${solutionId}`;
const port = 19489;
let stage = 'arguments',
  repository,
  proxy,
  proxyFailed = false,
  issued,
  keys;
let verified = false,
  revoked = false,
  receipt;
const auth = { userId };
const same = (a, b, message) => assert.equal(hash(a), hash(b), message);

async function snapshot() {
  return repository.solutionTransaction(tenantId, async (db) => {
    const rows = (
      await db.query(
        'SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=ANY($3::uuid[]) ORDER BY id',
        [tenantId, userId, [solutionId, oldSolutionId]]
      )
    ).rows;
    assert.equal(rows.length, 2);
    const current = rows.find((row) => row.id === solutionId);
    assert.equal(current.workflow_hash, workflowHash);
    assert.equal(hash(current.workflow), workflowHash);
    assert.equal(current.status, 'active');
    assert.equal(current.active_revision_id, null);
    assert.equal(current.environment_id, 'orqaly-customer-webhook-preview-002');
    assert.equal(current.deployment.workflowId, '3eAscwRxWyn2dxYl');
    assert.equal(current.deployment.versionId, '3ab89c04-9163-4adb-821f-562a43ff3841');
    const history = (
      await db.query(
        'SELECT * FROM orqaly.solution_invocations WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=ANY($3::uuid[]) ORDER BY id',
        [tenantId, userId, [solutionId, oldSolutionId]]
      )
    ).rows;
    assert(history.length <= 40, 'bounded_acceptance_history');
    return { rows, current, history };
  });
}

async function call(path, { method = 'GET', token, body, requestId } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(requestId ? { 'idempotency-key': requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (token) assert(!JSON.stringify(value).includes(token), 'credential_echo');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, value };
}

try {
  assert.deepEqual(process.argv.slice(2), ['run', solutionId]);
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  stage = 'restricted_connection';
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
  const url = new URL(secret.replace('@/', '@localhost/'));
  assert.equal(url.pathname, '/orqaly_v2_preview_001');
  url.hostname = '127.0.0.1';
  url.port = String(port);
  url.searchParams.delete('host');
  url.searchParams.delete('sslmode');
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
  repository = createPostgresRepositories({ environment: 'preview', apiDatabaseUrl: url.href });
  let connected = false;
  for (let n = 0; n < 20; n++) {
    assert(!proxyFailed && proxy.exitCode === null);
    try {
      await repository.solutionTransaction(tenantId, async (db) => {
        const identity = (
          await db.query(`SELECT current_database() AS database,
          pg_has_role(current_user,'orqaly_api','member') AS member,
          r.rolsuper AS superuser,r.rolbypassrls AS bypassrls
          FROM pg_roles r WHERE r.rolname=current_user`)
        ).rows[0];
        same(
          identity,
          { database: 'orqaly_v2_preview_001', member: true, superuser: false, bypassrls: false },
          'restricted_role_required'
        );
      });
      connected = true;
      break;
    } catch {
      await delay(500);
    }
  }
  assert(connected, 'database_not_ready');
  stage = 'baseline';
  const before = await snapshot();
  assert.equal(
    before.history.filter((row) => row.solution_id === solutionId).length,
    2,
    'only_original_two_receipts_expected'
  );
  assert.equal(before.history.filter((row) => row.solution_id === oldSolutionId).length, 6);
  // Explicit operator scope, not a substituted browser or Clerk session.
  keys = createSolutionApplicationKeyService({
    environment: 'preview',
    repository: {
      solutionTransaction: repository.solutionTransaction,
      resolveTenant: async ({ userId: supplied }) => {
        assert.equal(supplied, userId);
        return tenantId;
      },
    },
  });
  stage = 'operator_issuance';
  issued = await keys.create(
    auth,
    solutionId,
    { label: 'Preview app acceptance', expiresInDays: 30, workflowHash },
    before.current.row_version,
    randomUUID()
  );
  assert(!JSON.stringify(await keys.list(auth, solutionId)).includes(issued.token));
  stage = 'live_machine_http';
  const request = {
    method: 'POST',
    token: issued.token,
    body: { input: { name: ' Alice ', email: 'ALICE@EXAMPLE.COM' } },
    requestId: randomUUID(),
  };
  assert.equal((await call(endpoint, { ...request, token: undefined })).status, 401);
  const result = await call(endpoint, request);
  assert.equal(result.status, 200);
  assert.equal(result.value.invocation.status, 'succeeded');
  same(
    result.value.invocation.output,
    { customer_name: 'Alice', email: 'alice@example.com' },
    'real_n8n_output'
  );
  assert.match(result.value.invocation.executionId, /^[1-9][0-9]*$/);
  receipt = result.value.invocation;
  stage = 'replay_and_receipt';
  const replay = await call(endpoint, request);
  assert.equal(replay.status, 200);
  assert.equal(replay.value.replayed, true);
  assert.equal(replay.value.invocation.id, receipt.id);
  assert.equal(replay.value.invocation.executionId, receipt.executionId);
  const read = await call(`${endpoint}/invocations/${receipt.id}`, { token: issued.token });
  assert.equal(read.status, 200);
  assert.equal(read.value.invocation.id, receipt.id);
  stage = 'revocation';
  const revokedKey = await keys.revoke(auth, solutionId, issued.key.id, issued.key.rowVersion);
  assert.equal(revokedKey.key.status, 'revoked');
  revoked = true;
  assert.equal((await call(endpoint, request)).status, 401);
  assert.equal(
    (await call(`${endpoint}/invocations/${receipt.id}`, { token: issued.token })).status,
    401
  );
  stage = 'persisted_evidence';
  const after = await snapshot();
  same(after.rows, before.rows, 'solution_releases_changed');
  same(
    after.history.filter((row) => row.id !== receipt.id),
    before.history,
    'earlier_receipts_changed'
  );
  assert.equal(after.history.length, before.history.length + 1, 'exactly_one_new_invocation');
  const stored = after.history.find((row) => row.id === receipt.id);
  assert.equal(stored.application_key_id, issued.key.id);
  assert.equal(stored.application_key_label, 'Preview app acceptance');
  assert.equal(stored.execution_id, receipt.executionId);
  assert.equal(stored.workflow_hash, workflowHash);
  assert.equal(stored.status, 'succeeded');
  verified = true;
  console.log(
    JSON.stringify(
      {
        verified,
        solutionId,
        workflowHash,
        keyId: issued.key.id,
        keyRevoked: revoked,
        invocationId: receipt.id,
        n8nExecutionId: receipt.executionId,
        output: receipt.output,
        machineRouteWithoutClerkOrCookies: true,
        replayDidNotRedispatch: true,
        originalReleasesAndReceiptsPreserved: true,
        newInvocations: 1,
        evidenceBoundary:
          'Operator key issuance via production key service with restricted DB role; live deployed HTTP invocation and n8n output. Clerk browser issuance is separate evidence. No external provider action.',
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
      keyId: issued?.key.id,
      safeCode: /^[A-Z0-9_]{1,64}$/.test(error.code || '')
        ? error.code
        : 'APP_ACCESS_ACCEPTANCE_FAILED',
      noAutomaticRetry: true,
    })
  );
  process.exitCode = 1;
} finally {
  if (issued && !revoked) {
    try {
      await keys.revoke(auth, solutionId, issued.key.id, issued.key.rowVersion);
      revoked = true;
    } catch {
      console.error(
        JSON.stringify({ cleanup: 'test_key_revoke_requires_attention', keyId: issued.key.id })
      );
    }
  }
  issued = undefined;
  await repository?.close().catch(() => {});
  proxy?.kill('SIGTERM');
  if (!verified) console.log(JSON.stringify({ testKeyRevoked: revoked }));
}
