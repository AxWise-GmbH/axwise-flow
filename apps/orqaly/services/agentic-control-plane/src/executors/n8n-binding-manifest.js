import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  CANONICALIZATION_ALGORITHM,
  canonicalJson,
  canonicalJsonSha256,
} from '../domain/canonical.js';
import { N8N_CONNECTOR_REQUEST_FIELDS } from '../domain/runtime-contracts.js';

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const VersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const CanonicalKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const DescriptorKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
const StepKindSchema = z.enum(['connector_read', 'connector_write', 'notify']);
const DigestPinnedImageSchema = z
  .string()
  .regex(
    /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+(?::[A-Za-z0-9._-]+)?@sha256:[a-f0-9]{64}$/,
    'n8n runtime image must use a fully-qualified sha256 digest pin'
  );
const SafeRelativeWorkflowPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^workflows\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/)
  .refine((value) => !value.split('/').includes('..'), 'workflow path cannot traverse directories');
const HttpsAudienceSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => new URL(value).protocol === 'https:', 'Tool Gateway audience must use HTTPS');
const ServiceAccountEmailSchema = z
  .string()
  .email()
  .max(320)
  .refine(
    (value) => value.endsWith('.iam.gserviceaccount.com'),
    'Tool Gateway subject must be a Google service account'
  );
const ToolGatewayUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    const url = new URL(value);
    const isPinnedLocalGateway =
      url.protocol === 'http:' && url.hostname === 'tool-gateway' && url.port === '8080';
    if (
      (url.protocol !== 'https:' && !isPinnedLocalGateway) ||
      url.pathname !== '/v1/effects/execute' ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Tool Gateway URL must be the fixed HTTPS execution endpoint or the pinned local gateway',
      });
    }
  });
const MetadataIdentityUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    const url = new URL(value);
    const queryKeys = [...url.searchParams.keys()];
    if (
      url.protocol !== 'http:' ||
      url.hostname !== 'metadata.google.internal' ||
      url.port ||
      url.pathname !== '/computeMetadata/v1/instance/service-accounts/default/identity' ||
      queryKeys.length !== 1 ||
      queryKeys[0] !== 'audience' ||
      !url.searchParams.get('audience') ||
      url.hash
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'metadata identity URL must target the exact GCP service-account identity endpoint',
      });
    }
  });

export function n8nConnectorRequestBodyExpression(source = '$json.body') {
  const properties = N8N_CONNECTOR_REQUEST_FIELDS.map(
    (field) => `${field}:${source}.${field}`
  ).join(',');
  return `={{ JSON.stringify({${properties}}) }}`;
}

function sortedUniqueStrings(schema, maximum, message) {
  return z
    .array(schema)
    .min(1)
    .max(maximum)
    .superRefine((values, context) => {
      const canonical = [...new Set(values)].sort();
      if (
        canonical.length !== values.length ||
        canonical.some((value, index) => value !== values[index])
      ) {
        context.addIssue({ code: 'custom', message });
      }
    });
}

const DescriptorRefSchema = z
  .object({
    contractVersion: z.literal('1.0'),
    descriptorKey: DescriptorKeySchema,
    schemaVersion: VersionSchema,
    contentHash: HashSchema,
  })
  .strict();

const ExecutorBindingRefSchema = z
  .object({
    contractVersion: z.literal('1.0'),
    bindingKey: CanonicalKeySchema,
    bindingVersion: VersionSchema,
    contentHash: HashSchema,
  })
  .strict();

const RuntimeSchema = z
  .object({
    image: DigestPinnedImageSchema,
    mode: z.literal('regular'),
    concurrency: z.literal(1),
    retriesOwnedBy: z.literal('orqaly_control_plane'),
    auditSourceOfTruth: z.literal('orqaly_cloud_sql'),
  })
  .strict();

