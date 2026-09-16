import { z } from 'zod';
import { GoogleAuth } from 'google-auth-library';
import { canonicalJsonSha256 as canonicalHash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  REQUEST_AUTOMATION_POLICY,
  reviewNativeWorkflow,
  validateNativeWorkflowData,
} from './native-workflow-review.js';
import {
  assertNativeTransportBindings,
  NATIVE_EXECUTION_HEADER,
  NATIVE_INVOCATION_HEADER,
} from './native-workflow-runtime-contract.js';
import { isBoundedNativeJson } from '../../shared/workflow-v2/native-workflow-contracts.js';
import {
  BOUNDED_HTTP_NODE,
  isBoundedHttpPolicy,
  hasNativeOutbound,
} from './native-outbound-policy.js';
import { createBoundedNativeCredentialAdapter } from './native-outbound-credential-adapter.js';
import { createOwnedNativeBundleRuntime } from './native-workflow-bundle-runtime.js';

const NativePolicySchema = z
  .object({
    profile: z.literal(REQUEST_AUTOMATION_POLICY.profile),
    n8nVersion: z.literal(REQUEST_AUTOMATION_POLICY.n8nVersion),
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    allowedNodes: z
      .array(z.object({ type: z.string(), typeVersion: z.number() }).strict())
      .min(1)
      .max(100),
    expressionPolicy: z.literal('pure-data-v1'),
    maxNodes: z.number().int().min(1).max(REQUEST_AUTOMATION_POLICY.maxNodes),
    maxExecutionSeconds: z.number().int().min(1).max(REQUEST_AUTOMATION_POLICY.maxExecutionSeconds),
    egress: z.enum(['deny', 'bounded-https-post-v1']),
    credentials: z.enum(['deny', 'bound']),
    outboundTransportVersion: z.literal(1).optional(),
    outboundPackageHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    code: z.literal(false),
    durableTriggers: z.literal(false),
    ownedErrorHandlers: z.literal(true).optional(),
    ownedErrorHandlerProbe: z.literal(true).optional(),
    backgroundExecution: z.literal('instance_cpu_always').optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.ownedErrorHandlers || value.ownedErrorHandlerProbe) === Boolean(value.backgroundExecution),
    'Owned error handlers require an explicitly verified always-CPU host'
  )
  .refine(
    (value) =>
      (isBoundedHttpPolicy(value) ||
        (value.imageDigest === REQUEST_AUTOMATION_POLICY.imageDigest &&
          value.egress === 'deny' &&
          value.credentials === 'deny' &&
          !value.outboundTransportVersion &&
          !value.outboundPackageHash)) &&
      value.allowedNodes.every(
        (node) =>
          REQUEST_AUTOMATION_POLICY.allowedNodes.some(
            (allowed) => allowed.type === node.type && allowed.typeVersion === node.typeVersion
          ) ||
          (isBoundedHttpPolicy(value) &&
            node.type === BOUNDED_HTTP_NODE.type &&
            node.typeVersion === 1)
      ),
    'Unverified native node permission'
  );

const BindingSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{8,63}$/),
    tenantId: z.uuid(),
    userId: z.string().regex(/^user_[A-Za-z0-9]+$/),
    name: z.string().max(120),
    region: z.string().max(40),
    origin: z.url(),
    apiKey: z.string().min(16),
    useIdToken: z.boolean(),
    nativePolicy: NativePolicySchema.nullable().optional(),
  })
  .strict();
const safeId = (value) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .parse(value);

function verifyStoredWorkflow(actual, desired) {
  // n8n adds these inert defaults when storing an API-created workflow. Every
  // other setting must be part of the approved snapshot, including callbacks,
  // caller policies, retention, and MCP exposure.
  const providerDefaults = { callerPolicy: 'workflowsFromSameOwner', availableInMCP: false };
  for (const [key, value] of Object.entries(actual.settings ?? {})) {
    if (
      !Object.hasOwn(desired.settings, key) &&
      (!Object.hasOwn(providerDefaults, key) || value !== providerDefaults[key])
    )
      throw new Error('solution_workflow_settings_drift');
  }
  const projected = {
    name: actual.name,
    nodes: actual.nodes,
    connections: actual.connections,
    settings: Object.fromEntries(
      Object.keys(desired.settings).map((key) => [key, actual.settings?.[key]])
    ),
  };
  if (canonicalHash(projected) !== canonicalHash(desired))
    throw new Error('solution_workflow_drift');
}

