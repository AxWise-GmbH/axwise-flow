// Actual PostgreSQL gate. It accepts ONLY an explicitly named, empty disposable
// loopback database and synthetic roles; it never loads .env or calls providers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import canonicalize from 'canonicalize';
import {
  artifactContentHash,
  canonicalHash,
  canonicalJson,
  sha256Hex,
} from '../lib/workflow-v2/canonical.js';
import { transition } from '../lib/workflow-v2/state-machine.js';
import { createCapabilityWorkService } from '../server/workflow-v2/capability-work-service.js';
import { createWorkflowCommandService } from '../server/workflow-v2/command-service.js';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { capabilityArtifactId } from '../shared/workflow-v2/capability-contracts.js';
import { buildQualitativeAnalysis } from '../shared/workflow-v2/capability-analysis-contracts.js';
import {
  buildSimulation,
  simulationPlan,
} from '../shared/workflow-v2/capability-simulation-contracts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = new URL(process.env.WORKFLOW_V2_CAPABILITY_DISPOSABLE_DATABASE_URL || 'invalid:');
assert.equal(process.env.WORKFLOW_V2_CAPABILITY_DISPOSABLE_APPROVED, 'new_empty_loopback_only');
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.port, /^\d{4,5}$/);
assert.equal(url.username, 'capability_025_admin');
assert.equal(url.password, '');
assert.equal(url.search, '');
const database = url.pathname.slice(1);
assert.match(database, /^orqaly_capability_025_[a-z0-9_]{1,30}$/);
const receiptPath = process.env.WORKFLOW_V2_CAPABILITY_PG_RECEIPT;
assert(receiptPath && path.isAbsolute(receiptPath));
const roleSuffix = database.slice('orqaly_capability_025_'.length);
const ownerLogin = process.env.WORKFLOW_V2_CAPABILITY_TEST_OWNER_LOGIN || 'NOLOGIN';
assert(['NOLOGIN', 'LOGIN'].includes(ownerLogin));
const roles = Object.fromEntries(
  ['owner', 'api', 'worker', 'identity', 'mixed', 'outsider'].map((name) => [
    name,
    `cap025_${roleSuffix}_${name}`,
  ])
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => structuredClone(value);
const ref = ({ artifactId, artifactHash, kind }) => ({ artifactId, artifactHash, kind });
const now = () => new Date().toISOString();
const command = () => ({ commandId: randomUUID(), issuedAt: now() });
const pgOptions = (connectionString) => ({
  connectionString,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 20000,
});
const roleUrl = (role) => {
  const result = new URL(url);
  result.username = role;
  return result.href;
};
const admin = new pg.Client(pgOptions(url.href));
const clients = {};
const repositories = [];
const checks = [];
const receipt = {
  startedAt: now(),
  database,
  host: url.hostname,
  port: Number(url.port),
  runtime: process.version,
  sourceCommit: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim(),
  existingDatabaseChanged: false,
  providersCalled: false,
  cloudCalled: false,
  envFilesRead: false,
  roles,
  ownerLogin,
  checks,
  migrations: [],
  status: 'running',
};
async function check(name, action) {
  try {
    await action();
    checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, passed: false, code: error.code, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}
async function tenantQuery(client, tenantId, sql, parameters = []) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('orqaly.tenant_id',$1,true)", [tenantId]);
    const result = await client.query(sql, parameters);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
async function rpc(
  client,
  plan,
  name = 'apply_transition',
  tenantId = plan.event.tenantId,
  runId = plan.event.runId
) {
  assert(
    [
      'apply_transition',
      'apply_capability_transition',
      'apply_transition_private_025',
      'recover_attempt_lease',
    ].includes(name)
  );
  const result = await tenantQuery(
    client,
    tenantId,
    `SELECT orqaly.${name}($1,$2,$3::jsonb) AS receipt`,
    [tenantId, runId, JSON.stringify(plan)]
  );
  return result.rows[0].receipt;
}
async function fingerprint() {
  const tables = [
    'workflow_runs',
    'workflow_stages',
    'workflow_stage_dependencies',
    'stage_attempts',
    'artifacts',
    'artifact_lineage',
    'approvals',
    'workflow_events',
    'outbox_events',
  ];
  const snapshot = {};
  for (const table of tables) {
    const result = await admin.query(
      `SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]') AS rows FROM orqaly.${table} AS row`
    );
    snapshot[table] = result.rows[0].rows;
  }
  return canonicalHash(snapshot);
}
async function deniedAtomic(
  name,
  action,
  codes = ['42501', '22023', '23514', '55000', '23505', '40001', '22P02']
) {
  await check(name, async () => {
    const before = await fingerprint();
    await assert.rejects(action, (error) => {
      assert(codes.includes(error.code), `${error.code}: ${error.message}`);
      return true;
    });
    assert.equal(await fingerprint(), before, 'rejected statement changed ledger rows');
  });
}
function changedEvent(plan, mutate) {
  const result = clone(plan);
  mutate(result.event, result);
  result.eventCanonical = canonicalJson(result.event);
  result.eventHash = sha256Hex(result.eventCanonical);
  return result;
}
function changedInput(plan, mutate) {
  return changedEvent(plan, (event, result) => {
    mutate(event.inputPayload);
    event.inputHash = canonicalHash(event.inputPayload);
    Object.assign(result.createAttempts[0], {
      inputPayload: clone(event.inputPayload),
      inputHash: event.inputHash,
      inputCanonical: canonicalJson(event.inputPayload),
    });
    result.createStages[0].inputHash = event.inputHash;
    result.outbox[0].inputHash = event.inputHash;
    result.audit.payload.inputHash = event.inputHash;
  });
}
function fact(kind, payload, operationId, sourceArtifactIds = []) {
  const content = { contentType: 'application/json', payload, markdown: null };
  return {
    artifactId: capabilityArtifactId(operationId, kind),
    artifactHash: artifactContentHash(content),
    kind,
    ...content,
    sourceArtifactIds: [...new Set(sourceArtifactIds)].sort(),
  };
}
const loadJson = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), 'utf8'));
const scopeFixture = await loadJson('shared/workflow-v2/fixtures/scope_completion_result_v2.json');
const analysisVector = (
  await loadJson('shared/workflow-v2/fixtures/capability-analysis-python-goldens.json')
).cases.find((item) => item.name === 'complete_supplied');
const simulationVector = (
  await loadJson('shared/workflow-v2/fixtures/capability-simulation-vectors.json')
).cases[0];
const plans = [];
let apiRepository, workerRepository, service;
const ownerUserId = `user_cap025${roleSuffix.replaceAll('_', '')}`;
const otherUserId = `user_cap025other${roleSuffix.replaceAll('_', '')}`;
let tenantId, otherTenantId;

