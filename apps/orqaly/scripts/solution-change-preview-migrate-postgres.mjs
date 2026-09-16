// Disposable PostgreSQL16 verification of the actual fixed020021 operator.
// Synthetic customer rows only; no GCP, n8n, model, provider or customer calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { compileSolutionWorkflow } from '../server/workflow-v2/solution-compiler.js';
import { captureMigrationCatalog } from './solution-app-keys-preview-migrate.mjs';
import {
  applyChangeMigrations,
  assertChangeCatalogState,
  assertChangeCatalogDelta,
  CHANGE_PREVIEW_SCOPE as scope,
  validateChangeSources,
} from './solution-change-preview-migrate.mjs';

assert.equal(process.argv.length, 2, 'no_arguments_supported');
const password = randomBytes(24).toString('hex');
const container = `orqaly-change-migrate-pg-${randomBytes(6).toString('hex')}`;
const docker = (args, extraEnv = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let started = false,
  db,
  phase = 'start';
const checks = [];
const check = (name) => {
  phase = name;
  checks.push(name);
  process.stdout.write(`check: ${name}\n`);
};
const commit = 'a'.repeat(40); // Explicit local source fixture, not cloud Git-commit evidence.
const files = readdirSync('database/workflow-v2/migrations')
  .filter((name) => /^\d{3}_/.test(name) && Number(name.slice(0, 3)) <= 21)
  .sort();
const records = files
  .filter((name) => Number(name.slice(0, 3)) >= 2)
  .map((name) => {
    const path = `database/workflow-v2/migrations/${name}`,
      source = readFileSync(path, 'utf8');
    return { number: Number(name.slice(0, 3)), path, source, committedSource: source };
  });
const sources = validateChangeSources(records, commit);
try {
  // Require the already installed image; no implicit network pull.
  docker(['image', 'inspect', 'postgres:16']);
  docker(
    [
      'run',
      '--pull=never',
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
  assert(port);
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch {
      await delay(250);
    }
  }
  const connect = async (database) => {
    const client = new pg.Client({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password,
      database,
      statement_timeout: 60000,
    });
    await client.connect();
    return client;
  };
  db = await connect('postgres');
  await db.query(`CREATE DATABASE ${scope.database}`);
  await db.end();
  db = await connect(scope.database);
  check('actual_postgresql16_and_migrations001_through019');
  const actual = Number(
    (await db.query("SELECT current_setting('server_version_num') AS version")).rows[0].version
  );
  assert.equal(Math.floor(actual / 10000), 16);
  for (const file of files.filter((name) => Number(name.slice(0, 3)) <= 19)) {
    phase = file;
    await db.query(readFileSync(`database/workflow-v2/migrations/${file}`, 'utf8'));
  }
  await db.query(`CREATE SCHEMA workflow_v2_release;
    CREATE TABLE workflow_v2_release.applied_additive_migrations(
    component text NOT NULL CHECK(component='orqaly'),migration_number integer NOT NULL,migration_path text NOT NULL,sha256 text NOT NULL,
    first_applied_source_commit text NOT NULL,source_commit text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(component,migration_number),CONSTRAINT applied_additive_migrations_migration_number_check CHECK(migration_number BETWEEN 2 AND 19));`);
  for (const source of sources.filter((entry) => entry.number <= 19))
    await db.query(
      "INSERT INTO workflow_v2_release.applied_additive_migrations(component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit) VALUES('orqaly',$1,$2,$3,$4,$4)",
      [source.number, source.path, source.digest, commit]
    );
  check('three_synthetic_owned_solutions_and_existing_conversation');
  await db.query(
    "INSERT INTO orqaly.tenants(id,display_name) VALUES($1,'Synthetic operator preservation tenant')",
    [scope.tenantId]
  );
  const spec = {
    kind: 'webhook_transform_v1',
    fields: [{ source: 'name', target: 'name', transform: 'trim' }],
  };
  for (const id of scope.solutionIds) {
    const compiled = compileSolutionWorkflow({ id, spec });
    await db.query(
      `INSERT INTO orqaly.customer_solutions(tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash) VALUES($1,$2,$3,$4,'Synthetic protected workflow','No runtime or production data claim',$5,$6,$7,$8,$9,$8)`,
      [
        scope.tenantId,
        id,
        scope.ownerUserId,
        randomUUID(),
        spec,
        { name: 'Synthetic Agent' },
        compiled.workflow,
        compiled.workflowHash,
        `fixture_${id}`,
      ]
    );
    const revisionId = randomUUID();
    await db.query(
      `INSERT INTO orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,workflow,workflow_hash,spec) VALUES($1,$2,$3,$4,2,1,$5,$6,$5,$7,$6)`,
      [
        scope.tenantId,
        id,
        revisionId,
        scope.ownerUserId,
        compiled.workflow,
        spec,
        compiled.workflowHash,
      ]
    );
    await db.query(
      `INSERT INTO orqaly.solution_revision_events(tenant_id,solution_id,revision_id,id,owner_user_id,kind,workflow_hash) VALUES($1,$2,$3,$4,$5,'created',$6)`,
      [scope.tenantId, id, revisionId, randomUUID(), scope.ownerUserId, compiled.workflowHash]
    );
    await db.query(
      `INSERT INTO orqaly.solution_invocations(tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,output,status,execution_id,completed_at) VALUES($1,$2,$3,$4,'test','fixture_synthetic_receipt',$5,$5,$6,$6,'succeeded','synthetic-no-runtime',clock_timestamp())`,
      [
        scope.tenantId,
        id,
        randomUUID(),
        scope.ownerUserId,
        compiled.workflowHash,
        { name: 'synthetic fixture only' },
      ]
    );
  }
  await db.query(
    `INSERT INTO orqaly.solution_conversation_turns(tenant_id,solution_id,id,owner_user_id,mode,message,request_key,request_hash,command,context_snapshot,context_hash,operation_id,envelope) VALUES($1,$2,$3,$4,'ask','Synthetic legacy conversation','fixture_preservation',$5,'{}','{}',$5,$6,'{}')`,
    [
      scope.tenantId,
      scope.solutionIds[0],
      randomUUID(),
      scope.ownerUserId,
      'a'.repeat(64),
      randomUUID(),
    ]
  );
  const options = { sources, commit };
  check('read_only_inspect_preserves019');
  const before = await captureMigrationCatalog(db);
  const inspected = await applyChangeMigrations(db, { ...options, mode: 'inspect' });
  assert.equal(inspected.status, 'ready_not_applied');
  assert.equal(inspected.preserved.customer_solutions.count, 3);
  assert.equal(inspected.preserved.solution_revisions.count, 3);
  assert.equal(inspected.preserved.solution_revision_events.count, 3);
  assert.equal(inspected.preserved.solution_invocations.count, 3);
  assert.equal(inspected.preserved.solution_conversation_turns.count, 1);
  assert.deepEqual(await captureMigrationCatalog(db), before);
  check('data_preservation_failure_rolls_back_all_ddl_and_ledger');
  let snapshots = 0;
  await assert.rejects(
    () =>
      applyChangeMigrations(db, {
        ...options,
        mode: 'apply',
        preserveCustomers: async () => ({ immutableFixtureHash: snapshots++ }),
      }),
    /protected_customer_or_workflow_data_changed/
  );
  assert.deepEqual(await captureMigrationCatalog(db), before);
  assert.equal(
    (
      await db.query(
        'SELECT max(migration_number) AS version FROM workflow_v2_release.applied_additive_migrations'
      )
    ).rows[0].version,
    19
  );
  check('reviewed_atomic020021_apply_preserves_customer_rows_and_cluster');
  const applied = await applyChangeMigrations(db, { ...options, mode: 'apply' });
  assert.equal(applied.status, 'applied_verified');
  assert.equal(applied.ledgerAfter, 21);
  assert.deepEqual(applied.preserved, inspected.preserved);
  const after = await captureMigrationCatalog(db);
  assertChangeCatalogDelta(before, after);
  assert.deepEqual(
    (await db.query('SELECT lifecycle FROM orqaly.solution_conversation_turns')).rows[0].lifecycle,
    {}
  );
  check('idempotent_apply_and_post_inspect_make_no_writes');
  const priorLedger = (
    await db.query(
      'SELECT * FROM workflow_v2_release.applied_additive_migrations ORDER BY migration_number'
    )
  ).rows;
  for (const mode of ['apply', 'inspect']) {
    const replay = await applyChangeMigrations(db, { ...options, mode });
    assert.equal(replay.status, 'already_applied_no_writes');
    assert.deepEqual(replay.preserved, inspected.preserved);
  }
  assert.deepEqual(
    (
      await db.query(
        'SELECT * FROM workflow_v2_release.applied_additive_migrations ORDER BY migration_number'
      )
    ).rows,
    priorLedger
  );
  check('new_rpc_acl_fork_rls_and_historical_catalog_tamper_rejected');
  for (const mutate of [
    (rows) => {
      rows.find(
        (row) => row.kind === 'table' && row.object === 'solution_revision_forks'
      ).data.forceRls = false;
    },
    (rows) => {
      rows
        .find(
          (row) => row.kind === 'function' && row.object === 'advance_solution_conversation_turn'
        )
        .data.acl.push({
          grantor: 'postgres',
          grantee: 'PUBLIC',
          privilege: 'EXECUTE',
          grantable: false,
        });
    },
    (rows) => {
      rows.find(
        (row) => row.kind === 'policy' && row.object === 'solution_revision_forks'
      ).data.using = 'true';
    },
  ]) {
    const invalid = structuredClone(after);
    mutate(invalid);
    assert.throws(() => assertChangeCatalogState(invalid, true));
  }
  const altered = structuredClone(after);
  altered.find((row) => row.kind === 'table' && row.object === 'customer_solutions').data.owner =
    'orqaly_api';
  assert.throws(
    () => assertChangeCatalogDelta(before, altered),
    /unreviewed_catalog_or_privilege_change/
  );
  process.stdout.write(
    `${JSON.stringify({ verified: true, environment: 'disposable_local_pg_only', postgresVersion: actual, checks: checks.length, preserved: applied.preserved, migrationHashes: applied.migrationHashes, providerCalls: 0, cloudCalls: 0 })}\n`
  );
} catch (error) {
  // Local fixture only. Stable assertion messages may be shown, never DB objects,
  // connection strings, SQL text, arbitrary rows or Docker stderr.
  process.stderr.write(
    `${JSON.stringify({ verified: false, phase, code: error.code ?? 'LOCAL_GUARD_FAILED', assertion: error.name === 'AssertionError' ? String(error.message).split('\n')[0] : null, position: error.position ?? null })}\n`
  );
  process.exitCode = 1;
} finally {
  await db?.end().catch(() => {});
  if (started)
    try {
      docker(['rm', '--force', container]);
    } catch {
      process.exitCode = 1;
    }
}
