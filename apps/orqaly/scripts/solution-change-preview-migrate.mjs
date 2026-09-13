// Fixed Orqaly preview migration020+021 operator. No n8n/AxWise schema, role,
// database ACL, IAM or runtime changes. Cloud apply requires separate approval.
// Usage: node scripts/solution-change-preview-migrate.mjs inspect|apply
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { captureMigrationCatalog } from './solution-app-keys-preview-migrate.mjs';

const root = resolve(import.meta.dirname, '..');
export const CHANGE_PREVIEW_SCOPE = Object.freeze({
  project: 'axwise-v2-preview-001',
  database: 'orqaly_v2_preview_001',
  instance: 'axwise-v2-preview-001:europe-west4:orqaly-v2-preview-001-pg',
  port: 19520,
  tenantId: 'c1b26d36-721b-5d8c-8d4c-180050ee9b94',
  ownerUserId: 'user_2vHlB9JhH4FazWsgKYENFIeAnMu',
  solutionIds: [
    '2031decc-b21e-48b5-9bd5-3ed3d4dfd024',
    '8b606adc-91ba-46e5-86da-ece609df9c7d',
    '637fcfaf-3864-468b-ad36-47337b80c484',
  ],
});
export const CHANGE_MIGRATION_HASHES = Object.freeze({
  20: '20c9bf9c637fe6d92ad804af9bbfa17af41ec3c462cb857c9ba12482bbc93713',
  21: '2493b1b673f9458a307625783207439ef2fd8602302fa3954a137de0ff085e45',
});
const migrationDir = 'database/workflow-v2/migrations';
const ledgerConstraint = 'applied_additive_migrations_migration_number_check';
const sha = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])])
        )
      : value;
const ordered = (rows) =>
  [...rows].sort((a, b) =>
    JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b)), 'en')
  );