async function setupRolesAndBaseline() {
  await admin.connect();
  assert.equal(
    (await admin.query("SELECT to_regnamespace('orqaly') AS schema")).rows[0].schema,
    null,
    'test database is not empty'
  );
  for (const role of Object.values(roles))
    assert.equal(
      (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount,
      0,
      'synthetic role already exists'
    );
  for (const [kind, role] of Object.entries(roles)) {
    await admin.query(
      `CREATE ROLE ${role} ${kind === 'owner' ? ownerLogin : 'LOGIN'} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`
    );
  }
  const migrationRoot = path.join(ROOT, 'database/workflow-v2/migrations');
  const files = (await readdir(migrationRoot))
    .filter((name) => /^0(?:0[1-9]|1[0-9]|2[0-4])_.*\.sql$/.test(name))
    .sort();
  assert.equal(files.length, 24);
  for (const filename of files) {
    const relative = `database/workflow-v2/migrations/${filename}`;
    const bytes = await readFile(path.join(ROOT, relative));
    const frozen = execFileSync('/usr/bin/git', ['show', `${receipt.sourceCommit}:${relative}`], {
      cwd: ROOT,
    });
    assert.equal(sha(bytes), sha(frozen), 'historical migration file changed');
    await admin.query(bytes.toString());
    receipt.migrations.push({ filename, sha256: sha(bytes) });
  }
  for (const kind of ['api', 'worker', 'identity'])
    await admin.query(
      `GRANT orqaly_${kind} TO ${roles[kind]} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`
    );
  await admin.query(
    `GRANT orqaly_api, orqaly_worker TO ${roles.mixed} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`
  );
  await admin.query(`ALTER SCHEMA orqaly OWNER TO ${roles.owner}`);
  const tables = (
    await admin.query(
      "SELECT format('%I.%I',n.nspname,c.relname) AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='orqaly' AND c.relkind IN ('r','p','v','S')"
    )
  ).rows;
  for (const table of tables)
    await admin.query(`ALTER TABLE ${table.name} OWNER TO ${roles.owner}`);
  const functions = (
    await admin.query(
      "SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='orqaly'"
    )
  ).rows;
  for (const fn of functions)
    await admin.query(`ALTER FUNCTION ${fn.signature} OWNER TO ${roles.owner}`);
  for (const [kind, role] of Object.entries(roles))
    if (kind !== 'owner') {
      clients[kind] = new pg.Client(pgOptions(roleUrl(role)));
      await clients[kind].connect();
    }
  receipt.syntheticOwnershipSetup =
    'Only new disposable schema objects reassigned from bootstrap administrator to a nonsuperuser/non-BYPASSRLS owner; actual target ownership not inspected or changed.';
  receipt.originalOid = (
    await admin.query("SELECT 'orqaly.apply_transition(uuid,uuid,jsonb)'::regprocedure::oid AS oid")
  ).rows[0].oid;
  await clients.worker.query(
    'PREPARE before_025(uuid,uuid,jsonb) AS SELECT orqaly.apply_transition($1,$2,$3)'
  );
  await clients.api.query(
    'PREPARE before_025(uuid,uuid,jsonb) AS SELECT orqaly.apply_transition($1,$2,$3)'
  );
}
async function apply025() {
  const migration = await readFile(
    path.join(ROOT, 'database/workflow-v2/migrations/025_explicit_capability_work.sql'),
    'utf8'
  );
  receipt.migration025Sha256 = sha(migration);
  await admin.query(`SET ROLE ${roles.owner}`);
  try {
    await admin.query(migration);
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  } finally {
    await admin.query('RESET ROLE');
  }
}
async function configureRuntime() {
  apiRepository = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: roleUrl(roles.identity),
    apiDatabaseUrl: roleUrl(roles.api),
    requireCapabilityWork: true,
  });
  workerRepository = createPostgresRepositories({
    environment: 'preview',
    workerDatabaseUrl: roleUrl(roles.worker),
    requireCapabilityWork: true,
  });
  repositories.push(apiRepository, workerRepository);
  const persist = apiRepository.applyCapabilityTransition.bind(apiRepository);
  apiRepository.applyCapabilityTransition = async (...args) => {
    const plan = args[2];
    plans.push(clone(plan));
    const label = `${plan.event.type}_${plans.length}`;
    await deniedAtomic(`${label}_wrong_tenant_context`, () =>
      rpc(clients.api, plan, 'apply_capability_transition', otherTenantId)
    );
    await deniedAtomic(`${label}_wrong_owner`, () =>
      rpc(
        clients.api,
        changedEvent(plan, (event) => {
          event[event.ownerUserId ? 'ownerUserId' : 'decidedBy'] = otherUserId;
        }),
        'apply_capability_transition'
      )
    );
    for (const field of ['createStages', 'createAttempts', 'outbox']) {
      await deniedAtomic(`${label}_${field}_cannot_be_null`, () =>
        rpc(clients.api, { ...clone(plan), [field]: null }, 'apply_capability_transition')
      );
    }
    if (plan.event.type === 'CapabilityActivityRequested') {
      await deniedAtomic(`${label}_stale_version`, () =>
        rpc(
          clients.api,
          changedEvent(plan, (event) => {
            event.expectedRowVersion -= 1;
          }),
          'apply_capability_transition'
        )
      );
      if (plan.event.inputPayload.processingConsent) {
        for (const [field, value] of [
          ['granted', false],
          ['provider', 'unapproved'],
          ['operationId', randomUUID()],
          ['bindingHash', '0'.repeat(64)],
        ]) {
          await deniedAtomic(`${label}_consent_${field}`, () =>
            rpc(
              clients.api,
              changedInput(plan, (input) => {
                input.processingConsent[field] = value;
              }),
              'apply_capability_transition'
            )
          );
        }
        await deniedAtomic(`${label}_changed_limits_without_reconsent`, () =>
          rpc(
            clients.api,
            changedInput(plan, (input) => {
              input.limits.maxInputTokens += 1;
            }),
            'apply_capability_transition'
          )
        );
      }
    }
    return persist(...args);
  };
  service = createCapabilityWorkService({ repository: apiRepository, enabled: true });
  tenantId = await apiRepository.resolveTenant({ userId: ownerUserId });
  otherTenantId = await apiRepository.resolveTenant({ userId: otherUserId });
}
async function start(capability = 'AnalyzeEvidenceV1', allowSimulationAnalysis = false) {
  const result = await service.start(
    { userId: ownerUserId },
    {
      ...command(),
      capability,
      request: 'Understand this explicitly selected synthetic test workflow.',
      allowSimulationAnalysis,
      compilerDisclosure: { accepted: true, noticeVersion: 'google-scope-compiler-v1' },
    }
  );
  return result.workflow.run.id;
}
async function snapshot(runId) {
  return workerRepository.loadWorkerSnapshot(tenantId, runId);
}
async function claim(runId) {
  const result = await clients.worker.query(
    "SELECT orqaly.claim_outbox('cap025-synthetic-worker',$1,120) AS claim",
    [randomUUID()]
  );
  assert.equal(result.rows[0].claim?.runId, runId);
  return result.rows[0].claim;
}
async function workerEvent(runId, type, extra = {}) {
  const state = await snapshot(runId);
  const attempt = state.attempts.findLast((item) => item.leaseToken);
  assert(attempt);
  const event = {
    type,
    eventId: randomUUID(),
    tenantId,
    runId,
    occurredAt: now(),
    stageId: attempt.stageId,
    attemptId: attempt.id,
    leaseToken: attempt.leaseToken,
    ...extra,
  };
  const plan = transition(state, event);
  plans.push(clone(plan));
  for (const field of ['createStages', 'createAttempts', 'createApproval']) {
    const forged = clone(plan);
    forged[field] = field === 'createApproval' ? { id: randomUUID() } : [{ id: randomUUID() }];
    await deniedAtomic(`${type}_${plans.length}_worker_cannot_inject_${field}`, () =>
      rpc(clients.worker, forged)
    );
  }
  await deniedAtomic(`${type}_${plans.length}_api_cannot_take_worker_role`, () =>
    rpc(clients.api, plan)
  );
  await deniedAtomic(`${type}_${plans.length}_wrong_lease`, () =>
    rpc(
      clients.worker,
      changedEvent(plan, (value) => {
        value.leaseToken = randomUUID();
      })
    )
  );
  const receipt = await workerRepository.applyWorkerTransition(tenantId, runId, plan);
  return { receipt, event, plan, attempt };
}
async function started(runId) {
  await claim(runId);
  return workerEvent(runId, 'ActivityStarted', { deploymentId: 'synthetic-local-pg-gate' });
}
async function complete(runId, resultFactory) {
  const { attempt } = await started(runId);
  const result = resultFactory(attempt);
  await workerEvent(runId, 'ActivityCompleted', { result, nextAttempts: [] });
  return result.artifact;
}
async function compile(runId) {
  return complete(runId, (attempt) => {
    const result = clone(scopeFixture);
    result.artifact.artifactId = randomUUID();
    result.artifact.payload.authority.canonicalInputHash = attempt.inputHash;
    result.artifact.artifactHash = artifactContentHash(result.artifact);
    return result;
  });
}
async function ready(capability = 'AnalyzeEvidenceV1', allowSimulationAnalysis = false) {
  const runId = await start(capability, allowSimulationAnalysis);
  const scope = await compile(runId);
  await service.approveScope({ userId: ownerUserId }, runId, {
    ...command(),
    artifact: ref(scope),
    scopeCompatible: true,
  });
  assert.equal((await snapshot(runId)).run.status, 'awaiting_capability_input');
  return { runId, scope };
}
async function admit(runId) {
  await service.admitCorpus({ userId: ownerUserId }, runId, {
    ...command(),
    expectedRowVersion: (await snapshot(runId)).run.rowVersion,
    corpus: clone(analysisVector.context.corpus),
  });
  return complete(runId, (attempt) => ({
    resultType: 'transcript_corpus_admitted',
    artifact: fact('transcript_corpus', attempt.inputPayload.corpus, attempt.operationId),
  }));
}
async function prepareAnalyze(runId, source) {
  const draft = {
    ...command(),
    expectedRowVersion: (await snapshot(runId)).run.rowVersion,
    operationType: 'AnalyzeEvidenceV1',
    sourceArtifact: ref(source),
    request: clone(analysisVector.context.request),
  };
  const { review } = await service.prepareOperation({ userId: ownerUserId }, runId, draft);
  return { draft, review };
}
async function confirm(runId, { draft, review }) {
  return service.confirmOperation({ userId: ownerUserId }, runId, {
    draft,
    confirmation: {
      granted: true,
      provider: review.provider,
      purpose: review.purpose,
      operationId: review.operationId,
      bindingHash: review.bindingHash,
      reviewId: review.reviewId,
      noticeVersion: review.noticeVersion,
      scopeCompatible: true,
    },
  });
}