function verifyWorkflow(actual, desired) {
  verifyStoredWorkflow(actual, desired);
  const active = actual.activeVersion;
  if (!active || active.versionId !== actual.versionId)
    throw new Error('solution_workflow_not_published');
  // A provider publishing a different snapshot must never be accepted as ready.
  if (
    canonicalHash(active.nodes) !== canonicalHash(desired.nodes) ||
    canonicalHash(active.connections) !== canonicalHash(desired.connections)
  )
    throw new Error('solution_published_workflow_drift');
}

const executionId = (value) =>
  z
    .string()
    .regex(/^[1-9][0-9]{0,30}$/)
    .parse(value);
const native = (solution) => solution.spec?.kind === 'n8n_workflow_v2';
function nativePermission(
  config,
  workflow,
  spec,
  id,
  controlledTest = false,
  nativeConnections = []
) {
  if (!config.nativePolicy) throw new Error('native_runtime_policy_missing');
  assertNativeTransportBindings({ workflow, id, controlledTest });
  // This one server-authored retention override is limited to disposable tests.
  // All business graph, parameters and other settings remain exactly reviewed.
  const candidate = structuredClone(workflow);
  if (controlledTest) candidate.settings.saveDataErrorExecution = 'none';
  if (
    nativeConnections.some(
      (entry) => entry.tenant_id !== config.tenantId || entry.owner_user_id !== config.userId
    )
  )
    throw new Error('native_connection_scope_denied');
  const review = reviewNativeWorkflow({
    workflow: candidate,
    spec,
    runtimePolicy: config.nativePolicy,
    connections: nativeConnections,
    environmentId: config.id,
  });
  if (!review.valid || !review.execution.allowed)
    throw new Error('native_runtime_capability_denied');
}

function nativeInput(spec, input) {
  if (!validateNativeWorkflowData({ schema: spec.inputSchema, value: input }).valid)
    throw new Error('native_execution_input_invalid');
}

function deploymentReceipt(actual, workflowHash) {
  return {
    workflowId: safeId(actual.id),
    versionId: safeId(actual.versionId),
    workflowHash,
    verifiedAt: new Date().toISOString(),
    active: actual.active === true,
  };
}

function verifyDeployment(actual, solution, published = false) {
  if (canonicalHash(solution.workflow) !== solution.workflow_hash)
    throw new Error('solution_workflow_hash_mismatch');
  (published ? verifyWorkflow : verifyStoredWorkflow)(actual, solution.workflow);
  if (
    actual.id !== solution.deployment.workflowId ||
    actual.versionId !== solution.deployment.versionId
  )
    throw new Error('solution_deployment_version_changed');
  if (published && actual.active !== true) throw new Error('solution_workflow_not_published');
}