const BindingSchema = z
  .object({
    contractVersion: z.literal('1.0'),
    bindingKey: CanonicalKeySchema,
    bindingVersion: VersionSchema,
    contentHash: HashSchema,
    workflowFile: SafeRelativeWorkflowPathSchema,
    workflowContentHash: HashSchema,
    workflowVersionId: z.string().uuid(),
    webhookPath: CanonicalKeySchema,
    gatewayIdentityMode: z.enum(['forwarded_workload_token_v1', 'n8n_gcp_metadata_v1']).optional(),
    metadataIdentityUrl: MetadataIdentityUrlSchema.optional(),
    toolGatewayUrl: ToolGatewayUrlSchema,
    toolGatewayAudience: HttpsAudienceSchema,
    toolGatewayExpectedSubject: ServiceAccountEmailSchema.optional(),
    acceptedStepKinds: sortedUniqueStrings(
      StepKindSchema,
      3,
      'accepted n8n step kinds must be sorted and unique'
    ),
    providerAccess: z.literal('forbidden'),
    credentialAccess: z.literal('opaque_grant_only'),
    executionDataRetention: z.literal('none'),
  })
  .strict()
  .superRefine((binding, context) => {
    const mode = binding.gatewayIdentityMode || 'forwarded_workload_token_v1';
    if (mode === 'n8n_gcp_metadata_v1') {
      if (!binding.metadataIdentityUrl) {
        context.addIssue({
          code: 'custom',
          path: ['metadataIdentityUrl'],
          message: 'GCP metadata identity mode requires the fixed metadata identity URL',
        });
      } else if (
        new URL(binding.metadataIdentityUrl).searchParams.get('audience') !==
        binding.toolGatewayAudience
      ) {
        context.addIssue({
          code: 'custom',
          path: ['metadataIdentityUrl'],
          message: 'metadata identity audience must equal the pinned Tool Gateway audience',
        });
      }
      if (!binding.toolGatewayExpectedSubject) {
        context.addIssue({
          code: 'custom',
          path: ['toolGatewayExpectedSubject'],
          message: 'GCP metadata identity mode requires the exact n8n service-account subject',
        });
      }
      if (new URL(binding.toolGatewayUrl).protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: ['toolGatewayUrl'],
          message: 'GCP metadata identity mode requires an HTTPS Tool Gateway URL',
        });
      }
    } else if (binding.metadataIdentityUrl || binding.toolGatewayExpectedSubject) {
      context.addIssue({
        code: 'custom',
        message: 'forwarded workload identity mode cannot declare n8n metadata identity fields',
      });
    }
  });

const DescriptorBindingSchema = z
  .object({
    descriptor: DescriptorRefSchema,
    executorBinding: ExecutorBindingRefSchema,
    acceptedStepKinds: sortedUniqueStrings(
      StepKindSchema,
      3,
      'descriptor binding step kinds must be sorted and unique'
    ),
  })
  .strict();

const ManifestSchema = z
  .object({
    version: z.literal('orqaly_n8n_executor_bindings_v1'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    manifestHash: HashSchema,
    runtime: RuntimeSchema,
    bindings: z.array(BindingSchema).min(1).max(50),
    descriptorBindings: z.array(DescriptorBindingSchema).max(1_000),
  })
  .strict();

export class N8nBindingManifestError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.name = 'N8nBindingManifestError';
    this.code = code;
    this.details = details;
  }
}

function bindingWithoutHash(binding) {
  const { contentHash: _contentHash, ...payload } = binding;
  return payload;
}

export function n8nBindingHashPayload(manifest, binding) {
  return {
    version: 'orqaly_n8n_executor_binding_v1',
    canonicalization: manifest.canonicalization,
    runtime: manifest.runtime,
    binding: bindingWithoutHash(binding),
  };
}

export function n8nBindingContentHash(manifest, binding) {
  return canonicalJsonSha256(n8nBindingHashPayload(manifest, binding));
}

export function n8nBindingManifestHashPayload(manifest) {
  const { manifestHash: _manifestHash, ...payload } = manifest;
  return payload;
}

export function n8nBindingManifestContentHash(manifest) {
  return canonicalJsonSha256(n8nBindingManifestHashPayload(manifest));
}

