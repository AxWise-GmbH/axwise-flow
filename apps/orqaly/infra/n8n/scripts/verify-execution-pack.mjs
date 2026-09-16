import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJsonSha256 } from '../../../services/agentic-control-plane/src/domain/canonical.js';
import { ExecutionDescriptorManifestV1Schema } from '../../../services/agentic-control-plane/src/domain/execution-descriptor-registry.js';
import { loadN8nBindingManifest } from '../../../services/agentic-control-plane/src/executors/n8n-binding-manifest.js';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = await loadN8nBindingManifest(path.join(directory, 'executor-bindings.json'));
const descriptor = ExecutionDescriptorManifestV1Schema.parse(
  JSON.parse(await readFile(path.join(directory, 'descriptors/operational-record-create-v1.json'), 'utf8'))
);
const inputSchema = JSON.parse(
  await readFile(path.join(directory, 'schemas/operational-record-create-v1.input.schema.json'), 'utf8')
);
const outputSchema = JSON.parse(
  await readFile(path.join(directory, 'schemas/operational-record-create-v1.output.schema.json'), 'utf8')
);
const bootstrapDockerfile = await readFile(
  path.join(directory, 'bootstrap/Dockerfile'),
  'utf8'
);
const bootstrapScript = await readFile(path.join(directory, 'bootstrap/bootstrap.sh'), 'utf8');
const cloudBuild = await readFile(path.join(directory, 'cloudbuild.execution.yaml'), 'utf8');
const gatewayDockerfile = await readFile(
  path.join(directory, '../../services/agentic-tool-gateway/Dockerfile'),
  'utf8'
);
const bootstrapBaseImage =
  'docker.io/n8nio/n8n:2.37.10@sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec';

assert.equal(descriptor.inputSchemaHash, canonicalJsonSha256(inputSchema));
assert.equal(descriptor.outputSchemaHash, canonicalJsonSha256(outputSchema));
assert.deepEqual(manifest.descriptorBindings, [
  {
    descriptor: descriptor.reference,
    executorBinding: descriptor.supportedExecutorBindings[0],
    acceptedStepKinds: ['connector_write'],
  },
]);
assert.equal(manifest.bindings[0].gatewayIdentityMode, 'n8n_gcp_metadata_v1');
assert.equal(manifest.bindings[0].toolGatewayExpectedSubject, 'orqaly-n8n-preview@axwise-v2-preview-001.iam.gserviceaccount.com');
assert.ok(bootstrapDockerfile.startsWith(`FROM ${bootstrapBaseImage}\n`));
assert.equal(bootstrapDockerfile.includes('workflow-v2-preview/n8n@sha256:'), false);
assert.ok(bootstrapDockerfile.includes(`${manifest.bindings[0].workflowContentHash}  /opt/orqaly/workflows/tool-gateway-connector-v1.json`));
assert.ok(bootstrapScript.includes(`readonly expected_hash=${manifest.bindings[0].workflowContentHash}`));
assert.ok(bootstrapScript.includes('n8n publish:workflow --id="${workflow_id}"'));
assert.ok(bootstrapScript.includes('n8n unpublish:workflow --id="${workflow_id}"'));
assert.match(
  gatewayDockerfile,
  /^FROM docker\.io\/library\/node:[^\n]+@sha256:[a-f0-9]{64} AS dependencies$/m
);
assert.match(
  gatewayDockerfile,
  /^FROM docker\.io\/library\/node:[^\n]+@sha256:[a-f0-9]{64}$/m
);
assert.ok(cloudBuild.includes('services/agentic-tool-gateway/Dockerfile'));
assert.ok(cloudBuild.includes('infra/n8n/bootstrap/Dockerfile'));
assert.ok(
  cloudBuild.includes(
    'gcr.io/kaniko-project/executor@sha256:9e69fd4330ec887829c780f5126dd80edc663df6def362cd22e79bcdf00ac53f'
  )
);
assert.ok(cloudBuild.includes('--context=dir:///workspace'));
assert.ok(cloudBuild.includes('orqaly-agentic-n8n-bootstrap:${_IMAGE_TAG}'));
assert.ok(cloudBuild.includes('logging: CLOUD_LOGGING_ONLY'));

process.stdout.write(
  `verified ${descriptor.reference.descriptorKey}@${descriptor.reference.contentHash} -> ${manifest.bindings[0].bindingKey}@${manifest.bindings[0].contentHash}\n`
);
