// PREPARED OPERATOR ACCEPTANCE. Cloud effects require an explicit reviewed run.
// A real deployed AxWise/worker designs and tests one new provider-free Build.
// This operator uses production service methods with the existing restricted API
// DB role, NOT a forged Clerk session. It never claims worker jobs, fabricates
// model output/evidence, rewinds due dates, or changes old customer releases.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createSolutionBuildService } from '../server/workflow-v2/solution-build-service.js';
import { createSolutionService } from '../server/workflow-v2/solution-service.js';
import { createSolutionScheduleService } from '../server/workflow-v2/solution-schedule-service.js';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { createBoundedHttpPolicy, reviewNativeWorkflow } from '../server/workflow-v2/native-workflow-review.js';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';

export const SCHEDULE_PREVIEW = Object.freeze({
  sourceCommit: '7b330159069b426730183ffb55ae68a90e19e2ff',
  project: 'axwise-v2-preview-001', region: 'europe-west4', port: 19529,
  tenantId: 'c1b26d36-721b-5d8c-8d4c-180050ee9b94', userId: 'user_2vHlB9JhH4FazWsgKYENFIeAnMu',
  sourceSolutionId: '8b606adc-91ba-46e5-86da-ece609df9c7d',
  oldSolutionId: '2031decc-b21e-48b5-9bd5-3ed3d4dfd024',
  runId: 'c1cb54ec-00f5-5106-b7ff-16acf5640c07', agentId: '1155b480-afad-471f-aa05-ffa4046b4168',
  environmentId: 'orqaly-customer-webhook-preview-003',
  nativeOrigin: 'https://orqaly-solution-n8n-preview-003-161074549006.europe-west4.run.app',
  nativeImage: 'sha256:245aab7912f5fa74547ef832ddc2ed195176260ee16767e25a4769c72812bee2',
  applicationImage: 'europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqaly-execution@sha256:c16d032de3271fe40a658ad96a43ae5c3a9ea061b41c978dad1185a81974afc5',
  prefix: 'native-schedule-preview-20260906-v1',
  // Root observed signed-in Agent hub -> exact task -> Prepare workflow.
  approvedBuildId: '637fcfaf-3864-468b-ad36-47337b80c484',
});
const fixed = SCHEDULE_PREVIEW;
const scope = { tenantId: fixed.tenantId, userId: fixed.userId };
const auth = { userId: fixed.userId };
const input = Object.freeze({ text: '  preview schedule  ' });
const output = Object.freeze({ text: 'preview schedule' });
export const schedulePreviewInstruction = () => [
  'Create a NEW provider-free native n8n JSON webhook workflow for the existing task Agent.',
  'Its name must be "Synthetic preview: scheduled text normalization". This is a clearly labelled preview acceptance, not a customer integration.',
  'HTTP POST receives a JSON object with exactly one required string field text (maximum 200 characters).',
  'Return HTTP 200 JSON {"text": input.text.trim()}, with no other output fields. Only trim leading/trailing whitespace; preserve all inner characters.',
  'Use runtimeProfile request_automation, no connections, no credentials, no external network/provider, no Code node and no JavaScript code execution.',
  'Use native Webhook, Edit Fields/Set with a pure data trim expression, and Respond to Webhook. The input is $json.body.text, not body.input.',
  'The inputSchema and outputSchema are objects with text as required string, additionalProperties false; input text maxLength 200.',
  'Include exactly ONE frozen acceptanceCase id trim-text, requirementIds [trim-text], input {"text":"  preview schedule  "}, expectedOutput {"text":"preview schedule"}, expectedStatus 200, assertions [].',
  'The requirement trim-text is: remove leading and trailing whitespace and return the text JSON object.',
  'There are no unanswered business decisions. Orqaly handles webhook path and correlation headers; do not generate scheduling nodes. A separately approved Orqaly 5-minute schedule will call this released workflow.',
].join('\n');

export function validateSchedulePreviewSource(value) {
  assert.deepEqual(value, {
    tenant_id: fixed.tenantId, owner_user_id: fixed.userId, solution_id: fixed.sourceSolutionId,
    build_id: fixed.sourceSolutionId, agent_id: fixed.agentId, run_id: fixed.runId,
    build_status: 'completed', build_owner: fixed.userId, run_owner: fixed.userId,
  }, 'exact_owned_source_link_required');
}