function descriptorBindingIdentity(entry) {
  return canonicalJson(entry);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function parseN8nBindingManifest(rawManifest) {
  const manifest = ManifestSchema.parse(rawManifest);
  const bindingIdentities = manifest.bindings.map(
    (binding) => `${binding.contractVersion}:${binding.bindingKey}:${binding.bindingVersion}`
  );
  if (new Set(bindingIdentities).size !== bindingIdentities.length) {
    throw new N8nBindingManifestError('n8n_binding_identity_duplicate');
  }
  for (const binding of manifest.bindings) {
    if (binding.contentHash !== n8nBindingContentHash(manifest, binding)) {
      throw new N8nBindingManifestError('n8n_binding_content_hash_mismatch', {
        bindingKey: binding.bindingKey,
        bindingVersion: binding.bindingVersion,
      });
    }
  }
  const registeredBindingRefs = new Set(
    manifest.bindings.map((binding) =>
      canonicalJson({
        contractVersion: binding.contractVersion,
        bindingKey: binding.bindingKey,
        bindingVersion: binding.bindingVersion,
        contentHash: binding.contentHash,
      })
    )
  );
  const descriptorBindingIdentities = manifest.descriptorBindings.map(descriptorBindingIdentity);
  if (new Set(descriptorBindingIdentities).size !== descriptorBindingIdentities.length) {
    throw new N8nBindingManifestError('n8n_descriptor_binding_duplicate');
  }
  for (const entry of manifest.descriptorBindings) {
    if (!registeredBindingRefs.has(canonicalJson(entry.executorBinding))) {
      throw new N8nBindingManifestError('n8n_descriptor_binding_references_unknown_executor', {
        descriptorKey: entry.descriptor.descriptorKey,
      });
    }
    const binding = manifest.bindings.find(
      (candidate) =>
        canonicalJson(entry.executorBinding) ===
        canonicalJson({
          contractVersion: candidate.contractVersion,
          bindingKey: candidate.bindingKey,
          bindingVersion: candidate.bindingVersion,
          contentHash: candidate.contentHash,
        })
    );
    if (entry.acceptedStepKinds.some((stepKind) => !binding.acceptedStepKinds.includes(stepKind))) {
      throw new N8nBindingManifestError('n8n_descriptor_step_kind_exceeds_executor_binding', {
        descriptorKey: entry.descriptor.descriptorKey,
      });
    }
  }
  if (manifest.manifestHash !== n8nBindingManifestContentHash(manifest)) {
    throw new N8nBindingManifestError('n8n_binding_manifest_hash_mismatch');
  }
  return deepFreeze(manifest);
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function objectContainsKey(value, prohibitedKey) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((entry) => objectContainsKey(entry, prohibitedKey));
  }
  return (
    Object.hasOwn(value, prohibitedKey) ||
    Object.values(value).some((entry) => objectContainsKey(entry, prohibitedKey))
  );
}

