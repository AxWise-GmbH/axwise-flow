import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJsonSha256 } from '../../../services/agentic-control-plane/src/domain/canonical.js';
import { executionDescriptorContentHash } from '../../../services/agentic-control-plane/src/domain/execution-descriptor-registry.js';
import {
  n8nBindingContentHash,
  n8nBindingManifestContentHash,
} from '../../../services/agentic-control-plane/src/executors/n8n-binding-manifest.js';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(directory, 'executor-bindings.json');
const descriptorPath = path.join(directory, 'descriptors/operational-record-create-v1.json');
const inputSchemaPath = path.join(directory, 'schemas/operational-record-create-v1.input.schema.json');
const outputSchemaPath = path.join(directory, 'schemas/operational-record-create-v1.output.schema.json');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
const binding = manifest.bindings.find((candidate) => candidate.bindingKey === 'tool_gateway_connector_v1');
if (!binding) throw new Error('tool_gateway_connector_v1 binding missing');
const workflowBytes = await readFile(path.join(directory, binding.workflowFile));
binding.workflowContentHash = crypto.createHash('sha256').update(workflowBytes).digest('hex');
binding.contentHash = n8nBindingContentHash(manifest, binding);

descriptor.inputSchemaHash = canonicalJsonSha256(JSON.parse(await readFile(inputSchemaPath, 'utf8')));
descriptor.outputSchemaHash = canonicalJsonSha256(JSON.parse(await readFile(outputSchemaPath, 'utf8')));
descriptor.supportedExecutorBindings = [
  {
    contractVersion: binding.contractVersion,
    bindingKey: binding.bindingKey,
    bindingVersion: binding.bindingVersion,
    contentHash: binding.contentHash,
  },
];
descriptor.reference.contentHash = executionDescriptorContentHash(descriptor);

manifest.descriptorBindings = [
  {
    descriptor: descriptor.reference,
    executorBinding: descriptor.supportedExecutorBindings[0],
    acceptedStepKinds: ['connector_write'],
  },
];
manifest.manifestHash = n8nBindingManifestContentHash(manifest);

await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify(
    {
      manifestHash: manifest.manifestHash,
      binding: descriptor.supportedExecutorBindings[0],
      descriptor: descriptor.reference,
      inputSchemaHash: descriptor.inputSchemaHash,
      outputSchemaHash: descriptor.outputSchemaHash,
      workflowContentHash: binding.workflowContentHash,
    },
    null,
    2
  )}\n`
);
