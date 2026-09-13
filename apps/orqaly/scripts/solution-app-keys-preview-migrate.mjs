// Exact additive migration014 operator for the existing Orqaly GCP preview.
// Usage: node scripts/solution-app-keys-preview-migrate.mjs inspect|apply
// apply requires separate operator approval. No runtime, IAM, n8n, provider or
// customer-row mutation is performed. Passwords remain in memory, never output.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = 'axwise-v2-preview-001';
const instance = `${project}:europe-west4:orqaly-v2-preview-001-pg`;
const database = 'orqaly_v2_preview_001';
const databaseNames = [
  database,
  'orqaly_solution_n8n_preview_001',
  'orqaly_solution_n8n_preview_002',
];
const port = 19487;
const tenantId = 'c1b26d36-721b-5d8c-8d4c-180050ee9b94';
const ownerUserId = 'user_2vHlB9JhH4FazWsgKYENFIeAnMu';
const solutionIds = [
  '2031decc-b21e-48b5-9bd5-3ed3d4dfd024',
  '8b606adc-91ba-46e5-86da-ece609df9c7d',
];
const sourceRunIds = [
  '837fdcaf-3536-5901-b044-94faf03d7a7b',
  'c1cb54ec-00f5-5106-b7ff-16acf5640c07',
];
const migrationPath = 'database/workflow-v2/migrations/014_solution_application_keys.sql';
const baselinePath = 'database/workflow-v2/migrations/013_solution_build_requests.sql';
export const migration014Hash = '0d1dfa9cdc32deb889c86f3ab5481adf7ba58c9c99eb451820f828c77115bc6a';
const migration013Hash = 'dd5cbf3e54937670cdcd835176a06cdea2577639cf324a72cc640e6a39be8d44';
const newTables = ['solution_application_keys', 'solution_application_usage'];
const newFunction = 'guard_solution_application_key_update';
const ledgerConstraint = 'applied_additive_migrations_migration_number_check';
const additions = [
  ['constraint', 'customer_solutions', 'customer_solutions_owner_identity'],
  ['index', 'customer_solutions', 'customer_solutions_owner_identity'],
  ['column', 'solution_invocations', 'application_key_id'],
  ['column', 'solution_invocations', 'application_key_label'],
  ['constraint', 'solution_invocations', 'solution_invocations_application_key_label_check'],
  ['constraint', 'solution_invocations', 'solution_invocations_application_key'],
  ['constraint', 'solution_invocations', 'solution_invocations_application_actor'],
  ['index', 'solution_invocations', 'solution_invocations_application_key_idx'],
  ['index', 'solution_invocations', 'solution_invocations_running_idx'],
];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  return value;
}
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(canonical(value)))
    .digest('hex');
const ordered = (rows) =>
  [...rows].sort((a, b) =>
    JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b)), 'en')
  );
export function parseMigrationMode(args) {
  assert(
    args.length === 1 && ['inspect', 'apply'].includes(args[0]),
    'explicit_inspect_or_apply_required'
  );
  return args[0];
}
export function validateMigrationSources({
  source,
  committedSource,
  baseline,
  committedBaseline,
  commit,
}) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(hash(source), migration014Hash, 'migration014_reviewed_hash_required');
  assert.equal(hash(committedSource), migration014Hash, 'migration014_must_be_committed');
  assert.equal(hash(baseline), migration013Hash, 'migration013_baseline_changed');
  assert.equal(hash(committedBaseline), migration013Hash, 'migration013_must_be_committed');
  assert(
    /^BEGIN;\s[\s\S]*\sCOMMIT;\s*$/.test(source),
    'exact_migration_transaction_wrapper_required'
  );
  return source.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
}
export function validateMigrationLedger(rows) {
  assert(
    rows.every((row) => row.component === 'orqaly'),
    'foreign_migration_component'
  );
  const numbers = rows.map((row) => row.migration_number);
  assert.deepEqual(
    numbers,
    Array.from({ length: numbers.length }, (_, index) => index + 2),
    'contiguous_migration_ledger_required'
  );
  assert([13, 14].includes(numbers.at(-1)), 'exact_013_or_014_ledger_required');
  assert.equal(
    rows.find((row) => row.migration_number === 13)?.sha256,
    migration013Hash,
    'migration013_ledger_hash_mismatch'
  );
  const applied = rows.find((row) => row.migration_number === 14);
  if (applied) {
    assert.equal(applied.sha256, migration014Hash, 'migration014_ledger_hash_mismatch');
    assert.equal(applied.migration_path, migrationPath, 'migration014_ledger_path_mismatch');
  }
  return Boolean(applied);
}