function assertWorkflowMatchesBinding(workflow, binding) {
  const gatewayIdentityMode = binding.gatewayIdentityMode || 'forwarded_workload_token_v1';
  if (workflow.versionId !== binding.workflowVersionId) {
    throw new N8nBindingManifestError('n8n_workflow_version_mismatch');
  }
  if (workflow.active !== false) {
    throw new N8nBindingManifestError('n8n_workflow_must_ship_inactive');
  }
  if (workflow.meta?.orqalyBinding !== binding.bindingKey) {
    throw new N8nBindingManifestError('n8n_workflow_binding_identity_mismatch');
  }
  if (workflow.meta?.toolGatewayAudience !== binding.toolGatewayAudience) {
    throw new N8nBindingManifestError('n8n_workflow_gateway_audience_mismatch');
  }
  if (objectContainsKey(workflow, 'credentials')) {
    throw new N8nBindingManifestError('n8n_workflow_credentials_forbidden');
  }
  const permittedNodeTypes = new Set([
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.httpRequest',
    'n8n-nodes-base.respondToWebhook',
  ]);
  if (
    !Array.isArray(workflow.nodes) ||
    workflow.nodes.some((node) => !permittedNodeTypes.has(node.type) || node.retryOnFail === true)
  ) {
    throw new N8nBindingManifestError('n8n_workflow_node_policy_forbidden');
  }
  const webhookNodes = workflow.nodes?.filter((node) => node.type === 'n8n-nodes-base.webhook');
  if (webhookNodes?.length !== 1 || webhookNodes[0].parameters?.path !== binding.webhookPath) {
    throw new N8nBindingManifestError('n8n_workflow_webhook_mismatch');
  }
  const httpNodes = workflow.nodes?.filter((node) => node.type === 'n8n-nodes-base.httpRequest');
  const responseNodes = workflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.respondToWebhook'
  );
  if (
    responseNodes.length !== 1 ||
    responseNodes[0].parameters?.respondWith !== 'firstIncomingItem' ||
    responseNodes[0].parameters?.responseBody !== undefined ||
    responseNodes[0].parameters?.options?.responseCode !== 200
  ) {
    throw new N8nBindingManifestError('n8n_workflow_receipt_passthrough_required');
  }
  const gatewayNodes = httpNodes?.filter((node) => node.name === 'Fixed Internal Tool Gateway');
  if (
    gatewayNodes?.length !== 1 ||
    gatewayNodes[0].parameters?.url !== binding.toolGatewayUrl ||
    gatewayNodes[0].retryOnFail !== false ||
    gatewayNodes[0].onError !== 'stopWorkflow'
  ) {
    throw new N8nBindingManifestError('n8n_workflow_gateway_policy_mismatch');
  }
  const gatewayParameters = gatewayNodes[0].parameters || {};
  const webhookBodySource =
    gatewayIdentityMode === 'n8n_gcp_metadata_v1'
      ? "$('Private Orqaly Dispatch').item.json.body"
      : '$json.body';
  if (
    gatewayParameters.sendHeaders !== true ||
    gatewayParameters.sendBody !== true ||
    gatewayParameters.contentType !== 'raw' ||
    gatewayParameters.rawContentType !== 'application/json' ||
    gatewayParameters.body !== n8nConnectorRequestBodyExpression(webhookBodySource) ||
    gatewayParameters.options?.allowUnauthorizedCerts !== false ||
    gatewayParameters.options?.redirect?.redirect?.followRedirects !== false ||
    gatewayParameters.options?.response?.response?.fullResponse !== false ||
    gatewayParameters.options?.response?.response?.neverError !== false ||
    gatewayParameters.options?.response?.response?.responseFormat !== 'json' ||
    gatewayParameters.options?.timeout !== 20_000
  ) {
    throw new N8nBindingManifestError('n8n_workflow_projection_policy_mismatch');
  }
  const headerEntries = gatewayParameters.headerParameters?.parameters;
  if (!Array.isArray(headerEntries) || headerEntries.length !== 4) {
    throw new N8nBindingManifestError('n8n_workflow_gateway_authorization_mismatch');
  }
  const headers = new Map(
    headerEntries.map((header) => [String(header.name).toLowerCase(), header.value])
  );
  const webhookHeaderSource =
    gatewayIdentityMode === 'n8n_gcp_metadata_v1'
      ? "$('Private Orqaly Dispatch').item.json.headers"
      : '$json.headers';
  const expectedGatewayAuthorization =
    gatewayIdentityMode === 'n8n_gcp_metadata_v1'
      ? "={{ 'Bearer ' + $json.data }}"
      : "={{ $json.headers['x-orqaly-tool-gateway-authorization'] }}";
  if (
    headers.size !== 4 ||
    headers.get('content-type') !== 'application/json' ||
    headers.get('x-orqaly-request-id') !== `={{ ${webhookHeaderSource}['x-orqaly-request-id'] }}` ||
    headers.get('idempotency-key') !== `={{ ${webhookHeaderSource}['idempotency-key'] }}` ||
    headers.get('authorization') !== expectedGatewayAuthorization
  ) {
    throw new N8nBindingManifestError('n8n_workflow_gateway_authorization_mismatch');
  }
  const metadataNodes = httpNodes?.filter((node) => node.name === 'Acquire n8n Workload Identity');
  if (gatewayIdentityMode === 'n8n_gcp_metadata_v1') {
    const metadata = metadataNodes?.[0];
    const metadataHeaders = metadata?.parameters?.headerParameters?.parameters;
    if (
      httpNodes.length !== 2 ||
      metadataNodes.length !== 1 ||
      metadata.parameters?.url !== binding.metadataIdentityUrl ||
      metadata.parameters?.sendHeaders !== true ||
      metadata.parameters?.sendBody === true ||
      metadata.retryOnFail !== false ||
      metadata.onError !== 'stopWorkflow' ||
      !Array.isArray(metadataHeaders) ||
      metadataHeaders.length !== 1 ||
      String(metadataHeaders[0].name).toLowerCase() !== 'metadata-flavor' ||
      metadataHeaders[0].value !== 'Google' ||
      metadata.parameters?.options?.redirect?.redirect?.followRedirects !== false ||
      metadata.parameters?.options?.response?.response?.responseFormat !== 'text' ||
      metadata.parameters?.options?.response?.response?.fullResponse !== false ||
      metadata.parameters?.options?.response?.response?.neverError !== false ||
      metadata.parameters?.options?.timeout !== 5_000
    ) {
      throw new N8nBindingManifestError('n8n_workflow_metadata_identity_policy_mismatch');
    }
  } else if (httpNodes.length !== 1 || metadataNodes?.length !== 0) {
    throw new N8nBindingManifestError('n8n_workflow_metadata_identity_forbidden');
  }
  const expectedConnections =
    gatewayIdentityMode === 'n8n_gcp_metadata_v1'
      ? {
          'Private Orqaly Dispatch': {
            main: [[{ node: 'Acquire n8n Workload Identity', type: 'main', index: 0 }]],
          },
          'Acquire n8n Workload Identity': {
            main: [[{ node: 'Fixed Internal Tool Gateway', type: 'main', index: 0 }]],
          },
          'Fixed Internal Tool Gateway': {
            main: [[{ node: 'Return Gateway Receipt', type: 'main', index: 0 }]],
          },
        }
      : {
          'Private Orqaly Dispatch': {
            main: [[{ node: 'Fixed Internal Tool Gateway', type: 'main', index: 0 }]],
          },
          'Fixed Internal Tool Gateway': {
            main: [[{ node: 'Return Gateway Receipt', type: 'main', index: 0 }]],
          },
        };
  if (canonicalJson(workflow.connections) !== canonicalJson(expectedConnections)) {
    throw new N8nBindingManifestError('n8n_workflow_connection_policy_mismatch');
  }
  const settings = workflow.settings || {};
  if (settings.executionTimeout !== 30) {
    throw new N8nBindingManifestError('n8n_workflow_execution_timeout_mismatch');
  }
  if (
    settings.saveDataErrorExecution !== 'none' ||
    settings.saveDataSuccessExecution !== 'none' ||
    settings.saveManualExecutions !== false ||
    settings.saveExecutionProgress !== false
  ) {
    throw new N8nBindingManifestError('n8n_workflow_execution_retention_forbidden');
  }
}