export function validateSchedulePreviewAdoption(value, createdEvent, expectedId) {
  assert.match(expectedId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert(![fixed.sourceSolutionId, fixed.oldSolutionId].includes(expectedId), 'must_adopt_new_build_only');
  assert.equal(value.id, expectedId); assert.equal(value.tenant_id, fixed.tenantId);
  assert.equal(value.owner_user_id, fixed.userId); assert.equal(value.run_id, fixed.runId); assert.equal(value.agent_id, fixed.agentId);
  assert.equal(value.preparation_version, 2); assert(['preparing', 'draft'].includes(value.status), 'only_fresh_unapproved_build');
  assert.equal(hash(value.instruction), hash(schedulePreviewInstruction()), 'verbatim_reviewed_instruction_required');
  assert.equal(value.create_hash, hash({ runId: fixed.runId, agentId: fixed.agentId, instruction: schedulePreviewInstruction() }));
  assert.equal(value.solution_id, null); assert.equal(value.environment_id, null);
  assert.equal(value.review, null); assert(!value.native_metadata?.pendingTest && !value.native_metadata?.testEvidence);
  assert.equal(value.agent_snapshot.id, fixed.agentId); assert.match(value.agent_snapshot.profileHash, /^[a-f0-9]{64}$/);
  assert.equal(createdEvent.kind, 'created'); assert.equal(createdEvent.build_request_id, expectedId);
  assert.equal(createdEvent.tenant_id, fixed.tenantId); assert.equal(createdEvent.owner_user_id, fixed.userId);
  return { buildId: expectedId, instructionHash: hash(value.instruction), createHash: value.create_hash, agentProfileHash: value.agent_snapshot.profileHash };
}

export function validateSchedulePreviewBusinessContract(build) {
  assert.equal(build.spec?.kind, 'n8n_workflow_v2');
  assert.equal(build.spec.runtimeProfile, 'request_automation');
  assert.deepEqual(build.spec.connections, []);
  assert.equal(build.name, 'Synthetic preview: scheduled text normalization');
  assert.equal(build.runId, fixed.runId); assert.equal(build.agentId, fixed.agentId);
  assert.deepEqual(build.questions, []);
  assert.equal(build.workflowHash, hash(build.workflow));
  assert.equal(build.spec.acceptanceCases.length, 1);
  const acceptance = build.spec.acceptanceCases[0];
  assert.equal(acceptance.id, 'trim-text'); assert.deepEqual(acceptance.input, input);
  assert.deepEqual(acceptance.expectedOutput, output); assert.equal(acceptance.expectedStatus ?? 200, 200);
  assert.deepEqual(acceptance.assertions, []);
  for (const schema of [build.spec.inputSchema, build.spec.outputSchema]) {
    assert.equal(schema.type, 'object'); assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ['text']); assert.deepEqual(Object.keys(schema.properties), ['text']);
    assert.equal(schema.properties.text.type, 'string');
  }
  assert.equal(build.spec.inputSchema.properties.text.maxLength, 200);
  const types = new Set(['n8n-nodes-base.webhook', 'n8n-nodes-base.set', 'n8n-nodes-base.respondToWebhook']);
  assert(build.workflow.nodes.every(node => types.has(node.type) && !node.credentials), 'provider_free_only');
  return { input, output, workflowHash: build.workflowHash };
}

export function validateSchedulePreviewCandidate(build, policy) {
  const contract = validateSchedulePreviewBusinessContract(build);
  const checked = reviewNativeWorkflow({ workflow: build.workflow, spec: build.spec, runtimePolicy: policy, connections: [], environmentId: fixed.environmentId });
  assert.equal(checked.valid, true, 'model_candidate_must_pass_real_static_review');
  assert.equal(checked.execution.allowed, true, 'pure_execution_policy_required');
  return contract;
}