// Full definitions, RLS, owner and ACL metadata, excluding volatile OIDs/stats.
// Values are compared in memory. Only aggregate hashes are printed.
export async function captureMigrationCatalog(db) {
  const rows = [];
  const add = async (kind, query) => {
    const result = await db.query(query);
    rows.push(...result.rows.map((row) => ({ kind, ...row })));
  };
  const schemas = "n.nspname IN ('orqaly','workflow_v2_release')";
  const acl = (value) =>
    `(SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb) FROM aclexplode(NULLIF(${value},'{}'::aclitem[])) a)`;
  await add(
    'schema',
    `SELECT n.nspname AS schema,n.nspname AS object,'' AS part,jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',${acl("coalesce(n.nspacl,acldefault('n',n.nspowner))")}) AS data FROM pg_namespace n WHERE ${schemas}`
  );
  await add(
    'table',
    `SELECT n.nspname AS schema,c.relname AS object,'' AS part,jsonb_build_object('kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'persistence',c.relpersistence,'options',c.reloptions,'acl',${acl("coalesce(c.relacl,acldefault('r',c.relowner))")}) AS data FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas} AND c.relkind IN ('r','p','v','m','S')`
  );
  await add(
    'column',
    `SELECT n.nspname AS schema,c.relname AS object,a.attname AS part,jsonb_build_object('position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',${acl("coalesce(a.attacl,'{}'::aclitem[])")}) AS data FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE ${schemas} AND c.relkind IN ('r','p','v','m','S') AND a.attnum>0 AND NOT a.attisdropped`
  );
  await add(
    'constraint',
    `SELECT n.nspname AS schema,c.relname AS object,k.conname AS part,jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) AS data FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas}`
  );
  await add(
    'index',
    `SELECT n.nspname AS schema,c.relname AS object,idx.relname AS part,jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'owner',pg_get_userbyid(idx.relowner)) AS data FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas}`
  );
  await add(
    'trigger',
    `SELECT n.nspname AS schema,c.relname AS object,t.tgname AS part,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) AS data FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas} AND NOT t.tgisinternal`
  );
  await add(
    'policy',
    `SELECT schemaname AS schema,tablename AS object,policyname AS part,jsonb_build_object('permissive',permissive,'roles',roles,'cmd',cmd,'using',qual,'check',with_check) AS data FROM pg_policies WHERE schemaname IN ('orqaly','workflow_v2_release')`
  );
  await add(
    'function',
    `SELECT n.nspname AS schema,p.proname AS object,pg_get_function_identity_arguments(p.oid) AS part,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',${acl("coalesce(p.proacl,acldefault('f',p.proowner))")}) AS data FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${schemas} AND p.prokind IN ('f','p')`
  );
  return ordered(rows);
}
function isAddition(row) {
  return (
    row.schema === 'orqaly' &&
    (newTables.includes(row.object) ||
      row.object === newFunction ||
      additions.some(
        ([kind, object, part]) => row.kind === kind && row.object === object && row.part === part
      ))
  );
}
function retainedCatalog(rows) {
  return ordered(
    rows
      .filter(
        (row) =>
          !isAddition(row) &&
          !(
            row.kind === 'constraint' &&
            row.schema === 'workflow_v2_release' &&
            row.object === 'applied_additive_migrations' &&
            row.part === ledgerConstraint
          )
      )
      .map((row) => {
        if (
          row.kind === 'column' &&
          row.schema === 'orqaly' &&
          row.object === 'tenants' &&
          ['id', 'status'].includes(row.part)
        )
          return {
            ...row,
            data: {
              ...row.data,
              acl: row.data.acl.filter(
                (entry) =>
                  !(
                    entry.grantee === 'orqaly_api' &&
                    entry.privilege === 'SELECT' &&
                    entry.grantor === 'postgres' &&
                    entry.grantable === false
                  )
              ),
            },
          };
        return row;
      })
  );
}
export function assertMigrationCatalogState(rows, applied) {
  const matches = (kind, object, part = '') =>
    rows.filter(
      (row) =>
        row.schema === 'orqaly' && row.kind === kind && row.object === object && row.part === part
    );
  if (!applied) {
    assert.equal(rows.filter(isAddition).length, 0, 'unexpected_partial_migration014_catalog');
  } else {
    for (const [kind, object, part] of additions)
      assert.equal(matches(kind, object, part).length, 1, 'migration014_catalog_addition_missing');
    for (const table of newTables) {
      const value = matches('table', table)[0]?.data;
      assert(
        value?.rls === true && value.forceRls === true && value.owner === 'postgres',
        'new_table_owner_forced_rls_required'
      );
      assert.deepEqual(
        ordered(value.acl.filter((entry) => entry.grantee !== 'postgres')),
        ordered(
          ['INSERT', 'SELECT'].map((privilege) => ({
            grantor: 'postgres',
            grantee: 'orqaly_api',
            privilege,
            grantable: false,
          }))
        ),
        'new_table_grants_not_exact'
      );
      const expectedColumns =
        table === newTables[0]
          ? ['last_used_at', 'revoked_at', 'row_version']
          : ['day_count', 'day_start', 'minute_count', 'minute_start'];
      const columnGrants = rows
        .filter((row) => row.schema === 'orqaly' && row.kind === 'column' && row.object === table)
        .flatMap((row) => row.data.acl.map((grant) => ({ column: row.part, ...grant })));
      assert.deepEqual(
        ordered(columnGrants),
        ordered(
          expectedColumns.map((column) => ({
            column,
            grantor: 'postgres',
            grantee: 'orqaly_api',
            privilege: 'UPDATE',
            grantable: false,
          }))
        ),
        'new_column_grants_not_exact'
      );
      const policies = rows.filter(
        (row) => row.schema === 'orqaly' && row.kind === 'policy' && row.object === table
      );
      assert.equal(policies.length, 1, 'new_table_policy_not_exact');
      assert.deepEqual(policies[0].data.roles, ['orqaly_api']);
      assert.equal(policies[0].data.using, '(tenant_id = orqaly.current_tenant_id())');
      assert.equal(policies[0].data.check, policies[0].data.using);
    }
    const guard = matches('function', newFunction)[0]?.data;
    assert(
      guard && guard.owner === 'postgres' && guard.securityDefiner === false,
      'key_guard_owner_required'
    );
    assert.deepEqual(guard.config, ['search_path=pg_catalog, orqaly']);
    assert(
      guard.acl.every((entry) => entry.grantee === 'postgres'),
      'key_guard_public_execute_forbidden'
    );
    assert.equal(
      matches('trigger', newTables[0], 'solution_application_key_update_guard').length,
      1
    );
    for (const column of ['id', 'status']) {
      const acl = matches('column', 'tenants', column)[0]?.data.acl;
      assert(
        acl?.some(
          (entry) =>
            entry.grantee === 'orqaly_api' && entry.privilege === 'SELECT' && !entry.grantable
        ),
        'tenant_status_narrow_select_missing'
      );
    }
  }
  const ledger = rows.find(
    (row) =>
      row.kind === 'constraint' &&
      row.schema === 'workflow_v2_release' &&
      row.object === 'applied_additive_migrations' &&
      row.part === ledgerConstraint
  );
  assert.equal(
    ledger?.data.definition,
    `CHECK (((migration_number >= 2) AND (migration_number <= ${applied ? 14 : 13})))`,
    'ledger_bound_not_exact'
  );
}
export function assertMigrationCatalogDelta(before, after) {
  assertMigrationCatalogState(before, false);
  assertMigrationCatalogState(after, true);
  assert.deepEqual(
    retainedCatalog(after),
    retainedCatalog(before),
    'preexisting_catalog_or_privileges_changed'
  );
}
export async function captureClusterPreservation(db) {
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
        'SELECT datname,pg_get_userbyid(datdba) AS owner,datacl::text,datallowconn,datconnlimit FROM pg_database WHERE datname=ANY($1::text[]) ORDER BY datname',
        [databaseNames]
      )
    ).rows,
  };
}
export async function captureCustomerPreservation(db) {
  await db.query('SET LOCAL ROLE orqaly_api');
  try {
    await db.query(
      "SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)",
      [tenantId, ownerUserId]
    );
    const result = {};
    for (const table of [
      'customer_solutions',
      'solution_revisions',
      'solution_revision_events',
      'solution_invocations',
      'solution_build_requests',
      'solution_build_attempts',
      'solution_build_events',
    ]) {
      const idColumn = ['customer_solutions', 'solution_build_requests'].includes(table)
        ? 'id'
        : table.startsWith('solution_build_')
          ? 'build_request_id'
          : 'solution_id';
      const projection =
        table === 'solution_invocations'
          ? "to_jsonb(t)-ARRAY['application_key_id','application_key_label']"
          : 'to_jsonb(t)';
      const rows = (
        await db.query(
          `SELECT ${projection} AS value FROM orqaly.${table} t WHERE tenant_id=$1 AND ${idColumn}=ANY($2::uuid[]) ORDER BY id`,
          [tenantId, solutionIds]
        )
      ).rows;
      result[table] = { count: rows.length, sha256: hash(rows) };
      if (table === 'customer_solutions') {
        assert.equal(rows.length, 2, 'both_existing_solutions_required');
        assert(
          rows.every((row) => row.value.owner_user_id === ownerUserId),
          'solution_owner_scope_mismatch'
        );
      }
      if (table === 'solution_invocations') {
        assert.equal(
          rows.filter((row) => row.value.solution_id === solutionIds[0]).length,
          6,
          'original_six_receipts_required'
        );
        assert(
          rows.filter((row) => row.value.solution_id === solutionIds[1]).length >= 2,
          'fresh_acceptance_receipts_required'
        );
      }
    }
    const source = (
      await db.query(
        'SELECT to_jsonb(r) AS value FROM orqaly.workflow_runs r WHERE tenant_id=$1 AND owner_user_id=$2 AND id=ANY($3::uuid[]) ORDER BY id',
        [tenantId, ownerUserId, sourceRunIds]
      )
    ).rows;
    assert.equal(source.length, 2, 'both_existing_source_runs_required');
    result.sourceRuns = { count: source.length, sha256: hash(source) };
    const artifacts = (
      await db.query(
        'SELECT to_jsonb(a) AS value FROM orqaly.artifacts a WHERE tenant_id=$1 AND run_id=ANY($2::uuid[]) ORDER BY id',
        [tenantId, sourceRunIds]
      )
    ).rows;
    assert(artifacts.length > 0, 'original_source_artifacts_required');
    result.sourceArtifacts = { count: artifacts.length, sha256: hash(artifacts) };
    return result;
  } finally {
    await db.query('RESET ROLE');
  }
}