export async function loadN8nBindingManifest(manifestPath) {
  const manifestBytes = await readFile(manifestPath);
  const manifest = parseN8nBindingManifest(JSON.parse(manifestBytes.toString('utf8')));
  const manifestDirectory = path.dirname(path.resolve(manifestPath));
  for (const binding of manifest.bindings) {
    const workflowPath = path.resolve(manifestDirectory, binding.workflowFile);
    if (!workflowPath.startsWith(`${manifestDirectory}${path.sep}`)) {
      throw new N8nBindingManifestError('n8n_workflow_path_outside_manifest_root');
    }
    const workflowBytes = await readFile(workflowPath);
    if (sha256Bytes(workflowBytes) !== binding.workflowContentHash) {
      throw new N8nBindingManifestError('n8n_workflow_content_hash_mismatch', {
        workflowFile: binding.workflowFile,
      });
    }
    let workflow;
    try {
      workflow = JSON.parse(workflowBytes.toString('utf8'));
    } catch (error) {
      throw new N8nBindingManifestError('n8n_workflow_json_invalid', {
        workflowFile: binding.workflowFile,
        cause: error,
      });
    }
    assertWorkflowMatchesBinding(workflow, binding);
  }
  return manifest;
}

export function selectN8nBinding(manifest, { bindingKey, bindingVersion }) {
  const parsed = parseN8nBindingManifest(manifest);
  const binding = parsed.bindings.find(
    (candidate) =>
      candidate.bindingKey === bindingKey && candidate.bindingVersion === bindingVersion
  );
  if (!binding) throw new N8nBindingManifestError('n8n_executor_binding_not_registered');
  return { manifest: parsed, binding };
}

export function assertN8nDescriptorBinding(manifest, binding, envelope) {
  const envelopeBinding = envelope.executorBinding;
  if (
    envelopeBinding.contractVersion !== binding.contractVersion ||
    envelopeBinding.bindingKey !== binding.bindingKey ||
    envelopeBinding.bindingVersion !== binding.bindingVersion ||
    envelopeBinding.contentHash !== binding.contentHash
  ) {
    throw new N8nBindingManifestError('n8n_executor_binding_not_permitted');
  }
  const permitted = manifest.descriptorBindings.some(
    (entry) =>
      canonicalJson(entry.executorBinding) === canonicalJson(envelopeBinding) &&
      canonicalJson(entry.descriptor) === canonicalJson(envelope.descriptor) &&
      entry.acceptedStepKinds.includes(envelope.stepKind)
  );
  if (!permitted) {
    throw new N8nBindingManifestError('n8n_descriptor_binding_not_permitted');
  }
}