async function schemaAdversaries() {
  const assertReady = async (expected) => {
    for (const kind of ['api', 'worker'])
      assert.equal(
        (await clients[kind].query('SELECT orqaly.capability_work_schema_ready_025() AS ready'))
          .rows[0].ready,
        expected
      );
    if (!expected) {
      await assert.rejects(
        () => apiRepository.readiness(),
        /capability_work_migration_025_required/
      );
      await assert.rejects(
        () => workerRepository.readiness(),
        /capability_work_migration_025_required/
      );
    }
  };
  for (const [name, alter, restore] of [
    [
      'public_private_rpc_execute',
      'GRANT EXECUTE ON FUNCTION orqaly.apply_transition_private_025(uuid,uuid,jsonb) TO PUBLIC',
      'REVOKE EXECUTE ON FUNCTION orqaly.apply_transition_private_025(uuid,uuid,jsonb) FROM PUBLIC',
    ],
    [
      'worker_owner_rpc_execute',
      'GRANT EXECUTE ON FUNCTION orqaly.apply_capability_transition(uuid,uuid,jsonb) TO orqaly_worker',
      'REVOKE EXECUTE ON FUNCTION orqaly.apply_capability_transition(uuid,uuid,jsonb) FROM orqaly_worker',
    ],
    [
      'disabled_forced_rls',
      'ALTER TABLE orqaly.artifacts NO FORCE ROW LEVEL SECURITY',
      'ALTER TABLE orqaly.artifacts FORCE ROW LEVEL SECURITY',
    ],
    [
      'disabled_immutable_trigger',
      'ALTER TABLE orqaly.stage_attempts DISABLE TRIGGER capability_attempt_invariant_025',
      'ALTER TABLE orqaly.stage_attempts ENABLE TRIGGER capability_attempt_invariant_025',
    ],
    [
      'missing_update_trigger_event',
      'CREATE OR REPLACE TRIGGER capability_attempt_invariant_025 BEFORE INSERT ON orqaly.stage_attempts FOR EACH ROW EXECUTE FUNCTION orqaly.capability_attempt_invariant_025()',
      'CREATE OR REPLACE TRIGGER capability_attempt_invariant_025 BEFORE INSERT OR UPDATE ON orqaly.stage_attempts FOR EACH ROW EXECUTE FUNCTION orqaly.capability_attempt_invariant_025()',
    ],
  ])
    await check(`readiness_rejects_${name}`, async () => {
      const before = await fingerprint();
      try {
        await admin.query(alter);
        await assertReady(false);
      } finally {
        await admin.query(restore);
      }
      await assertReady(true);
      assert.equal(await fingerprint(), before);
    });
  await check('readiness_rejects_helper_body_drift', async () => {
    const signature = 'orqaly.capability_profile_valid_025(jsonb)';
    const definition = (
      await admin.query('SELECT pg_get_functiondef($1::regprocedure) AS definition', [signature])
    ).rows[0].definition;
    try {
      await admin.query(
        "CREATE OR REPLACE FUNCTION orqaly.capability_profile_valid_025(profile jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, orqaly AS 'SELECT true'"
      );
      await assertReady(false);
    } finally {
      await admin.query(definition);
    }
    await assertReady(true);
  });
  await check('runtime_rejects_replaced_attestation_even_when_it_claims_ready', async () => {
    const signature = 'orqaly.capability_work_schema_ready_025()';
    const definition = (
      await admin.query('SELECT pg_get_functiondef($1::regprocedure) AS definition', [signature])
    ).rows[0].definition;
    try {
      await admin.query(
        "CREATE OR REPLACE FUNCTION orqaly.capability_work_schema_ready_025() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, orqaly AS 'BEGIN RETURN true; END'"
      );
      for (const repository of [apiRepository, workerRepository])
        await assert.rejects(
          () => repository.readiness(),
          /capability_work_migration_025_required/
        );
    } finally {
      await admin.query(definition);
    }
    await assertReady(true);
  });
}

