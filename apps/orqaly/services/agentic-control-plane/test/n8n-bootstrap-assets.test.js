import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function repositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

test('n8n bootstrap is a one-shot, private, fail-closed manifest reconciliation job', async () => {
  const [compose, dockerfile, bootstrap, manifestText] = await Promise.all([
    repositoryFile('infra/n8n/compose.yaml'),
    repositoryFile('infra/n8n/bootstrap.Dockerfile'),
    repositoryFile('infra/n8n/bootstrap.mjs'),
    repositoryFile('infra/n8n/executor-bindings.json'),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.deepEqual(manifest.descriptorBindings, []);
  assert.match(compose, /N8N_PUBLIC_API_DISABLED: 'false'/);
  assert.match(compose, /N8N_PUBLIC_API_SWAGGERUI_DISABLED: 'true'/);
  assert.match(compose, /N8N_DISABLE_UI: \$\{N8N_DISABLE_UI:-true\}/);
  assert.match(compose, /N8N_API_BASE_URL: http:\/\/n8n:5678\/api\/v1\//);
  assert.match(compose, /N8N_API_KEY: \$\{N8N_API_KEY:\?set N8N_API_KEY\}/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(dockerfile, /node:22\.22\.0-alpine3\.23@sha256:[a-f0-9]{64}/);
  assert.equal(dockerfile.includes('COPY services/agentic-control-plane/src ./'), false);
  assert.match(dockerfile, /ENTRYPOINT \["node", "infra\/n8n\/bootstrap\.mjs"\]/);
  assert.match(dockerfile, /CMD \["reconcile"\]/);
  assert.match(bootstrap, /loadN8nWorkflowAllowlist/);
  assert.match(bootstrap, /ensureAllWorkflowsPublished/);
  assert.match(bootstrap, /getAllWorkflowReadiness/);
  assert.equal(bootstrap.includes('console.log(process.env'), false);
  assert.equal(bootstrap.includes('error.stack'), false);
});