// No raw runData, provider error text, stack, request body or credentials leave
// this adapter. Node IDs/types and fixed error descriptions are useful for repair
// without copying untrusted provider messages into the next model request.
function verifiedExecutionSnapshot(
  execution,
  workflow,
  provider,
  spec,
  runtimePolicy,
  { logicalWorkflow = workflow, workflowRole = 'main' } = {}
) {
  if (!execution || execution.workflowId !== provider.id) return false;
  const snapshot = execution.workflowData;
  // Pinned public executions store the version beside workflowData, not in it.
  if (
    !snapshot ||
    snapshot.id !== provider.id ||
    execution.workflowVersionId !== provider.versionId
  )
    return false;
  // n8n materializes missing native parameter defaults in execution snapshots
  // (for example Webhook.authentication='none'). The immutable version was
  // verified before dispatch; also require every explicitly approved parameter
  // unchanged, with no extra/missing/reordered nodes or array entries. Default
  // expansion must still pass the pinned native parameter schema. This is not
  // accepted for stored workflows or approval artifacts.
  const containsApproved = (actual, approved) => {
    if (Array.isArray(approved))
      return (
        Array.isArray(actual) &&
        actual.length === approved.length &&
        approved.every((value, index) => containsApproved(actual[index], value))
      );
    if (approved && typeof approved === 'object')
      return (
        actual &&
        typeof actual === 'object' &&
        Object.entries(approved).every(
          ([key, value]) => Object.hasOwn(actual, key) && containsApproved(actual[key], value)
        )
      );
    return actual === approved;
  };
  if (!Array.isArray(snapshot.nodes) || snapshot.nodes.length !== workflow.nodes.length)
    return false;
  for (let index = 0; index < workflow.nodes.length; index++) {
    const approved = workflow.nodes[index];
    const actual = snapshot.nodes[index];
    if (
      !containsApproved(actual?.parameters, approved.parameters) ||
      canonicalHash({ ...actual, parameters: approved.parameters }) !== canonicalHash(approved)
    )
      return false;
  }
  try {
    verifyStoredWorkflow({ ...snapshot, nodes: workflow.nodes }, workflow);
  } catch {
    return false;
  }
  const reviewSpec = structuredClone(spec);
  for (const dependency of reviewSpec.ownedDependencies ?? []) {
    dependency.workflow.settings.saveDataErrorExecution = 'none';
    dependency.workflow.settings.saveDataSuccessExecution = 'none';
  }
  const expandedReview = reviewNativeWorkflow({
    workflow: {
      name: workflow.name,
      nodes: snapshot.nodes,
      connections: snapshot.connections,
      settings: {
        ...logicalWorkflow.settings,
        saveDataErrorExecution: 'none',
        saveDataSuccessExecution: 'none',
      },
    },
    spec: reviewSpec,
    runtimePolicy,
    workflowRole,
  });
  return expandedReview.valid && expandedReview.execution.allowed;
}

function capturedFailure(
  execution,
  workflow,
  provider,
  invocationId,
  spec,
  runtimePolicy,
  options
) {
  if (
    execution?.status !== 'error' ||
    !verifiedExecutionSnapshot(execution, workflow, provider, spec, runtimePolicy, options)
  )
    return null;
  const runData = execution.data?.resultData?.runData;
  const trigger = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
  const triggerItems = runData?.[trigger.name]?.flatMap((run) => run.data?.main?.[0] ?? []) ?? [];
  if (!triggerItems.some((item) => item.json?.headers?.[NATIVE_INVOCATION_HEADER] === invocationId))
    return null;
  const executed = workflow.nodes.filter(
    (node) => Array.isArray(runData?.[node.name]) && runData[node.name].length
  );
  const failing = executed.filter((node) =>
    runData[node.name].some((run) => run.error || run.executionStatus === 'error')
  );
  const messages = {
    NodeOperationError: 'n8n could not complete this node operation.',
    ExpressionError: 'n8n could not evaluate a node expression.',
    NodeApiError: 'n8n reported a node request failure.',
  };
  const diagnostics = failing.map((node) => {
    const error = runData[node.name].find((run) => run.error)?.error;
    const typeMismatch =
      typeof error?.message === 'string'
        ? error.message
            .slice(0, 2000)
            .match(
              /is (?:a|an) (string|number|boolean|array|object) but was expecting (?:a|an) (string|number|boolean|array|object)/i
            )
        : null;
    return {
      code: Object.hasOwn(messages, error?.name) ? error.name : 'N8N_NODE_FAILED',
      message: typeMismatch
        ? `n8n expected a ${typeMismatch[2].toLowerCase()} but received a ${typeMismatch[1].toLowerCase()}. Check this node's input type.`
        : (messages[error?.name] ?? 'n8n reported a failure in this node.'),
      nodeId: node.id,
      nodeType: node.type,
    };
  });
  if (!diagnostics.length)
    diagnostics.push({
      code: 'N8N_EXECUTION_FAILED',
      message: 'n8n recorded a failed execution; no specific node diagnostic was retained.',
    });
  return {
    status: 'failed',
    executionId: executionId(String(execution.id)),
    diagnostics,
    executedNodeIds: executed.map((node) => node.id),
  };
}