export async function applyReviewedMigration(
  db,
  {
    mode,
    source,
    commit,
    preserveCustomer = captureCustomerPreservation,
    preserveCluster = captureClusterPreservation,
  }
) {
  assert(['inspect', 'apply'].includes(mode));
  let inTransaction = false;
  try {
    await db.query(
      `BEGIN ISOLATION LEVEL REPEATABLE READ${mode === 'inspect' ? ' READ ONLY' : ''}`
    );
    inTransaction = true;
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
    assert.equal(identity.role, 'postgres', 'exact_existing_migration_role_required');
    assert.equal(Math.floor(identity.version / 10000), 16, 'preview_postgres16_required');
    const ledgerQuery =
      'SELECT * FROM workflow_v2_release.applied_additive_migrations ORDER BY migration_number';
    const beforeLedger = (await db.query(ledgerQuery)).rows;
    const alreadyApplied = validateMigrationLedger(beforeLedger);
    const beforeCatalog = await captureMigrationCatalog(db);
    assertMigrationCatalogState(beforeCatalog, alreadyApplied);
    const beforeCluster = await preserveCluster(db);
    const beforeCustomer = await preserveCustomer(db);
    if (mode === 'apply' && !alreadyApplied) {
      await db.query(source);
      await db.query(
        `ALTER TABLE workflow_v2_release.applied_additive_migrations DROP CONSTRAINT ${ledgerConstraint}; ALTER TABLE workflow_v2_release.applied_additive_migrations ADD CONSTRAINT ${ledgerConstraint} CHECK(migration_number BETWEEN 2 AND 14)`
      );
      await db.query(
        `INSERT INTO workflow_v2_release.applied_additive_migrations(component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit) VALUES('orqaly',14,$1,$2,$3,$3)`,
        [migrationPath, migration014Hash, commit]
      );
    }
    const afterCatalog = await captureMigrationCatalog(db);
    const afterLedger = (await db.query(ledgerQuery)).rows;
    const afterCluster = await preserveCluster(db);
    const afterCustomer = await preserveCustomer(db);
    assert.deepEqual(
      afterCluster,
      beforeCluster,
      'existing_roles_memberships_or_database_acl_changed'
    );
    assert.deepEqual(afterCustomer, beforeCustomer, 'existing_customer_data_changed');
    if (mode === 'apply' && !alreadyApplied) {
      assertMigrationCatalogDelta(beforeCatalog, afterCatalog);
      assert.equal(validateMigrationLedger(afterLedger), true);
      assert.deepEqual(
        afterLedger.filter((row) => row.migration_number !== 14),
        beforeLedger,
        'old_migration_ledger_changed'
      );
    } else {
      assert.deepEqual(afterCatalog, beforeCatalog);
      assert.deepEqual(afterLedger, beforeLedger);
    }
    await db.query(mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
    inTransaction = false;
    return {
      verified: true,
      mode,
      status: alreadyApplied
        ? 'already_applied_verified_no_writes'
        : mode === 'apply'
          ? 'applied_verified'
          : 'ready_not_applied',
      database: identity.database,
      postgresVersion: identity.version,
      sourceCommit: commit,
      migration014Sha256: migration014Hash,
      ledgerBefore: beforeLedger.at(-1).migration_number,
      ledgerAfter: afterLedger.at(-1).migration_number,
      catalogBeforeHash: hash(beforeCatalog),
      catalogAfterHash: hash(afterCatalog),
      clusterPreservationHash: hash(beforeCluster),
      customerPreservation: beforeCustomer,
      runtimeCloudChanges: false,
      customerRowChanges: false,
      secretsLogged: false,
    };
  } catch (error) {
    if (inTransaction) await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  let stage = 'arguments_and_committed_sources';
  let db;
  let proxy;
  try {
    const mode = parseMigrationMode(process.argv.slice(2));
    const git = (args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const commit = git(['rev-parse', 'HEAD']).trim();
    const source = validateMigrationSources({
      source: readFileSync(resolve(root, migrationPath), 'utf8'),
      committedSource: git(['show', `HEAD:${migrationPath}`]),
      baseline: readFileSync(resolve(root, baselinePath), 'utf8'),
      committedBaseline: git(['show', `HEAD:${baselinePath}`]),
      commit,
    });
    stage = 'owned_proxy_port';
    const probe = createServer();
    await new Promise((resolveReady, reject) => {
      probe.once('error', reject);
      probe.listen({ host: '127.0.0.1', port, exclusive: true }, resolveReady);
    });
    await new Promise((resolveClosed) => probe.close(resolveClosed));
    stage = 'existing_preview_admin_secret';
    const password = execFileSync(
      'gcloud',
      [
        'secrets',
        'versions',
        'access',
        '1',
        '--secret=orqaly-v2-preview-001-db-admin-password',
        `--project=${project}`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    assert(password.length > 0 && !password.includes('\n'), 'invalid_admin_secret_shape');
    stage = 'owned_proxy_connection';
    let proxyFailed = false;
    proxy = spawn(
      'cloud-sql-proxy',
      [instance, '--gcloud-auth', '--address=127.0.0.1', `--port=${port}`],
      { stdio: 'ignore' }
    );
    proxy.once('error', () => {
      proxyFailed = true;
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      assert(!proxyFailed && proxy.exitCode === null, 'owned_proxy_failed');
      const candidate = new pg.Client({
        host: '127.0.0.1',
        port,
        user: 'postgres',
        password,
        database,
        application_name: 'orqaly-reviewed-additive014',
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
    assert(db && !proxyFailed && proxy.exitCode === null, 'owned_proxy_connection_failed');
    const identity = (await db.query('SELECT current_database() AS name,current_user AS role'))
      .rows[0];
    assert.equal(identity.name, database, 'exact_preview_database_required');
    assert.equal(identity.role, 'postgres');
    stage = 'reviewed_migration_transaction';
    const result = await applyReviewedMigration(db, { mode, source, commit });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Never emit pg/gcloud error messages, SQL text, params or child-process stderr.
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
    if (db) await db.end().catch(() => {});
    if (proxy && proxy.exitCode === null) proxy.kill('SIGTERM');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