async function canonicalScannerChecks() {
  await admin.query(`SET ROLE ${roles.owner}`);
  try {
    const consent = {
      bindingHash: 'a'.repeat(64),
      granted: true,
      noticeVersion: 'google-selected-sources-v1',
      operationId: randomUUID(),
      provider: 'google',
      purpose: 'AnalyzeEvidenceV1',
      schemaVersion: 'axwise.processing-consent.v1',
    };
    const vectors = [
      {
        a: 1e-7,
        nested: {
          processingConsent: 'data, not authority',
          escaped: '\\"},[🌍é漢字',
          values: [0.125, 9007199254740991, 1e21],
        },
        processingConsent: consent,
        z: 'last',
      },
      { processingConsent: consent, text: '🌍\\"[{},]'.repeat(30000) },
      { before: { a: [{ b: [{ c: 'nested' }] }] }, processingConsent: consent },
    ];
    for (let index = 0; index < vectors.length; index++)
      await check(`byte_exact_unsigned_input_vector_${index}`, async () => {
        const value = vectors[index],
          unsigned = clone(value);
        delete unsigned.processingConsent;
        // This helper-only vector also proves byte preservation for fractions;
        // the production envelope serializer deliberately accepts integers only.
        const canonical = canonicalize(value);
        const startedAt = performance.now();
        const result = (
          await admin.query(
            'SELECT orqaly.capability_unsigned_input_025($1,$2::jsonb) AS unsigned',
            [canonical, JSON.stringify(value)]
          )
        ).rows[0].unsigned;
        assert.equal(result, canonicalize(unsigned));
        receipt.scannerTimings ||= [];
        receipt.scannerTimings.push({
          bytes: Buffer.byteLength(canonical),
          elapsedMs: performance.now() - startedAt,
        });
      });
    for (const [name, raw] of [
      ['duplicate_member', '{"a":1,"a":1,"processingConsent":' + canonicalJson(consent) + '}'],
      ['escaped_top_level_key', '{"\\u0061":1,"processingConsent":' + canonicalJson(consent) + '}'],
      ['reordered_members', '{"z":1,"processingConsent":' + canonicalJson(consent) + ',"a":1}'],
      ['missing_consent', '{"a":1}'],
      ['oversize', canonicalJson({ a: 'x'.repeat(1000000), processingConsent: consent })],
    ])
      await check(`unsigned_input_rejects_${name}`, () =>
        assert.rejects(
          () =>
            admin.query('SELECT orqaly.capability_unsigned_input_025($1,$2::jsonb)', [
              raw,
              JSON.stringify(JSON.parse(raw)),
            ]),
          (error) => error.code === '22023'
        )
      );
  } finally {
    await admin.query('RESET ROLE');
  }
}

