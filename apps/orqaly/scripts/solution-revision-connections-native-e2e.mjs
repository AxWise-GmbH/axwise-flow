// Real disposable PostgreSQL + pinned n8n credential persistence. Synthetic
// values only. No workflow execution, provider calls, cloud, or public listener.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { nativeOutboundFixture } from './fixtures/native-outbound-workflow.mjs';
import { nativeOwnedErrorFixture } from '../server/workflow-v2/fixtures/native-owned-error.js';
import { normalizeNativeBundle, nativeBundleHash } from '../server/workflow-v2/native-workflow-bundle.js';
import { createBoundedHttpPolicy } from '../server/workflow-v2/native-workflow-review.js';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { createSolutionRevisionService } from '../server/workflow-v2/solution-revision-service.js';
import { verifyRevisionConnectionsReadiness } from '../server/workflow-v2/solution-revision-storage-readiness.js';

assert.deepEqual(process.argv.slice(2), ['--local-synthetic-only']);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suffix = randomBytes(6).toString('hex');
const postgres = `orqaly-connection-pg-${suffix}`, n8n = `orqaly-connection-n8n-${suffix}`;
const password = randomBytes(24).toString('hex');
const scope = { tenantId: randomUUID(), userId: 'user_syntheticrevisionowner' };
const solutionId = randomUUID(), revisionId = randomUUID(), environmentId = `synthetic-connection-${suffix}`;
const secret = `SyntheticOnly-${randomUUID()}`;
let pool, db, pgStarted = false, n8nStarted = false, stage = 'start';
const check = (label) => { stage = label; process.stdout.write(`check: ${label}\n`); };
const docker = (args, env = {}) => execFileSync('docker', args, {
  encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const origin = 'http://127.0.0.1:5678';
const requests = [];
async function fetchLocal(url, options = {}) {
  const target = new URL(url), method = options.method ?? 'GET';
  assert.equal(target.origin, origin, 'only_disposable_loopback_management');
  assert(
    (method === 'GET' && ['/rest/settings', '/api/v1/workflows', '/api/v1/credentials'].includes(target.pathname)) ||
    (method === 'POST' && ['/rest/owner/setup', '/rest/api-keys', '/api/v1/credentials'].includes(target.pathname)) ||
    (['GET', 'DELETE'].includes(method) && /^\/api\/v1\/credentials\/[A-Za-z0-9_-]+$/.test(target.pathname)),
    'no_workflow_writes_or_execution_transport'
  );
  const script = 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",async()=>{try{const v=JSON.parse(s);const r=await fetch(v.url,{method:v.method,headers:v.headers,body:v.body,redirect:"error",signal:AbortSignal.timeout(10000)});process.stdout.write(JSON.stringify({status:r.status,headers:[...r.headers],cookies:r.headers.getSetCookie(),body:await r.text()}))}catch{process.exitCode=2}})';
  let value;
  try {
    value = JSON.parse(execFileSync('docker', ['exec', '-i', n8n, 'node', '-e', script], {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      input: JSON.stringify({ url, method, headers: Object.fromEntries(new Headers(options.headers ?? {})), body: options.body }),
    }));
  } catch { throw new Error('local_management_unavailable'); }
  requests.push({ method, path: target.pathname, status: value.status });
  const headers = new Headers(value.headers);
  headers.delete('set-cookie');
  for (const cookie of value.cookies) headers.append('set-cookie', cookie);
  return new Response([204, 304].includes(value.status) ? null : value.body, { status: value.status, headers });
}

try {
  check('start_owned_networkless_n8n_and_loopback_postgresql');
  docker(['image', 'inspect', 'postgres:16']);
  const image = JSON.parse(docker(['image', 'inspect', 'n8nio/n8n:2.37.10']))[0];
  const imageDigest = image.RepoDigests.find((entry) => entry.startsWith('n8nio/n8n@'))?.split('@')[1];
  assert.match(imageDigest ?? '', /^sha256:[a-f0-9]{64}$/);
  docker(['run', '--pull=never', '-d', '--name', postgres, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', 'postgres:16'], { POSTGRES_PASSWORD: password });
  pgStarted = true;
  docker(['run', '--pull=never', '-d', '--name', n8n, '--network', 'none',
    '-v', `${root}/infra/n8n/nodes-orqaly-bounded-http:/opt/orqaly-custom/nodes-orqaly-bounded-http:ro`,
    '-e', 'NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules',
    '-e', 'N8N_CUSTOM_EXTENSIONS=/opt/orqaly-custom/nodes-orqaly-bounded-http',
    '-e', 'N8N_DIAGNOSTICS_ENABLED=false', '-e', 'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
    '-e', 'N8N_TEMPLATES_ENABLED=false', '-e', 'N8N_SECURE_COOKIE=false', 'n8nio/n8n:2.37.10']);
  n8nStarted = true;
  assert.equal(docker(['inspect', '--format', '{{.HostConfig.NetworkMode}}', n8n]), 'none');
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { const response = await fetchLocal(`${origin}/rest/settings`); if (response.ok && (await response.json()).data) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert(ready, 'n8n_rest_ready');
  const setup = await fetchLocal(`${origin}/rest/owner/setup`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'revision-connection@example.test', firstName: 'Synthetic', lastName: 'Owner', password: `SyntheticA9!${randomUUID()}` }) });
  assert(setup.ok, 'local_owner_setup');
  const cookie = setup.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');
  const keyResponse = await fetchLocal(`${origin}/rest/api-keys`, { method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ label: 'Synthetic revision credentials only', expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scopes: ['workflow:list', 'credential:create', 'credential:read', 'credential:list', 'credential:delete'] }) });
  assert(keyResponse.ok, 'local_api_key');
  const apiKey = (await keyResponse.json()).data.rawApiKey;
  // Synthetic adapter policy only: this base image plus the read-only mounted
  // custom package is NOT a claimed deployable production image fingerprint.
  const policy = { ...createBoundedHttpPolicy({ imageDigest }), ownedErrorHandlers: true, backgroundExecution: 'instance_cpu_always' };
  const runtime = createSolutionRuntime({ allowLocalHttp: true, fetchImpl: fetchLocal, bindings: [{
    ...scope, id: environmentId, name: 'Synthetic credential isolation', region: 'local', origin, apiKey, useIdToken: false, nativePolicy: policy,
  }] });
  const metadata = async (id) => fetchLocal(`${origin}/api/v1/credentials/${id}`, { headers: { 'X-N8N-API-KEY': apiKey } });
  const port = docker(['port', postgres, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert(port);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', max: 4 });
  db = await pool.connect();
  check('apply_real_postgresql001_through023');
  const migrations = resolve(root, 'database/workflow-v2/migrations');
  for (const file of readdirSync(migrations).filter((name) => /^\d{3}_/.test(name) && Number(name.slice(0, 3)) <= 23).sort()) {
    stage = file; await db.query(readFileSync(resolve(migrations, file), 'utf8'));
  }
  const artifact = nativeOutboundFixture();
  const child = nativeOwnedErrorFixture(revisionId).spec.ownedDependencies[0];
  const deliver = structuredClone(artifact.workflow.nodes[1]);
  deliver.id = 'deliver-error'; deliver.name = 'Deliver failure'; deliver.parameters.body = '={{ $json }}';
  child.workflow.nodes.push(deliver);
  child.workflow.connections['Extract failure details'] = { main: [[{ node: deliver.name, type: 'main', index: 0 }]] };
  child.spec.connections = [{ ...artifact.spec.connections[0], nodeIds: [deliver.id] }];
  artifact.spec.ownedDependencies = [child];
  artifact.workflow.settings.errorWorkflow = `orqaly:error:${child.id}`;
  const source = normalizeNativeBundle({ ...artifact, id: revisionId });
  check('seed_exact_synthetic_main_and_owned_child_draft');
  await db.query("INSERT INTO orqaly.tenants(id,display_name) VALUES($1,'Synthetic connection acceptance')", [scope.tenantId]);
  await db.query(`INSERT INTO orqaly.customer_solutions
    (tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash,environment_id)
    VALUES($1,$2,$3,$4,'Synthetic secure connection','No provider effects',$5,'{}',$6,$7,'synthetic_connections',$7,$8)`,
    [scope.tenantId, solutionId, scope.userId, randomUUID(), source.spec, source.workflow, source.workflowHash, environmentId]);
  await db.query(`INSERT INTO orqaly.solution_revisions
    (tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,workflow,workflow_hash,spec)
    VALUES($1,$2,$3,$4,2,1,$5,$6,$5,$7,$6)`,
    [scope.tenantId, solutionId, revisionId, scope.userId, source.workflow, source.spec, source.workflowHash]);
  const liveBefore = (await db.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1', [solutionId])).rows[0];
  const draftBefore = (await db.query('SELECT * FROM orqaly.solution_revisions WHERE id=$1', [revisionId])).rows[0];
  async function transaction(authScope, action, role = 'orqaly_api') {
    assert(['orqaly_api', 'orqaly_worker'].includes(role));
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SET LOCAL ROLE ${role}`);
      await client.query("SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)", [authScope.tenantId, authScope.userId]);
      const result = await action(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const repository = { resolveTenant: async () => scope.tenantId, solutionBuildTransaction: transaction };
  let service = createSolutionRevisionService({ repository, runtime });
  await transaction(scope, (client) => verifyRevisionConnectionsReadiness(client, { api: true }));
  check('owner_consent_and_hash_guards_before_native_mutation');
  await assert.rejects(() => service.revisionSetup({ userId: 'user_other' }, solutionId, revisionId), { code: 'SOLUTION_NOT_FOUND' });
  let current = await service.revisionSetup(scope, solutionId, revisionId);
  assert.equal(current.setup.ready, false);
  assert.equal(current.connectionRequirements.length, 2);
  const commandFor = (value, requirement) => ({ expectedVersion: value.revision.rowVersion, workflowHash: value.revision.workflowHash,
    bundleHash: value.revision.bundleHash, requirementId: requirement.id, confirmedScopeHash: requirement.scopeHash,
    acknowledge: true, credentials: { name: 'X-Task-Key', value: secret } });
  const firstCommand = commandFor(current, current.connectionRequirements[0]);
  await assert.rejects(() => service.createRevisionConnection(scope, solutionId, revisionId, { ...firstCommand, acknowledge: false }, 'create_invalid_1'));
  await assert.rejects(() => service.createRevisionConnection(scope, solutionId, revisionId, { ...firstCommand, workflowHash: 'a'.repeat(64) }, 'create_invalid_2'), { code: 'SOLUTION_REVISION_CHANGED' });
  assert.equal(requests.filter((request) => request.path === '/api/v1/credentials' && request.method === 'POST').length, 0);
  const created = [];
  for (const requirementId of current.connectionRequirements.map((entry) => entry.id)) {
    check(requirementId.startsWith('owned:') ? 'real_child_credential_create_bind_and_replay' : 'real_main_credential_create_bind_and_replay');
    const requirement = current.connectionRequirements.find((entry) => entry.id === requirementId);
    assert.equal(requirement.canConnect, true);
    const command = commandFor(current, requirement), requestKey = `create_${created.length}_synthetic`;
    current = await service.createRevisionConnection(scope, solutionId, revisionId, structuredClone(command), requestKey);
    const record = current.connectionRequirements.find((entry) => entry.id === requirementId);
    assert.equal(record.status, 'saved');
    assert.equal(current.revision.status, 'draft');
    assert.equal(current.revision.testedAt, null); assert.equal(current.revision.approvedAt, null);
    const stored = (await db.query('SELECT * FROM orqaly.solution_revision_connections WHERE id=$1', [record.connectionId])).rows[0];
    assert.equal(stored.status, 'saved'); assert.equal(stored.environment_id, environmentId);
    const response = await metadata(stored.provider_credential_id);
    assert.equal(response.status, 200);
    const provider = await response.json();
    assert.equal(provider.id, stored.provider_credential_id);
    assert.equal(provider.name, `Orqaly connection ${stored.id}`); assert.equal(provider.type, 'orqalyBoundedHttp');
    assert(!JSON.stringify(provider).includes(secret), 'native_metadata_must_not_expose_key');
    const selected = record.dependencyId ? current.revision.spec.ownedDependencies.find((entry) => entry.id === record.dependencyId).workflow : current.revision.workflow;
    assert.equal(selected.nodes.find((node) => node.id === record.nodeIds[0]).credentials.orqalyBoundedHttp.id, provider.id);
    assert(!JSON.stringify(current).includes(secret), 'public_revision_must_not_expose_key');
    assert(!JSON.stringify(stored).includes(secret), 'postgres_record_must_not_contain_key');
    const posts = requests.filter((request) => request.path === '/api/v1/credentials' && request.method === 'POST').length;
    await service.createRevisionConnection(scope, solutionId, revisionId, structuredClone(command), requestKey);
    assert.equal(requests.filter((request) => request.path === '/api/v1/credentials' && request.method === 'POST').length, posts);
    created.push({ connectionId: stored.id, providerId: provider.id });
  }
  check('restart_readback_exact_bindings_without_verification_claim');
  service = createSolutionRevisionService({ repository, runtime });
  current = await service.revisionSetup(scope, solutionId, revisionId);
  assert.equal(current.setup.ready, true);
  assert(current.connectionRequirements.every((entry) => entry.status === 'saved'));
  assert.equal(current.revision.bundleHash, nativeBundleHash({ workflow: current.revision.workflow, spec: current.revision.spec }));
  await transaction({ ...scope, userId: 'user_other' }, async (client) => {
    assert.equal((await client.query('SELECT id FROM orqaly.solution_revision_connections')).rows.length, 0);
  });
  for (const saved of created.reverse()) {
    check('exact_owned_native_revoke_and_absence_readback');
    const descriptor = current.connectionRequirements.find((entry) => entry.connectionId === saved.connectionId);
    const command = { expectedVersion: current.revision.rowVersion, workflowHash: current.revision.workflowHash,
      bundleHash: current.revision.bundleHash, connectionId: saved.connectionId, confirmedScopeHash: descriptor.scopeHash, acknowledge: true };
    const requestKey = `revoke_${saved.connectionId}`;
    current = await service.revokeRevisionConnection(scope, solutionId, revisionId, command, requestKey);
    assert.equal((await metadata(saved.providerId)).status, 404);
    const deletes = requests.filter((request) => request.method === 'DELETE').length;
    await service.revokeRevisionConnection(scope, solutionId, revisionId, command, requestKey);
    assert.equal(requests.filter((request) => request.method === 'DELETE').length, deletes);
    assert.equal((await db.query('SELECT status FROM orqaly.solution_revision_connections WHERE id=$1', [saved.connectionId])).rows[0].status, 'revoked');
  }
  check('source_preservation_and_zero_workflow_or_provider_effects');
  const liveAfter = (await db.query('SELECT * FROM orqaly.customer_solutions WHERE id=$1', [solutionId])).rows[0];
  const draftAfter = (await db.query('SELECT * FROM orqaly.solution_revisions WHERE id=$1', [revisionId])).rows[0];
  assert.deepEqual(liveAfter, liveBefore);
  assert.deepEqual(draftAfter.workflow, draftBefore.workflow); assert.deepEqual(draftAfter.spec, draftBefore.spec);
  assert.equal(draftAfter.workflow_hash, draftBefore.workflow_hash);
  assert.equal(draftAfter.row_version, 4); assert.equal(draftAfter.tested_at, null); assert.equal(draftAfter.approved_at, null);
  assert.equal(requests.filter((request) => request.method === 'POST' && request.path === '/api/v1/credentials').length, 2);
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 2);
  assert.equal((await db.query('SELECT id FROM orqaly.solution_invocations')).rows.length, 0);
  const allEvidence = await db.query('SELECT to_jsonb(e) AS value FROM orqaly.solution_revision_events e');
  assert(!JSON.stringify(allEvidence.rows).includes(secret));
  process.stdout.write(`PASS real PostgreSQL + n8n 2.37.10: main/child saved (not verified), exact bind/restart/replay/revoke, no executions; image ${imageDigest}.\n`);
} catch (error) {
  // Assertion values may include synthetic credentials; never print them or a
  // child-process error containing the command's stdin/environment.
  process.stderr.write(`FAIL ${stage}: ${error.code || error.name || 'error'}\n`);
  process.exitCode = 1;
} finally {
  db?.release(); await pool?.end();
  if (n8nStarted) docker(['rm', '--force', n8n]);
  if (pgStarted) docker(['rm', '--force', postgres]);
}
