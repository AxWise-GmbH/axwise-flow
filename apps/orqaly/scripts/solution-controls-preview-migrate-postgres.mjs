// Disposable PostgreSQL16 proof of the actual022023 operator. No cloud calls.
// All customer records and the source commit below are explicit local fixtures.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { compileSolutionWorkflow } from '../server/workflow-v2/solution-compiler.js';
import { captureMigrationCatalog } from './solution-app-keys-preview-migrate.mjs';
import {
  applyControlsMigrations,
  assertControlsCatalogState,
  CONTROLS_PREVIEW_SCOPE as scope,
  validateControlsSources,
} from './solution-controls-preview-migrate.mjs';

assert.equal(process.argv.length, 2, 'no_arguments_supported');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = readdirSync('database/workflow-v2/migrations')
  .filter((name) => /^\d{3}_/.test(name) && Number(name.slice(0, 3)) <= 23)
  .sort();
const records = files
  .filter((name) => Number(name.slice(0, 3)) >= 2)
  .map((name) => {
    const path = `database/workflow-v2/migrations/${name}`,
      source = readFileSync(path, 'utf8');
    return { number: Number(name.slice(0, 3)), path, source, committedSource: source };
  });
const manifest = {
  commit: 'a'.repeat(40),
  hashes: Object.fromEntries(
    records.filter((row) => row.number >= 22).map((row) => [row.number, sha(row.source)])
  ),
};
const sources = validateControlsSources(records, manifest);
const container = `orqaly-controls-migrate-pg-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const docker = (args, environment = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let db,
  started = false,
  phase = 'start',
  count = 0;
const check = (name) => {
  phase = name;
  count++;
  process.stdout.write(`check: ${name}\n`);
};
try {
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
  for (let i = 0; i < 60; i++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch {
      await delay(250);
    }
  }
  const connect = async (database) => {
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password, database });
    await client.connect();
    return client;
  };
  db = await connect('postgres');
  await db.query(`CREATE DATABASE ${scope.database}`);
  await db.end();
  db = await connect(scope.database);
  check('pg16_migrations001_through021');
  for (const name of files.filter((name) => Number(name.slice(0, 3)) <= 21)) {
    phase = name;
    await db.query(readFileSync(`database/workflow-v2/migrations/${name}`, 'utf8'));
  }
  await db.query(
    `CREATE SCHEMA workflow_v2_release; CREATE TABLE workflow_v2_release.applied_additive_migrations(component text NOT NULL CHECK(component='orqaly'),migration_number integer NOT NULL,migration_path text NOT NULL,sha256 text NOT NULL,first_applied_source_commit text NOT NULL,source_commit text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(component,migration_number),CONSTRAINT applied_additive_migrations_migration_number_check CHECK(migration_number BETWEEN 2 AND 21))`
  );
  for (const source of sources.filter((source) => source.number <= 21))
    await db.query(
      "INSERT INTO workflow_v2_release.applied_additive_migrations(component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit) VALUES('orqaly',$1,$2,$3,$4,$4)",
      [source.number, source.path, source.digest, manifest.commit]
    );
  check('three_synthetic_customer_snapshots');
  await db.query(
    "INSERT INTO orqaly.tenants(id,display_name) VALUES($1,'Synthetic controls operator preservation')",
    [scope.tenantId]
  );
  const spec = {
    kind: 'webhook_transform_v1',
    fields: [{ source: 'name', target: 'name', transform: 'trim' }],
  };
  for (const id of scope.solutionIds) {
    const compiled = compileSolutionWorkflow({ id, spec });
    await db.query(
      "INSERT INTO orqaly.customer_solutions(tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash) VALUES($1,$2,$3,$4,'Synthetic preserved solution','No provider or customer effects',$5,'{}',$6,$7,$8,$7)",
      [
        scope.tenantId,
        id,
        scope.ownerUserId,
        randomUUID(),
        spec,
        compiled.workflow,
        compiled.workflowHash,
        `fixture_${id}`,
      ]
    );
    const revisionId = randomUUID();
    await db.query(
      'INSERT INTO orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,workflow,workflow_hash,spec) VALUES($1,$2,$3,$4,2,1,$5,$6,$5,$7,$6)',
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
      "INSERT INTO orqaly.solution_revision_events(tenant_id,solution_id,revision_id,id,owner_user_id,kind,workflow_hash) VALUES($1,$2,$3,$4,$5,'created',$6)",
      [scope.tenantId, id, revisionId, randomUUID(), scope.ownerUserId, compiled.workflowHash]
    );
  }
  const options = { sources, manifest };
  check('read_only_inspect_preserves021');
  const before = await captureMigrationCatalog(db);
  const inspect = await applyControlsMigrations(db, { ...options, mode: 'inspect' });
  assert.equal(inspect.status, 'ready_not_applied');
  assert.equal(inspect.ledgerAfter, 21);
  assert.equal(inspect.preserved.customer_solutions.count, 3);
  assert.deepEqual(await captureMigrationCatalog(db), before);
  check('unexpected_acl_change_rolls_back_both_migrations');
  const bad = records
    .map((row) =>
      row.number === 23
        ? {
            ...row,
            source: row.source.replace(
              /\s*COMMIT;\s*$/,
              '\nGRANT DELETE ON orqaly.solution_failure_probes TO orqaly_api;\nCOMMIT;\n'
            ),
          }
        : row
    )
    .map((row) => ({ ...row, committedSource: row.source }));
  const badManifest = { ...manifest, hashes: { ...manifest.hashes, 23: sha(bad.at(-1).source) } };
  await assert.rejects(
    () =>
      applyControlsMigrations(db, {
        mode: 'apply',
        manifest: badManifest,
        sources: validateControlsSources(bad, badManifest),
      }),
    /broad_mutation_privilege_denied|new_table_grants_not_exact/
  );
  assert.deepEqual(await captureMigrationCatalog(db), before);
  assert.equal(
    (
      await db.query(
        'SELECT max(migration_number) AS n FROM workflow_v2_release.applied_additive_migrations'
      )
    ).rows[0].n,
    21
  );
  check('atomic_reviewed_apply_with_owner_rls_and_exact_grants');
  const receipt = await applyControlsMigrations(db, { ...options, mode: 'apply' });
  assert.equal(receipt.status, 'applied_verified');
  assert.equal(receipt.ledgerAfter, 23);
  assert.equal(receipt.protectedDataPreserved, true);
  assert.deepEqual(receipt.preserved, inspect.preserved);
  assertControlsCatalogState(await captureMigrationCatalog(db), true);
  check('restart_inspect_and_apply_are_no_write_replays');
  const applied = await captureMigrationCatalog(db);
  for (const mode of ['inspect', 'apply']) {
    const replay = await applyControlsMigrations(db, { ...options, mode });
    assert.equal(replay.status, 'already_applied_no_writes');
    assert.deepEqual(replay.preserved, inspect.preserved);
  }
  assert.deepEqual(await captureMigrationCatalog(db), applied);
  check('trigger_body_and_new_column_privilege_drift_rejected');
  await db.query('GRANT UPDATE(scope) ON orqaly.solution_revision_connections TO orqaly_api');
  await assert.rejects(
    () => applyControlsMigrations(db, { ...options, mode: 'inspect' }),
    /new_column_grants_not_exact/
  );
  await db.query('REVOKE UPDATE(scope) ON orqaly.solution_revision_connections FROM orqaly_api');
  await db.query(
    'CREATE OR REPLACE FUNCTION orqaly.guard_revision_connection_pending() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RETURN NEW; END $$'
  );
  await assert.rejects(
    () => applyControlsMigrations(db, { ...options, mode: 'inspect' }),
    /reviewed_function_body_changed/
  );
  process.stdout.write(
    `${JSON.stringify({ verified: true, synthetic: true, postgresMajor: 16, checks: count, migrationHashes: manifest.hashes, cloudCalls: 0, customerCalls: 0 })}\n`
  );
} catch (error) {
  process.stderr.write(`FAIL ${phase}: ${error.code || error.name}: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await db?.end().catch(() => {});
  if (started) docker(['rm', '-f', container]);
}
