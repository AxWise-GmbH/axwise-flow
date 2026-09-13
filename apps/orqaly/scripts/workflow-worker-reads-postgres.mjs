// Disposable local PostgreSQL16 only. Synthetic rows/roles, no cloud, providers,
// environment database URLs or customer data. All owned resources are cleaned.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { canonicalHash, canonicalJson } from '../lib/workflow-v2/canonical.js';
import { transition } from '../lib/workflow-v2/state-machine.js';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';

assert.equal(process.argv.length, 2, 'no_arguments_supported');
const suffix = randomBytes(6).toString('hex');
const container = `orqaly-worker-reads-pg-${suffix}`;
const password = randomBytes(24).toString('hex');
const docker = (args, env = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const checks = [];
let phase = 'start',
  started = false,
  admin,
  api,
  worker,
  repository;
const check = (name) => {
  phase = name;
  checks.push(name);
  process.stdout.write(`check: ${name}\n`);
};
const rejectsCode = (fn, code) => assert.rejects(fn, (error) => error.code === code);
try {
  docker(
    [
      'run',
      '--detach',
      '--name',
      container,
      '--publish',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD',
      'postgres:16',
    ],
    { POSTGRES_PASSWORD: password }
  );
  started = true;
  const port = docker(['port', container, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert(port, 'owned_loopback_port_required');
  for (let retry = 0; retry < 60; retry++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch {
      await delay(250);
    }
  }
  const url = (role) => `postgresql://${role}:${password}@127.0.0.1:${port}/postgres`;
  admin = new pg.Client({ connectionString: url('postgres'), statement_timeout: 10000 });
  await admin.connect();
  check('baseline001_through023');
  const migrations = (await readdir('database/workflow-v2/migrations'))
    .filter((file) => /^\d{3}.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 23)
    .sort();
  assert.equal(migrations.length, 23);
  for (const file of migrations)
    await admin.query(await readFile(`database/workflow-v2/migrations/${file}`, 'utf8'));
  for (const role of ['api', 'worker'])
    await admin.query(
      `CREATE ROLE reads_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE orqaly_${role}`
    );
  api = new pg.Client({ connectionString: url('reads_test_api') });
  worker = new pg.Client({ connectionString: url('reads_test_worker') });
  await api.connect();
  await worker.connect();
  repository = createPostgresRepositories({
    environment: 'preview',
    workerDatabaseUrl: url('reads_test_worker'),
  });
  const tenant = randomUUID(),
    otherTenant = randomUUID();
  await admin.query('INSERT INTO orqaly.tenants(id,display_name) VALUES($1,$3),($2,$3)', [
    tenant,
    otherTenant,
    'Synthetic lease test',
  ]);
  const input = {
    type: 'CompileScopeV2',
    request: 'Synthetic lease recovery',
    objectiveOnlyContext: [],
    safeDefaults: {
      geography: [],
      acceptedSourceTypes: [],
      assumptions: [],
      limits: [],
      policies: [],
    },
  };
  const inputHash = canonicalHash(input),
    canonical = canonicalJson(input);
  const fixtures = [];
  const statuses = [
    'requested',
    'awaiting_gate_1',
    'awaiting_gate_2',
    'completed',
    'completed_with_evidence_gaps',
    'blocked',
    'failed',
    'cancelled',
    'running',
    'running',
    'running',
  ];
  for (const [index, status] of statuses.entries()) {
    const row = {
      tenant: index === 9 ? otherTenant : tenant,
      run: randomUUID(),
      stage: randomUUID(),
      attempt: randomUUID(),
      operation: randomUUID(),
      lease: randomUUID(),
      outbox: randomUUID(),
      status,
      activityStatus: index === 9 ? 'polling' : 'running',
    };
    await admin.query(
      `INSERT INTO orqaly.workflow_runs
      (tenant_id,id,owner_user_id,mode,status,contract_version,request_hash,request_payload)
      VALUES($1,$2,'user_synthetic123','simple',$3,'orqaly.workflow.v2',$4,$5)`,
      [row.tenant, row.run, status, inputHash, { request: input.request }]
    );
    await admin.query(
      `INSERT INTO orqaly.workflow_stages
      (tenant_id,run_id,id,stage_key,kind,status,ordinal,input_hash)
      VALUES($1,$2,$3,'compile-scope','compile_scope',$4,10,$5)`,
      [row.tenant, row.run, row.stage, row.activityStatus, inputHash]
    );
    await admin.query(
      `INSERT INTO orqaly.stage_attempts
      (tenant_id,run_id,stage_id,id,attempt_number,status,activity_type,operation_id,input_hash,
       input_payload,input_canonical,lease_token,lease_owner,lease_expires_at)
      VALUES($1,$2,$3,$4,1,$5,'axwise_operation',$6,$7,$8,$9,$10,'synthetic',clock_timestamp()-interval '1 minute')`,
      [
        row.tenant,
        row.run,
        row.stage,
        row.attempt,
        row.activityStatus,
        row.operation,
        inputHash,
        input,
        canonical,
        row.lease,
      ]
    );
    await admin.query(
      `INSERT INTO orqaly.outbox_events
      (tenant_id,run_id,id,idempotency_key,command_type,stage_id,attempt_id,operation_id,input_hash,
       status,available_at,lease_token,lease_owner,lease_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'processing',clock_timestamp()-interval '2 minutes',
       $10,'synthetic',clock_timestamp()-interval '1 minute')`,
      [
        row.tenant,
        row.run,
        row.outbox,
        `${row.activityStatus === 'polling' ? 'poll' : 'dispatch'}:${row.operation}`,
        row.activityStatus === 'polling' ? 'poll_activity' : 'dispatch_activity',
        row.stage,
        row.attempt,
        row.operation,
        inputHash,
        row.lease,
      ]
    );
    fixtures.push(row);
  }
  check('old_rpc_reproduces_terminal_loop');
  assert.equal(
    (await worker.query('SELECT * FROM orqaly.list_expired_attempt_leases(100)')).rowCount,
    11
  );
  const preserved = async () => {
    const values = [];
    for (const table of ['workflow_runs', 'workflow_stages', 'stage_attempts', 'outbox_events'])
      values.push(
        (
          await admin.query(
            `SELECT to_jsonb(t) AS value FROM orqaly.${table} t ORDER BY tenant_id,id`
          )
        ).rows
      );
    return canonicalHash(values);
  };
  const before = await preserved();
  await admin.query(
    await readFile('database/workflow-v2/migrations/024_active_attempt_lease_recovery.sql', 'utf8')
  );
  assert.equal(await preserved(), before);
  check('024_preserves_history_and_filters_nonrunning_before_limit');
  const list = await repository.listExpiredAttemptLeases(100);
  assert.deepEqual(
    list.map((row) => row.runId).sort(),
    fixtures
      .slice(8)
      .map((row) => row.run)
      .sort()
  );
  assert.equal((await repository.listExpiredAttemptLeases(1))[0].runId, fixtures[8].run);
  assert(!JSON.stringify(list).includes(input.request));
  for (const row of fixtures.slice(0, 8)) {
    if (['requested', 'awaiting_gate_1', 'awaiting_gate_2'].includes(row.status)) continue;
    assert.equal(
      await repository.loadWorkerSnapshot(row.tenant, row.run, { skipTerminal: true }),
      null
    );
  }
  check('worker_only_rpc_acl_search_path_and_tenant_isolation');
  const functions = (
    await admin.query(`SELECT proname,prosecdef,proconfig,
    has_function_privilege('orqaly_api',p.oid,'EXECUTE') AS api,
    has_function_privilege('orqaly_identity',p.oid,'EXECUTE') AS identity,
    has_function_privilege('orqaly_worker',p.oid,'EXECUTE') AS worker
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='orqaly' AND proname IN ('list_expired_attempt_leases','recover_attempt_lease')`)
  ).rows;
  assert.equal(functions.length, 2);
  for (const fn of functions) {
    assert(fn.prosecdef && fn.worker && !fn.api && !fn.identity);
    assert(fn.proconfig.includes('search_path=pg_catalog, orqaly'));
  }
  await rejectsCode(
    () => api.query('SELECT * FROM orqaly.list_expired_attempt_leases(1)'),
    '42501'
  );
  for (const limit of [null, 0, 1001])
    await rejectsCode(
      () => worker.query('SELECT * FROM orqaly.list_expired_attempt_leases($1)', [limit]),
      '22023'
    );
  const inactive = fixtures[3];
  const inactivePlan = {
    event: { type: 'LeaseExpired', tenantId: inactive.tenant, runId: inactive.run },
  };
  await rejectsCode(
    () =>
      worker.query('SELECT orqaly.recover_attempt_lease($1,$2,$3)', [
        inactive.tenant,
        inactive.run,
        inactivePlan,
      ]),
    '42501'
  );
  await worker.query("SELECT set_config('orqaly.tenant_id',$1,false)", [tenant]);
  assert.equal(
    (await worker.query('SELECT id FROM orqaly.workflow_runs WHERE tenant_id=$1', [otherTenant]))
      .rowCount,
    0
  );
  await rejectsCode(
    () =>
      api.query('SELECT orqaly.recover_attempt_lease($1,$2,$3)', [
        tenant,
        inactive.run,
        inactivePlan,
      ]),
    '42501'
  );
  await rejectsCode(
    () =>
      worker.query('SELECT orqaly.recover_attempt_lease($1,$2,$3)', [
        tenant,
        inactive.run,
        { event: { type: 'ActivityStarted', tenantId: tenant, runId: inactive.run } },
      ]),
    '22023'
  );
  const skipped = await repository.applyWorkerTransition(tenant, inactive.run, inactivePlan);
  assert.deepEqual(skipped, { skipped: true, reason: 'run_not_active' });
  assert.equal(await preserved(), before);
  const makePlan = async (row) =>
    transition(await repository.loadWorkerSnapshot(row.tenant, row.run), {
      type: 'LeaseExpired',
      eventId: randomUUID(),
      tenantId: row.tenant,
      runId: row.run,
      occurredAt: new Date().toISOString(),
      stageId: row.stage,
      attemptId: row.attempt,
      leaseToken: row.lease,
      requeueAt: new Date().toISOString(),
    });
  check('stale_lease_rejected_without_partial_stage_mutation');
  const stale = fixtures[10],
    stalePlan = await makePlan(stale);
  await admin.query(
    'UPDATE orqaly.stage_attempts SET lease_token=$1,row_version=row_version+1 WHERE id=$2',
    [randomUUID(), stale.attempt]
  );
  const beforeStale = await preserved();
  await rejectsCode(
    () => repository.applyWorkerTransition(stale.tenant, stale.run, stalePlan),
    '40001'
  );
  assert.equal(await preserved(), beforeStale);
  await admin.query(
    'UPDATE orqaly.stage_attempts SET lease_token=$1,row_version=row_version+1 WHERE id=$2',
    [stale.lease, stale.attempt]
  );
  check('active_running_recovery_requeues_the_same_input_and_operation');
  await repository.applyWorkerTransition(stale.tenant, stale.run, await makePlan(stale));
  const recoveredRunning = await repository.loadWorkerSnapshot(stale.tenant, stale.run);
  assert.equal(recoveredRunning.attempts[0].status, 'queued');
  assert.deepEqual(recoveredRunning.attempts[0].inputPayload, input);
  const claimedAgain = await repository.claimOutbox('synthetic-retry-worker', randomUUID(), 120);
  assert.equal(claimedAgain.runId, stale.run);
  assert.equal(claimedAgain.operationId, stale.operation);
  assert.equal(claimedAgain.inputHash, inputHash);
  check('active_polling_recovery_and_same_event_replay');
  const active = fixtures[9],
    plan = await makePlan(active);
  const result = await repository.applyWorkerTransition(active.tenant, active.run, plan);
  assert.equal(result.idempotent, false);
  assert.equal(
    (await repository.applyWorkerTransition(active.tenant, active.run, plan)).idempotent,
    true
  );
  const recovered = (
    await admin.query('SELECT status,lease_token FROM orqaly.stage_attempts WHERE id=$1', [
      active.attempt,
    ])
  ).rows[0];
  assert.equal(recovered.status, 'polling');
  assert.equal(recovered.lease_token, null);
  check('cancellation_wins_locked_race_without_requeue_or_history_changes');
  const racing = fixtures[8],
    racePlan = await makePlan(racing);
  await admin.query('BEGIN');
  await admin.query(
    "UPDATE orqaly.workflow_runs SET status='cancelled' WHERE tenant_id=$1 AND id=$2",
    [racing.tenant, racing.run]
  );
  const pending = repository.applyWorkerTransition(racing.tenant, racing.run, racePlan);
  let locked = false;
  for (let retry = 0; retry < 50; retry++) {
    const rows = await admin.query(
      "SELECT 1 FROM pg_stat_activity WHERE application_name='orqaly-preview-worker' AND wait_event_type='Lock'"
    );
    if (rows.rowCount) {
      locked = true;
      break;
    }
    await delay(20);
  }
  assert(locked, 'recovery_must_wait_for_run_lock');
  await admin.query('COMMIT');
  const afterCancellation = await preserved();
  assert.deepEqual(await pending, { skipped: true, reason: 'run_not_active' });
  assert.equal(await preserved(), afterCancellation);
  assert.equal(
    (
      await admin.query('SELECT 1 FROM orqaly.workflow_events WHERE id=$1', [
        racePlan.event.eventId,
      ])
    ).rowCount,
    0
  );
  check('repeated_idle_cycles_return_no_expired_terminal_payloads');
  for (let pass = 0; pass < 3; pass++)
    assert.deepEqual(await repository.listExpiredAttemptLeases(100), []);
  process.stdout.write(
    `${JSON.stringify({ status: 'passed', postgresMajor: 16, checks: checks.length, syntheticRuns: fixtures.length })}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', phase, errorType: error?.name || 'Error', code: error?.code || null })}\n`
  );
  process.exitCode = 1;
} finally {
  await repository?.close();
  await Promise.all([api, worker, admin].filter(Boolean).map((client) => client.end()));
  if (started) docker(['rm', '--force', container]);
}
