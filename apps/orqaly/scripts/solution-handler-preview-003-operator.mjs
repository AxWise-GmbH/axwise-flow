// Fixed existing003 preview only. inspect/plan are metadata-only; apply requires
// an explicit reviewed plan and confirmation. Never deploy Orqaly, change IAM,
// create a service/secret, or activate a production owned error-handler policy.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createBoundedHttpPolicy } from '../server/workflow-v2/native-workflow-review.js';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';

export const HANDLER_003 = Object.freeze({
  project: 'axwise-v2-preview-001', region: 'europe-west4',
  service: 'orqaly-solution-n8n-preview-003', environmentId: 'orqaly-customer-webhook-preview-003',
  secret: 'orqaly-solution-preview-001-002-003-environments', sourceSecretVersion: '2',
  image: 'europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/n8n-native-preview-003@sha256:245aab7912f5fa74547ef832ddc2ed195176260ee16767e25a4769c72812bee2',
  revision: 'orqaly-solution-n8n-preview-003-00001-sxg',
  suffix: 'handler-probe-sep7', tag: 'hp-sep7',
});
const { project, region, service, environmentId } = HANDLER_003;
const api = `orqaly-v2-api-preview@${project}.iam.gserviceaccount.com`;
const worker = `orqaly-v2-worker-preview@${project}.iam.gserviceaccount.com`;
const names = ['orqaly-solution-n8n-preview', 'orqaly-solution-n8n-preview-002', service];
const expectedSpecHashes = [
  '99b5df426015858177679873d0ed488263528896f5f39298344340c8803028f6',
  '35aabecb754ac4472e20bcb5200401196c6e66a5710f37150df0dc4e3a4a1242',
  '4e1bbd47a37ebfdf3a4e24f5e2c008bb6133fd04a562118e65ff13f8735a6d82',
];
const expectedIamHashes = [
  '0e7c99a617ede3e4c059ef9a86b9f42d04442c08a1389df749163851f5b324ba',
  '0e7c99a617ede3e4c059ef9a86b9f42d04442c08a1389df749163851f5b324ba',
  'e05afe3750bc9c3235d072171fc42b29c877c978f20972d339896bff7d3311e1',
];
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, canonical(v[key])])) : v;
export const handler003Hash = (v) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const fail = (code) => { throw new Error(code); };
const env = (value) => value.spec.template.spec.containers[0].env;
const nodes = (value) => JSON.parse(env(value).find((entry) => entry.name === 'NODES_INCLUDE')?.value ?? 'null');
const origin = `https://${service}-161074549006.${region}.run.app`;
const candidate = `${service}-${HANDLER_003.suffix}`;
export function assertHandler003TargetNames(target = HANDLER_003) {
  assert.equal(target.service, HANDLER_003.service, 'fixed003_service_required');
  for (const value of [target.tag, target.suffix])
    assert(typeof value === 'string' && /^[a-z][a-z0-9-]*[a-z0-9]$/.test(value), 'valid_cloud_run_target_name_required');
  assert(target.service.length + target.tag.length <= 46, 'cloud_run_tag_and_service_max46');
  assert(`${target.service}-${target.suffix}`.length <= 63, 'cloud_run_revision_max63');
}
const keepAnnotations = (value) => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) =>
  !['run.googleapis.com/operation-id', 'run.googleapis.com/ingress-status', 'run.googleapis.com/urls',
    'run.googleapis.com/client-name', 'run.googleapis.com/client-version'].includes(key)));
