// Exact preview-only additive release operator. Inspect is read-only. Apply
// requires committed migration bytes and records each digest in the live ledger.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const project = 'axwise-v2-preview-001', instance = `${project}:europe-west4:orqaly-v2-preview-001-pg`, port = 19516;
const orqalyRoot = resolve(import.meta.dirname, '..'), axwiseRoot = '/private/tmp/axwise-prepare-solution';
const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const capture = (cmd, args, cwd = orqalyRoot) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const mode = process.argv[2];
const onlyAxwise = process.argv[3] === '--axwise-only';
const onlyOrqaly = process.argv[3] === '--orqaly-only';
assert(['inspect', 'apply'].includes(mode) && (process.argv.length === 3 || ((onlyAxwise || onlyOrqaly) && process.argv.length === 4)), 'explicit_mode_required');
const files = onlyAxwise ? [] : ['015_native_workflow_builder.sql', '016_solution_schedules.sql', '017_isolated_coding_jobs.sql', '018_native_connection_verification.sql', '019_solution_conversations.sql'];
const migrations = files.map((file) => {
  const path = `database/workflow-v2/migrations/${file}`, source = readFileSync(resolve(orqalyRoot, path), 'utf8');
  assert(/^BEGIN;\s[\s\S]*\sCOMMIT;\s*$/.test(source), 'migration_transaction_required');
  if (mode === 'apply') assert.equal(hash(capture('git', ['show', `HEAD:${path}`]) + '\n'), hash(source), 'committed_migration_required');
  return { path, number: Number(file.slice(0, 3)), digest: hash(source), sql: source.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '') };
});
const axwisePath = 'backend/database/workflow_v2/007_prepare_solution_v2.sql';
const axwiseSource = onlyOrqaly ? null : readFileSync(resolve(axwiseRoot, axwisePath), 'utf8');
if (mode === 'apply' && !onlyOrqaly) assert.equal(hash(capture('git', ['show', `HEAD:${axwisePath}`], axwiseRoot) + '\n'), hash(axwiseSource), 'committed_axwise_migration_required');
let proxy, client, stage = 'source_validation';
async function connect(database, password) {
  const next = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password, database, connectionTimeoutMillis: 1000 });
  await next.connect();
  const identity = (await next.query("SELECT current_database() AS name,current_user AS user,current_setting('server_version_num')::integer AS version")).rows[0];
  assert(identity.name === database && identity.user === 'postgres' && Math.floor(identity.version / 10000) === 16, 'exact_preview_identity_required');
  return next;
}
async function preserve(db) {
  await db.query('SET LOCAL ROLE orqaly_api');
  await db.query("SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)", ['c1b26d36-721b-5d8c-8d4c-180050ee9b94', 'user_2vHlB9JhH4FazWsgKYENFIeAnMu']);
  try {
  const result = {};
  const ids = ['2031decc-b21e-48b5-9bd5-3ed3d4dfd024', '8b606adc-91ba-46e5-86da-ece609df9c7d', '637fcfaf-3864-468b-ad36-47337b80c484'];
  for (const table of ['customer_solutions', 'solution_revisions', 'solution_revision_events', 'solution_invocations']) {
    const rows = (await db.query(`SELECT to_jsonb(t)-'evidence' AS value FROM orqaly.${table} t WHERE ${table === 'customer_solutions' ? 'id' : 'solution_id'}=ANY($1::uuid[]) ORDER BY id`, [ids])).rows;
    if (table === 'customer_solutions') assert.equal(rows.length, 3, 'preserved_solutions_missing');
    result[table] = { count: rows.length, hash: hash(rows) };
  }
  return result;
  } finally { await db.query('RESET ROLE'); }
}
try {
  stage = 'owned_proxy';
  const probe = net.createServer();
  await new Promise((done, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', done); });
  await new Promise((done) => probe.close(done));
  const password = capture('gcloud', ['secrets', 'versions', 'access', '1', '--secret=orqaly-v2-preview-001-db-admin-password', `--project=${project}`]);
  proxy = spawn('cloud-sql-proxy', [instance, '--gcloud-auth', '--address=127.0.0.1', `--port=${port}`], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 60; attempt++) {
    assert(proxy.exitCode === null, 'owned_proxy_failed');
    try { client = await connect('orqaly_v2_preview_001', password); break; } catch { await delay(500); }
  }
  assert(client, 'preview_database_unavailable');
  if (!onlyAxwise) {
  stage = 'orqaly_preflight';
  await client.query(`BEGIN ISOLATION LEVEL REPEATABLE READ${mode === 'inspect' ? ' READ ONLY' : ''}`);
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SET LOCAL idle_in_transaction_session_timeout='60s'");
  if (mode === 'apply') await client.query("SELECT pg_advisory_xact_lock(hashtext('orqaly-preview-additive-migration'))");
  const ledger = (await client.query("SELECT * FROM workflow_v2_release.applied_additive_migrations WHERE component='orqaly' ORDER BY migration_number")).rows;
  assert(ledger.at(-1)?.migration_number >= 14 && ledger.at(-1).migration_number <= 19, 'exact_native_baseline_required');
  assert.deepEqual(ledger.map((entry) => entry.migration_number), Array.from({ length: ledger.length }, (_, index) => index + 2), 'contiguous_baseline_required');
  assert.equal(ledger.find((entry) => entry.migration_number === 14)?.sha256, '0d1dfa9cdc32deb889c86f3ab5481adf7ba58c9c99eb451820f828c77115bc6a', 'baseline014_mismatch');
  const preserved = await preserve(client), applied = [];
  const sourceCommit = capture('git', ['rev-parse', 'HEAD']);
  for (const migration of migrations) {
    const prior = ledger.find((entry) => entry.migration_number === migration.number);
    if (prior) { assert.equal(prior.sha256, migration.digest, 'native_ledger_source_mismatch'); assert.equal(prior.migration_path, migration.path); }
    else if (mode === 'apply') {
      stage = `orqaly_apply_${migration.number}`;
      await client.query(migration.sql);
      await client.query('ALTER TABLE workflow_v2_release.applied_additive_migrations DROP CONSTRAINT applied_additive_migrations_migration_number_check; ALTER TABLE workflow_v2_release.applied_additive_migrations ADD CONSTRAINT applied_additive_migrations_migration_number_check CHECK(migration_number BETWEEN 2 AND 19)');
      await client.query("INSERT INTO workflow_v2_release.applied_additive_migrations(component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit) VALUES('orqaly',$1,$2,$3,$4,$4)", [migration.number, migration.path, migration.digest, sourceCommit]);
      applied.push(migration.number);
    }
  }
  assert.deepEqual(await preserve(client), preserved, 'existing_customer_data_changed');
  if (mode === 'apply') {
    const rls = (await client.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='orqaly'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname", [['solution_build_tests', 'solution_connections', 'solution_schedules', 'solution_schedule_ticks', 'solution_coding_jobs', 'solution_coding_dispatches', 'solution_conversation_turns']])).rows;
    assert(rls.length === 7 && rls.every((entry) => entry.relrowsecurity && entry.relforcerowsecurity), 'native_forced_rls_required');
    const grants = (await client.query("SELECT has_function_privilege('orqaly_api','orqaly.complete_solution_conversation_turn(uuid,uuid,jsonb)','EXECUTE') AS api_complete,has_table_privilege('orqaly_worker','orqaly.solution_revisions','UPDATE') AS broad_revision_write,has_table_privilege('orqaly_api','orqaly.solution_conversation_turns','UPDATE') AS api_turn_write,has_function_privilege('orqaly_worker','orqaly.complete_solution_conversation_turn(uuid,uuid,jsonb)','EXECUTE') AS worker_complete")).rows[0];
    assert(grants && !grants.api_complete && !grants.broad_revision_write && !grants.api_turn_write && grants.worker_complete, 'conversation_least_privilege_required');
  }
  await client.query(mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
  console.log(JSON.stringify({ component: 'orqaly', mode, applied, sourceCommit, migrations: migrations.map(({ number, digest }) => ({ number, digest })), preserved }));
  }
  await client.end(); client = null;
  if (!onlyOrqaly) {
  stage = 'axwise_preflight';
  client = await connect('axwise_v2_preview_001', password);
  await client.query(`BEGIN${mode === 'inspect' ? ' READ ONLY' : ''}`);
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
  const marker = (await client.query("SELECT to_jsonb(marker) AS value FROM workflow_v2_release.applied_baseline marker WHERE component='axwise' AND migration_number=1")).rows[0]?.value;
  assert(marker?.prepare_solution_migration_path === 'backend/database/workflow_v2/006_prepare_solution.sql' && marker.prepare_solution_sha256 === 'e2573b95a5d00d0104a705c4531cf40945d66ebc23b2f8287cf0dc131d6687df', 'axwise006_baseline_required');
  const constraint = (await client.query("SELECT pg_get_constraintdef(oid) AS value FROM pg_constraint WHERE conrelid='axwise.cognitive_operations'::regclass AND conname='cognitive_operations_operation_type_check'")).rows[0]?.value;
  assert(constraint?.includes('PrepareSolutionV1'), 'axwise006_constraint_required');
  const nativeApplied = constraint.includes('PrepareSolutionV2');
  if (nativeApplied) assert.equal(marker.native_solution_sha256, hash(axwiseSource), 'axwise_native_marker_mismatch');
  if (mode === 'apply' && !nativeApplied) {
    stage = 'axwise_apply007';
    await client.query(axwiseSource.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, ''));
    await client.query('ALTER TABLE workflow_v2_release.applied_baseline ADD COLUMN native_solution_migration_path text, ADD COLUMN native_solution_sha256 text');
    await client.query("UPDATE workflow_v2_release.applied_baseline SET native_solution_migration_path=$1,native_solution_sha256=$2,source_commit=$3 WHERE component='axwise' AND migration_number=1", [axwisePath, hash(axwiseSource), capture('git', ['rev-parse', 'HEAD'], axwiseRoot)]);
  }
  await client.query(mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
  console.log(JSON.stringify({ component: 'axwise', mode, applied: mode === 'apply' && !nativeApplied, migration: 7, digest: hash(axwiseSource), credentialsLogged: false }));
  }
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ status: 'failed', stage, code: /^[A-Z0-9_]{3,50}$/.test(error.code ?? '') ? error.code : 'OPERATOR_CHECK_FAILED', check: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0].slice(0,100) : undefined }));
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  if (proxy && proxy.exitCode === null) proxy.kill('SIGTERM');
}
