import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { createBoundedHttpPolicy } from '../server/workflow-v2/native-workflow-review.js';
import { createCodingN8nLauncher } from '../server/workflow-v2/coding-worker-n8n.js';
import { createCodingWorkerService } from '../server/workflow-v2/coding-worker-service.js';

// Actual n8n -> verified TLS -> production coding dispatch router -> real PG.
// Internal Docker network uses synthetic public unicast IPs, no internet route,
// no private-address guard exceptions and no third-party provider credentials.
export async function runCodingNativeLocalAcceptance({ scope, repository, store, sandbox, workerService, postgresContainer, password, proposal, signingKey }) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), suffix = randomUUID().slice(0, 12);
  const network = `orqaly-coding-native-${suffix}`, n8n = `${network}-n8n`, broker = `${network}-broker`;
  const temp = mkdtempSync(join(tmpdir(), 'orqaly-coding-tls-'));
  const docker = (args, env = {}) => execFileSync('docker', args, { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let networkMade = false, pgJoined = false, nativeStarted = false, brokerStarted = false;
  const image = 'n8nio/n8n:2.37.10', policy = createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` });
  const origin = 'http://127.0.0.1:5678', brokerOrigin = 'https://coding-fixture.orqaly.example';
  const fetchImpl = async (url, options = {}) => {
    const script = 'let raw="";process.stdin.on("data",x=>raw+=x);process.stdin.on("end",async()=>{try{const v=JSON.parse(raw);const r=await fetch(v.url,{method:v.method,headers:v.headers,body:v.body,redirect:"error",signal:AbortSignal.timeout(60000)});process.stdout.write(JSON.stringify({status:r.status,headers:[...r.headers],cookies:r.headers.getSetCookie(),body:await r.text()}))}catch{process.exitCode=2}})';
    let value;
    try { value = JSON.parse(execFileSync('docker', ['exec', '-i', n8n, 'node', '-e', script], { encoding: 'utf8',
      input: JSON.stringify({ url, method: options.method ?? 'GET', headers: Object.fromEntries(new Headers(options.headers ?? {})), body: options.body }), stdio: ['pipe', 'pipe', 'pipe'] })); }
    catch { throw new Error('coding_native_management_unavailable'); }
    const headers = new Headers(value.headers); headers.delete('set-cookie'); for (const cookie of value.cookies) headers.append('set-cookie', cookie);
    return new Response(value.status === 204 ? null : value.body, { status: value.status, headers });
  };
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-noenc', '-keyout', join(temp, 'key.pem'), '-out', join(temp, 'cert.pem'), '-days', '1',
      '-subj', '/CN=coding-fixture.orqaly.example', '-addext', 'subjectAltName=DNS:coding-fixture.orqaly.example'], { stdio: 'ignore' });
    docker(['network', 'create', '--internal', '--subnet', '93.184.219.0/24', network]); networkMade = true;
    docker(['network', 'connect', '--ip', '93.184.219.23', network, postgresContainer]); pgJoined = true;
    docker(['run', '-d', '--pull=never', '--name', broker, '--network', network, '--ip', '93.184.219.20', '--user', '0',
      '-v', `${temp}:/fixture:ro`, '-v', `${root}:/orqaly:ro`, '-e', 'CODING_FIXTURE_DATABASE_URL', '-e', 'CODING_FIXTURE_SIGNING_KEY',
      '--entrypoint', 'node', image, '/orqaly/scripts/fixtures/coding-local-tls-broker.mjs'], {
      CODING_FIXTURE_DATABASE_URL: `postgresql://coding_test_api:${password}@93.184.219.23:5432/postgres`, CODING_FIXTURE_SIGNING_KEY: signingKey.toString('base64') }); brokerStarted = true;
    docker(['run', '-d', '--pull=never', '--name', n8n, '--network', network, '--ip', '93.184.219.21', '--add-host', 'coding-fixture.orqaly.example:93.184.219.20',
      '-v', `${join(root, 'infra/n8n/nodes-orqaly-bounded-http')}:/opt/orqaly-custom/nodes-orqaly-bounded-http:ro`, '-v', `${join(temp, 'cert.pem')}:/fixture-ca.pem:ro`,
      '-e', 'NODE_EXTRA_CA_CERTS=/fixture-ca.pem', '-e', 'NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules', '-e', 'N8N_CUSTOM_EXTENSIONS=/opt/orqaly-custom/nodes-orqaly-bounded-http',
      '-e', `NODES_INCLUDE=${JSON.stringify([...new Set(policy.allowedNodes.map(node => node.type))])}`, '-e', 'NODES_EXCLUDE=["n8n-nodes-base.executeCommand","n8n-nodes-base.readWriteFile","n8n-nodes-base.httpRequest","n8n-nodes-base.code"]',
      '-e', 'N8N_BLOCK_ENV_ACCESS_IN_NODE=true', '-e', 'N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES=true', '-e', 'N8N_DIAGNOSTICS_ENABLED=false', '-e', 'N8N_VERSION_NOTIFICATIONS_ENABLED=false', '-e', 'N8N_SECURE_COOKIE=false', image]); nativeStarted = true;
    let ready = false; for (let i = 0; i < 100; i++) { try { const result = await fetchImpl(`${origin}/rest/settings`); if (result.ok && (await result.json()).data) { ready = true; break; } } catch { /* startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready, 'genuine pinned native ready'); assert.equal((await fetchImpl(`${brokerOrigin}/readyz`)).status, 200, 'actual TLS broker ready');
    const setup = await fetchImpl(`${origin}/rest/owner/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'coding-native@example.test', firstName: 'Synthetic', lastName: 'Owner', password: `SyntheticA9!${randomUUID()}` }) }); assert.equal(setup.ok, true);
    const cookie = setup.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ');
    const response = await fetchImpl(`${origin}/rest/api-keys`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ label: 'Disposable approved coding dispatch', expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scopes: ['workflow:create', 'workflow:read', 'workflow:list', 'workflow:delete', 'workflow:activate', 'workflow:deactivate', 'execution:list', 'execution:read', 'credential:create', 'credential:read', 'credential:list', 'credential:delete'] }) }); assert.ok(response.ok);
    const apiKey = (await response.json()).data.rawApiKey, environmentId = `coding-native-${suffix}`;
    const runtime = createSolutionRuntime({ bindings: [{ tenantId: scope.tenantId, userId: scope.userId, id: environmentId, name: 'Local coding dispatch', region: 'local', origin, apiKey, useIdToken: false, nativePolicy: policy }], allowLocalHttp: true, fetchImpl });
    const launcher = createCodingN8nLauncher({ runtime, store, environmentId, origin: brokerOrigin });
    const service = createCodingWorkerService({ repository, store, sandbox, signingKey, launcher });
    let job = (await service.create(scope, scope.solutionId, { runId: scope.runId, proposal }, randomUUID())).job;
    job = (await service.approve(scope, scope.solutionId, job.id, { runId: scope.runId, expectedVersion: job.rowVersion, specHash: job.specHash }, randomUUID())).job;
    const launched = await service.runReviewed(scope, scope.solutionId, job.id, { runId: scope.runId, expectedVersion: job.rowVersion, specHash: job.specHash }, randomUUID());
    assert.equal(launched.orchestration.status, 'accepted', JSON.stringify(launched.orchestration)); assert.ok(launched.orchestration.executionId);
    assert.equal(launched.job.status, 'queued'); assert.equal(launched.orchestration.credentialCleanup, 'removed'); assert.equal(launched.orchestration.workflowCleanup, 'removed');
    assert.equal((await workerService().advanceOne()).status, 'succeeded');
    const done = (await service.read(scope, scope.solutionId, job.id, { runId: scope.runId })).job;
    assert.equal(done.artifacts[0].content, proposal.changes[0].content); assert.equal(done.evidence.command.exitCode, 0);
    assert.equal(done.orchestration.evidence.executionId, launched.orchestration.executionId);
    assert.ok(!JSON.stringify(done).includes(signingKey.toString('base64'))); assert.ok(!JSON.stringify(done).includes(apiKey));
    console.log(JSON.stringify({ nativeN8nExecution: true, nativeExecutionId: launched.orchestration.executionId, durableJob: done.id, status: done.status,
      sourceHash: done.sourceHash, artifactHash: done.artifacts[0].hash, credentialCleanup: 'removed', workflowCleanup: 'removed', sandboxCleanup: done.evidence.cleanup.status }));
  } finally {
    if (nativeStarted) docker(['rm', '-f', n8n]); if (brokerStarted) docker(['rm', '-f', broker]);
    if (pgJoined) docker(['network', 'disconnect', network, postgresContainer]); if (networkMade) docker(['network', 'rm', network]);
  }
}
