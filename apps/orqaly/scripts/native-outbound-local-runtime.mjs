import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { createBoundedHttpPolicy } from '../server/workflow-v2/native-workflow-review.js';

// Real pinned n8n + TLS on an INTERNAL Docker network, no internet route or
// private-IP exception. Management uses Docker-exec, not a published public port.
export async function startNativeOutboundLocalRuntime(scope) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const suffix = randomUUID().slice(0, 12);
  const network = `orqaly-outbound-build-${suffix}`,
    n8n = `${network}-n8n`,
    receiver = `${network}-receiver`;
  const temp = mkdtempSync(join(tmpdir(), 'orqaly-outbound-build-tls-'));
  const docker = (args) =>
    execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const image = 'n8nio/n8n:2.37.10';
  let networkCreated = false,
    n8nStarted = false,
    receiverStarted = false;
  const policy = createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` });
  const receiverSecret = `Synthetic-receiver-${randomUUID()}`;
  const origin = 'http://127.0.0.1:5678';
  const close = async () => {
    if (n8nStarted) {
      docker(['rm', '-f', n8n]);
      n8nStarted = false;
    }
    if (receiverStarted) {
      docker(['rm', '-f', receiver]);
      receiverStarted = false;
    }
    if (networkCreated) {
      docker(['network', 'rm', network]);
      networkCreated = false;
    }
  };
  const fetchImpl = async (url, options = {}) => {
    const script =
      'let raw="";process.stdin.on("data",x=>raw+=x);process.stdin.on("end",async()=>{try{const v=JSON.parse(raw);const r=await fetch(v.url,{method:v.method,headers:v.headers,body:v.body,redirect:"error",signal:AbortSignal.timeout(60000)});process.stdout.write(JSON.stringify({status:r.status,headers:[...r.headers],cookies:r.headers.getSetCookie(),body:await r.text()}))}catch{process.exitCode=2}})';
    let value;
    try {
      value = JSON.parse(
        execFileSync('docker', ['exec', '-i', n8n, 'node', '-e', script], {
          encoding: 'utf8',
          input: JSON.stringify({
            url,
            method: options.method ?? 'GET',
            headers: Object.fromEntries(new Headers(options.headers ?? {})),
            body: options.body,
          }),
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      );
    } catch {
      throw new Error('outbound_local_management_unavailable');
    }
    const headers = new Headers(value.headers);
    headers.delete('set-cookie');
    for (const cookie of value.cookies) headers.append('set-cookie', cookie);
    return new Response(value.status === 204 ? null : value.body, {
      status: value.status,
      headers,
    });
  };
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-noenc',
        '-keyout',
        join(temp, 'key.pem'),
        '-out',
        join(temp, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=outbound-fixture.orqaly.example',
        '-addext',
        'subjectAltName=DNS:outbound-fixture.orqaly.example',
      ],
      { stdio: 'ignore' }
    );
    docker(['network', 'create', '--internal', '--subnet', '93.184.217.0/24', network]);
    networkCreated = true;
    docker([
      'run',
      '-d',
      '--pull=never',
      '--name',
      receiver,
      '--network',
      network,
      '--ip',
      '93.184.217.20',
      '--user',
      '0',
      '-v',
      `${temp}:/fixture:ro`,
      '-v',
      `${join(root, 'scripts/fixtures/native-outbound-receiver.cjs')}:/receiver.cjs:ro`,
      '-e',
      `SYNTHETIC_RECEIVER_KEY=${receiverSecret}`,
      '--entrypoint',
      'node',
      image,
      '/receiver.cjs',
    ]);
    receiverStarted = true;
    docker([
      'run',
      '-d',
      '--pull=never',
      '--name',
      n8n,
      '--network',
      network,
      '--ip',
      '93.184.217.21',
      '--add-host',
      'outbound-fixture.orqaly.example:93.184.217.20',
      '-v',
      `${join(root, 'infra/n8n/nodes-orqaly-bounded-http')}:/opt/orqaly-custom/nodes-orqaly-bounded-http:ro`,
      '-v',
      `${join(temp, 'cert.pem')}:/fixture-ca.pem:ro`,
      '-e',
      'NODE_EXTRA_CA_CERTS=/fixture-ca.pem',
      '-e',
      'NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules',
      '-e',
      'N8N_CUSTOM_EXTENSIONS=/opt/orqaly-custom/nodes-orqaly-bounded-http',
      '-e',
      `NODES_INCLUDE=${JSON.stringify([...new Set(policy.allowedNodes.map((node) => node.type))])}`,
      '-e',
      'NODES_EXCLUDE=["n8n-nodes-base.executeCommand","n8n-nodes-base.readWriteFile","n8n-nodes-base.httpRequest","n8n-nodes-base.code"]',
      '-e',
      'N8N_SSRF_PROTECTION_ENABLED=true',
      '-e',
      'N8N_BLOCK_ENV_ACCESS_IN_NODE=true',
      '-e',
      'N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES=true',
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      '-e',
      'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
      '-e',
      'N8N_TEMPLATES_ENABLED=false',
      '-e',
      'N8N_SECURE_COOKIE=false',
      image,
    ]);
    n8nStarted = true;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetchImpl(`${origin}/rest/settings`);
        if (res.ok && (await res.json()).data) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(ready, true, 'outbound_local_n8n_readiness');
    const setup = await fetchImpl(`${origin}/rest/owner/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'outbound-build@example.test',
        firstName: 'Synthetic',
        lastName: 'Owner',
        password: `SyntheticA9!${randomUUID()}`,
      }),
    });
    assert.equal(setup.ok, true, 'outbound_local_owner_setup');
    const cookie = setup.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const keys = await fetchImpl(`${origin}/rest/api-keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        label: 'Disposable durable outbound proof',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        scopes: [
          'workflow:create',
          'workflow:read',
          'workflow:list',
          'workflow:delete',
          'workflow:activate',
          'workflow:deactivate',
          'execution:list',
          'execution:read',
          'credential:create',
          'credential:list',
          'credential:read',
          'credential:delete',
        ],
      }),
    });
    assert.equal(keys.ok, true, 'outbound_local_key_setup');
    const apiKey = (await keys.json()).data.rawApiKey;
    const environmentId = `outbound-build-${suffix}`;
    return {
      runtime: createSolutionRuntime({
        bindings: [
          {
            ...scope,
            id: environmentId,
            name: 'Local bounded outbound',
            region: 'local',
            origin,
            apiKey,
            useIdToken: false,
            nativePolicy: policy,
          },
        ],
        allowLocalHttp: true,
        fetchImpl,
      }),
      environmentId,
      policy,
      receiverCredential: () => ({ name: 'Authorization', value: receiverSecret }),
      receiverProof: () =>
        JSON.parse(
          docker([
            'exec',
            receiver,
            'node',
            '-e',
            'fetch("http://127.0.0.1:8080").then(r=>r.text()).then(console.log)',
          ])
        ),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
