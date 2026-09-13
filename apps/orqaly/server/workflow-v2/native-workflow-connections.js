import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { isBoundedNativeJson } from '../../shared/workflow-v2/native-workflow-contracts.js';
import boundedTransport from '../../infra/n8n/nodes-orqaly-bounded-http/transport.cjs';

// Application-owned credential forms. Neither an LLM question nor a native node
// can supply arbitrary field descriptors, credential IDs, OAuth URLs or API hosts.
// These are scope descriptors, NOT an enabled egress/credential transport. The
// runtime must separately provide an audited bound-credential capability; the
// currently enabled pure runtime denies all of these external node types.
const descriptors = Object.freeze({
  orqalyBoundedHttp: [
    { name: 'name', label: 'Header name', type: 'text', required: true },
    { name: 'value', label: 'API key', type: 'secret', required: true },
  ],
  httpHeaderAuth: [
    { name: 'name', label: 'Header name', type: 'text', required: true },
    { name: 'value', label: 'API key', type: 'secret', required: true },
  ],
  githubApi: [
    { name: 'accessToken', label: 'GitHub access token', type: 'secret', required: true },
  ],
  twilioApi: [
    { name: 'accountSid', label: 'Account SID', type: 'text', required: true },
    { name: 'authToken', label: 'Auth token', type: 'secret', required: true },
  ],
});
const nodeCredentials = Object.freeze({
  'CUSTOM.boundedHttp': 'orqalyBoundedHttp',
  'n8n-nodes-base.httpRequest': 'httpHeaderAuth',
  'n8n-nodes-base.github': 'githubApi',
  'n8n-nodes-base.twilio': 'twilioApi',
});

function publicDestination(value) {
  if (typeof value !== 'string' || value.includes('{{') || value.length > 2000)
    throw new Error('connection_destination_must_be_fixed');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    url.hostname === 'localhost' ||
    !url.hostname.includes('.') ||
    /^(?:\d+\.){3}\d+$/.test(url.hostname) ||
    url.hostname.includes(':') ||
    /(?:^|\.)(?:internal|local|localhost|invalid|test)$/.test(url.hostname)
  )
    throw new Error('connection_public_https_destination_required');
  return url;
}
const fixedText = (value) => {
  const text = typeof value === 'object' && value !== null ? value.value : value;
  if (typeof text !== 'string' || !text || text.length > 500 || text.includes('{{'))
    throw new Error('connection_target_must_be_fixed');
  return text;
};

export function describeNativeConnection({
  requirement,
  workflow,
  connection = null,
  environmentId = null,
}) {
  const result = {
    id: requirement.id,
    nodeIds: requirement.nodeIds,
    service: requirement.provider,
    credentialType: requirement.credentialType,
    status: connection?.status ?? 'missing',
    fields: [],
    canConnect: false,
    reason: 'This connection type requires a supported setup adapter.',
  };
  const nodes = requirement.nodeIds.map((id) => workflow?.nodes?.find((node) => node.id === id));
  if (nodes.some((node) => !node))
    return { ...result, reason: 'The connection refers to a missing workflow node.' };
  const types = new Set(nodes.map((node) => nodeCredentials[node.type]));
  if (
    types.size !== 1 ||
    !types.has(requirement.credentialType) ||
    !descriptors[requirement.credentialType]
  )
    return result;
  try {
    const targets = nodes.map((node) => {
      if (node.type === 'CUSTOM.boundedHttp') {
        const url = boundedTransport.destination(node.parameters.url);
        if (nodes.length !== 1 || node.typeVersion !== 1 || node.parameters.method !== 'POST')
          throw new Error('connection_bounded_operation_invalid');
        return { nodeId: node.id, typeVersion: 1, transportVersion: 1,
          destination: url.href, hostname: url.hostname, method: 'POST', parametersHash: hash(node.parameters) };
      }
      if (node.type === 'n8n-nodes-base.httpRequest') {
        const url = publicDestination(node.parameters.url);
        return {
          nodeId: node.id,
          destination: url.href,
          hostname: url.hostname,
          method: z
            .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
            .parse(node.parameters.method ?? 'GET'),
          parametersHash: hash(node.parameters),
        };
      }
      if (node.type === 'n8n-nodes-base.github')
        return {
          nodeId: node.id,
          hostname: 'api.github.com',
          owner: fixedText(node.parameters.owner),
          repository: fixedText(node.parameters.repository),
          resource: fixedText(node.parameters.resource ?? 'issue'),
          operation: fixedText(node.parameters.operation ?? 'get'),
          // Pin every reviewed parameter, including issue/ref/file target and
          // payload expressions. A changed action requires fresh authorization.
          parametersHash: hash(node.parameters),
        };
      return {
        nodeId: node.id,
        hostname: 'api.twilio.com',
        resource: fixedText(node.parameters.resource ?? 'sms'),
        operation: fixedText(node.parameters.operation ?? 'send'),
        from: fixedText(node.parameters.from),
        to: fixedText(node.parameters.to),
        parametersHash: hash(node.parameters),
      };
    });
    targets.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    const scope = { credentialType: requirement.credentialType, targets };
    const stale =
      connection &&
      (connection.environment_id !== environmentId ||
        connection.credential_type !== requirement.credentialType ||
        hash(connection.scope) !== hash(scope));
    return {
      ...result,
      fields: structuredClone(descriptors[requirement.credentialType]),
      ...(stale ? { status: 'stale' } : {}),
      scope,
      connectionId: connection?.id ?? null,
      canConnect: !!environmentId && !connection,
      reason: stale
        ? 'The destination or operation changed. Revoke the old connection and authorize the new scope.'
        : !environmentId
          ? 'An isolated environment must be assigned before adding a connection.'
          : connection
            ? connection.status === 'verified'
              ? 'Verified for the tested operation.'
              : 'Saved securely. An explicitly approved service test is still required.'
            : 'Connect this service securely; no credential will be sent to the Agent.',
    };
  } catch {
    return {
      ...result,
      reason: 'Choose a fixed service account or public HTTPS destination before connecting.',
    };
  }
}

