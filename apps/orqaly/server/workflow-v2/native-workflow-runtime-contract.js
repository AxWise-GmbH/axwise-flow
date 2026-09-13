import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { isBoundedNativeJson } from '../../shared/workflow-v2/native-workflow-contracts.js';

export const NATIVE_RUNTIME_CONTRACT = 'orqaly.native-webhook.v2';
export const NATIVE_EXECUTION_HEADER = 'x-orqaly-execution-id';
export const NATIVE_INVOCATION_HEADER = 'x-orqaly-invocation-id';
export const NATIVE_OUTBOUND_DELIVERY_HEADER = 'x-orqaly-outbound-delivery';
export const NATIVE_OUTBOUND_CONNECTION_HEADER = 'x-orqaly-outbound-connection-id';
export const NATIVE_WORKFLOW_SETTINGS = Object.freeze({
  executionOrder: 'v1',
  executionTimeout: 30,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none',
  saveManualExecutions: false,
  availableInMCP: false,
});

function correlationHeaders(triggerName) {
  return [
    { name: NATIVE_EXECUTION_HEADER, value: '={{ $execution.id }}' },
    {
      name: NATIVE_INVOCATION_HEADER,
      value: `={{ $(${JSON.stringify(triggerName)}).first().json.headers[${JSON.stringify(NATIVE_INVOCATION_HEADER)}] }}`,
    },
  ];
}

// Only transport/lifecycle metadata is normalized. Business nodes, graph and
// responseBody remain the model/customer's real native workflow, not a template.
export function normalizeNativeWorkflow({ workflow, id, controlledTest = false }) {
  z.uuid().parse(id);
  if (!isBoundedNativeJson(workflow) || !Array.isArray(workflow?.nodes))
    throw new Error('native_workflow_not_bounded');
  if (workflow.active !== undefined && workflow.active !== false)
    throw new Error('native_workflow_activation_not_authorized');
  const allowed = new Set([
    'name',
    'nodes',
    'connections',
    'settings',
    'active',
    'pinData',
    'staticData',
    'meta',
    'tags',
    'nodeGroups',
    'description',
  ]);
  if (Object.keys(workflow).some((key) => !allowed.has(key)))
    throw new Error('native_workflow_field_not_supported');
  // Empty native-editor defaults carry no artifact semantics. Never hide
  // customer state or edits by stripping a nonempty value before validation.
  for (const key of ['pinData', 'staticData', 'meta'])
    if (
      workflow[key] != null &&
      (typeof workflow[key] !== 'object' ||
        Array.isArray(workflow[key]) ||
        Object.keys(workflow[key]).length)
    )
      throw new Error('native_workflow_hidden_state_not_supported');
  for (const key of ['tags', 'nodeGroups'])
    if (workflow[key] != null && (!Array.isArray(workflow[key]) || workflow[key].length))
      throw new Error('native_workflow_metadata_not_supported');
  if (workflow.description != null && workflow.description !== '')
    throw new Error('native_workflow_metadata_not_supported');
  if (typeof workflow.name !== 'string' || !workflow.name.trim() || workflow.name.length > 120)
    throw new Error('native_workflow_name_invalid');
  if (
    workflow.settings != null &&
    (typeof workflow.settings !== 'object' || Array.isArray(workflow.settings))
  )
    throw new Error('native_workflow_settings_invalid');
  const value = structuredClone(workflow);
  const triggers = value.nodes.filter((node) => node.type === 'n8n-nodes-base.webhook');
  // Other profiles can still be designed and viewed. Execution capability checks
  // separately prevent staging/publishing an autonomous trigger prematurely.
  if (triggers.length === 1) {
    const trigger = triggers[0];
    trigger.webhookId = id;
    trigger.parameters = {
      ...trigger.parameters,
      path: `solution-${id}`,
      httpMethod: 'POST',
      responseMode: 'responseNode',
    };
    const outbound = value.nodes.filter((node) => node.type === 'CUSTOM.boundedHttp');
    const outboundHeaders =
      outbound.length === 1
        ? [
            {
              name: NATIVE_OUTBOUND_DELIVERY_HEADER,
              value: `={{ $(${JSON.stringify(outbound[0].name)}).first().json.delivery }}`,
            },
            {
              name: NATIVE_OUTBOUND_CONNECTION_HEADER,
              value: `={{ $(${JSON.stringify(outbound[0].name)}).first().json.connectionId }}`,
            },
          ]
        : [];
    const reserved = new Set([
      NATIVE_EXECUTION_HEADER,
      NATIVE_INVOCATION_HEADER,
      NATIVE_OUTBOUND_DELIVERY_HEADER,
      NATIVE_OUTBOUND_CONNECTION_HEADER,
    ]);
    for (const node of value.nodes.filter(
      (item) => item.type === 'n8n-nodes-base.respondToWebhook'
    )) {
      const options = { ...node.parameters?.options };
      const entries = options.responseHeaders?.entries ?? [];
      if (
        !Array.isArray(entries) ||
        entries.some(
          (entry) =>
            !entry ||
            typeof entry.name !== 'string' ||
            typeof entry.value !== 'string' ||
            Object.keys(entry).some((key) => !['name', 'value'].includes(key))
        )
      )
        throw new Error('native_response_headers_invalid');
      options.responseHeaders = {
        entries: [
          ...entries.filter(
            (entry) => typeof entry?.name === 'string' && !reserved.has(entry.name.toLowerCase())
          ),
          ...correlationHeaders(trigger.name),
          ...outboundHeaders,
        ],
      };
      node.parameters = { ...node.parameters, options };
    }
  }
  // Server-managed fields from the native editor are not part of the artifact
  // accepted by the public workflow API. Do not silently drop business settings.
  const safe = {
    name: value.name,
    nodes: value.nodes,
    connections: value.connections ?? {},
    settings: { ...value.settings, ...NATIVE_WORKFLOW_SETTINGS },
  };
  if (controlledTest) {
    safe.name = `Orqaly test ${id}`;
    // Narrowly scoped to this disposable test artifact. The runtime reads only
    // this owned test's bounded diagnostics and removes it after capture.
    safe.settings.saveDataErrorExecution = value.nodes.some(
      (node) => node.type === 'CUSTOM.boundedHttp'
    )
      ? 'none'
      : 'all';
  }
  return { workflow: safe, workflowHash: hash(safe) };
}

export function assertNativeTransportBindings({ workflow, id, controlledTest = false }) {
  const normalized = normalizeNativeWorkflow({ workflow, id, controlledTest }).workflow;
  if (hash(normalized) !== hash(workflow)) throw new Error('native_transport_binding_changed');
  const triggers = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.webhook');
  if (
    triggers.length !== 1 ||
    !workflow.nodes.some((node) => node.type === 'n8n-nodes-base.respondToWebhook')
  )
    throw new Error('native_request_trigger_required');
}

export function nativeCandidateFingerprint({
  workflow,
  spec,
  runtimePolicy,
  connections = [],
  dependencies = [],
}) {
  return hash({
    version: NATIVE_RUNTIME_CONTRACT,
    workflow,
    spec,
    runtimePolicy,
    connections: [...connections]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, environment_id, credential_type, provider_credential_id, scope }) => ({
        id,
        environmentId: environment_id,
        credentialType: credential_type,
        providerCredentialId: provider_credential_id,
        scope,
      })),
    dependencies,
  });
}