export function createSolutionRuntime({
  bindings = [],
  fetchImpl = fetch,
  getIdentityHeaders,
  allowLocalHttp = false,
} = {}) {
  const parsed = z.array(BindingSchema).max(100).parse(bindings);
  if (
    new Set(parsed.map((value) => value.id)).size !== parsed.length ||
    new Set(parsed.map((value) => value.origin)).size !== parsed.length
  )
    throw new Error('duplicate_solution_environment');
  for (const value of parsed) {
    const origin = new URL(value.origin);
    const local =
      allowLocalHttp &&
      origin.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(origin.hostname);
    if (
      (!local && origin.protocol !== 'https:') ||
      origin.origin !== value.origin ||
      origin.username ||
      origin.password ||
      (value.useIdToken && local)
    )
      throw new Error('invalid_solution_environment_origin');
  }
  const auth = new GoogleAuth();
  const identityHeaders =
    getIdentityHeaders ??
    (async (origin) => {
      const client = await auth.getIdTokenClient(origin);
      return client.getRequestHeaders(origin);
    });
  function binding(scope, id) {
    const found = parsed.find(
      (value) =>
        value.id === id && value.tenantId === scope.tenantId && value.userId === scope.userId
    );
    if (!found) throw new Error('solution_environment_scope_denied');
    return found;
  }
  async function requestEnvelope(
    config,
    path,
    {
      method = 'GET',
      body,
      management = true,
      invocationId,
      nativeBusiness = false,
      allowFailure = false,
      maxBytes = 256000,
    } = {}
  ) {
    const headers = new Headers(config.useIdToken ? await identityHeaders(config.origin) : {});
    headers.set('content-type', 'application/json');
    if (management) headers.set('X-N8N-API-KEY', config.apiKey);
    if (nativeBusiness) {
      headers.delete('X-N8N-API-KEY');
      if (config.useIdToken) {
        const identity = headers.get('authorization');
        if (!identity?.startsWith('Bearer ')) throw new Error('native_identity_token_unavailable');
        // Native workflows can return the entire webhook $json, including its
        // headers. Keep our ID token out of application Authorization. Cloud
        // Run removes the signature from this dedicated header before delivery:
        // https://docs.cloud.google.com/run/docs/authenticating/service-to-service
        // Actual deployed forwarding is a release acceptance check, not a unit
        // test assumption. V1 and management request authentication is unchanged.
        headers.set('X-Serverless-Authorization', identity);
        headers.delete('authorization');
      }
    }
    if (invocationId) headers.set(NATIVE_INVOCATION_HEADER, z.uuid().parse(invocationId));
    // Deploy and invoke first verify the isolated runtime through a read. Allow
    // that read to absorb scale-to-zero startup without extending write budgets
    // or retrying an action whose outcome could be ambiguous.
    const timeoutMs = management ? (method === 'GET' ? 60000 : 15000) : 45000;
    const response = await fetchImpl(`${config.origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok && !allowFailure) {
      await response.body?.cancel();
      throw new Error(`solution_runtime_http_${response.status}`);
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('solution_runtime_response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
    return {
      data: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      status: response.status,
      headers: response.headers,
    };
  }
  async function request(config, path, options) {
    return (await requestEnvelope(config, path, options)).data;
  }
  async function nativeWebhook(
    config,
    workflowId,
    invocationId,
    input,
    workflow,
    nativeConnections = []
  ) {
    const result = await requestEnvelope(
      config,
      `/webhook/solution-${z.uuid().parse(workflowId)}`,
      {
        method: 'POST',
        management: false,
        nativeBusiness: true,
        body: input,
        invocationId,
        allowFailure: true,
        maxBytes: 65536,
      }
    );
    if (
      result.headers.get(NATIVE_INVOCATION_HEADER) !== invocationId ||
      !/^[1-9][0-9]{0,30}$/.test(result.headers.get(NATIVE_EXECUTION_HEADER) ?? '') ||
      !isBoundedNativeJson(result.data, { maxBytes: 65536 })
    )
      throw new Error('native_execution_outcome_unknown');
    let outboundDelivery;
    if (hasNativeOutbound(workflow)) {
      const node = workflow.nodes.find((entry) => entry.type === BOUNDED_HTTP_NODE.type);
      const credentialId = node.credentials?.orqalyBoundedHttp?.id;
      const record = nativeConnections.find(
        (entry) => entry.provider_credential_id === credentialId
      );
      const delivery = result.headers.get('x-orqaly-outbound-delivery');
      if (
        !record ||
        !['accepted', 'rejected'].includes(delivery) ||
        result.headers.get('x-orqaly-outbound-connection-id') !== record.id
      )
        throw new Error('native_outbound_receipt_unknown');
      outboundDelivery = { delivery, connectionId: record.id, nodeId: node.id };
    }
    return {
      output: result.data,
      executionId: result.headers.get(NATIVE_EXECUTION_HEADER),
      responseStatus: result.status,
      status: 'succeeded',
      diagnostics: [],
      executedNodeIds: outboundDelivery ? [outboundDelivery.nodeId] : [],
      ...(outboundDelivery ? { outboundDelivery } : {}),
    };
  }
  const credentials = createBoundedNativeCredentialAdapter({
    request: (scope, environmentId, path, options) => {
      const config = binding(scope, environmentId);
      if (!isBoundedHttpPolicy(config.nativePolicy))
        throw new Error('native_outbound_policy_missing');
      return request(config, path, options);
    },
  });
  async function verifyNativeCredentials(config, workflow, nativeConnections = []) {
    for (const node of workflow.nodes.filter((entry) => entry.type === BOUNDED_HTTP_NODE.type)) {
      const providerId = safeId(node.credentials?.orqalyBoundedHttp?.id);
      const record = nativeConnections.find((entry) => entry.provider_credential_id === providerId);
      if (
        !record ||
        !['saved', 'verified'].includes(record.status) ||
        record.environment_id !== config.id ||
        record.tenant_id !== config.tenantId ||
        record.owner_user_id !== config.userId
      )
        throw new Error('native_connection_scope_denied');
      const stored = await request(config, `/api/v1/credentials/${providerId}`);
      if (
        stored?.id !== providerId ||
        stored.name !== `Orqaly connection ${record.id}` ||
        stored.type !== 'orqalyBoundedHttp'
      )
        throw new Error('native_connection_provider_mismatch');
    }
  }
  async function nativeActivation(scope, solution, activate) {
    if (solution.spec?.ownedDependencies?.length)
      return bundles.activation(scope, solution, activate);
    const config = binding(scope, solution.environment_id);
    if (!native(solution)) throw new Error('native_workflow_required');
    if (activate) {
      nativePermission(
        config,
        solution.workflow,
        solution.spec,
        solution.revision_id ?? solution.id,
        false,
        solution.nativeConnections
      );
      await verifyNativeCredentials(config, solution.workflow, solution.nativeConnections);
    } else {
      // Revocation must not prevent stopping an already owned deployed workflow.
      // Exact transport, hash, provider ID/version and stored artifact are still
      // checked below; this path can only unpublish, never execute or widen it.
      assertNativeTransportBindings({
        workflow: solution.workflow,
        id: solution.revision_id ?? solution.id,
      });
    }
    const path = `/api/v1/workflows/${safeId(solution.deployment.workflowId)}`;
    const stored = await request(config, path);
    verifyDeployment(stored, solution);
    if (activate) {
      if (stored.active !== true)
        await request(config, `${path}/publish`, {
          method: 'POST',
          body: { versionId: stored.versionId },
        });
    } else if (stored.active === true)
      await request(config, `${path}/unpublish`, { method: 'POST', body: {} });
    const verified = await request(config, path);
    verifyDeployment(verified, solution, activate);
    if (!activate && (verified.active === true || verified.activeVersion))
      throw new Error('solution_workflow_still_published');
    return deploymentReceipt(verified, solution.workflow_hash);
  }
  const bundles = createOwnedNativeBundleRuntime({
    binding,
    request,
    nativeWebhook,
    verifyStoredWorkflow,
    verifyWorkflow,
    verifyNativeCredentials,
    verifiedExecutionSnapshot,
    capturedFailure,
  });
  return {
    ...credentials,
    probeNativeFailure: bundles.probeNativeFailure,
    reconcileNativeFailureProbe: bundles.reconcileNativeFailureProbe,
    reconcileNativeBundleInvocation: bundles.reconcileInvocation,
    environmentIds: (scope) =>
      parsed
        .filter((value) => value.tenantId === scope.tenantId && value.userId === scope.userId)
        .map((value) => value.id),
    available: (scope) =>
      parsed.some((value) => value.tenantId === scope.tenantId && value.userId === scope.userId),
    select: (scope) =>
      parsed.find((value) => value.tenantId === scope.tenantId && value.userId === scope.userId)
        ?.id ?? null,
    nativePolicy(scope, id) {
      return structuredClone(binding(scope, id).nativePolicy ?? null);
    },
    async cleanupNativeTest(scope, { environmentId, testId, workflow, workflowHash }) {
      const config = binding(scope, environmentId);
      z.uuid().parse(testId);
      if (workflow.name !== `Orqaly test ${testId}` || canonicalHash(workflow) !== workflowHash)
        throw new Error('native_test_cleanup_binding_mismatch');
      assertNativeTransportBindings({ workflow, id: testId, controlledTest: true });
      // Cleanup reduces authority. It intentionally does not require a usable
      // credential, republish anything, invoke a webhook, or retry a test.
      const inventory = await request(config, '/api/v1/workflows?limit=100');
      if (!Array.isArray(inventory.data) || inventory.nextCursor)
        throw new Error('solution_environment_inventory_unexpected');
      const matches = inventory.data.filter((item) => item.name === workflow.name);
      if (matches.length > 1) throw new Error('native_test_cleanup_ambiguous');
      if (!matches.length) return { status: 'removed' };
      const path = `/api/v1/workflows/${safeId(matches[0].id)}`;
      const stored = await request(config, path);
      if (stored.id !== matches[0].id) throw new Error('native_test_cleanup_identity_mismatch');
      verifyStoredWorkflow(stored, workflow);
      await request(config, path, { method: 'DELETE' });
      const remaining = await request(config, '/api/v1/workflows?limit=100');
      if (
        !Array.isArray(remaining.data) ||
        remaining.nextCursor ||
        remaining.data.some((item) => item.id === stored.id || item.name === workflow.name)
      )
        throw new Error('native_test_cleanup_unconfirmed');
      return { status: 'removed' };
    },
    activate: (scope, solution) => nativeActivation(scope, solution, true),
    pause: (scope, solution) => nativeActivation(scope, solution, false),
    describe(id) {
      const value = parsed.find((item) => item.id === id);
      return value
        ? {
            id: value.id,
            name: value.name,
            region: value.region,
            isolation: 'Dedicated n8n service and database identity',
            engine: 'Self-hosted n8n',
            capacity: 'Webhook-only preview; one solution per environment',
          }
        : { id, name: 'Environment unavailable', engine: 'Self-hosted n8n' };
    },
    async deploy(scope, solution) {
      if (solution.spec?.ownedDependencies?.length) return bundles.deploy(scope, solution);
      const config = binding(scope, solution.environment_id);
      if (canonicalHash(solution.workflow) !== solution.workflow_hash)
        throw new Error('solution_workflow_hash_mismatch');
      if (native(solution)) {
        nativePermission(
          config,
          solution.workflow,
          solution.spec,
          solution.revision_id ?? solution.id,
          false,
          solution.nativeConnections
        );
        await verifyNativeCredentials(config, solution.workflow, solution.nativeConnections);
      }
      const listing = await request(config, '/api/v1/workflows?limit=100');
      if (!Array.isArray(listing.data) || listing.nextCursor)
        throw new Error('solution_environment_inventory_unexpected');
      // A revision may coexist only with deployments whose provider IDs were
      // obtained from this owner's durable solution/revision records.
      const knownIds = new Set((solution.known_workflow_ids ?? []).map(safeId));
      if (
        listing.data.some((item) => item.name !== solution.workflow.name && !knownIds.has(item.id))
      )
        throw new Error('solution_environment_not_exclusive');
      const candidates = listing.data.filter((item) => item.name === solution.workflow.name);
      if (candidates.length > 1) throw new Error('solution_workflow_duplicate');
      let workflow = candidates.length
        ? await request(config, `/api/v1/workflows/${safeId(candidates[0].id)}`)
        : await request(config, '/api/v1/workflows', { method: 'POST', body: solution.workflow });
      // Never mutate a different existing workflow during retry/reconciliation.
      const comparison = {
        ...workflow,
        activeVersion: {
          versionId: workflow.versionId,
          nodes: workflow.nodes,
          connections: workflow.connections,
        },
      };
      verifyWorkflow(comparison, solution.workflow);
      if (native(solution)) {
        if (workflow.active === true || workflow.activeVersion)
          throw new Error('native_stage_already_published');
        const verified = await request(config, `/api/v1/workflows/${safeId(workflow.id)}`);
        verifyStoredWorkflow(verified, solution.workflow);
        if (verified.active === true || verified.activeVersion)
          throw new Error('native_stage_already_published');
        return deploymentReceipt(verified, solution.workflow_hash);
      }
      if (!workflow.activeVersion || workflow.activeVersion.versionId !== workflow.versionId) {
        workflow = await request(config, `/api/v1/workflows/${safeId(workflow.id)}/publish`, {
          method: 'POST',
          body: { versionId: workflow.versionId },
        });
      }
      const verified = await request(config, `/api/v1/workflows/${safeId(workflow.id)}`);
      verifyWorkflow(verified, solution.workflow);
      return {
        workflowId: safeId(verified.id),
        versionId: safeId(verified.versionId),
        workflowHash: solution.workflow_hash,
        verifiedAt: new Date().toISOString(),
      };
    },
    async invoke(scope, solution, invocation) {
      if (solution.spec?.ownedDependencies?.length)
        return bundles.invoke(scope, solution, invocation);
      const config = binding(scope, solution.environment_id);
      if (native(solution)) {
        nativePermission(
          config,
          solution.workflow,
          solution.spec,
          solution.revision_id ?? solution.id,
          false,
          solution.nativeConnections
        );
        nativeInput(solution.spec, invocation.input);
        z.uuid().parse(invocation.id);
        const stored = await request(
          config,
          `/api/v1/workflows/${safeId(solution.deployment.workflowId)}`
        );
        verifyDeployment(stored, solution, true);
        await verifyNativeCredentials(config, solution.workflow, solution.nativeConnections);
        try {
          return await nativeWebhook(
            config,
            solution.revision_id ?? solution.id,
            invocation.id,
            invocation.input,
            solution.workflow,
            solution.nativeConnections
          );
        } catch {
          throw new Error('native_execution_outcome_unknown');
        }
      }
      const workflow = await request(
        config,
        `/api/v1/workflows/${safeId(solution.deployment.workflowId)}`
      );
      verifyWorkflow(workflow, solution.workflow);
      if (
        workflow.id !== solution.deployment.workflowId ||
        workflow.versionId !== solution.deployment.versionId
      )
        throw new Error('solution_deployment_version_changed');
      const result = await request(
        config,
        `/webhook/solution-${z.uuid().parse(solution.revision_id ?? solution.id)}`,
        {
          method: 'POST',
          management: false,
          body: { input: invocation.input, invocationId: invocation.id },
        }
      );
      if (result.invocationId !== invocation.id || JSON.stringify(result.output).length > 20000) {
        throw new Error('solution_execution_response_mismatch');
      }
      return {
        output: result.output,
        executionId: z
          .string()
          .regex(/^[1-9][0-9]{0,30}$/)
          .parse(result.executionId),
      };
    },
    async testNative(
      scope,
      {
        environmentId,
        workflow,
        spec,
        testId,
        invocationId,
        input,
        nativeConnections = [],
        allowExternalEffects = false,
      }
    ) {
      if (spec?.ownedDependencies?.length)
        return bundles.testNative(scope, {
          environmentId,
          workflow,
          spec,
          testId,
          invocationId,
          input,
          nativeConnections,
          allowExternalEffects,
        });
      const config = binding(scope, environmentId);
      z.uuid().parse(testId);
      z.uuid().parse(invocationId);
      const outbound = hasNativeOutbound(workflow);
      if (outbound && allowExternalEffects !== true)
        throw new Error('native_outbound_consent_required');
      nativePermission(config, workflow, spec, testId, true, nativeConnections);
      if (outbound && workflow.settings.saveDataErrorExecution !== 'none')
        throw new Error('native_outbound_retention_denied');
      nativeInput(spec, input);
      const proof = {
        testArtifactHash: canonicalHash(workflow),
        testConfiguration: {
          controlledTest: true,
          saveDataErrorExecution: outbound ? 'none' : 'all',
          saveDataSuccessExecution: 'none',
        },
      };
      let provider = null;
      let result;
      let dispatched = false;
      try {
        // The test ID is unique per durable attempt. Finding it already present
        // means a previous write may have succeeded: never rerun that attempt.
        const listing = await request(config, '/api/v1/workflows?limit=100');
        if (!Array.isArray(listing.data) || listing.nextCursor)
          throw new Error('solution_environment_inventory_unexpected');
        if (listing.data.some((item) => item.name === workflow.name))
          throw new Error('native_test_attempt_already_exists');
        provider = await request(config, '/api/v1/workflows', { method: 'POST', body: workflow });
        safeId(provider.id);
        safeId(provider.versionId);
        verifyStoredWorkflow(provider, workflow);
        if (provider.active === true || provider.activeVersion)
          throw new Error('native_stage_already_published');
        const path = `/api/v1/workflows/${safeId(provider.id)}`;
        await request(config, `${path}/publish`, {
          method: 'POST',
          body: { versionId: provider.versionId },
        });
        const verified = await request(config, path);
        verifyDeployment(
          verified,
          {
            workflow,
            workflow_hash: proof.testArtifactHash,
            deployment: { workflowId: provider.id, versionId: provider.versionId },
          },
          true
        );
        await verifyNativeCredentials(config, workflow, nativeConnections);
        dispatched = true;
        result = await nativeWebhook(
          config,
          testId,
          invocationId,
          input,
          workflow,
          nativeConnections
        );
      } catch {
        result = {
          status: 'outcome_unknown',
          diagnostics: [
            {
              code: dispatched ? 'N8N_EXECUTION_UNCONFIRMED' : 'N8N_TEST_SETUP_UNCONFIRMED',
              message: dispatched
                ? 'The n8n request has no verified execution result. Do not retry it automatically.'
                : 'The isolated test could not be safely verified; it was not retried.',
            },
          ],
          executedNodeIds: [],
        };
        if (provider && dispatched && !outbound) {
          try {
            const executions = await request(
              config,
              `/api/v1/executions?workflowId=${safeId(provider.id)}&limit=1&includeData=true`,
              { maxBytes: 1048576 }
            );
            const captured =
              Array.isArray(executions.data) && executions.data.length === 1
                ? capturedFailure(
                    executions.data[0],
                    workflow,
                    provider,
                    invocationId,
                    spec,
                    config.nativePolicy
                  )
                : null;
            if (captured) result = captured;
          } catch {
            /* Missing/redacted evidence is unknown, never invented. */
          }
        }
      } finally {
        if (provider) {
          try {
            // Confirm exact ownership/snapshot again before deleting only the
            // temporary workflow created by this attempt, never a live release.
            const path = `/api/v1/workflows/${safeId(provider.id)}`;
            const current = await request(config, path);
            verifyStoredWorkflow(current, workflow);
            if (current.id === provider.id && current.versionId === provider.versionId) {
              await request(config, path, { method: 'DELETE' });
              result = { ...result, cleanup: { status: 'removed' } };
            } else
              result = {
                ...result,
                cleanup: {
                  status: 'pending',
                  message: 'The temporary test workflow changed; cleanup was not authorized.',
                },
              };
          } catch {
            result = {
              ...result,
              cleanup: {
                status: 'pending',
                message:
                  'The temporary test workflow needs cleanup; no other workflow was changed.',
              },
            };
          }
        }
      }
      return { ...result, ...proof };
    },
  };
}

export function solutionRuntimeFromEnvironment(env = process.env) {
  return createSolutionRuntime({
    bindings: JSON.parse(env.ORQALY_SOLUTION_ENVIRONMENTS || '[]'),
    allowLocalHttp: env.ORQALY_ENVIRONMENT === 'local',
  });
}