try {
  await check(
    'empty_disposable_database_exact_historical_baseline_and_separate_roles',
    setupRolesAndBaseline
  );
  await check('migration_025_applies_as_same_nonsuperuser_nonbypass_owner', apply025);
  await check('real_repository_runtime_identity_and_readiness', async () => {
    await configureRuntime();
    await apiRepository.readiness();
    await workerRepository.readiness();
    assert.equal(
      (await clients.api.query('SELECT orqaly.capability_work_schema_ready_025() AS ready')).rows[0]
        .ready,
      true
    );
    assert.equal(
      (await clients.worker.query('SELECT orqaly.capability_work_schema_ready_025() AS ready'))
        .rows[0].ready,
      true
    );
  });
  await canonicalScannerChecks();
  await schemaAdversaries();
  const main = await ready();
  await check('compile_then_exact_owner_scope_approval_is_idle_without_new_attempt', async () => {
    const state = await snapshot(main.runId);
    assert.equal(state.stages.length, 2);
    assert.equal(state.attempts.length, 1);
    assert.equal(state.approvals.length, 1);
  });
  const initialPlan = clone(plans.find((plan) => plan.event.type === 'CapabilityRunRequested'));
  for (const kind of ['worker', 'identity', 'mixed', 'outsider'])
    await deniedAtomic(`${kind}_cannot_call_capability_owner_endpoint`, () =>
      rpc(clients[kind], initialPlan, 'apply_capability_transition')
    );
  for (const kind of ['api', 'worker']) {
    await deniedAtomic(`${kind}_generic_endpoint_rejects_recorded_owner_event`, () =>
      rpc(clients[kind], initialPlan)
    );
    await deniedAtomic(`${kind}_cannot_call_private_original_oid_by_new_name`, () =>
      rpc(clients[kind], initialPlan, 'apply_transition_private_025')
    );
    await deniedAtomic(`${kind}_prepared_original_oid_is_revoked_after_025`, () =>
      tenantQuery(
        clients[kind],
        tenantId,
        `EXECUTE before_025('${tenantId}'::uuid,'${main.runId}'::uuid,'${JSON.stringify(initialPlan).replaceAll("'", "''")}'::jsonb)`
      )
    );
  }
  const source = await admit(main.runId);
  await check('actual_corpus_admission_persists_exact_bytes_and_returns_idle', async () =>
    assert.equal((await snapshot(main.runId)).run.status, 'awaiting_capability_input')
  );
  const review = await prepareAnalyze(main.runId, source);
  await confirm(main.runId, review);
  const analysisPlan = clone(plans.at(-1));
  await check('actual_analysis_confirmation_persists_one_hash_bound_consented_attempt', async () =>
    assert.equal(
      (await snapshot(main.runId)).attempts.at(-1).inputPayload.processingConsent.bindingHash,
      review.review.bindingHash
    )
  );
  await deniedAtomic('worker_cannot_forge_capability_activity_owner_event', () =>
    rpc(clients.worker, analysisPlan)
  );
  await deniedAtomic('owner_event_changed_plan_replay_is_atomic_conflict', () =>
    rpc(clients.api, { ...clone(analysisPlan), outbox: [] }, 'apply_capability_transition')
  );
  await check('exact_owner_event_replay_is_idempotent', async () =>
    assert.equal(
      (await rpc(clients.api, analysisPlan, 'apply_capability_transition')).idempotent,
      true
    )
  );
  const analyzed = await complete(main.runId, (attempt) => {
    const input = attempt.inputPayload;
    const payload = buildQualitativeAnalysis({
      ...analysisVector.artifact,
      corpus: input.source.payload,
      request: input.request,
      acceptedScope: input.acceptedScope,
      sourceArtifacts: [input.source.artifact],
    });
    return {
      resultType: 'evidence_analyzed',
      artifact: fact('qualitative_analysis', payload, attempt.operationId, [
        input.acceptedScope.artifactId,
        input.source.artifact.artifactId,
      ]),
    };
  });
  await check(
    'analysis_completion_settles_without_successor_and_retains_previous_outputs',
    async () => {
      const state = await snapshot(main.runId);
      assert.equal(state.run.status, 'completed');
      assert.equal(state.run.finalArtifact.artifactId, analyzed.artifactId);
      assert.equal(state.stages.length, 4);
      assert.equal(state.attempts.length, 3);
    }
  );
  const sim = await ready('SimulateV1', true);
  const simDraft = {
    ...command(),
    expectedRowVersion: (await snapshot(sim.runId)).run.rowVersion,
    operationType: 'SimulateV1',
    request: clone(simulationVector.request),
    selectedGrounding: [],
  };
  const simReview = (await service.prepareOperation({ userId: ownerUserId }, sim.runId, simDraft))
    .review;
  await confirm(sim.runId, { draft: simDraft, review: simReview });
  const simulated = await complete(sim.runId, (attempt) => {
    const input = attempt.inputPayload,
      candidate = clone(simulationVector.candidate),
      slots = simulationPlan(input.request, { operationId: attempt.operationId });
    candidate.participants = candidate.participants.map((person, index) => ({
      ...person,
      ...slots[index],
    }));
    candidate.interviews = candidate.interviews.map((interview, index) => ({
      ...interview,
      participantId: slots[index].participantId,
    }));
    return {
      resultType: 'simulation_completed',
      artifact: fact(
        'simulation',
        buildSimulation(candidate, {
          request: input.request,
          operationId: attempt.operationId,
          acceptedScope: input.acceptedScope,
        }),
        attempt.operationId,
        [input.acceptedScope.artifactId]
      ),
    };
  });
  await check('actual_simulation_completes_and_preserves_synthetic_output', async () => {
    assert.equal(simulated.payload.origin, 'synthetic');
    assert.equal((await snapshot(sim.runId)).run.status, 'completed');
  });
  await check('cross_tenant_snapshot_and_artifact_reads_are_empty', async () => {
    assert.equal(await workerRepository.loadWorkerSnapshot(otherTenantId, main.runId), null);
    assert.equal(
      await apiRepository.loadArtifact(otherTenantId, main.runId, analyzed.artifactId),
      null
    );
  });
  const retryDraft = {
    ...simDraft,
    ...command(),
    expectedRowVersion: (await snapshot(sim.runId)).run.rowVersion,
  };
  const retryReview = (
    await service.prepareOperation({ userId: ownerUserId }, sim.runId, retryDraft)
  ).review;
  await confirm(sim.runId, { draft: retryDraft, review: retryReview });
  await started(sim.runId);
  const failed = await workerEvent(sim.runId, 'ActivityFailed', {
    retryable: false,
    errorClass: 'SYNTHETIC_LOCAL_TERMINAL',
  });
  await check('paid_failure_is_terminal_without_successor_or_reused_consent', async () => {
    const state = await snapshot(sim.runId);
    assert.equal(state.run.status, 'failed');
    assert.equal(state.attempts.length, 3);
    assert.equal(state.run.finalArtifact.artifactId, simulated.artifactId);
  });
  await deniedAtomic('paid_failure_cannot_be_changed_to_automatic_retry', () =>
    rpc(
      clients.worker,
      changedEvent(failed.plan, (event) => {
        event.eventId = randomUUID();
        event.retryable = true;
      })
    )
  );
  await deniedAtomic('capability_profile_cannot_be_changed_even_by_direct_admin_update', () =>
    admin.query(
      "UPDATE orqaly.workflow_runs SET request_payload=jsonb_set(request_payload,'{workProfile,purpose}','\"changed\"') WHERE tenant_id=$1 AND id=$2",
      [tenantId, main.runId]
    )
  );
  await deniedAtomic('capability_input_cannot_be_changed_even_by_direct_admin_update', () =>
    admin.query(
      "UPDATE orqaly.stage_attempts SET input_payload=jsonb_set(input_payload,'{limits,maxInputTokens}','999999') WHERE tenant_id=$1 AND run_id=$2 AND input_payload->>'type'='AnalyzeEvidenceV1'",
      [tenantId, main.runId]
    )
  );
  const recoverRun = await start();
  const originalAttempt = (await started(recoverRun)).attempt;
  await workerEvent(recoverRun, 'ActivityDispatchAmbiguous', {
    statusUrl: 'https://synthetic.example.test/operations/local',
    nextPollAt: now(),
  });
  await claim(recoverRun);
  await workerEvent(recoverRun, 'ActivityRedispatchRequested', { redispatchAt: now() });
  await started(recoverRun);
  await workerEvent(recoverRun, 'ActivityDeferred', {
    statusUrl: 'https://synthetic.example.test/operations/local',
    nextPollAt: now(),
  });
  await claim(recoverRun);
  await check('existing_024_lease_recovery_preserves_same_operation_and_input', async () => {
    await admin.query(
      "UPDATE orqaly.stage_attempts SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND run_id=$2",
      [tenantId, recoverRun]
    );
    await admin.query(
      "UPDATE orqaly.outbox_events SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND run_id=$2 AND status='processing'",
      [tenantId, recoverRun]
    );
    const state = await snapshot(recoverRun),
      attempt = state.attempts.at(-1);
    const event = {
      type: 'LeaseExpired',
      eventId: randomUUID(),
      tenantId,
      runId: recoverRun,
      occurredAt: now(),
      stageId: attempt.stageId,
      attemptId: attempt.id,
      leaseToken: attempt.leaseToken,
      requeueAt: now(),
    };
    const plan = transition(state, event);
    const receipt = await rpc(clients.worker, plan, 'recover_attempt_lease');
    assert.equal(receipt.idempotent, false);
    const after = await snapshot(recoverRun);
    assert.equal(after.attempts.length, 1);
    assert.equal(after.attempts[0].operationId, originalAttempt.operationId);
    assert.equal(after.attempts[0].inputHash, originalAttempt.inputHash);
    assert.equal(after.attempts[0].leaseToken, null);
    assert.equal(after.attempts[0].status, 'polling');
  });
  await claim(recoverRun);
  await workerEvent(recoverRun, 'ActivityFailed', {
    retryable: true,
    errorClass: 'SYNTHETIC_SCOPE_RETRY',
    nextAttempt: {
      attemptId: randomUUID(),
      operationId: randomUUID(),
      inputHash: originalAttempt.inputHash,
      inputPayload: clone(originalAttempt.inputPayload),
    },
  });
  await started(recoverRun);
  await workerEvent(recoverRun, 'ActivityFailed', {
    retryable: false,
    errorClass: 'SYNTHETIC_SCOPE_TERMINAL',
  });
  await check(
    'compiler_retry_preserves_original_disclosed_input_and_bounded_attempts',
    async () => {
      const state = await snapshot(recoverRun);
      assert.equal(state.run.status, 'failed');
      assert.equal(state.attempts.length, 2);
      assert.deepEqual(state.attempts[1].inputPayload, originalAttempt.inputPayload);
    }
  );
  await check('legacy_goal_still_initializes_and_replays_with_original_plan', async () => {
    const legacy = createWorkflowCommandService({ repository: apiRepository });
    const legacyCommand = {
      ...command(),
      request: 'Create a synthetic local legacy checklist.',
      mode: 'simple',
    };
    const first = await legacy.start({ userId: ownerUserId }, legacyCommand);
    assert.equal(first.workflow.stages.length, 7);
    const again = await legacy.start({ userId: ownerUserId }, legacyCommand);
    assert.equal(again.workflow.run.id, first.workflow.run.id);
    assert.equal(again.receipt.idempotent, true);
    assert.equal(again.workflow.attempts.length, 1);
  });
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = {
    message: error.message,
    code: error.code,
    position: error.position,
    where: error.where,
    detail: error.detail,
    stack: error.stack,
  };
  process.exitCode = 1;
} finally {
  await Promise.all(repositories.map((repository) => repository.close().catch(() => {})));
  await Promise.all(Object.values(clients).map((client) => client.end().catch(() => {})));
  await admin.end().catch(() => {});
  receipt.finishedAt = now();
  receipt.passed = checks.filter((item) => item.passed).length;
  receipt.failed = checks.filter((item) => !item.passed).length;
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify(
      {
        status: receipt.status,
        passed: receipt.passed,
        failed: receipt.failed,
        failure: receipt.failure,
        receiptPath,
        sha256: sha(await readFile(receiptPath)),
      },
      null,
      2
    )
  );
}