export function validateSchedulePreviewDesign(attempt, event, build) {
  assert.equal(attempt.tenant_id, fixed.tenantId); assert.equal(attempt.owner_user_id, fixed.userId);
  assert.equal(attempt.build_request_id, build.id); assert.equal(attempt.input_version, build.inputVersion);
  assert.equal(attempt.status, 'completed'); assert(attempt.dispatch_count > 0);
  const envelope = attempt.envelope;
  assert.equal(envelope.operationType, 'PrepareSolutionV2'); assert.equal(envelope.operationId, attempt.operation_id);
  assert.deepEqual(envelope.owner, { ...scope, organizationId: null });
  assert.equal(envelope.workflow.runId, fixed.runId);
  assert.equal(envelope.input.type, 'PrepareSolutionV2'); assert.equal(envelope.input.buildRequestId, build.id);
  assert.equal(envelope.input.inputVersion, build.inputVersion); assert.equal(envelope.input.source.runId, fixed.runId);
  assert.equal(envelope.input.agent.id, fixed.agentId);
  assert.equal(envelope.canonicalInputHash, hash(envelope.input)); assert.equal(attempt.input_hash, envelope.canonicalInputHash);
  const prepared = attempt.result;
  assert.equal(prepared.schemaVersion, 'axwise.solution-preparation.v2'); assert.equal(prepared.outcome, 'candidate');
  assert.equal(prepared.buildRequestId, build.id); assert.equal(prepared.inputVersion, build.inputVersion);
  assert.equal(hash(prepared.spec), hash(build.spec));
  assert.equal(normalizeNativeWorkflow({ workflow: prepared.workflow, id: build.id }).workflowHash, build.workflowHash);
  assert.equal(event.kind, 'design_completed'); assert.equal(event.build_request_id, build.id);
  assert.equal(event.tenant_id, fixed.tenantId); assert.equal(event.owner_user_id, fixed.userId);
  assert.equal(event.input_version, build.inputVersion); assert.equal(event.details.operationId, attempt.operation_id);
  assert.equal(event.details.workflowHash, build.workflowHash);
  return { operationId: attempt.operation_id, inputHash: attempt.input_hash, resultHash: hash(prepared) };
}

export async function schedulePreviewReadOnly(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SELECT set_config('orqaly.tenant_id',$1,true)", [fixed.tenantId]);
    await client.query("SELECT set_config('orqaly.build_owner_user_id',$1,true)", [fixed.userId]);
    return await callback(client);
  } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
}

