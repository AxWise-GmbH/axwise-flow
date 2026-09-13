// Effectful only with explicit run-approved-coding. Operator-initiated production
// service acceptance, NOT Clerk/browser/automatic Agent-preparation evidence.
// One fixed synthetic job; no GitHub/provider writes or Google identity in n8n
// credential data. Google identity is transport-only for private management.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, lstat, rename } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createPostgresCodingStore } from '../server/workflow-v2/coding-worker-postgres.js';
import { createCodingWorkerService } from '../server/workflow-v2/coding-worker-service.js';
import { createCodingN8nLauncher } from '../server/workflow-v2/coding-worker-n8n.js';
import { createRemoteCloudRunCodingSandbox } from '../server/workflow-v2/coding-worker-remote.js';
import { cloudRunCodingDescriptor } from '../server/workflow-v2/coding-worker-cloud-run.js';
import { validateCodingReceipt } from '../server/workflow-v2/coding-worker-receipt.js';
import { codingHash, contentHash, prepareCodingSpec } from '../server/workflow-v2/coding-worker-contracts.js';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { createBoundedHttpPolicy } from '../server/workflow-v2/native-workflow-review.js';

export const CODING_PREVIEW = Object.freeze({
  project: 'axwise-v2-preview-001', region: 'europe-west4',
  tenantId: 'c1b26d36-721b-5d8c-8d4c-180050ee9b94', userId: 'user_2vHlB9JhH4FazWsgKYENFIeAnMu',
  solutionId: '8b606adc-91ba-46e5-86da-ece609df9c7d', buildId: '8b606adc-91ba-46e5-86da-ece609df9c7d',
  agentId: '1155b480-afad-471f-aa05-ffa4046b4168', runId: 'c1cb54ec-00f5-5106-b7ff-16acf5640c07',
  oldSolutionId: '2031decc-b21e-48b5-9bd5-3ed3d4dfd024',
  environmentId: 'orqaly-customer-webhook-preview-003',
  nativeOrigin: 'https://orqaly-solution-n8n-preview-003-161074549006.europe-west4.run.app',
  nativeImage: 'sha256:245aab7912f5fa74547ef832ddc2ed195176260ee16767e25a4769c72812bee2',
  apiOrigin: 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app',
  sandboxOrigin: 'https://orqaly-coding-sandbox-preview-161074549006.europe-west4.run.app',
  sandboxImage: 'sha256:f187c466ed8e0719d8cb5f621580c3a96044182ed5de98e357432e15f7802ac1',
  applicationImage: 'sha256:c16d032de3271fe40a658ad96a43ae5c3a9ea061b41c978dad1185a81974afc5',
  createKey: 'coding-product-preview-20260906-v1-create', approveKey: 'coding-product-preview-20260906-v1-approve', runKey: 'coding-product-preview-20260906-v1-run',
  ledger: '/private/tmp/orqaly-coding-product-preview-20260906-v1.json', sqlPort: 19527,
});
const fixed = CODING_PREVIEW;
export const codingPreviewScope = () => ({ tenantId: fixed.tenantId, userId: fixed.userId, solutionId: fixed.solutionId, runId: fixed.runId });
export function codingPreviewProposal() {
  const source = 'export function total(values){return values.reduce((sum,value)=>sum-value,0);}\n';
  const changed = 'export function total(values){return values.reduce((sum,value)=>sum+value,0);}\n';
  return { kind: 'node_source_patch_v1', title: 'Synthetic preview acceptance: Node total patch',
    source: [{ path: 'src/total.mjs', content: source }], changes: [{ path: 'src/total.mjs', previousHash: contentHash(source), content: changed }],
    tests: [{ path: 'total.test.mjs', content: "import test from 'node:test';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {total} from '/workspace/src/total.mjs';\ntest('adds amounts',()=>assert.equal(total([2,3,5]),10));\ntest('handles empty input',()=>assert.equal(total([]),0));\ntest('writes a computed artifact',()=>writeFileSync('/workspace/result.json',JSON.stringify({total:total([2,3,5]),empty:total([])})));\n" }],
    outputs: ['src/total.mjs', 'result.json'], timeoutMs: 30000 };
}
export function validateCodingPreviewSource(row) {
  assert.deepEqual(row, { tenant_id: fixed.tenantId, owner_user_id: fixed.userId, solution_id: fixed.solutionId,
    build_id: fixed.buildId, agent_id: fixed.agentId, run_id: fixed.runId, build_status: 'completed', build_owner: fixed.userId, run_owner: fixed.userId }, 'exact_completed_source_link_required');
}
export function validateCodingPreviewBinding(binding) {
  assert.equal(binding.id, fixed.environmentId); assert.equal(binding.tenantId, fixed.tenantId); assert.equal(binding.userId, fixed.userId);
  assert.equal(binding.origin, fixed.nativeOrigin); assert.equal(binding.useIdToken, true);
  assert.deepEqual(binding.nativePolicy, createBoundedHttpPolicy({ imageDigest: fixed.nativeImage }));
  assert.equal(typeof binding.apiKey, 'string'); assert(binding.apiKey.length >= 16);
}
export function assertCodingPreviewTransport(url, options, googleToken, signingKey, expectedJobId) {
  const target = new URL(url); assert.equal(target.origin, fixed.nativeOrigin, 'native003_only_transport');
  const body = options?.body || '';
  assert(!body.includes(googleToken) && !body.includes(signingKey), 'operator_identity_must_never_enter_native_data');
  // Credentials created here can only contain the two-segment internal HMAC
  // capability. No Cloud credential/token is exported to a native node.
  if (options?.method === 'POST' && target.pathname === '/api/v1/credentials') {
    const data = JSON.parse(body); assert.equal(data.type, 'orqalyBoundedHttp');
    assert.match(data.data.headerValue, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const claim = JSON.parse(Buffer.from(data.data.headerValue.slice(7).split('.')[0], 'base64url').toString('utf8'));
    assert.deepEqual(claim.scope, codingPreviewScope()); assert.equal(claim.v, 1);
    assert.equal(claim.jobId, expectedJobId); assert.match(claim.jobId, /^[a-f0-9-]{36}$/);
    assert.equal(claim.specHash, codingHash(prepareCodingSpec(codingPreviewProposal(), cloudRunCodingDescriptor(fixed.sandboxImage))));
    const credentialScope = JSON.parse(data.data.scope);
    assert.equal(credentialScope.targets.length, 1); assert.equal(credentialScope.targets[0].destination, `${fixed.apiOrigin}/coding/v1/jobs/${claim.jobId}/dispatch`);
    assert(Number.isSafeInteger(claim.expiresAt) && claim.expiresAt > Date.now() && claim.expiresAt <= Date.now() + 300000);
  }
}
const cloud = args => execFileSync('gcloud', [...args, `--project=${fixed.project}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 }).trim();
const cloudJson = args => JSON.parse(cloud([...args, '--format=json']));
const secret = (name, version) => cloud(['secrets', 'versions', 'access', version, `--secret=${name}`]);
const serviceDescription = name => cloudJson(['run', 'services', 'describe', name, `--region=${fixed.region}`]);
export function validateCodingPreviewDeployment(service) {
  assert(['orqaly-v2-api-preview', 'orqaly-v2-worker-preview'].includes(service.metadata.name));
  const active = service.status.traffic.filter(item => (item.percent || 0) > 0);
  assert.equal(active.length, 1); assert.equal(active[0].percent, 100);
  assert.equal(active[0].revisionName, `${service.metadata.name}-exec-7b330159`);
  assert(service.spec.template.spec.containers[0].image.endsWith(`@${fixed.applicationImage}`), 'exact_reviewed_application_image_required');
  const env = new Map(service.spec.template.spec.containers[0].env.map(item => [item.name, item]));
  for (const [key, value] of Object.entries({ ORQALY_CODING_WORKER_URL: fixed.sandboxOrigin, ORQALY_CODING_WORKER_IMAGE_SHA256: fixed.sandboxImage,
    ORQALY_CODING_N8N_ENVIRONMENT_ID: fixed.environmentId, ORQALY_PUBLIC_API_ORIGIN: fixed.apiOrigin })) assert.equal(env.get(key)?.value, value, 'deployed_coding_configuration_mismatch');
  assert.deepEqual(env.get('ORQALY_CODING_DISPATCH_SIGNING_KEY')?.valueFrom?.secretKeyRef,
    { name: 'orqaly-coding-preview-dispatch-signing-key', key: '1' }, 'deployed_signing_version_required');
  assert.deepEqual(env.get('ORQALY_SOLUTION_ENVIRONMENTS')?.valueFrom?.secretKeyRef,
    { name: 'orqaly-solution-preview-001-002-003-environments', key: '2' }, 'deployed_native_scopes_version_required');
  assert(service.status.conditions.some(item => item.type === 'Ready' && item.status === 'True'));
}
function oldCloudSnapshot() {
  return Object.fromEntries(['orqaly-solution-n8n-preview', 'orqaly-solution-n8n-preview-002'].map(name => {
    const service = serviceDescription(name), iam = cloudJson(['run', 'services', 'get-iam-policy', name, `--region=${fixed.region}`]);
    const annotations = Object.fromEntries(Object.entries(service.spec.template.metadata.annotations || {}).filter(([key]) => !/client-|operation-id/.test(key)));
    return [name, { specHash: codingHash({ spec: service.spec.template.spec, annotations }), iamHash: codingHash(iam.bindings || []) }];
  }));
}
async function readLedger() {
  try { const stat = await lstat(fixed.ledger); assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 32000, 'owned_ledger_required');
    const value = JSON.parse(await readFile(fixed.ledger, 'utf8'));
    assert(value.kind === 'coding-product-preview-v1' && value.createKey === fixed.createKey && value.runKey === fixed.runKey, 'ledger_scope_mismatch'); return value;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function saveLedger(value, create = false) {
  const text = JSON.stringify(value, null, 2); assert(text.length < 32000);
  if (create) { await writeFile(fixed.ledger, text, { flag: 'wx', mode: 0o600 }); return; }
  assert(await readLedger(), 'owned_ledger_missing');
  const temporary = `${fixed.ledger}.${process.pid}.next`;
  await writeFile(temporary, text, { flag: 'wx', mode: 0o600 }); await rename(temporary, fixed.ledger);
}

export async function runCodingProductPreview(args = process.argv.slice(2)) {
  assert.deepEqual(args, ['run-approved-coding'], 'explicit_single_scope_acceptance_required');
  let stage = 'deployment_preflight', repository, proxy, proxyFailed = false, current, store, before, state;
  let verified = false; const auth = { userId: fixed.userId }, scope = codingPreviewScope();
  const safe = () => ({ stage, jobId: current?.id || state?.jobId || null, status: current?.status || null });
  try {
    validateCodingPreviewDeployment(serviceDescription('orqaly-v2-api-preview')); validateCodingPreviewDeployment(serviceDescription('orqaly-v2-worker-preview'));
    const sandboxService = serviceDescription('orqaly-coding-sandbox-preview');
    assert(sandboxService.spec.template.spec.containers[0].image.endsWith(`@${fixed.sandboxImage}`), 'final_sandbox_image_required');
    const binding = JSON.parse(secret('orqaly-solution-preview-003-environment', '2')); validateCodingPreviewBinding(binding);
    const signingKey = secret('orqaly-coding-preview-dispatch-signing-key', '1'); assert.equal(Buffer.from(signingKey, 'base64').length, 32);
    const googleToken = cloud(['auth', 'print-identity-token']); assert.match(googleToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const runtime = createSolutionRuntime({ bindings: [binding], getIdentityHeaders: async selected => {
      assert.equal(selected, fixed.nativeOrigin); return { authorization: `Bearer ${googleToken}` };
    }, fetchImpl: async (url, options) => { assertCodingPreviewTransport(url, options, googleToken, signingKey, current?.id); return fetch(url, options); } });
    // This adapter supplies the exact deployed descriptor for immutable approval.
    // The operator NEVER calls its run(): only the deployed worker executes code.
    const sandbox = createRemoteCloudRunCodingSandbox({ origin: fixed.sandboxOrigin, image: fixed.sandboxImage });
    stage = 'restricted_api_role';
    const free = createServer(); await new Promise((resolve, reject) => { free.once('error', reject); free.listen(fixed.sqlPort, '127.0.0.1', resolve); }); await new Promise(resolve => free.close(resolve));
    const db = new URL(secret('orqaly-v2-preview-001-db-api-url', '2').replace('@/', '@localhost/'));
    assert.equal(db.pathname, '/orqaly_v2_preview_001'); db.hostname = '127.0.0.1'; db.port = String(fixed.sqlPort); db.searchParams.delete('host'); db.searchParams.delete('sslmode');
    proxy = spawn('cloud-sql-proxy', [`${fixed.project}:${fixed.region}:orqaly-v2-preview-001-pg`, '--gcloud-auth', '--address=127.0.0.1', `--port=${fixed.sqlPort}`], { stdio: 'ignore' });
    proxy.once('error', () => { proxyFailed = true; });
    repository = createPostgresRepositories({ environment: 'preview', apiDatabaseUrl: db.href, requireCoding: true });
    let connected = false;
    for (let i = 0; i < 30; i++) { assert(!proxyFailed && proxy.exitCode === null, 'owned_proxy_failed');
      try { await repository.readiness(); connected = true; break; } catch { await delay(500); } }
    assert(connected, 'restricted_database_not_ready');
    const transaction = callback => repository.solutionBuildTransaction(scope, callback);
    await transaction(async client => {
      const identity = (await client.query("SELECT current_database() AS db,pg_has_role(current_user,'orqaly_api','member') AS api,pg_has_role(current_user,'orqaly_worker','member') AS worker,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.deepEqual(identity, { db: 'orqaly_v2_preview_001', api: true, worker: false, rolsuper: false, rolbypassrls: false });
      const rows = (await client.query(`SELECT s.tenant_id,s.owner_user_id,s.id AS solution_id,b.id AS build_id,b.agent_id,b.run_id,b.status AS build_status,b.owner_user_id AS build_owner,r.owner_user_id AS run_owner
        FROM orqaly.customer_solutions s JOIN orqaly.solution_build_requests b ON b.tenant_id=s.tenant_id AND b.id=s.build_request_id AND b.solution_id=s.id AND b.agent_id=s.agent_id
        JOIN orqaly.workflow_runs r ON r.tenant_id=b.tenant_id AND r.id=b.run_id
        WHERE s.tenant_id=$1 AND s.owner_user_id=$2 AND s.id=$3`, [scope.tenantId, scope.userId, scope.solutionId])).rows;
      assert.equal(rows.length, 1); validateCodingPreviewSource(rows[0]);
    });
    const scopedRepository = { solutionBuildTransaction: (selected, callback) => {
      assert.deepEqual(selected, scope); return transaction(callback);
    }, resolveTenant: async selected => { assert.deepEqual(selected, auth); return scope.tenantId; } };
    store = createPostgresCodingStore(scopedRepository);
    const launcher = createCodingN8nLauncher({ runtime, store, environmentId: fixed.environmentId, origin: fixed.apiOrigin });
    const service = createCodingWorkerService({ repository: scopedRepository, store, sandbox, signingKey: Buffer.from(signingKey, 'base64'), launcher });
    const protectedSnapshot = async () => transaction(async client => {
      const result = {};
      for (const table of ['customer_solutions', 'solution_revisions', 'solution_revision_events', 'solution_invocations']) {
        const rows = (await client.query(`SELECT to_jsonb(t) AS value FROM orqaly.${table} t WHERE tenant_id=$1 AND owner_user_id=$2 AND ${table === 'customer_solutions' ? 'id' : 'solution_id'}=ANY($3::uuid[]) ORDER BY id LIMIT 201`,
          [scope.tenantId, scope.userId, [fixed.solutionId, fixed.oldSolutionId]])).rows;
        assert(rows.length <= 200); if (table === 'customer_solutions') assert.equal(rows.length, 2);
        result[table] = { count: rows.length, hash: codingHash(rows) };
      }
      return result;
    });
    stage = 'persistent_baseline';
    const spec = prepareCodingSpec(codingPreviewProposal(), cloudRunCodingDescriptor(fixed.sandboxImage)); const specHash = codingHash(spec);
    state = await readLedger(); before = { database: await protectedSnapshot(), cloud: oldCloudSnapshot() };
    const existing = (await transaction(client => client.query('SELECT id,spec_hash FROM orqaly.solution_coding_jobs WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND run_id=$4 AND request_key=$5',
      [scope.tenantId, scope.userId, scope.solutionId, scope.runId, fixed.createKey]))).rows;
    assert(existing.length <= 1); if (!state) assert.equal(existing.length, 0, 'existing_job_without_baseline_needs_operator_review');
    if (state) { assert.equal(state.specHash, specHash); assert.deepEqual(before, state.before, 'protected_state_changed_since_first_attempt'); }
    else { state = { kind: 'coding-product-preview-v1', createKey: fixed.createKey, approveKey: fixed.approveKey, runKey: fixed.runKey,
      specHash, before, createdAt: new Date().toISOString(), jobId: null, verified: false }; await saveLedger(state, true); }
    stage = 'create_exact_synthetic_proposal';
    current = existing.length ? (await service.read(auth, scope.solutionId, existing[0].id, { runId: scope.runId })).job :
      (await service.create(auth, scope.solutionId, { runId: scope.runId, proposal: codingPreviewProposal() }, fixed.createKey)).job;
    assert.equal(current.specHash, specHash); assert.equal(current.runId, fixed.runId);
    if (state.jobId) assert.equal(state.jobId, current.id); else { state.jobId = current.id; await saveLedger(state); }
    if (current.status === 'proposed') {
      stage = 'operator_exact_hash_approval'; current = (await service.approve(auth, scope.solutionId, current.id,
        { runId: scope.runId, expectedVersion: current.rowVersion, specHash }, fixed.approveKey)).job;
    }
    if (current.status === 'approved') {
      stage = 'real_n8n_to_public_broker';
      // A persisted dispatch—even after a lost response—is replayed by the
      // service, never recreated. No capability is printed or stored locally.
      const launched = await service.runReviewed(auth, scope.solutionId, current.id,
        { runId: scope.runId, expectedVersion: current.rowVersion, specHash }, fixed.runKey);
      current = launched.job;
      assert.equal(launched.orchestration.status, 'accepted', 'native_dispatch_unconfirmed_no_retry');
    }
    stage = 'deployed_worker_observation';
    let previous = null;
    for (let i = 0; i < 150 && ['queued', 'running'].includes(current.status); i++) {
      if (current.status !== previous) { console.log(JSON.stringify({ ...safe(), evidenceBoundary: 'authoritative_persisted_status' })); previous = current.status; }
      await delay(2000); current = (await service.read(auth, scope.solutionId, current.id, { runId: scope.runId })).job;
    }
    assert.equal(current.status, 'succeeded', 'coding_result_not_successful_no_retry');
    stage = 'exact_persisted_execution_evidence';
    const stored = await store.read(scope, current.id); const bound = validateCodingReceipt(scope, stored, { status: stored.status, evidence: stored.evidence, artifacts: stored.artifacts });
    assert.deepEqual(bound, { bound: true, actual: true }); assert.equal(stored.spec_hash, specHash);
    assert.equal(stored.evidence.runtime.image, fixed.sandboxImage); assert.equal(stored.evidence.command.exitCode, 0); assert.equal(stored.evidence.cleanup.status, 'removed');
    assert.equal(stored.artifacts.find(item => item.path === 'src/total.mjs').content, codingPreviewProposal().changes[0].content);
    assert.deepEqual(JSON.parse(stored.artifacts.find(item => item.path === 'result.json').content), { total: 10, empty: 0 });
    const dispatch = await store.readDispatch(scope, current.id);
    assert.equal(dispatch.request_key, fixed.runKey); assert.equal(dispatch.environment_id, fixed.environmentId); assert.equal(dispatch.status, 'accepted');
    assert.match(dispatch.evidence.executionId, /^[1-9][0-9]*$/); assert.equal(dispatch.evidence.workflowCleanup, 'removed'); assert.equal(dispatch.evidence.credentialCleanup, 'removed');
    const nativeRead = async path => {
      assert(['/api/v1/workflows?limit=100', '/api/v1/credentials?limit=100'].includes(path));
      const response = await fetch(`${fixed.nativeOrigin}${path}`, { redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${googleToken}`, 'X-N8N-API-KEY': binding.apiKey } });
      assert(response.ok); const text = await response.text(); assert(text.length < 2_000_000); const value = JSON.parse(text);
      assert(Array.isArray(value.data) && !value.nextCursor, 'bounded_native_inventory_required'); return value.data;
    };
    assert(!(await nativeRead('/api/v1/workflows?limit=100')).some(item => item.name === `Orqaly test ${dispatch.id}`), 'owned_native_test_still_present');
    assert(!(await nativeRead('/api/v1/credentials?limit=100')).some(item => item.id === dispatch.credential_id || item.name === `Orqaly connection ${dispatch.id}`), 'owned_native_credential_still_present');
    stage = 'lost_response_replay_and_preservation';
    const replay = await service.runReviewed(auth, scope.solutionId, current.id, { runId: scope.runId, expectedVersion: 1, specHash }, fixed.runKey);
    assert.equal(replay.orchestration.replayed, true); assert.equal(replay.job.evidence.executionId, stored.evidence.executionId);
    assert.deepEqual({ database: await protectedSnapshot(), cloud: oldCloudSnapshot() }, state.before, 'old_solutions_revisions_history_or_runtime_changed');
    const count = (await transaction(client => client.query('SELECT count(*)::integer AS value FROM orqaly.solution_coding_jobs WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND request_key=$4',
      [scope.tenantId, scope.userId, scope.solutionId, fixed.createKey]))).rows[0].value; assert.equal(count, 1);
    verified = true;
    const receipt = { verified, evidenceBoundary: 'Operator source/approval via real production services and restricted API DB role; real n8n003 to deployed broker, deployed worker and private Cloud Run Sandbox. Not Clerk UI or automatic Agent generation.',
      solutionId: fixed.solutionId, runId: fixed.runId, jobId: current.id, specHash, nativeExecutionId: dispatch.evidence.executionId,
      sandboxExecutionId: stored.evidence.executionId, sandboxImage: fixed.sandboxImage, nativeEnvironment: fixed.environmentId,
      output: { total: 10, empty: 0 }, artifacts: stored.artifacts.map(({ path, bytes, hash }) => ({ path, bytes, hash })),
      nativeWorkflowCleanup: 'removed', nativeCredentialCleanup: 'removed', sandboxCleanup: 'removed',
      exactOneJob: true, replayDidNotRedispatch: true, oldReleasesAndHistoryPreserved: true, googleIdentityInNativeCredentials: false };
    state = { ...state, verified: true, receipt }; await saveLedger(state); console.log(JSON.stringify(receipt)); return receipt;
  } catch (error) {
    const result = { verified: false, ...safe(), noAutomaticRetry: true, credentialsLogged: false,
      code: /^[A-Z0-9_]{3,64}$/.test(error.code || '') ? error.code : 'CODING_PRODUCT_ACCEPTANCE_UNCONFIRMED' };
    console.error(JSON.stringify(result)); process.exitCode = 1; return result;
  } finally {
    await repository?.close().catch(() => {}); if (proxy && proxy.exitCode === null) proxy.kill('SIGTERM');
    if (!verified && current) console.log(JSON.stringify({ jobId: current.id, status: current.status, preservedForReview: true }));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCodingProductPreview();