export function handler003Configuration(value, { normalizeClientNonce = true } = {}) {
  const spec = structuredClone(value.spec); delete spec.traffic;
  delete spec.template.metadata.name;
  spec.template.metadata.annotations = keepAnnotations(spec.template.metadata.annotations);
  // gcloud can remove this client-generated label when revising a service. It
  // is not runtime configuration; preserve every other label byte-for-byte.
  if (normalizeClientNonce && spec.template.metadata.labels) {
    delete spec.template.metadata.labels['client.knative.dev/nonce'];
    if (!Object.keys(spec.template.metadata.labels).length) delete spec.template.metadata.labels;
  }
  return { spec, annotations: keepAnnotations(value.metadata.annotations), labels: value.metadata.labels ?? {} };
}
export function desiredHandler003Configuration(value) {
  const next = structuredClone(value);
  next.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'] = 'false';
  env(next).find((entry) => entry.name === 'NODES_INCLUDE').value = JSON.stringify([...new Set([...nodes(value), 'n8n-nodes-base.errorTrigger'])]);
  return handler003Configuration(next);
}
export function probeOnlyHandler003Bindings(bindings) {
  assert(Array.isArray(bindings) && bindings.length === 3, 'exact_three_existing_bindings_required');
  assert.deepEqual([...bindings.map((entry) => entry.id)].sort(), [
    'orqaly-customer-webhook-preview-001', 'orqaly-customer-webhook-preview-002', environmentId,
  ]);
  const target = bindings.find((entry) => entry.id === environmentId);
  assert.equal(target.origin, origin); assert.equal(target.useIdToken, true);
  assert.equal(target.tenantId, 'c1b26d36-721b-5d8c-8d4c-180050ee9b94');
  assert.equal(target.userId, 'user_2vHlB9JhH4FazWsgKYENFIeAnMu');
  assert.equal(handler003Hash(target.nativePolicy), handler003Hash(createBoundedHttpPolicy({ imageDigest: HANDLER_003.image.split('@')[1] })));
  const next = structuredClone(bindings);
  const updated = next.find((entry) => entry.id === environmentId);
  updated.nativePolicy.ownedErrorHandlerProbe = true;
  updated.nativePolicy.backgroundExecution = 'instance_cpu_always';
  assert(!Object.hasOwn(updated.nativePolicy, 'ownedErrorHandlers'));
  assert.equal(handler003Hash(updated.nativePolicy.allowedNodes), handler003Hash(target.nativePolicy.allowedNodes));
  for (let i = 0; i < bindings.length; i++) {
    const before = bindings[i], after = structuredClone(next[i]);
    if (after.id === environmentId) after.nativePolicy = before.nativePolicy;
    assert.equal(handler003Hash(after), handler003Hash(before), 'only003_policy_flags_may_change');
  }
  // Constructor/schema-only; no network, credential creation or execution.
  const runtime = createSolutionRuntime({ bindings: next, fetchImpl: async () => fail('operator_must_not_invoke_runtime') });
  assert.equal(runtime.nativePolicy(target, environmentId).ownedErrorHandlerProbe, true);
  return next;
}
export function parseHandler003Arguments(args) {
  assertHandler003TargetNames();
  const [mode, file, confirmation] = args;
  if (!['inspect', 'plan', 'apply', 'plan-staged', 'resume-staged'].includes(mode)) fail('explicit_handler003_mode_required');
  if (mode === 'inspect') { if (args.length !== 1) fail('unexpected_operator_argument'); return { mode }; }
  if (!/^\/private\/tmp\/orqaly-handler-[A-Za-z0-9_-]+\.json$/.test(file ?? '')) fail('scoped_plan_path_required');
  if (['plan', 'plan-staged'].includes(mode) && args.length !== 2) fail('unexpected_operator_argument');
  if (['apply', 'resume-staged'].includes(mode) && (args.length !== 3 || confirmation !== '--confirm-existing-003-probe-only')) fail('explicit_reviewed_apply_required');
  return { mode, file };
}
function cloud(args, input) {
  return execFileSync('gcloud', [...args, `--project=${project}`], {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024, timeout: 180000,
  }).trim();
}
const json = (args) => JSON.parse(cloud([...args, '--format=json']));
const readService = (name) => json(['run', 'services', 'describe', name, `--region=${region}`]);
const readIam = (name) => json(['run', 'services', 'get-iam-policy', name, `--region=${region}`]);
function versionNumbers() {
  return json(['secrets', 'versions', 'list', HANDLER_003.secret]).map((entry) => ({
    version: entry.name.split('/').at(-1), state: entry.state,
  })).sort((a, b) => Number(a.version) - Number(b.version));
}
function ready(value) {
  for (const type of ['Ready', 'ConfigurationsReady', 'RoutesReady'])
    assert.equal(value.status.conditions.find((entry) => entry.type === type)?.status, 'True', 'runtime_not_ready');
}
function inspection() {
  const runtimes = names.map((name) => ({ service: readService(name), iam: readIam(name) }));
  const secretIam = json(['secrets', 'get-iam-policy', HANDLER_003.secret]);
  const versions = versionNumbers();
  const appRefs = ['orqaly-v2-api-preview', 'orqaly-v2-worker-preview'].map((name) => {
    const value = readService(name);
    return { name, reference: env(value).find((entry) => entry.name === 'ORQALY_SOLUTION_ENVIRONMENTS')?.valueFrom?.secretKeyRef };
  });
  return { runtimes, secretIam, versions, appRefs };
}
function baseline(current) {
  current.runtimes.forEach((entry, i) => {
    ready(entry.service);
    assert.equal(handler003Hash(entry.service.spec), expectedSpecHashes[i], `runtime${i + 1}_baseline_drift`);
    assert.equal(handler003Hash(entry.iam.bindings ?? []), expectedIamHashes[i], 'runtime_iam_drift');
  });
  assert.deepEqual(current.versions, [{ version: '1', state: 'ENABLED' }, { version: '2', state: 'ENABLED' }]);
  for (const entry of current.appRefs) assert.deepEqual(entry.reference, { name: HANDLER_003.secret, key: '2' });
  const bindings = current.secretIam.bindings ?? [];
  assert.equal(bindings.length, 1, 'secret_iam_scope_drift');
  assert.equal(bindings[0].role, 'roles/secretmanager.secretAccessor');
  assert(!bindings[0].condition);
  assert.deepEqual([...bindings[0].members].sort(), [`serviceAccount:${api}`, `serviceAccount:${worker}`].sort());
  const target = current.runtimes[2].service;
  assert.equal(target.spec.template.spec.containers[0].image, HANDLER_003.image);
  assert.equal(target.status.latestReadyRevisionName, HANDLER_003.revision);
  assert.equal(nodes(target).length, 15); assert(!nodes(target).includes('n8n-nodes-base.errorTrigger'));
  assert.deepEqual(target.status.traffic.map(({ revisionName, percent, tag }) => ({ revisionName, percent, tag })),
    [{ revisionName: HANDLER_003.revision, percent: 100, tag: undefined }]);
}
export function handler003PlanReceipt(current) {
  return { schemaVersion: 'orqaly.handler003.plan.v1', project, region, service,
    runtimes: current.runtimes.map((entry) => ({ name: entry.service.metadata.name,
      specHash: handler003Hash(entry.service.spec), configHash: handler003Hash(handler003Configuration(entry.service)),
      iamHash: handler003Hash(entry.iam.bindings ?? []) })),
    secretIamHash: handler003Hash(current.secretIam.bindings ?? []), versions: current.versions, appRefs: current.appRefs,
    image: HANDLER_003.image, baselineRevision: HANDLER_003.revision,
    candidateRevision: candidate, revisionSuffix: HANDLER_003.suffix, trafficTag: HANDLER_003.tag,
    desiredConfigHash: handler003Hash(desiredHandler003Configuration(current.runtimes[2].service)),
    changes: { cpuThrottling: false, appendNode: 'n8n-nodes-base.errorTrigger', minInstances: 0, maxInstances: 1,
      newBindingVersion: '3', ownedErrorHandlerProbe: true, ownedErrorHandlers: 'absent', externalEffects: false,
      attachesBindingToOrqaly: false, changesIam: false, changes001002: false } };
}
function assertPreserved(current, original, targetConfig) {
  for (let i = 0; i < 3; i++) {
    assert.equal(handler003Hash(current.runtimes[i].iam.bindings ?? []), original.runtimes[i].iamHash, 'iam_changed');
    if (i < 2) {
      assert.equal(handler003Hash(current.runtimes[i].service.spec), original.runtimes[i].specHash, 'old_runtime_changed');
      assert.equal(handler003Hash(handler003Configuration(current.runtimes[i].service)), original.runtimes[i].configHash, 'old_runtime_metadata_changed');
    }
    else assert.equal(handler003Hash(handler003Configuration(current.runtimes[i].service)), targetConfig, 'unexpected003_config_change');
  }
  assert.equal(handler003Hash(current.secretIam.bindings ?? []), original.secretIamHash, 'secret_iam_changed');
  assert.deepEqual(current.appRefs, original.appRefs, 'orqaly_binding_attachment_changed');
}
const STAGED_ORIGINAL_PLAN = '/private/tmp/orqaly-handler-corrected-sep7.json';
const STAGED_ORIGINAL_HASH = '09a341ac972dbae1e2dadade9a1ce15022c57ab4af4cc59728554a9f35ccbf61';
const STAGED_CONFIG_HASH = '9dd5a0aff2216507d44300adb2a0de470cf63ba06af54a6e311e990432a0f9de';
const preservedFiles = [
  ['/private/tmp/orqaly-handler-reviewed-sep7.json', '926ce6e765b26d1c41d44cc80c97536a8d0c2900644ed2b7b7fb6a64ac050d39'],
  ['/private/tmp/orqaly-handler-reviewed-sep7.json.state', '820293544b76e4ffb83327d3c1392c3b8b91db8cb29c00c9acc15732cbc4c366'],
  ['/private/tmp/orqaly-handler-rejected-sep7.json', '18eac7dbf9e57868e1ec4723a73a8d0037a7f091453be35adb89ffa7e390628f'],
  [STAGED_ORIGINAL_PLAN, '8d6fd0b114bda62eb2ce26e71ced1afd529d5bf435362ad4b25d959660022437'],
  [`${STAGED_ORIGINAL_PLAN}.state`, 'bf88e8d852aa69578c59b03ceb04db3aa4a3e204dff3f6e7833fa930af5307e2'],
];
function preservedStagedInputs() {
  for (const [path, sha256] of preservedFiles)
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), sha256, 'original_operator_evidence_changed');
  const original = JSON.parse(readFileSync(STAGED_ORIGINAL_PLAN, 'utf8'));
  assert.equal(handler003Hash(original), STAGED_ORIGINAL_HASH, 'original_staged_plan_changed');
  assert.deepEqual(JSON.parse(readFileSync(`${STAGED_ORIGINAL_PLAN}.state`, 'utf8')),
    { planHash: STAGED_ORIGINAL_HASH, stage: 'staged', mutationAttempted: true }, 'original_staged_state_changed');
  return original;
}
export function assertHandler003StagedRuntime(current, planned) {
  assertPreserved(current, planned, planned.desiredConfigHash);
  assert.deepEqual(current.versions, [{ version: '1', state: 'ENABLED' }, { version: '2', state: 'ENABLED' }], 'binding_versions_changed');
  for (const entry of current.appRefs) assert.deepEqual(entry.reference, { name: HANDLER_003.secret, key: '2' });
  for (const entry of current.runtimes) ready(entry.service);
  const target = current.runtimes[2].service;
  assert.equal(target.status.latestReadyRevisionName, candidate, 'staged_candidate_not_ready');
  assert.equal(target.status.latestCreatedRevisionName, candidate, 'another_revision_created');
  assert.equal(target.spec.template.metadata.name, candidate, 'staged_template_changed');
  assert.equal(target.spec.template.spec.containers[0].image, HANDLER_003.image, 'staged_image_changed');
  assert.equal(target.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'], 'false');
  assert.equal(nodes(target).filter((type) => type === 'n8n-nodes-base.errorTrigger').length, 1);
  const traffic = (entries) => entries.map(({ revisionName, percent, tag, latestRevision }) =>
    ({ revisionName, percent: percent ?? 0, tag: tag ?? null, latestRevision: latestRevision ?? false }));
  const expected = traffic([{ revisionName: HANDLER_003.revision, percent: 100 }, { revisionName: candidate, tag: HANDLER_003.tag }]);
  assert.deepEqual(traffic(target.spec.traffic), expected, 'staged_desired_traffic_changed');
  assert.deepEqual(traffic(target.status.traffic), expected, 'staged_actual_traffic_changed');
}
function stagedPlan(current, original) {
  // Original ledgers predate nonce normalization: retain their stricter old
  // service projections, and bind the exact separately-reviewed normalized003.
  for (let i = 0; i < 2; i++) {
    assert.equal(handler003Hash(current.runtimes[i].service.spec), original.runtimes[i].specHash, 'old_runtime_changed');
    assert.equal(handler003Hash(handler003Configuration(current.runtimes[i].service, { normalizeClientNonce: false })),
      original.runtimes[i].configHash, 'old_runtime_metadata_changed');
  }
  const planned = { ...handler003PlanReceipt(current), schemaVersion: 'orqaly.handler003.staged-reconciliation.v1',
    originalPlanHash: STAGED_ORIGINAL_HASH, originalStage: 'staged',
    preservedEvidence: preservedFiles.map(([path, sha256]) => ({ path, sha256 })),
    normalization: 'template.labels.client.knative.dev/nonce_only',
    desiredConfigHash: STAGED_CONFIG_HASH,
    remainingSteps: ['tagged_metadata_health', 'promote_existing_candidate', 'remove_only_hp-sep7_tag', 'publish_and_readback_probe_only_binding3'],
    restagesRuntime: false, readsSecretValuesDuringPlan: false };
  for (let i = 0; i < 3; i++) assert.equal(planned.runtimes[i].iamHash, original.runtimes[i].iamHash, 'iam_changed');
  assert.equal(planned.secretIamHash, original.secretIamHash, 'secret_iam_changed');
  assert.deepEqual(planned.appRefs, original.appRefs, 'orqaly_binding_attachment_changed');
  assertHandler003StagedRuntime(current, planned);
  return planned;
}
async function taggedHealth() {
  const port = await new Promise((yes, no) => {
    const listener = net.createServer(); listener.once('error', no);
    listener.listen(0, '127.0.0.1', () => { const selected = listener.address().port; listener.close(() => yes(selected)); });
  });
  const child = spawn('gcloud', ['run', 'services', 'proxy', service, `--project=${project}`, `--region=${region}`,
    `--tag=${HANDLER_003.tag}`, `--port=${port}`], { stdio: 'ignore' });
  let failed = false; child.on('error', () => { failed = true; });
  try {
    for (let i = 0; i < 60; i++) {
      if (failed || child.exitCode !== null) fail('owned_readiness_proxy_failed');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/rest/settings`, { redirect: 'error', signal: AbortSignal.timeout(1000) });
        if (response.ok && response.headers.get('content-type')?.includes('application/json') && (await response.json()).data) return;
      } catch {}
      await delay(500);
    }
    fail('staged_runtime_metadata_readiness_failed');
  } finally { child.kill('SIGTERM'); }
}
export async function runHandler003Operator(args) {
  const { mode, file } = parseHandler003Arguments(args);
  const current = inspection();
  if (mode === 'inspect') return { readOnly: true, ...handler003PlanReceipt(current) };
  if (mode === 'plan-staged' || mode === 'resume-staged') {
    const original = preservedStagedInputs();
    const planned = stagedPlan(current, original);
    assert(!preservedFiles.some(([path]) => path === file || path === `${file}.state`), 'new_reconciliation_evidence_path_required');
    if (mode === 'plan-staged') {
      writeFileSync(file, `${JSON.stringify(planned, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      return { readOnly: true, plan: file, planHash: handler003Hash(planned), originalEvidencePreserved: true };
    }
    assert.equal(handler003Hash(JSON.parse(readFileSync(file, 'utf8'))), handler003Hash(planned), 'reviewed_staged_plan_drift');
    const statePath = `${file}.state`;
    assert(!existsSync(statePath), 'reconciliation_already_started_inspect_without_retry');
    let state = { planHash: handler003Hash(planned), originalPlanHash: STAGED_ORIGINAL_HASH,
      stage: 'starting_reconciliation', mutationAttempted: false };
    writeFileSync(statePath, `${JSON.stringify(state)}\n`, { flag: 'wx', mode: 0o600 });
    const save = (stage, extra = {}) => {
      state = { ...state, ...extra, stage }; writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 }); return state;
    };
    await taggedHealth(); save('staged_metadata_ready');
    assertHandler003StagedRuntime(inspection(), planned); preservedStagedInputs();
    const previous = JSON.parse(cloud(['secrets', 'versions', 'access', '2', `--secret=${HANDLER_003.secret}`]));
    const next = probeOnlyHandler003Bindings(previous);
    save('promotion_pending', { mutationAttempted: true });
    const result = await completeStagedHandler003({ planned, previous, next, save, healthVerified: true });
    preservedStagedInputs();
    return { ...result, originalEvidencePreserved: true, restagedRuntime: false };
  }
  baseline(current);
  const planned = handler003PlanReceipt(current);
  if (mode === 'plan') {
    writeFileSync(file, `${JSON.stringify(planned, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { readOnly: true, plan: file, planHash: handler003Hash(planned) };
  }
  assert.equal(handler003Hash(JSON.parse(readFileSync(file, 'utf8'))), handler003Hash(planned), 'reviewed_plan_drift');
  const statePath = `${file}.state`;
  assert(!existsSync(statePath), 'apply_already_started_inspect_and_reconcile_without_retry');
  // Secret values never enter arguments, disk, output, logs, or n8n. New version
  // merely preserves all existing values while adding two003 policy flags.
  const previous = JSON.parse(cloud(['secrets', 'versions', 'access', '2', `--secret=${HANDLER_003.secret}`]));
  const next = probeOnlyHandler003Bindings(previous);
  let state = { planHash: handler003Hash(planned), stage: 'starting', mutationAttempted: true };
  writeFileSync(statePath, `${JSON.stringify(state)}\n`, { flag: 'wx', mode: 0o600 });
  const save = (stage, extra = {}) => { state = { ...state, ...extra, stage }; writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 }); return state; };
  // A no-traffic revision starts a real n8n process; this is not an inert check.
  cloud(['run', 'services', 'update', service, `--region=${region}`, '--no-cpu-throttling',
    `--update-env-vars=^~^NODES_INCLUDE=${JSON.stringify([...nodes(current.runtimes[2].service), 'n8n-nodes-base.errorTrigger'])}`,
    `--revision-suffix=${HANDLER_003.suffix}`, `--tag=${HANDLER_003.tag}`, '--no-traffic', '--quiet']);
  save('staged');
  const actual = inspection();
  assertPreserved(actual, planned, planned.desiredConfigHash); ready(actual.runtimes[2].service);
  assert.equal(actual.runtimes[2].service.status.latestReadyRevisionName, candidate);
  const traffic = actual.runtimes[2].service.status.traffic;
  assert.equal(traffic.filter((entry) => (entry.percent ?? 0) > 0).length, 1);
  assert(traffic.some((entry) => entry.revisionName === HANDLER_003.revision && entry.percent === 100));
  assert(traffic.some((entry) => entry.revisionName === candidate && entry.tag === HANDLER_003.tag && !entry.percent));
  return completeStagedHandler003({ planned, previous, next, save });
}
async function completeStagedHandler003({ planned, previous, next, save, healthVerified = false }) {
  if (!healthVerified) { await taggedHealth(); save('staged_metadata_ready'); }
  cloud(['run', 'services', 'update-traffic', service, `--region=${region}`, `--to-revisions=${candidate}=100`, '--quiet']);
  save('promoted');
  cloud(['run', 'services', 'update-traffic', service, `--region=${region}`, `--remove-tags=${HANDLER_003.tag}`, '--quiet']);
  let actual = inspection(); assertPreserved(actual, planned, planned.desiredConfigHash); ready(actual.runtimes[2].service);
  assert.deepEqual(actual.runtimes[2].service.status.traffic.map(({ revisionName, percent, tag }) => ({ revisionName, percent, tag })),
    [{ revisionName: candidate, percent: 100, tag: undefined }]);
  assert.deepEqual(actual.versions, planned.versions);
  save('runtime_verified_binding_publish_pending');
  const version = jsonWithInput(['secrets', 'versions', 'add', HANDLER_003.secret, '--data-file=-', '--quiet'], JSON.stringify(next));
  save('binding_write_acknowledged', { returnedVersion: version.name.split('/').at(-1) });
  assert.equal(version.name.split('/').at(-1), '3', 'unexpected_new_secret_version');
  save('binding_published', { secretReference: `${HANDLER_003.secret}:3` });
  const saved = JSON.parse(cloud(['secrets', 'versions', 'access', '3', `--secret=${HANDLER_003.secret}`]));
  assert.equal(handler003Hash(saved), handler003Hash(next), 'binding_version_readback_mismatch');
  assert.equal(handler003Hash(JSON.parse(cloud(['secrets', 'versions', 'access', '2', `--secret=${HANDLER_003.secret}`]))), handler003Hash(previous), 'original_binding_changed');
  actual = inspection(); assertPreserved(actual, planned, planned.desiredConfigHash);
  assert.deepEqual(actual.versions, [...planned.versions, { version: '3', state: 'ENABLED' }]);
  const state = save('complete');
  return { ...state, verified: true, revision: candidate, image: HANDLER_003.image, configHash: planned.desiredConfigHash,
    minInstances: 0, maxInstances: 1, productionHandlersEnabled: false, orqalyBindingUnchanged: true,
    metadataReadiness: true, actualHandlerExecution: 'not_performed', oldRuntimesPreserved: true, iamPreserved: true };
}
function jsonWithInput(args, input) { return JSON.parse(cloud([...args, '--format=json'], input)); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHandler003Operator(process.argv.slice(2)).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch(() => { process.stderr.write('handler003_operator_stopped; inspect cloud metadata and the safe state receipt before any retry. No secret values are logged.\n'); process.exitCode = 1; });
}
