import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  N8nBindingManifestError,
  loadN8nBindingManifest,
  n8nBindingContentHash,
  n8nBindingManifestContentHash,
  n8nConnectorRequestBodyExpression,
  parseN8nBindingManifest,
} from '../src/executors/n8n-binding-manifest.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = path.join(repositoryRoot, 'infra/n8n/executor-bindings.json');

test('deployed n8n manifest verifies its image digest while local Compose stays portable', async () => {
  const manifest = await loadN8nBindingManifest(manifestPath);
  const binding = manifest.bindings[0];
  assert.equal(
    binding.contentHash,
    '90da06a5e27263e11891eff9cc0982546b93d4b7425b7b6f5ca550131b9147ee'
  );
  assert.equal(
    manifest.manifestHash,
    'ee3c76ac1c0a2cb20928e437c082712177276b6587efadbe481e9bfd5d2cc6d2'
  );
  assert.equal(manifest.descriptorBindings.length, 1);
  assert.equal(binding.gatewayIdentityMode, 'n8n_gcp_metadata_v1');
  assert.match(manifest.runtime.image, /@sha256:[a-f0-9]{64}$/);

  const compose = await readFile(path.join(repositoryRoot, 'infra/n8n/compose.yaml'), 'utf8');
  assert.ok(
    compose.includes(
      'image: ${N8N_IMAGE:-docker.io/n8nio/n8n:2.37.10@sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec}'
    )
  );
  assert.equal(compose.includes(`image: ${manifest.runtime.image}`), false);

  const bootstrap = await readFile(
    path.join(repositoryRoot, 'infra/n8n/bootstrap/Dockerfile'),
    'utf8'
  );
  assert.ok(
    bootstrap.startsWith(
      'FROM docker.io/n8nio/n8n:2.37.10@sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec'
    )
  );
  assert.equal(bootstrap.includes('workflow-v2-preview/n8n@sha256:'), false);
});

test('workflow projects only the connector contract and acquires its own workload identity', async () => {
  const workflow = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'infra/n8n/workflows/tool-gateway-connector-v1.json'),
      'utf8'
    )
  );
  const gateway = workflow.nodes.find((node) => node.name === 'Fixed Internal Tool Gateway');
  assert.equal(
    gateway.parameters.body,
    n8nConnectorRequestBodyExpression("$('Private Orqaly Dispatch').item.json.body")
  );
  assert.equal(gateway.parameters.body.includes('JSON.stringify($json.body)'), false);
  for (const privateField of [
    'principalId',
    'agentId',
    'personaVersion',
    'sealedContextReferences',
    'artifactReferences',
    'callbackReference',
  ]) {
    assert.equal(gateway.parameters.body.includes(privateField), false, privateField);
  }
  const headers = new Map(
    gateway.parameters.headerParameters.parameters.map((header) => [header.name, header.value])
  );
  const metadata = workflow.nodes.find((node) => node.name === 'Acquire n8n Workload Identity');
  assert.equal(headers.get('authorization'), "={{ 'Bearer ' + $json.data }}");
  assert.equal(gateway.parameters.options.timeout, 20_000);
  assert.equal(metadata.parameters.options.timeout, 5_000);
  assert.equal(workflow.settings.executionTimeout, 30);
  const response = workflow.nodes.find((node) => node.name === 'Return Gateway Receipt');
  assert.deepEqual(response.parameters, {
    respondWith: 'firstIncomingItem',
    options: { responseCode: 200 },
  });
  assert.equal(JSON.stringify(workflow).includes('x-orqaly-tool-gateway-authorization'), false);
  assert.equal(Object.hasOwn(workflow, 'credentials'), false);
});

test('manifest rejects changed binding policy, mutable images and unknown binding references', async () => {
  const deployed = JSON.parse(await readFile(manifestPath, 'utf8'));

  const changedWebhook = structuredClone(deployed);
  changedWebhook.bindings[0].webhookPath = 'attacker-selected-hook';
  assert.throws(
    () => parseN8nBindingManifest(changedWebhook),
    (error) =>
      error instanceof N8nBindingManifestError && error.code === 'n8n_binding_content_hash_mismatch'
  );

  const mutableImage = structuredClone(deployed);
  mutableImage.runtime.image = 'docker.io/n8nio/n8n:latest';
  assert.throws(() => parseN8nBindingManifest(mutableImage));

  const mismatchedMetadataAudience = structuredClone(deployed);
  mismatchedMetadataAudience.bindings[0].metadataIdentityUrl =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Fother-gateway.agentic.internal';
  mismatchedMetadataAudience.bindings[0].contentHash = n8nBindingContentHash(
    mismatchedMetadataAudience,
    mismatchedMetadataAudience.bindings[0]
  );
  mismatchedMetadataAudience.descriptorBindings[0].executorBinding.contentHash =
    mismatchedMetadataAudience.bindings[0].contentHash;
  mismatchedMetadataAudience.manifestHash = n8nBindingManifestContentHash(
    mismatchedMetadataAudience
  );
  assert.throws(() => parseN8nBindingManifest(mismatchedMetadataAudience));

  const unknownBinding = structuredClone(deployed);
  unknownBinding.descriptorBindings.push({
    descriptor: {
      contractVersion: '1.0',
      descriptorKey: 'record_lookup_v1',
      schemaVersion: '1.0',
      contentHash: 'a'.repeat(64),
    },
    executorBinding: {
      contractVersion: '1.0',
      bindingKey: 'unregistered_connector',
      bindingVersion: '1.0',
      contentHash: 'b'.repeat(64),
    },
    acceptedStepKinds: ['connector_read'],
  });
  unknownBinding.manifestHash = n8nBindingManifestContentHash(unknownBinding);
  assert.throws(
    () => parseN8nBindingManifest(unknownBinding),
    (error) =>
      error instanceof N8nBindingManifestError &&
      error.code === 'n8n_descriptor_binding_references_unknown_executor'
  );
});

test('binding hash covers runtime and workflow pins while manifest hash covers allowlist', async () => {
  const deployed = JSON.parse(await readFile(manifestPath, 'utf8'));
  const originalBindingHash = n8nBindingContentHash(deployed, deployed.bindings[0]);

  const withDescriptor = structuredClone(deployed);
  withDescriptor.descriptorBindings.push({
    descriptor: {
      contractVersion: '1.0',
      descriptorKey: 'record_lookup_v1',
      schemaVersion: '1.0',
      contentHash: 'a'.repeat(64),
    },
    executorBinding: {
      contractVersion: '1.0',
      bindingKey: deployed.bindings[0].bindingKey,
      bindingVersion: deployed.bindings[0].bindingVersion,
      contentHash: deployed.bindings[0].contentHash,
    },
    acceptedStepKinds: ['connector_read'],
  });
  assert.equal(
    n8nBindingContentHash(withDescriptor, withDescriptor.bindings[0]),
    originalBindingHash
  );
  assert.notEqual(n8nBindingManifestContentHash(withDescriptor), deployed.manifestHash);
});
