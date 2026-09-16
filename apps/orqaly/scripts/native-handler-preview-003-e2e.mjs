// Operator-triggered synthetic runtime proof ONLY. Never customer-source proof,
// release approval, email delivery, a model call, or a database operation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nativeOwnedErrorFixture } from '../server/workflow-v2/fixtures/native-owned-error.js';
import { createNativeFailureProbeArtifact } from '../server/workflow-v2/native-failure-probe.js';
import { nativeBundleMembers, materializeNativeBundle } from '../server/workflow-v2/native-workflow-bundle.js';
import { createBoundedHttpPolicy } from '../server/workflow-v2/native-workflow-review.js';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { failureProbeReceiptMatches } from '../server/workflow-v2/solution-failure-probe-service.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { HANDLER_003, handler003Configuration, handler003Hash } from './solution-handler-preview-003-operator.mjs';

export const HANDLER_ACCEPTANCE_003 = Object.freeze({
  ...HANDLER_003,
  origin: 'https://orqaly-solution-n8n-preview-003-161074549006.europe-west4.run.app',
  tenantId: 'c1b26d36-721b-5d8c-8d4c-180050ee9b94',
  userId: 'user_2vHlB9JhH4FazWsgKYENFIeAnMu',
  sourceId: 'd8e1cfe3-b0b5-4f04-a35a-5393cbbfbbe4',
  probeId: '01d7caa9-5b30-459f-b0b4-ed791a770be0',
  sourceHash: 'c3f94613092ff7e31f751992dcb9c75662121d74b39ca1d1e66c6e440f715a94',
  commandHash: '5f5124112616540dbe054e58eedb875dd71b5a0ea34a053fce1eaccdf2d59222',
  configHash: '9dd5a0aff2216507d44300adb2a0de470cf63ba06af54a6e311e990432a0f9de',
  iamHash: 'e05afe3750bc9c3235d072171fc42b29c877c978f20972d339896bff7d3311e1',
  ledger: '/private/tmp/orqaly-handler-runtime-003-sep7.json',
  recoveryLedger: '/private/tmp/orqaly-handler-runtime-003-recovered-sep7.json',
});
const fixed = HANDLER_ACCEPTANCE_003;
const providerId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const cloud = (args) => execFileSync('gcloud', [...args, `--project=${fixed.project}`, '--verbosity=error'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 8 * 1024 * 1024,
}).trim();
const jsonCloud = (args) => JSON.parse(cloud([...args, '--format=json']));
const safeStepCodes = Object.freeze({
  runtime_metadata: 'HANDLER003_RUNTIME_METADATA_FAILED',
  binding3_policy: 'HANDLER003_BINDING_POLICY_FAILED',
  identity_transport: 'HANDLER003_IDENTITY_TRANSPORT_FAILED',
  node_catalog: 'HANDLER003_NODE_CATALOG_FAILED',
  workflow_inventory: 'HANDLER003_WORKFLOW_INVENTORY_FAILED',
  runtime_dispatch: 'HANDLER003_RUNTIME_OUTCOME_UNCONFIRMED',
  receipt_validation: 'HANDLER003_RECEIPT_VALIDATION_FAILED',
  cleanup_inventory: 'HANDLER003_CLEANUP_INVENTORY_FAILED',
});
// Never derive diagnostic text from an exception, response body or credential.
export function handler003SafeFailure(step, httpStatus) {
  const known = Object.hasOwn(safeStepCodes, step);
  return { failedStep: known ? step : 'unknown', errorCode: known ? safeStepCodes[step] : 'HANDLER003_ACCEPTANCE_UNCONFIRMED',
    ...(['node_catalog', 'workflow_inventory', 'cleanup_inventory'].includes(step) &&
      Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}) };
}
export const HANDLER003_PREFLIGHT_EVIDENCE = Object.freeze({
  ledgerHash: '10d8212d5221dfb41d736975ac1096355d468307e51ed97854d5cdb58e9e9db0',
  lockHash: '18736ffba7bf4a454977ee9d2a3b2c51bd40a41d55e096011731ae188118e855',
  failedStep: 'node_catalog', httpStatus: 401, executionAttempted: false,
});
export function assertHandler003StoppedPreflight(original, originalLock) {
  assert.equal(createHash('sha256').update(original).digest('hex'), HANDLER003_PREFLIGHT_EVIDENCE.ledgerHash, 'original_preflight_ledger_changed');
  assert.equal(createHash('sha256').update(originalLock).digest('hex'), HANDLER003_PREFLIGHT_EVIDENCE.lockHash, 'original_preflight_lock_changed');
  const value = JSON.parse(original);
  assert.equal(value.stage, 'stopped'); assert.equal(value.executionAttempted, false);
  assert.equal(value.commandHash, fixed.commandHash);
  for (const key of ['requests', 'result', 'cleanup', 'metadata']) assert(!Object.hasOwn(value, key), 'original_attempt_may_have_dispatched');
  return value;
}
const preservedPreflight = () => assertHandler003StoppedPreflight(readFileSync(fixed.ledger), readFileSync(`${fixed.ledger}.run-probe.started`));
export function handler003RecoveryInventory(list, command) {
  assert(Array.isArray(list.data) && !list.nextCursor, 'complete_inventory_required');
  assert(list.data.length <= 100 && list.data.every((entry) => providerId(entry.id)) &&
    new Set(list.data.map((entry) => entry.id)).size === list.data.length, 'bounded_unique_inventory_required');
  const names = nativeBundleMembers(createNativeFailureProbeArtifact(command)).map((member) => member.workflow.name);
  assert(!list.data.some((entry) => names.includes(entry.name)), 'derived_attempt_already_exists');
  return { count: list.data.length, sha256: hash(list.data) };
}
async function runtimeContext({ catalogRequired, setStep, setHttpStatus }) {
  setStep('runtime_metadata');
  const service = jsonCloud(['run', 'services', 'describe', fixed.service, `--region=${fixed.region}`]);
  const iam = jsonCloud(['run', 'services', 'get-iam-policy', fixed.service, `--region=${fixed.region}`]);
  const metadata = validateHandler003Runtime(service, iam);
  setStep('binding3_policy');
  const binding = validateHandler003Binding(JSON.parse(cloud(['secrets', 'versions', 'access', '3', `--secret=${fixed.secret}`])));
  setStep('identity_transport');
  const token = cloud(['auth', 'print-identity-token']);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const headers = { Authorization: `Bearer ${token}`, 'X-N8N-API-KEY': binding.apiKey };
  const get = async (path) => {
    const response = await fetch(`${fixed.origin}${path}`, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
    setHttpStatus(response.status); assert.equal(response.status, 200, 'native_readonly_preflight_failed');
    assert(Number(response.headers.get('content-length') ?? 0) <= 8 * 1024 * 1024);
    const text = await response.text(); assert(Buffer.byteLength(text) <= 8 * 1024 * 1024);
    return JSON.parse(text);
  };
  let catalog;
  if (catalogRequired) {
    setStep('node_catalog'); catalog = validateHandler003Catalog(await get('/types/nodes.json'));
  }
  return { metadata, binding, token, get, ...(catalog ? { catalog } : { nodeAvailability: {
    kind: 'pinned_image_and_enabled_node_configuration', catalogFetched: false,
    image: fixed.image, configHash: fixed.configHash, type: 'n8n-nodes-base.errorTrigger', version: 1,
    realLinkedTerminalHandlerExecutionRequired: true,
  } }) };
}
async function prepareHandler003Recovery(command) {
  let step = 'runtime_metadata', httpStatus = null;
  try {
    const original = preservedPreflight();
    assert(!existsSync(fixed.recoveryLedger), 'recovery_plan_already_exists');
    const context = await runtimeContext({ catalogRequired: false, setStep: (value) => { step = value; }, setHttpStatus: (value) => { httpStatus = value; } });
    step = 'workflow_inventory';
    const inventory = handler003RecoveryInventory(await context.get('/api/v1/workflows?limit=100'), command);
    preservedPreflight();
    const ledger = { schemaVersion: original.schemaVersion, scope: original.scope, stage: 'prepared',
      commandHash: fixed.commandHash, environmentId: fixed.environmentId, probeId: fixed.probeId,
      sourceWorkflowHash: command.workflowHash, sourceBundleHash: command.bundleHash,
      executionAttempted: false, originalPreflightEvidence: HANDLER003_PREFLIGHT_EVIDENCE,
      metadata: context.metadata, nodeAvailability: context.nodeAvailability,
      protectedWorkflowMetadataHash: inventory.sha256, protectedWorkflowCount: inventory.count,
      originalLedgersPreserved: true, customerDatabaseWrites: false, customerWorkflowWrites: false,
      modelCalls: 0, providerCalls: 0, credentialsLogged: false };
    writeFileSync(fixed.recoveryLedger, `${JSON.stringify(ledger, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { prepared: true, readOnly: true, ledger: fixed.recoveryLedger, ledgerHash: hash(ledger), ...ledger };
  } catch {
    return { prepared: false, passed: false, readOnly: true, ...handler003SafeFailure(step, httpStatus),
      originalLedgersPreserved: true, executionAttempted: false, credentialsLogged: false };
  }
}

export function handler003AcceptanceCommand() {
  const source = nativeOwnedErrorFixture(fixed.sourceId);
  assert.equal(hash(source), fixed.sourceHash, 'frozen_synthetic_source_changed');
  const command = { environmentId: fixed.environmentId, ...source, sourceVersion: 1,
    probeId: fixed.probeId, invocationId: fixed.probeId, allowExternalEffects: false };
  assert.equal(hash(command), fixed.commandHash, 'frozen_synthetic_command_changed');
  const artifact = createNativeFailureProbeArtifact(command);
  for (const member of nativeBundleMembers(artifact)) {
    assert.deepEqual(member.spec.connections, [], 'synthetic_connections_denied');
    assert(member.workflow.nodes.every((node) => !Object.keys(node.credentials ?? {}).length));
    assert(member.workflow.nodes.every((node) => ['n8n-nodes-base.webhook', 'n8n-nodes-base.set',
      'n8n-nodes-base.respondToWebhook', 'n8n-nodes-base.errorTrigger'].includes(node.type)), 'synthetic_effect_node_denied');
  }
  return command;
}
export function validateHandler003Binding(bindings) {
  assert(Array.isArray(bindings) && bindings.length === 3, 'exact_three_bindings_required');
  assert.deepEqual(bindings.map((value) => value.id).sort(), ['001', '002', '003'].map((id) => `orqaly-customer-webhook-preview-${id}`));
  const binding = bindings.find((value) => value.id === fixed.environmentId);
  for (const key of ['id', 'origin', 'tenantId', 'userId']) assert.equal(binding[key], key === 'id' ? fixed.environmentId : fixed[key], 'binding_scope_changed');
  assert.equal(binding.useIdToken, true);
  assert.equal(typeof binding.apiKey, 'string'); assert(binding.apiKey.length > 10);
  assert.deepEqual(binding.nativePolicy, { ...createBoundedHttpPolicy({ imageDigest: fixed.image.split('@')[1] }),
    ownedErrorHandlerProbe: true, backgroundExecution: 'instance_cpu_always' }, 'probe_only_policy_required');
  return binding;
}
export function validateHandler003Runtime(service, iam) {
  assert.equal(service.metadata.name, fixed.service);
  assert.equal(handler003Hash(handler003Configuration(service)), fixed.configHash, 'runtime_config_changed');
  assert.equal(handler003Hash(iam.bindings ?? []), fixed.iamHash, 'runtime_iam_changed');
  const candidate = `${fixed.service}-${fixed.suffix}`;
  for (const type of ['Ready', 'ConfigurationsReady', 'RoutesReady'])
    assert.equal(service.status.conditions.find((entry) => entry.type === type)?.status, 'True');
  assert.equal(service.status.latestReadyRevisionName, candidate);
  assert.equal(service.status.latestCreatedRevisionName, candidate);
  const traffic = (list) => list.map(({ revisionName, percent, tag }) => ({ revisionName, percent, tag }));
  assert.deepEqual(traffic(service.spec.traffic), [{ revisionName: candidate, percent: 100, tag: undefined }]);
  assert.deepEqual(traffic(service.status.traffic), [{ revisionName: candidate, percent: 100, tag: undefined }]);
  return { revision: candidate, configHash: fixed.configHash, iamHash: fixed.iamHash, image: fixed.image };
}
export function validateHandler003Catalog(types) {
  assert(Array.isArray(types), 'native_catalog_required');
  const found = types.filter((entry) => entry.name === 'n8n-nodes-base.errorTrigger');
  assert.equal(found.length, 1, 'actual_error_trigger_missing_or_ambiguous');
  assert((Array.isArray(found[0].version) ? found[0].version : [found[0].version]).includes(1));
  return { name: found[0].name, version: 1, descriptionHash: hash(found[0]) };
}
export function assertHandler003Ledger(ledger, mode) {
  assert.equal(ledger.schemaVersion, 'orqaly.synthetic-handler003.v1');
  assert.equal(ledger.commandHash, fixed.commandHash);
  assert.equal(ledger.probeId, fixed.probeId);
  assert.equal(ledger.environmentId, fixed.environmentId);
  if (mode === 'run-probe') assert.equal(ledger.stage, 'prepared', 'attempt_already_started_no_execution_retry');
  else {
    assert.equal(mode, 'reconcile-probe');
    assert(ledger.executionAttempted === true, 'no_attempt_to_reconcile');
    assert.notEqual(ledger.cleanup?.status, 'removed', 'cleanup_already_verified_no_more_actions');
  }
}

// The transport grants no generic n8n mutations: exact two derived graphs only.
// Google identity remains in authenticated transport headers, never node JSON.
export function createHandler003ProbeTransport({ command, reconcile = false, fetchImpl = fetch, record = () => {} }) {
  const artifact = createNativeFailureProbeArtifact(command);
  const members = nativeBundleMembers(artifact);
  const known = new Map();
  const attempts = new Set();
  let webhookAttempted = false;
  const expectedWorkflow = (name) => {
    if (name === members[1].workflow.name) return members[1].workflow;
    assert.equal(name, artifact.workflow.name, 'foreign_workflow_name');
    const child = [...known.values()].find((entry) => entry.name === members[1].workflow.name);
    assert(child && providerId(child.id) && providerId(child.versionId), 'child_pin_required_first');
    return materializeNativeBundle(artifact, [{ dependencyId: members[1].dependencyId, workflowId: child.id,
      versionId: child.versionId, workflowHash: hash(members[1].workflow), specHash: hash(members[1].spec) }]).workflow;
  };
  const remember = (value) => {
    if (!members.some((member) => member.workflow.name === value?.name)) return;
    assert(providerId(value.id) && providerId(value.versionId), 'provider_identity_invalid');
    known.set(value.id, { id: value.id, name: value.name, versionId: value.versionId });
    record({ category: 'owned_workflow_metadata', id: value.id, versionId: value.versionId, name: value.name });
  };
  return async (url, options = {}) => {
    const target = new URL(url), method = options.method ?? 'GET';
    assert.equal(target.origin, fixed.origin, 'foreign_destination_denied');
    const path = target.pathname;
    const parts = path.split('/');
    let category;
    if (path === '/api/v1/workflows' && method === 'GET') {
      assert.equal(target.search, '?limit=100'); category = 'workflow_inventory';
    } else if (path === '/api/v1/workflows' && method === 'POST') {
      assert(!reconcile && !target.search, 'reconcile_must_not_create');
      const body = JSON.parse(options.body);
      assert.equal(hash(body), hash(expectedWorkflow(body.name)), 'only_exact_derived_workflow_may_be_created');
      assert(!attempts.has(`create:${body.name}`), 'create_retry_denied'); attempts.add(`create:${body.name}`);
      category = 'create_disposable_member';
    } else if (path.startsWith('/api/v1/workflows/') && known.has(parts[4])) {
      assert(!target.search && parts.length <= 6);
      if (method === 'GET') { assert.equal(parts.length, 5); category = 'owned_workflow_read'; }
      else if (method === 'DELETE') {
        assert.equal(parts.length, 5); category = 'delete_disposable_member';
        assert(!attempts.has(`delete:${parts[4]}`)); attempts.add(`delete:${parts[4]}`);
      } else {
        assert(!reconcile && method === 'POST' && parts[5] === 'publish', 'only_exact_publish_allowed');
        assert.deepEqual(JSON.parse(options.body), { versionId: known.get(parts[4]).versionId });
        assert(!attempts.has(`publish:${parts[4]}`)); attempts.add(`publish:${parts[4]}`);
        category = 'publish_disposable_member';
      }
    } else if (path === '/api/v1/executions' && method === 'GET') {
      assert(known.has(target.searchParams.get('workflowId')));
      assert(['1', '100'].includes(target.searchParams.get('limit')));
      assert.equal(target.searchParams.get('includeData'), 'true');
      assert.equal([...target.searchParams].length, 3); category = 'owned_execution_evidence';
    } else if (path === `/webhook/solution-${command.probeId}` && method === 'POST') {
      assert(!reconcile && !webhookAttempted && !target.search, 'probe_execution_retry_denied');
      assert.equal(known.size, 2); assert.deepEqual(JSON.parse(options.body), {});
      const headers = new Headers(options.headers);
      assert.equal(headers.get('x-orqaly-invocation-id'), command.invocationId);
      assert(!headers.has('authorization') && !headers.has('x-n8n-api-key'), 'management_authority_must_not_enter_business_body');
      webhookAttempted = true; category = 'single_synthetic_failure_webhook';
    } else assert.fail('unapproved_native_request');
    record({ category, phase: 'attempting', method });
    const response = await fetchImpl(url, options);
    record({ category, phase: 'returned', method, status: response.status });
    if (response.ok && response.headers.get('content-type')?.includes('application/json') &&
        (category === 'workflow_inventory' || category === 'create_disposable_member' || category === 'owned_workflow_read')) {
      const value = await response.clone().json();
      if (category === 'workflow_inventory') {
        assert(Array.isArray(value.data) && !value.nextCursor, 'bounded_complete_inventory_required');
        for (const entry of value.data) remember(entry);
      } else remember(value);
    }
    return response;
  };
}

function receipt(result, command) {
  assert(failureProbeReceiptMatches(result, { id: command.probeId, source_version: command.sourceVersion,
    workflow_hash: command.workflowHash, bundle_hash: command.bundleHash, dependency_id: 'failure-handler', source_snapshot: command }), 'receipt_pins_invalid');
  return Object.fromEntries(['status', 'kind', 'coverage', 'externalEffects', 'sourceVersion', 'sourceWorkflowHash',
    'sourceBundleHash', 'dependencyId', 'sourceChildWorkflowHash', 'sourceChildSpecHash', 'testArtifactHash',
    'testBundleHash', 'materializedWorkflowHash', 'mainExecution', 'ownedDependencies', 'cleanup']
    .filter((key) => result[key] !== undefined).map((key) => [key, result[key]]));
}
export async function runHandler003Acceptance(args) {
  assert(args.length === 1 && ['prepare', 'run-probe', 'reconcile-probe', 'prepare-recovery', 'run-recovery', 'reconcile-recovery'].includes(args[0]), 'explicit_fixed_mode_required');
  const [requestedMode] = args, command = handler003AcceptanceCommand();
  if (requestedMode === 'prepare-recovery') return prepareHandler003Recovery(command);
  const recovery = requestedMode === 'run-recovery' || requestedMode === 'reconcile-recovery';
  if (recovery) preservedPreflight();
  const mode = requestedMode === 'run-recovery' ? 'run-probe' : requestedMode === 'reconcile-recovery' ? 'reconcile-probe' : requestedMode;
  const ledgerPath = recovery ? fixed.recoveryLedger : fixed.ledger;
  if (mode === 'prepare') {
    const ledger = { schemaVersion: 'orqaly.synthetic-handler003.v1', scope: 'synthetic_runtime_only_not_customer_handler',
      stage: 'prepared', commandHash: fixed.commandHash, environmentId: fixed.environmentId, probeId: fixed.probeId,
      sourceWorkflowHash: command.workflowHash, sourceBundleHash: command.bundleHash,
      customerDatabaseWrites: false, customerWorkflowWrites: false, modelCalls: 0, providerCalls: 0, executionAttempted: false };
    writeFileSync(fixed.ledger, `${JSON.stringify(ledger, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { prepared: true, ledger: fixed.ledger, ...ledger };
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  assertHandler003Ledger(ledger, mode);
  if (recovery) {
    assert.deepEqual(ledger.originalPreflightEvidence, HANDLER003_PREFLIGHT_EVIDENCE);
    assert.match(ledger.protectedWorkflowMetadataHash ?? '', /^[a-f0-9]{64}$/);
    assert.equal(ledger.nodeAvailability?.catalogFetched, false);
    assert.equal(ledger.nodeAvailability?.realLinkedTerminalHandlerExecutionRequired, true);
  }
  const lock = `${ledgerPath}.${mode}.started`;
  assert(!existsSync(lock), 'same_operation_already_started_do_not_retry');
  writeFileSync(lock, `${JSON.stringify({ mode, commandHash: fixed.commandHash })}\n`, { flag: 'wx', mode: 0o600 });
  const save = (fields) => { Object.assign(ledger, fields); writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 }); };
  let step = 'runtime_metadata', httpStatus = null;
  try {
    const context = await runtimeContext({ catalogRequired: !recovery, setStep: (value) => { step = value; }, setHttpStatus: (value) => { httpStatus = value; } });
    const { metadata, binding, token, get } = context;
    step = 'workflow_inventory';
    const before = await get('/api/v1/workflows?limit=100');
    assert(Array.isArray(before.data) && !before.nextCursor);
    const artifact = createNativeFailureProbeArtifact(command);
    const names = nativeBundleMembers(artifact).map((member) => member.workflow.name);
    if (mode === 'run-probe') assert(!before.data.some((entry) => names.includes(entry.name)), 'prior_disposable_attempt_exists');
    const protectedHash = hash(before.data.filter((entry) => !names.includes(entry.name)));
    if (ledger.protectedWorkflowMetadataHash)
      assert.equal(protectedHash, ledger.protectedWorkflowMetadataHash, 'original_workflow_inventory_changed');
    if (recovery) preservedPreflight();
    save({ stage: mode === 'run-probe' ? 'dispatching' : 'reconciling', executionAttempted: true,
      metadata, ...(context.catalog ? { catalog: context.catalog } : { nodeAvailability: context.nodeAvailability }),
      protectedWorkflowMetadataHash: protectedHash, requests: ledger.requests ?? [] });
    const record = (event) => { ledger.requests.push(event); save({}); };
    const runtime = createSolutionRuntime({ bindings: [binding],
      getIdentityHeaders: async (origin) => { assert.equal(origin, fixed.origin); return { authorization: `Bearer ${token}` }; },
      fetchImpl: createHandler003ProbeTransport({ command, reconcile: mode === 'reconcile-probe', record }),
    });
    const scope = { tenantId: fixed.tenantId, userId: fixed.userId };
    step = 'runtime_dispatch';
    const result = mode === 'run-probe' ? await runtime.probeNativeFailure(scope, command) : await runtime.reconcileNativeFailureProbe(scope, command);
    step = 'receipt_validation';
    const safe = receipt(result, command);
    save({ stage: 'result_recorded', result: safe, cleanup: safe.cleanup });
    step = 'cleanup_inventory';
    const after = await get('/api/v1/workflows?limit=100');
    assert(Array.isArray(after.data) && !after.nextCursor);
    assert.equal(hash(after.data.filter((entry) => !names.includes(entry.name))), protectedHash, 'preexisting_workflow_metadata_changed');
    assert(!after.data.some((entry) => names.includes(entry.name)), 'disposable_cleanup_unconfirmed');
    save({ stage: 'verified', cleanup: { status: 'removed' }, protectedWorkflowMetadataPreserved: true,
      passed: safe.status === 'succeeded', noExecutionRetry: true, credentialsLogged: false });
    if (recovery) preservedPreflight();
    return { ledger: ledgerPath, stage: ledger.stage, passed: ledger.passed, ...safe,
      ...(recovery ? { nodeAvailability: ledger.nodeAvailability, originalLedgersPreserved: true } : {}),
      scope: ledger.scope, protectedWorkflowMetadataPreserved: true, customerDatabaseWrites: false, providerCalls: 0 };
  } catch {
    const failure = handler003SafeFailure(step, httpStatus);
    save({ stage: 'stopped', passed: false, ...failure, noExecutionRetry: true });
    return { ledger: ledgerPath, stage: 'stopped', passed: false, executionAttempted: ledger.executionAttempted,
      ...failure, cleanup: ledger.cleanup ?? { status: 'pending' }, credentialsLogged: false };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHandler003Acceptance(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.passed === false) process.exitCode = 1;
  }).catch(() => { process.stderr.write('handler003_acceptance_stopped_without_retry; inspect the safe ledger.\n'); process.exitCode = 1; });
}