const quote = (value) => {
  assert.match(value, /^[a-z][a-z0-9_]*$/);
  return `"${value}"`;
};
const capture = (command, args) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
export function parseChangeMigrationMode(args) {
  assert(
    args.length === 1 && ['inspect', 'apply'].includes(args[0]),
    'explicit_inspect_or_apply_required'
  );
  return args[0];
}
export function validateChangeSources(records, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.deepEqual(
    records.map((record) => record.number),
    Array.from({ length: 20 }, (_, index) => index + 2),
    'all_committed_migrations002_through021_required'
  );
  return records.map((record) => {
    assert.match(record.path, /^database\/workflow-v2\/migrations\/\d{3}_[a-z0-9_]+\.sql$/);
    assert.equal(Number(record.path.split('/').at(-1).slice(0, 3)), record.number);
    assert.equal(record.source, record.committedSource, 'committed_migration_bytes_required');
    const digest = sha(record.source);
    if (record.number >= 20) {
      assert.equal(
        digest,
        CHANGE_MIGRATION_HASHES[record.number],
        'reviewed_migration_hash_required'
      );
      assert(
        /^BEGIN;\s[\s\S]*\sCOMMIT;\s*$/.test(record.source),
        'exact_transaction_wrapper_required'
      );
    }
    return {
      number: record.number,
      path: record.path,
      digest,
      source: record.source,
      sql: record.source.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, ''),
    };
  });
}
export function validateChangeLedger(rows, sources) {
  assert(
    rows.every((row) => row.component === 'orqaly'),
    'foreign_component_in_orqaly_ledger'
  );
  assert.deepEqual(
    rows.map((row) => row.migration_number),
    Array.from({ length: rows.length }, (_, index) => index + 2),
    'contiguous_ledger_required'
  );
  const last = rows.at(-1)?.migration_number;
  assert([19, 21].includes(last), 'exact019_or021_baseline_required');
  for (const row of rows) {
    const source = sources.find((entry) => entry.number === row.migration_number);
    assert(
      source && row.migration_path === source.path && row.sha256 === source.digest,
      'historical_ledger_source_mismatch'
    );
  }
  return last;
}
const additions = [
  ['column', 'solution_conversation_turns', 'lifecycle'],
  ['constraint', 'solution_conversation_turns', 'solution_conversation_turns_lifecycle_check'],
  ['constraint', 'solution_revisions', 'solution_revisions_owner_identity'],
  ['index', 'solution_revisions', 'solution_revisions_owner_identity'],
  ['constraint', 'solution_revisions', 'solution_revisions_solution_owner'],
];
const changedChecks = [
  'solution_conversation_turns_mode_check',
  'solution_conversation_turns_check',
];
const addedFunctions = [
  'advance_solution_conversation_turn',
  'claim_solution_conversation_turn_v2',
];
const changedFunctions = [
  'complete_solution_conversation_turn',
  'claim_solution_conversation_turn',
];
function added(row) {
  return (
    row.schema === 'orqaly' &&
    (row.object === 'solution_revision_forks' ||
      addedFunctions.includes(row.object) ||
      additions.some(
        ([kind, object, part]) => row.kind === kind && row.object === object && row.part === part
      ))
  );
}
function retained(rows) {
  return ordered(
    rows
      .filter(
        (row) =>
          !added(row) &&
          !(
            row.schema === 'workflow_v2_release' &&
            row.kind === 'constraint' &&
            row.part === ledgerConstraint
          ) &&
          !(
            row.schema === 'orqaly' &&
            row.object === 'solution_conversation_turns' &&
            row.kind === 'constraint' &&
            changedChecks.includes(row.part)
          )
      )
      .map((row) =>
        row.schema === 'orqaly' && row.kind === 'function' && changedFunctions.includes(row.object)
          ? { ...row, data: { ...row.data, definition: `reviewed020_${row.object}_body` } }
          : row
      )
  );
}
export function assertChangeCatalogState(rows, applied) {
  const matching = (kind, object, part) =>
    rows.filter(
      (row) =>
        row.schema === 'orqaly' &&
        row.kind === kind &&
        row.object === object &&
        (part === undefined || row.part === part)
    );
  if (!applied) assert.equal(rows.filter(added).length, 0, 'partial_change_migration_catalog');
  else {
    for (const [kind, object, part] of additions)
      assert.equal(matching(kind, object, part).length, 1, 'expected_catalog_addition_missing');
    const table = matching('table', 'solution_revision_forks')[0]?.data;
    assert(
      table?.rls && table.forceRls && table.owner === 'postgres',
      'fork_table_forced_rls_required'
    );
    assert.deepEqual(
      ordered(table.acl.filter((entry) => entry.grantee !== 'postgres')),
      ordered(
        ['INSERT', 'SELECT'].map((privilege) => ({
          grantor: 'postgres',
          grantee: 'orqaly_api',
          privilege,
          grantable: false,
        }))
      ),
      'fork_table_grants_not_exact'
    );
    const policy = matching('policy', 'solution_revision_forks');
    assert.equal(policy.length, 1, 'exact_owner_policy_required');
    assert.deepEqual(policy[0].data.roles, ['orqaly_api']);
    assert.equal(
      policy[0].data.using,
      "((tenant_id = orqaly.current_tenant_id()) AND (owner_user_id = current_setting('orqaly.build_owner_user_id'::text, true)))"
    );
    assert.equal(policy[0].data.check, policy[0].data.using);
    assert.equal(policy[0].data.cmd, 'ALL');
    assert.equal(policy[0].data.permissive, 'PERMISSIVE');
    assert.deepEqual(
      matching('column', 'solution_revision_forks')
        .map((row) => row.part)
        .sort(),
      [
        'tenant_id',
        'solution_id',
        'owner_user_id',
        'idempotency_key',
        'request_hash',
        'source_revision_id',
        'source_row_version',
        'source_workflow_hash',
        'target_revision_id',
        'created_at',
      ].sort()
    );
    assert.equal(matching('trigger', 'solution_revision_forks').length, 0);
    const lifecycle = matching('column', 'solution_conversation_turns', 'lifecycle')[0].data;
    assert.equal(lifecycle.type, 'jsonb');
    assert.equal(lifecycle.notNull, true);
    assert.equal(lifecycle.default, "'{}'::jsonb");
    assert.deepEqual(lifecycle.acl, []);
  }
  for (const name of [...changedFunctions, ...(applied ? addedFunctions : [])]) {
    const fn = matching('function', name);
    assert.equal(fn.length, 1);
    assert(
      fn[0].data.owner === 'postgres' && fn[0].data.securityDefiner === true,
      'scoped_worker_function_required'
    );
    assert.deepEqual(fn[0].data.config, ['search_path=pg_catalog, orqaly']);
    assert.deepEqual(ordered(fn[0].data.acl.filter((entry) => entry.grantee !== 'postgres')), [
      { grantor: 'postgres', grantee: 'orqaly_worker', privilege: 'EXECUTE', grantable: false },
    ]);
  }
  const mode = matching('constraint', 'solution_conversation_turns', changedChecks[0])[0]?.data
    .definition;
  const target = matching('constraint', 'solution_conversation_turns', changedChecks[1])[0]?.data
    .definition;
  assert(
    mode?.includes("'ask'::text") &&
      mode.includes("'change'::text") &&
      Boolean(mode.includes("'auto'::text")) === applied,
    'conversation_mode_check_mismatch'
  );
  assert(
    target?.includes('target_revision_id IS NULL') &&
      target.includes('target_revision_id IS NOT NULL') &&
      Boolean(target.includes("'auto'::text")) === applied,
    'conversation_target_check_mismatch'
  );
  const ledger = rows.find(
    (row) =>
      row.schema === 'workflow_v2_release' &&
      row.kind === 'constraint' &&
      row.part === ledgerConstraint
  );
  assert.equal(
    ledger?.data.definition,
    `CHECK (((migration_number >= 2) AND (migration_number <= ${applied ? 21 : 19})))`,
    'ledger_bound_mismatch'
  );
}
export function assertChangeCatalogDelta(before, after) {
  assertChangeCatalogState(before, false);
  assertChangeCatalogState(after, true);
  assert.deepEqual(retained(after), retained(before), 'unreviewed_catalog_or_privilege_change');
}
function sqlFunctionBody(source, name) {
  const start = source.indexOf(`FUNCTION orqaly.${name}(`);
  assert(start >= 0, 'reviewed_function_missing');
  const body = source.indexOf('AS $$', start);
  const end = source.indexOf('$$;', body + 5);
  assert(body > start && end > body, 'reviewed_function_body_not_found');
  return source.slice(body + 5, end);
}
export async function assertChangePrivileges(db, sources, applied) {
  const names = [...changedFunctions, ...(applied ? addedFunctions : [])];
  for (const name of names) {
    const identity = `orqaly.${name}(${name.startsWith('claim_') ? 'uuid' : 'uuid,uuid,jsonb'})`;
    const functionRow = (
      await db.query('SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure($1)', [identity])
    ).rows[0];
    const source = sources.find((entry) => entry.number === (applied ? 20 : 19));
    assert.equal(
      functionRow?.prosrc,
      sqlFunctionBody(source.source, name),
      'reviewed_function_body_changed'
    );
    const privileges = (
      await db.query(
        "SELECT has_function_privilege('orqaly_api',$1,'EXECUTE') AS api,has_function_privilege('orqaly_worker',$1,'EXECUTE') AS worker",
        [identity]
      )
    ).rows[0];
    assert(privileges?.api === false && privileges.worker === true, 'worker_only_rpc_required');
  }
  const guards = (
    await db.query(
      "SELECT has_table_privilege('orqaly_api','orqaly.solution_conversation_turns','UPDATE') AS api_turn_update,has_table_privilege('orqaly_worker','orqaly.solution_revisions','UPDATE') AS worker_revision_update"
    )
  ).rows[0];
  assert(
    !guards.api_turn_update && !guards.worker_revision_update,
    'no_broad_runtime_update_required'
  );
  if (applied) {
    const columns = (
      await db.query(
        "SELECT has_column_privilege('orqaly_api','orqaly.solution_conversation_turns','lifecycle','UPDATE') AS api_update,has_column_privilege('orqaly_api','orqaly.solution_conversation_turns','lifecycle','INSERT') AS api_insert,has_table_privilege('orqaly_worker','orqaly.solution_revision_forks','INSERT') AS worker_insert"
      )
    ).rows[0];
    assert(
      !columns.api_update && !columns.api_insert && !columns.worker_insert,
      'new_state_scope_must_remain_narrow'
    );
  }
}
export async function captureChangeCluster(db) {
  return {
    roles: (
      await db.query(
        'SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig FROM pg_roles ORDER BY rolname'
      )
    ).rows,
    memberships: (
      await db.query(
        'SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY role,member,grantor'
      )
    ).rows,
    databases: (
      await db.query(
        'SELECT datname,pg_get_userbyid(datdba) AS owner,datacl::text,datallowconn,datconnlimit FROM pg_database ORDER BY datname'
      )
    ).rows,
  };
}
export async function captureChangeCustomers(db, columns) {
  const scope = CHANGE_PREVIEW_SCOPE;
  await db.query('SET LOCAL ROLE orqaly_api');
  try {
    await db.query(
      "SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)",
      [scope.tenantId, scope.ownerUserId]
    );
    const result = {};
    const runs = new Set([
      '837fdcaf-3536-5901-b044-94faf03d7a7b',
      'c1cb54ec-00f5-5106-b7ff-16acf5640c07',
    ]);
    for (const table of [
      'customer_solutions',
      'solution_revisions',
      'solution_revision_events',
      'solution_invocations',
      'solution_conversation_turns',
      'solution_build_requests',
      'solution_build_attempts',
      'solution_build_events',
      'solution_build_tests',
      'solution_connections',
      'solution_schedules',
      'solution_schedule_ticks',
      'solution_coding_jobs',
      'solution_coding_dispatches',
      'solution_application_keys',
    ]) {
      const oldColumns = columns
        .filter((row) => row.schema === 'orqaly' && row.kind === 'column' && row.object === table)
        .filter((row) => table !== 'solution_conversation_turns' || row.part !== 'lifecycle')
        .map((row) => row.part);
      assert(oldColumns.length, 'protected_table_columns_required');
      const field = ['customer_solutions', 'solution_build_requests'].includes(table)
        ? 'id'
        : table.startsWith('solution_build_') || table === 'solution_connections'
          ? 'build_request_id'
          : 'solution_id';
      const selected = oldColumns.map((column) => `t.${quote(column)}`).join(',');
      const rows = (
        await db.query(
          `SELECT to_jsonb(p) AS value FROM (SELECT ${selected} FROM orqaly.${quote(table)} t WHERE tenant_id=$1 AND ${quote(field)}=ANY($2::uuid[]) AND owner_user_id=$3 ORDER BY id) p`,
          [scope.tenantId, scope.solutionIds, scope.ownerUserId]
        )
      ).rows;
      if (table === 'customer_solutions')
        assert.equal(rows.length, 3, 'three_existing_solutions_required');
      if (table === 'solution_build_requests')
        for (const row of rows) if (row.value.run_id) runs.add(row.value.run_id);
      result[table] = { count: rows.length, sha256: sha(rows) };
    }
    for (const table of ['workflow_runs', 'artifacts']) {
      const field = table === 'workflow_runs' ? 'id' : 'run_id';
      const rows = (
        await db.query(
          `SELECT to_jsonb(t) AS value FROM orqaly.${quote(table)} t WHERE tenant_id=$1 AND ${field}=ANY($2::uuid[]) ORDER BY id`,
          [scope.tenantId, [...runs]]
        )
      ).rows;
      result[table] = { count: rows.length, sha256: sha(rows) };
    }
    return result;
  } finally {
    await db.query('RESET ROLE');
  }
}
export async function applyChangeMigrations(
  db,
  {
    mode,
    sources,
    commit,
    preserveCustomers = captureChangeCustomers,
    preserveCluster = captureChangeCluster,
  }
) {
  parseChangeMigrationMode([mode]);
  assert.match(commit, /^[a-f0-9]{40}$/);
  const revalidated = validateChangeSources(
    sources.map((entry) => ({ ...entry, committedSource: entry.source })),
    commit
  );
  assert.deepEqual(sources, revalidated, 'validated_source_digest_and_sql_required');
  let transaction = false;
  try {
    await db.query(
      `BEGIN ISOLATION LEVEL REPEATABLE READ${mode === 'inspect' ? ' READ ONLY' : ''}`
    );
    transaction = true;
    await db.query(
      "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SET LOCAL idle_in_transaction_session_timeout='60s'"
    );
    if (mode === 'apply')
      await db.query("SELECT pg_advisory_xact_lock(hashtext('orqaly-preview-additive-migration'))");
    const identity = (
      await db.query(
        "SELECT current_database() AS database,current_user AS role,current_setting('server_version_num')::integer AS version"
      )
    ).rows[0];
    assert(
      identity.database === CHANGE_PREVIEW_SCOPE.database &&
        identity.role === 'postgres' &&
        Math.floor(identity.version / 10000) === 16,
      'exact_preview_database_pg16_role_required'
    );
    const ledgerQuery =
      'SELECT * FROM workflow_v2_release.applied_additive_migrations ORDER BY migration_number';
    const beforeLedger = (await db.query(ledgerQuery)).rows;
    const baseline = validateChangeLedger(beforeLedger, sources);
    const before = await captureMigrationCatalog(db);
    assertChangeCatalogState(before, baseline === 21);
    await assertChangePrivileges(db, sources, baseline === 21);
    const cluster = await preserveCluster(db);
    const customers = await preserveCustomers(db, before);
    if (mode === 'apply' && baseline === 19) {
      for (const number of [20, 21])
        await db.query(sources.find((source) => source.number === number).sql);
      await db.query(
        `ALTER TABLE workflow_v2_release.applied_additive_migrations DROP CONSTRAINT ${ledgerConstraint}; ALTER TABLE workflow_v2_release.applied_additive_migrations ADD CONSTRAINT ${ledgerConstraint} CHECK(migration_number BETWEEN 2 AND 21)`
      );
      for (const number of [20, 21]) {
        const source = sources.find((entry) => entry.number === number);
        await db.query(
          "INSERT INTO workflow_v2_release.applied_additive_migrations(component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit) VALUES('orqaly',$1,$2,$3,$4,$4)",
          [number, source.path, source.digest, commit]
        );
      }
    }
    const after = await captureMigrationCatalog(db);
    const afterLedger = (await db.query(ledgerQuery)).rows;
    const afterVersion = validateChangeLedger(afterLedger, sources);
    assert.deepEqual(await preserveCluster(db), cluster, 'cluster_role_or_database_acl_changed');
    assert.deepEqual(
      await preserveCustomers(db, before),
      customers,
      'protected_customer_or_workflow_data_changed'
    );
    await assertChangePrivileges(db, sources, afterVersion === 21);
    if (mode === 'apply' && baseline === 19) {
      assert.equal(afterVersion, 21);
      assertChangeCatalogDelta(before, after);
      assert.deepEqual(
        afterLedger.filter((row) => row.migration_number < 20),
        beforeLedger,
        'historical_ledger_changed'
      );
    } else {
      assert.deepEqual(after, before);
      assert.deepEqual(afterLedger, beforeLedger);
    }
    await db.query(mode === 'apply' && baseline === 19 ? 'COMMIT' : 'ROLLBACK');
    transaction = false;
    return {
      verified: true,
      schemaVersion: 'orqaly.solution-change-migration.v1',
      recordedAt: new Date().toISOString(),
      project: CHANGE_PREVIEW_SCOPE.project,
      instance: CHANGE_PREVIEW_SCOPE.instance,
      mode,
      status:
        baseline === 21
          ? 'already_applied_no_writes'
          : mode === 'apply'
            ? 'applied_verified'
            : 'ready_not_applied',
      database: identity.database,
      postgresVersion: identity.version,
      sourceCommit: commit,
      ledgerBefore: baseline,
      ledgerAfter: afterVersion,
      migrationHashes: CHANGE_MIGRATION_HASHES,
      catalogBeforeHash: sha(before),
      catalogAfterHash: sha(after),
      clusterHash: sha(cluster),
      preserved: customers,
      protectedDataPreserved: true,
      runtimeRoleReadiness: { verified: false, reason: 'separate_actual_login_audit_required' },
      runtimeChanges: false,
      customerRowChanges: false,
      secretsLogged: false,
    };
  } catch (error) {
    if (transaction) await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
async function main() {
  let stage = 'committed_source_validation',
    db,
    proxy;
  try {
    const mode = parseChangeMigrationMode(process.argv.slice(2));
    const commit = capture('git', ['rev-parse', 'HEAD']).trim();
    const sources = validateChangeSources(
      readdirSync(resolve(root, migrationDir))
        .filter(
          (file) =>
            /^\d{3}_.*\.sql$/.test(file) &&
            Number(file.slice(0, 3)) >= 2 &&
            Number(file.slice(0, 3)) <= 21
        )
        .sort()
        .map((file) => ({
          number: Number(file.slice(0, 3)),
          path: `${migrationDir}/${file}`,
          source: readFileSync(resolve(root, migrationDir, file), 'utf8'),
          committedSource: capture('git', ['show', `${commit}:${migrationDir}/${file}`]),
        })),
      commit
    );
    stage = 'owned_loopback_proxy';
    const probe = createServer();
    await new Promise((done, reject) => {
      probe.once('error', reject);
      probe.listen({ host: '127.0.0.1', port: CHANGE_PREVIEW_SCOPE.port, exclusive: true }, done);
    });
    await new Promise((done) => probe.close(done));
    stage = 'existing_orqaly_admin_secret';
    const password = capture('gcloud', [
      'secrets',
      'versions',
      'access',
      '1',
      '--secret=orqaly-v2-preview-001-db-admin-password',
      `--project=${CHANGE_PREVIEW_SCOPE.project}`,
    ]).trim();
    assert(password && !password.includes('\n'), 'admin_secret_shape_invalid');
    let proxyFailed = false;
    proxy = spawn(
      'cloud-sql-proxy',
      [
        CHANGE_PREVIEW_SCOPE.instance,
        '--gcloud-auth',
        '--address=127.0.0.1',
        `--port=${CHANGE_PREVIEW_SCOPE.port}`,
      ],
      { stdio: 'ignore' }
    );
    proxy.once('error', () => {
      proxyFailed = true;
    });
    stage = 'exact_preview_connection';
    for (let attempt = 0; attempt < 60; attempt++) {
      assert(!proxyFailed && proxy.exitCode === null, 'owned_proxy_failed');
      const candidate = new pg.Client({
        host: '127.0.0.1',
        port: CHANGE_PREVIEW_SCOPE.port,
        user: 'postgres',
        password,
        database: CHANGE_PREVIEW_SCOPE.database,
        application_name: 'orqaly-reviewed-additive020021',
        connectionTimeoutMillis: 1000,
      });
      try {
        await candidate.connect();
        db = candidate;
        break;
      } catch {
        await candidate.end().catch(() => {});
        await delay(500);
      }
    }
    assert(db && !proxyFailed && proxy.exitCode === null, 'owned_preview_connection_failed');
    stage = 'reviewed_migration_transaction';
    console.log(JSON.stringify(await applyChangeMigrations(db, { mode, sources, commit })));
  } catch (error) {
    console.error(
      JSON.stringify({
        verified: false,
        stage,
        code: /^[A-Z0-9_]{3,40}$/.test(error.code || '') ? error.code : 'OPERATOR_CHECK_FAILED',
        secretsLogged: false,
      })
    );
    process.exitCode = 1;
  } finally {
    await db?.end().catch(() => {});
    if (proxy && proxy.exitCode === null) proxy.kill('SIGTERM');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
