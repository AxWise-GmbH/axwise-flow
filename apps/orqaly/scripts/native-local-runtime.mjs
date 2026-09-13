import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { REQUEST_AUTOMATION_POLICY } from '../server/workflow-v2/native-workflow-review.js';
import { createNativeN8nUpstream } from '../server/workflow-v2/native-editor-upstream.js';

// Synthetic local integration fixture only. Credentials stay in memory, the
// port is loopback-only, and close() targets only the UUID-named owned container.
export async function startNativeLocalRuntime(scope, { fetchImpl = fetch } = {}) {
  const name = `orqaly-native-runtime-${randomUUID().slice(0, 12)}`;
  const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let started = false;
  const close = async () => { if (started) { docker(['rm', '-f', name]); started = false; } };
  try {
    docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5678', '-e', 'N8N_DIAGNOSTICS_ENABLED=false',
      '-e', 'N8N_VERSION_NOTIFICATIONS_ENABLED=false', '-e', 'N8N_TEMPLATES_ENABLED=false', '-e', 'N8N_SECURE_COOKIE=false', 'n8nio/n8n:2.37.10']);
    started = true;
    const port = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5678/tcp") 0).HostPort}}', name]);
    if (!/^[0-9]+$/.test(port)) throw new Error('native_local_port_invalid');
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await fetch(`${origin}/rest/settings`);
        if (response.ok && response.headers.get('content-type')?.includes('application/json') && (await response.json()).data) { ready = true; break; }
      } catch { /* The early health endpoint precedes REST readiness. */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('native_local_readiness_timeout');
    const email = 'native-runtime@example.test'; const password = `SyntheticA9!${randomUUID()}`;
    const setup = await fetch(`${origin}/rest/owner/setup`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, firstName: 'Synthetic', lastName: 'Runtime', password }) });
    if (!setup.ok || !setup.headers.get('content-type')?.includes('application/json')) throw new Error('native_local_owner_setup_failed');
    const cookie = setup.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
    const keyResponse = await fetch(`${origin}/rest/api-keys`, { method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ label: 'Disposable runtime test', expiresAt: Math.floor(Date.now() / 1000) + 3600,
        scopes: ['workflow:create', 'workflow:read', 'workflow:list', 'workflow:delete', 'workflow:activate', 'workflow:deactivate', 'execution:list', 'execution:read'] }) });
    if (!keyResponse.ok) throw new Error('native_local_key_setup_failed');
    const apiKey = (await keyResponse.json()).data.rawApiKey;
    const environmentId = 'native-local-environment';
    const binding = { ...scope, id: environmentId, name: 'Local synthetic n8n', region: 'local', origin, apiKey,
      useIdToken: false, nativePolicy: REQUEST_AUTOMATION_POLICY };
    return { runtime: createSolutionRuntime({ bindings: [binding], allowLocalHttp: true, fetchImpl }), origin, apiKey, environmentId,
      upstream: createNativeN8nUpstream({ origin, email, password, allowLocalHttp: true }), close };
  } catch (error) {
    await close();
    // Do not forward Docker command arguments or owner/key response bodies.
    throw new Error(error?.message?.startsWith('native_local_') ? error.message : 'native_local_fixture_start_failed');
  }
}