const cloud = args => execFileSync('gcloud', [...args, `--project=${fixed.project}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 }).trim();
const cloudJson = args => JSON.parse(cloud([...args, '--format=json']));
const secret = (name, version) => cloud(['secrets', 'versions', 'access', version, `--secret=${name}`]);
const describe = name => cloudJson(['run', 'services', 'describe', name, `--region=${fixed.region}`]);
const environment = service => new Map(service.spec.template.spec.containers[0].env.map(item => [item.name, item]));
export function validateSchedulePreviewDeployment(service, name) {
  assert(['orqaly-v2-api-preview', 'orqaly-v2-worker-preview'].includes(name));
  assert(service.status.conditions.some(item => item.type === 'Ready' && item.status === 'True'));
  const current = service.status.traffic.filter(item => item.percent === 100);
  assert.equal(current.length, 1); assert.equal(current[0].revisionName, `${name}-exec-7b330159`, 'frozen_current_runtime_release_required');
  assert.equal(service.status.traffic.reduce((sum, item) => sum + (item.percent ?? 0), 0), 100);
  assert.equal(service.spec.template.spec.containers[0].image, fixed.applicationImage);
  const env = environment(service);
  assert.equal(env.get('ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED')?.value, 'true');
  assert.equal(env.get('ORQALY_SOLUTION_SCHEDULES_ENABLED')?.value, 'true');
  assert.deepEqual(JSON.parse(env.get('ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS')?.value), [fixed.environmentId]);
  assert.deepEqual(env.get('ORQALY_SOLUTION_ENVIRONMENTS')?.valueFrom?.secretKeyRef, { name: 'orqaly-solution-preview-001-002-003-environments', key: '2' });
  return env;
}
function pinnedSecret(env, key, pattern) {
  const ref = env.get(key)?.valueFrom?.secretKeyRef;
  assert(ref && pattern.test(ref.name) && /^[1-9][0-9]*$/.test(ref.key), 'explicit_deployed_secret_version_required');
  return secret(ref.name, ref.key);
}
function oldCloudSnapshot() {
  return Object.fromEntries(['orqaly-solution-n8n-preview', 'orqaly-solution-n8n-preview-002'].map(name => {
    const service = describe(name), iam = cloudJson(['run', 'services', 'get-iam-policy', name, `--region=${fixed.region}`]);
    const annotations = Object.fromEntries(Object.entries(service.spec.template.metadata.annotations || {}).filter(([key]) => !/client-|operation-id/.test(key)));
    return [name, { specHash: hash({ spec: service.spec.template.spec, annotations }), iamHash: hash(iam.bindings || []) }];
  }));
}
async function protectedSnapshot(pool) {
  return schedulePreviewReadOnly(pool, async client => {
    const result = {};
    for (const table of ['customer_solutions', 'solution_revisions', 'solution_revision_events', 'solution_invocations']) {
      const rows = (await client.query(`SELECT to_jsonb(t) AS value FROM orqaly.${table} t WHERE tenant_id=$1 AND owner_user_id=$2 AND ${table === 'customer_solutions' ? 'id' : 'solution_id'}=ANY($3::uuid[]) ORDER BY id LIMIT 201`,
        [fixed.tenantId, fixed.userId, [fixed.sourceSolutionId, fixed.oldSolutionId]])).rows;
      assert(rows.length <= 200); if (table === 'customer_solutions') assert.equal(rows.length, 2);
      result[table] = { count: rows.length, hash: hash(rows) };
    }
    return result;
  });
}

// Covers a committed schedule create whose response was lost. This exact-key
// read never creates/retries a schedule or touches another customer's schedule.
export async function pauseSchedulePreviewSafely({ pool, schedules, buildId, scheduleId }) {
  if (!scheduleId) {
    const rows = await schedulePreviewReadOnly(pool, async client => (await client.query(
      'SELECT id FROM orqaly.solution_schedules WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND create_key=$4',
      [fixed.tenantId, fixed.userId, buildId, `${fixed.prefix}-schedule`]
    )).rows);
    assert(rows.length <= 1, 'ambiguous_schedule_cleanup');
    if (!rows.length) return { status: 'not_created', scheduleId: null };
    scheduleId = rows[0].id;
  }
  const result = await schedules.pause(auth, buildId, scheduleId);
  assert.equal(result.schedule.status, 'paused');
  return { status: 'paused', scheduleId };
}

export async function runNativeSchedulePreview(mode, adoptedBuildId = null) {
  assert(['inspect', 'adopt-exact-existing-build'].includes(mode));
  if (mode === 'adopt-exact-existing-build') {
    assert(fixed.approvedBuildId, 'root_approved_ui_build_id_not_set');
    assert.equal(adoptedBuildId, fixed.approvedBuildId);
  } else assert.equal(adoptedBuildId, null);
  let stage = 'preflight', repository, pool, proxy, proxyFailed = false, schedules, buildId, scheduleId, verified = false, paused = false, scheduleRequested = false, interrupted = false;
  const stop = () => { interrupted = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const safe = () => ({ stage, buildId: buildId ?? null, scheduleId: scheduleId ?? null });
  const log = evidence => console.log(JSON.stringify({ ...safe(), ...evidence }));
  try {
    const frozenPaths = ['server/workflow-v2', 'shared/workflow-v2', 'services/agentic-control-plane', 'lib/workflow-v2', 'infra/n8n', 'package.json', 'package-lock.json'];
    const git = args => execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
    assert.equal(git(['diff', '--name-only', fixed.sourceCommit, '--', ...frozenPaths]), '', 'runtime_sources_changed_since_deployment');
    assert.equal(git(['status', '--porcelain', '--', ...frozenPaths]), '', 'runtime_sources_must_be_clean');
    const apiEnv = validateSchedulePreviewDeployment(describe('orqaly-v2-api-preview'), 'orqaly-v2-api-preview');
    const workerEnv = validateSchedulePreviewDeployment(describe('orqaly-v2-worker-preview'), 'orqaly-v2-worker-preview');
    assert.deepEqual(apiEnv.get('ORQALY_SOLUTION_ENVIRONMENTS')?.valueFrom, workerEnv.get('ORQALY_SOLUTION_ENVIRONMENTS')?.valueFrom);
    const free = createServer(); await new Promise((resolve, reject) => { free.once('error', reject); free.listen(fixed.port, '127.0.0.1', resolve); }); await new Promise(resolve => free.close(resolve));
    const url = new URL(secret('orqaly-v2-preview-001-db-api-url', '2').replace('@/', '@localhost/'));
    assert.equal(url.pathname, '/orqaly_v2_preview_001'); url.hostname = '127.0.0.1'; url.port = String(fixed.port); url.searchParams.delete('host'); url.searchParams.delete('sslmode');
    proxy = spawn('cloud-sql-proxy', [`${fixed.project}:${fixed.region}:orqaly-v2-preview-001-pg`, '--gcloud-auth', '--address=127.0.0.1', `--port=${fixed.port}`], { stdio: 'ignore' });
    proxy.once('error', () => { proxyFailed = true; });
    pool = new pg.Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    let connected = false;
    for (let index = 0; index < 30; index++) {
      assert(!proxyFailed && proxy.exitCode === null, 'owned_proxy_failed');
      try { await schedulePreviewReadOnly(pool, async client => {
        const role = (await client.query("SELECT current_database() AS db,pg_has_role(current_user,'orqaly_api','member') AS api,pg_has_role(current_user,'orqaly_worker','member') AS worker,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
        assert.deepEqual(role, { db: 'orqaly_v2_preview_001', api: true, worker: false, rolsuper: false, rolbypassrls: false });
      }); connected = true; break; } catch { await delay(500); }
    }
    assert(connected, 'restricted_database_not_ready');
    let adoptionProof;
    await schedulePreviewReadOnly(pool, async client => {
      const rows = (await client.query(`SELECT s.tenant_id,s.owner_user_id,s.id AS solution_id,b.id AS build_id,b.agent_id,b.run_id,b.status AS build_status,b.owner_user_id AS build_owner,r.owner_user_id AS run_owner
        FROM orqaly.customer_solutions s JOIN orqaly.solution_build_requests b ON b.tenant_id=s.tenant_id AND b.id=s.build_request_id AND b.solution_id=s.id AND b.agent_id=s.agent_id
        JOIN orqaly.workflow_runs r ON r.tenant_id=b.tenant_id AND r.id=b.run_id
        WHERE s.tenant_id=$1 AND s.owner_user_id=$2 AND s.id=$3`, [fixed.tenantId, fixed.userId, fixed.sourceSolutionId])).rows;
      assert.equal(rows.length, 1); validateSchedulePreviewSource(rows[0]);
      assert.equal((await client.query('SELECT status FROM orqaly.tenants WHERE id=$1', [fixed.tenantId])).rows[0]?.status, 'active');
      const occupied = (await client.query(`SELECT id FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND environment_id=$3
        UNION SELECT id FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND environment_id=$3`, [fixed.tenantId, fixed.userId, fixed.environmentId])).rows;
      assert.equal(occupied.length, 0, 'runtime003_must_be_unassigned');
      assert.equal((await client.query('SELECT id FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND create_key=$3', [fixed.tenantId, fixed.userId, `${fixed.prefix}-create`])).rows.length, 0, 'existing_acceptance_build_requires_review_not_replay');
      if (mode === 'adopt-exact-existing-build') {
        const values = (await client.query('SELECT * FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3', [fixed.tenantId, fixed.userId, adoptedBuildId])).rows;
        const events = (await client.query("SELECT * FROM orqaly.solution_build_events WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND kind='created'", [fixed.tenantId, fixed.userId, adoptedBuildId])).rows;
        assert.equal(values.length, 1); assert.equal(events.length, 1);
        adoptionProof = validateSchedulePreviewAdoption(values[0], events[0], adoptedBuildId);
        assert.equal((await client.query('SELECT id FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3', [fixed.tenantId, fixed.userId, adoptedBuildId])).rows.length, 0);
      }
    });
    if (mode === 'inspect') { log({ verified: true, readOnly: true, restrictedApiRole: true, exactSourceOwned: true, runtimeUnassigned: true, effects: 0 }); return; }
    const before = { database: await protectedSnapshot(pool), cloud: oldCloudSnapshot() };
    const allBindings = JSON.parse(pinnedSecret(apiEnv, 'ORQALY_SOLUTION_ENVIRONMENTS', /^orqaly-solution-preview-001-002-003-environments$/));
    const binding = allBindings.find(item => item.id === fixed.environmentId);
    assert.equal(binding?.tenantId, fixed.tenantId); assert.equal(binding?.userId, fixed.userId); assert.equal(binding?.origin, fixed.nativeOrigin); assert.equal(binding?.useIdToken, true);
    const policy = createBoundedHttpPolicy({ imageDigest: fixed.nativeImage }); assert.deepEqual(binding.nativePolicy, policy);
    const googleToken = cloud(['auth', 'print-identity-token']); assert.match(googleToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const nativeFetch = async (selected, options = {}) => {
      const target = new URL(selected); assert.equal(target.origin, fixed.nativeOrigin);
      assert(!target.pathname.includes('/credentials'), 'no_native_credentials_in_this_pure_test');
      assert(!String(options.body ?? '').includes(googleToken), 'identity_is_transport_only');
      return fetch(selected, options);
    };
    const inventory = await nativeFetch(`${fixed.nativeOrigin}/api/v1/workflows?limit=100`, { redirect: 'error', signal: AbortSignal.timeout(60000), headers: { authorization: `Bearer ${googleToken}`, 'X-N8N-API-KEY': binding.apiKey } });
    assert(inventory.ok); const inventoryText = await inventory.text(); assert(inventoryText.length <= 2_000_000);
    const inventoryValue = JSON.parse(inventoryText); assert.deepEqual(inventoryValue.data, []); assert(!inventoryValue.nextCursor, 'coding_temporary_workflows_must_be_cleaned_first');
    const runtime = createSolutionRuntime({ bindings: [binding], fetchImpl: nativeFetch, getIdentityHeaders: async origin => { assert.equal(origin, fixed.nativeOrigin); return { authorization: `Bearer ${googleToken}` }; } });
    repository = createPostgresRepositories({ environment: 'preview', apiDatabaseUrl: url.href, requireSolutionBuilds: true, requireNativeWorkflowBuilds: true, requireSolutionSchedules: true });
    await repository.readiness();
    const scopedRepository = { ...repository,
      resolveTenant: async selected => { assert.deepEqual(selected, auth); return fixed.tenantId; },
      solutionBuildTransaction: (selected, callback) => { assert.deepEqual(selected, scope); return repository.solutionBuildTransaction(scope, callback); },
    };
    // No Agent client, signing key or substitute profile. Creation already ran
    // through the signed-in Orqaly API, which owns its private Agent read.
    const builds = createSolutionBuildService({ repository: scopedRepository, runtime, enableNativeWorkflows: true });
    const solutions = createSolutionService({ repository: scopedRepository, runtime });
    schedules = createSolutionScheduleService({ repository: scopedRepository, solutionService: solutions, enabled: true, environmentIds: [fixed.environmentId] });
    stage = 'adopt_exact_ui_created_build';
    assert(!interrupted, 'operator_interrupted');
    buildId = adoptedBuildId;
    let build = (await builds.read(auth, buildId)).buildRequest;
    log({ status: build.status, adoptionProof, executionBoundary: 'signed_in_ui_creation_then_scoped_operator_lifecycle_real_deployed_worker_only' });
    const waitBuild = async (predicate, timeoutMs) => {
      const deadline = Date.now() + timeoutMs; let prior = null;
      do {
        assert(!interrupted, 'operator_interrupted');
        build = (await builds.read(auth, buildId)).buildRequest;
        const state = `${build.status}:${build.testEvidence?.status ?? ''}`;
        if (state !== prior) { log({ status: build.status, testStatus: build.testEvidence?.status ?? null }); prior = state; }
        if (predicate(build)) return;
        assert(!['needs_input', 'unsupported', 'failed', 'cancelled'].includes(build.status), 'model_needs_attention_no_fabricated_answer');
        await delay(3000);
      } while (Date.now() < deadline);
      throw new Error('deployed_worker_did_not_finish_no_local_fallback');
    };
    await waitBuild(value => value.status === 'draft' && !!value.workflowHash, 360000);
    // Root explicitly approved up to two real model repairs for the observed
    // Respond-to-Webhook mode defect. Never replace the model's native JSON.
    // The service pins the original business contract; only that diagnosed
    // pure response-mode issue is eligible for this operator repair budget.
    const frozenSpecHash = hash(build.spec);
    for (let repair = 1; repair <= 2; repair++) {
      validateSchedulePreviewBusinessContract(build);
      const checked = reviewNativeWorkflow({ workflow: build.workflow, spec: build.spec, runtimePolicy: policy, connections: [], environmentId: fixed.environmentId });
      if (checked.valid && checked.execution.allowed) break;
      const codes = checked.execution.reasons.map(issue => issue.code);
      log({ validation: { valid: checked.valid, executionAllowed: checked.execution.allowed, codes,
        responseModes: build.workflow.nodes.filter(node => node.type === 'n8n-nodes-base.respondToWebhook').map(node => ({ id: node.id, respondWith: node.parameters.respondWith ?? 'firstIncomingItem' })) } });
      assert(checked.valid && codes.length === 1 && codes[0] === 'RUNTIME_RESPONSE_TYPE', 'unexpected_model_defect_requires_review');
      assert.equal(build.repairEligibility.allowed, true); assert(!interrupted, 'operator_interrupted');
      stage = 'request_real_model_response_mode_repair';
      build = (await builds.repair(auth, buildId, { expectedVersion: build.rowVersion, workflowHash: build.workflowHash,
        instruction: 'The authoritative runtime validation reports RUNTIME_RESPONSE_TYPE: this request profile requires explicit business JSON. Repair the Respond to Webhook configuration to respondWith json and an explicit JSON responseBody returning only the already-trimmed text field. Do not use firstIncomingItem or allIncomingItems. Preserve the exact original requirements, inputSchema, outputSchema, acceptanceCases, runtimeProfile, name and provider-free scope. Do not alter expected outputs, add connections, run tests, or claim success. Submit the corrected native JSON candidate for Orqaly validation.' }, `${fixed.prefix}-response-mode-repair-${repair}`)).buildRequest;
      log({ status: build.status, modelRepairRequested: repair });
      await waitBuild(value => value.status === 'draft' && !!value.workflowHash, 360000);
      assert.equal(hash(build.spec), frozenSpecHash, 'repair_must_preserve_exact_business_contract');
    }
    validateSchedulePreviewCandidate(build, policy);
    const designProof = await schedulePreviewReadOnly(pool, async client => {
      const attempts = (await client.query('SELECT * FROM orqaly.solution_build_attempts WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 ORDER BY input_version LIMIT 5', [fixed.tenantId, fixed.userId, buildId])).rows;
      assert(attempts.length >= 1 && attempts.length <= 4, 'bounded_model_attempt_count');
      const attempt = attempts.find(item => item.input_version === build.inputVersion); assert(attempt);
      const events = (await client.query("SELECT * FROM orqaly.solution_build_events WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND kind='design_completed' AND details->>'operationId'=$4", [fixed.tenantId, fixed.userId, buildId, attempt.operation_id])).rows;
      assert.equal(events.length, 1);
      return { ...validateSchedulePreviewDesign(attempt, events[0], build), attemptCount: attempts.length };
    });
    log({ designProof });
    stage = 'queue_actual_native_test';
    assert(!interrupted, 'operator_interrupted');
    assert.equal(build.testEligibility.allowed, true); assert.equal(build.environment.id, fixed.environmentId);
    build = (await builds.test(auth, buildId, { expectedVersion: build.rowVersion, workflowHash: build.workflowHash, allowExternalEffects: false, repairOnFailure: false }, `${fixed.prefix}-test`)).buildRequest;
    assert(['queued', 'running', 'succeeded'].includes(build.testEvidence.status), 'durable_request_or_already_claimed_test_required');
    await waitBuild(value => ['succeeded', 'failed', 'outcome_unknown'].includes(value.testEvidence?.status), 480000);
    assert.equal(build.testEvidence.status, 'succeeded', 'real_test_must_pass_without_operator_repair');
    assert.equal(build.testEvidence.caseResults.length, 1);
    const caseReceipt = build.testEvidence.caseResults[0];
    assert.equal(caseReceipt.status, 'succeeded'); assert.equal(caseReceipt.passed, true); assert.equal(caseReceipt.cleanup.status, 'removed');
    assert.match(caseReceipt.executionId, /^[1-9][0-9]*$/); assert.deepEqual(caseReceipt.output, output); assert.equal(caseReceipt.outputHash, hash(output));
    validateSchedulePreviewCandidate(build, policy);
    stage = 'exact_workflow_review_and_handoff';
    assert(!interrupted, 'operator_interrupted');
    build = (await builds.review(auth, buildId, { expectedVersion: build.rowVersion })).buildRequest;
    assert.equal(build.status, 'reviewed'); assert.equal(build.review.valid, true);
    build = (await builds.confirm(auth, buildId, { expectedVersion: build.rowVersion, workflowHash: build.workflowHash }, `${fixed.prefix}-confirm`)).buildRequest;
    assert.equal(build.solutionId, buildId); assert.equal(build.status, 'completed');
    let solution = (await solutions.read(auth, buildId)).solution;
    assert.equal(solution.environment.id, fixed.environmentId);
    assert.equal(solution.workflowHash, build.workflowHash); assert.equal(hash(solution.workflow), build.workflowHash); assert.equal(hash(solution.spec), hash(build.spec));
    stage = 'stage_approved_release';
    assert(!interrupted, 'operator_interrupted');
    solution = (await solutions.decide(auth, buildId, { action: 'deploy', workflowHash: solution.workflowHash, environmentId: fixed.environmentId }, solution.rowVersion)).solution;
    assert.equal(solution.status, 'ready');
    stage = 'release_test_before_activation';
    assert(!interrupted, 'operator_interrupted');
    const releaseTest = await solutions.invoke(auth, buildId, { mode: 'test', input }, `${fixed.prefix}-release-test`);
    assert.equal(releaseTest.invocation.status, 'succeeded'); assert.deepEqual(releaseTest.invocation.output, output); assert.match(releaseTest.invocation.executionId, /^[1-9][0-9]*$/);
    solution = (await solutions.read(auth, buildId)).solution;
    stage = 'explicit_release_activation';
    assert(!interrupted, 'operator_interrupted');
    solution = (await solutions.decide(auth, buildId, { action: 'activate', workflowHash: solution.workflowHash, environmentId: fixed.environmentId }, solution.rowVersion)).solution;
    assert.equal(solution.status, 'active');
    stage = 'create_real_five_minute_schedule';
    assert(!interrupted, 'operator_interrupted');
    const requestedAt = Date.now();
    scheduleRequested = true;
    const result = await schedules.create(auth, buildId, { label: 'Synthetic preview acceptance — one observed due run', workflowHash: solution.workflowHash, timing: { kind: 'interval', minutes: 5 }, input }, `${fixed.prefix}-schedule`);
    scheduleId = result.schedule.id;
    const dueAt = new Date(result.schedule.nextRunAt).getTime();
    assert(dueAt >= requestedAt + 299000 && dueAt <= Date.now() + 301000, 'real_server_due_time_required');
    log({ status: result.schedule.status, nextRunAt: result.schedule.nextRunAt, note: 'Waiting for the actual deployed worker; no local claim or forced tick.' });
    stage = 'observe_real_due_worker';
    let tick;
    do {
      assert(!interrupted, 'operator_interrupted');
      const observed = await schedules.list(auth, buildId);
      const currentTicks = observed.ticks.filter(item => item.schedule_id === scheduleId);
      assert(currentTicks.length <= 1, 'unexpected_additional_tick');
      if (currentTicks.length && ['succeeded', 'failed', 'outcome_unknown'].includes(currentTicks[0].status)) { tick = currentTicks[0]; break; }
      assert(observed.schedules.find(item => item.id === scheduleId)?.status === 'active', 'schedule_stopped_before_confirmed_result');
      await delay(10000);
    } while (Date.now() < dueAt + 180000);
    stage = 'pause_exact_acceptance_schedule';
    assert.equal((await schedules.pause(auth, buildId, scheduleId)).schedule.status, 'paused'); paused = true;
    assert.equal(tick?.status, 'succeeded', 'deployed_schedule_result_unconfirmed_no_retry');
    const persisted = (await solutions.read(auth, buildId)).invocations;
    assert.equal(persisted.length, 2, 'one_release_test_and_one_scheduled_invocation_only');
    const scheduled = persisted.find(item => item.id === tick.invocation_id);
    assert.equal(scheduled?.status, 'succeeded'); assert.equal(scheduled?.mode, 'production');
    assert.deepEqual(scheduled.actor, { kind: 'schedule', id: scheduleId, label: 'Scheduled run' });
    assert.deepEqual(scheduled.input, input); assert.deepEqual(scheduled.output, output); assert.match(scheduled.executionId, /^[1-9][0-9]*$/);
    assert(new Date(tick.scheduled_at).getTime() === dueAt);
    assert.deepEqual({ database: await protectedSnapshot(pool), cloud: oldCloudSnapshot() }, before, 'old_releases_history_or_runtime_changed');
    verified = true;
    log({ verified, evidenceBoundary: 'Exact Build created through signed-in Orqaly UI; subsequent approvals use production services with restricted API DB role. Deployed AxWise design, deployed worker build test and naturally due schedule, real n8n003. Later lifecycle is not browser-interaction proof.',
      adoptionProof,
      solutionId: buildId, workflowHash: solution.workflowHash, nativeEnvironment: fixed.environmentId, designProof,
      buildTestExecutionId: caseReceipt.executionId, releaseTestExecutionId: releaseTest.invocation.executionId,
      scheduleExecutionId: scheduled.executionId, schedulePaused: true, output,
      oldSolutionsPreserved: true, externalProviderRequests: 0, localWorkerClaims: 0 });
  } catch (error) {
    log({ verified: false, code: /^[A-Z0-9_]{3,80}$/.test(error.code ?? '') ? error.code : 'NATIVE_SCHEDULE_ACCEPTANCE_UNCONFIRMED', noAutomaticRetry: true });
    process.exitCode = 1;
  } finally {
    if (schedules && buildId && scheduleRequested && !paused) {
      try { const cleanup = await pauseSchedulePreviewSafely({ pool, schedules, buildId, scheduleId }); paused = cleanup.status === 'paused'; scheduleId = cleanup.scheduleId; }
      catch { log({ cleanup: 'schedule_pause_unconfirmed_operator_attention_required' }); }
    }
    if (!verified && buildId) log({ preservedForReview: true, schedulePaused: paused, noExecutionRetry: true });
    await repository?.close().catch(() => {}); await pool?.end().catch(() => {});
    if (proxy && proxy.exitCode === null) proxy.kill('SIGTERM');
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert([3, 4].includes(process.argv.length));
  await runNativeSchedulePreview(process.argv[2], process.argv[3] ?? null);
}