export function validateNativeCredentialInput(type, input) {
  const fields = descriptors[type];
  if (
    !fields ||
    !isBoundedNativeJson(input, { maxBytes: 24000 }) ||
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    fields.some(
      (field) =>
        typeof input[field.name] !== 'string' ||
        input[field.name].length < 1 ||
        input[field.name].length > 8000 ||
        /[\r\n\0]/.test(input[field.name])
    )
  )
    throw new Error('connection_fields_invalid');
  if (type === 'orqalyBoundedHttp') boundedTransport.validateHeader(input.name, input.value);
  if (
    type === 'httpHeaderAuth' &&
    (!/^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(input.name) ||
      /^(?:host|cookie|set-cookie|content-length|transfer-encoding|connection|proxy-authorization|x-orqaly-.+)$/i.test(
        input.name
      ))
  )
    throw new Error('connection_header_forbidden');
  if (type === 'twilioApi' && !/^AC[a-fA-F0-9]{32}$/.test(input.accountSid))
    throw new Error('connection_account_sid_invalid');
  return Object.fromEntries(fields.map((field) => [field.name, input[field.name]]));
}

export function bindNativeConnections(workflow, spec, connections, environmentId) {
  if (workflow === null) return null;
  if (!isBoundedNativeJson(workflow) || !Array.isArray(workflow.nodes))
    throw new Error('connection_workflow_invalid');
  const bound = structuredClone(workflow);
  const expected = new Map();
  for (const requirement of spec.connections) {
    const connection = connections.find(
      (item) =>
        item.requirement_id === requirement.id && ['saved', 'verified'].includes(item.status)
    );
    if (!connection) continue;
    const described = describeNativeConnection({
      requirement,
      workflow,
      connection,
      environmentId,
    });
    if (
      !['saved', 'verified'].includes(described.status) ||
      !described.scope ||
      !connection.provider_credential_id
    )
      continue;
    for (const nodeId of requirement.nodeIds) {
      if (expected.has(nodeId)) throw new Error('connection_node_binding_ambiguous');
      expected.set(nodeId, {
        type: connection.credential_type,
        id: connection.provider_credential_id,
        name: `Orqaly connection ${connection.id}`,
      });
    }
  }
  for (const node of bound.nodes) {
    const binding = expected.get(node.id);
    // The client/model cannot smuggle its own provider credential selector.
    delete node.credentials;
    if (binding) node.credentials = { [binding.type]: { id: binding.id, name: binding.name } };
  }
  return bound;
}
