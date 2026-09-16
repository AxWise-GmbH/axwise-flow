// Fixed preview additive022+023 only. Cloud inspect/apply each require authority.
// No runtime, n8n, AxWise, role, database-ACL, IAM or customer-row mutations.
// Usage: inspect|apply --source-commit=<40hex> --migration022-sha256=<64hex>
//                     --migration023-sha256=<64hex>
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { captureMigrationCatalog } from './solution-app-keys-preview-migrate.mjs';
import {
  CHANGE_PREVIEW_SCOPE,
  captureChangeCluster,
  captureChangeCustomers,
} from './solution-change-preview-migrate.mjs';

const root = resolve(import.meta.dirname, '..');
export const CONTROLS_PREVIEW_SCOPE = Object.freeze({ ...CHANGE_PREVIEW_SCOPE, port: 19522 });
const migrationDir = 'database/workflow-v2/migrations';
const ledgerConstraint = 'applied_additive_migrations_migration_number_check';
const tables = [
  'solution_revision_connection_members',
  'solution_revision_connections',
  'solution_revision_connection_operations',
  'solution_failure_probes',
];
const functions = [
  'guard_revision_connection_binding',
  'guard_revision_connection_operation',
  'guard_revision_connection_pending',
  'guard_solution_failure_probe',
];
const updates = {
  solution_revision_connection_members: [],
  solution_revision_connections: [
    'status',
    'provider_credential_id',
    'row_version',
    'updated_at',
    'revoked_at',
  ],
  solution_revision_connection_operations: ['status', 'attempts', 'updated_at'],
  solution_failure_probes: [
    'status',
    'evidence',
    'error_code',
    'completed_at',
    'cleanup_state',
    'cleanup_evidence',
  ],
};
const triggers = [
  [
    'solution_revision_connections',
    'revision_connection_binding_guard',
    functions[0],
    'INSERT OR UPDATE',
  ],
  [
    'solution_revision_connection_operations',
    'revision_connection_operation_guard',
    functions[1],
    'INSERT OR UPDATE',
  ],
  ['solution_revisions', 'revision_connection_pending_guard', functions[2], 'UPDATE'],
  ['solution_failure_probes', 'solution_failure_probe_guard', functions[3], 'INSERT OR UPDATE'],
];
const sha = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const ordered = (rows) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
const capture = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export function validateControlsManifest(manifest) {
  assert.deepEqual(Object.keys(manifest).sort(), ['commit', 'hashes']);
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(manifest.hashes).sort(), ['22', '23']);
  for (const digest of Object.values(manifest.hashes)) assert.match(digest, /^[a-f0-9]{64}$/);
  return manifest;
}
export function parseControlsArguments(args) {
  assert.equal(args.length, 4, 'explicit_mode_commit_and_two_reviewed_hashes_required');
  assert(['inspect', 'apply'].includes(args[0]), 'explicit_inspect_or_apply_required');
  const matches = args
    .slice(1)
    .map((arg) =>
      arg.match(/^--(source-commit|migration022-sha256|migration023-sha256)=([a-f0-9]+)$/)
    );
  assert(matches.every(Boolean), 'exact_named_manifest_arguments_required');
  const values = Object.fromEntries(matches.map((match) => [match[1], match[2]]));
  assert.equal(Object.keys(values).length, 3, 'duplicate_manifest_argument');
  return {
    mode: args[0],
    manifest: validateControlsManifest({
      commit: values['source-commit'],
      hashes: { 22: values['migration022-sha256'], 23: values['migration023-sha256'] },
    }),
  };
}
export function validateControlsSources(records, manifest) {
  validateControlsManifest(manifest);
  assert.deepEqual(
    records.map((record) => record.number),
    Array.from({ length: 22 }, (_, i) => i + 2),
    'all_committed_sources002_through023_required'
  );
  return records.map((record) => {
    assert.match(record.path, /^database\/workflow-v2\/migrations\/\d{3}_[a-z0-9_]+\.sql$/);
    assert.equal(Number(record.path.split('/').at(-1).slice(0, 3)), record.number);
    assert.equal(record.source, record.committedSource, 'committed_migration_bytes_required');
    const digest = sha(record.source);
    if (record.number >= 22) {
      assert.equal(
        digest,
        manifest.hashes[record.number],
        'reviewed_target_migration_hash_required'
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
export function validateControlsLedger(rows, sources) {
  assert(
    rows.every((row) => row.component === 'orqaly'),
    'foreign_ledger_component'
  );
  assert.deepEqual(
    rows.map((row) => row.migration_number),
    Array.from({ length: rows.length }, (_, i) => i + 2),
    'contiguous_historical_ledger_required'
  );
  const last = rows.at(-1)?.migration_number;
  assert([21, 23].includes(last), 'exact021_or023_baseline_required');
  for (const row of rows) {
    const source = sources.find((value) => value.number === row.migration_number);
    assert(
      source && source.path === row.migration_path && source.digest === row.sha256,
      'historical_source_ledger_mismatch'
    );
  }
  return last;
}
function isAddition(row) {
  return (
    row.schema === 'orqaly' &&
    (tables.includes(row.object) ||
      functions.includes(row.object) ||
      (row.kind === 'trigger' &&
        row.object === 'solution_revisions' &&
        row.part === 'revision_connection_pending_guard'))
  );
}
function retained(rows) {
  return rows.filter(
    (row) =>
      !isAddition(row) &&
      !(
        row.schema === 'workflow_v2_release' &&
        row.kind === 'constraint' &&
        row.object === 'applied_additive_migrations' &&
        row.part === ledgerConstraint
      )
  );
}
const grant = (grantee, privilege) => ({
  grantor: 'postgres',
  grantee,
  privilege,
  grantable: false,
});
export function assertControlsCatalogState(rows, applied) {
  const matching = (kind, object, part) =>
    rows.filter(
      (row) =>
        row.schema === 'orqaly' &&
        row.kind === kind &&
        row.object === object &&
        (part === undefined || row.part === part)
    );
  if (!applied)
    assert.equal(rows.filter(isAddition).length, 0, 'partial_controls_migration_catalog');
  else {
    for (const table of tables) {
      const entries = matching('table', table);
      assert.equal(entries.length, 1);
      const data = entries[0].data;
      assert(
        data.owner === 'postgres' && data.kind === 'r' && data.rls && data.forceRls,
        'forced_owner_rls_required'
      );
      const worker = table !== 'solution_failure_probes';
      const expected = [
        grant('orqaly_api', 'SELECT'),
        grant('orqaly_api', 'INSERT'),
        ...(worker ? [grant('orqaly_worker', 'SELECT')] : []),
      ];
      assert.deepEqual(
        ordered(data.acl.filter((value) => value.grantee !== 'postgres')),
        ordered(expected),
        'new_table_grants_not_exact'
      );
      const policy = matching('policy', table);
      assert.equal(policy.length, 1, 'single_scoped_policy_required');
      assert.deepEqual(
        policy[0].data.roles,
        worker ? ['orqaly_api', 'orqaly_worker'] : ['orqaly_api']
      );
      assert.equal(policy[0].data.cmd, 'ALL');
      assert.equal(policy[0].data.permissive, 'PERMISSIVE');
      assert.equal(policy[0].data.using, policy[0].data.check);
      const expression = policy[0].data.using;
      assert(
        expression.includes('tenant_id') &&
          expression.includes('orqaly.current_tenant_id()') &&
          expression.includes(
            "owner_user_id = current_setting('orqaly.build_owner_user_id'::text, true)"
          ) &&
          !/\bOR\b/.test(expression),
        'tenant_owner_policy_required'
      );
      const columns = matching('column', table);
      for (const column of columns)
        assert.deepEqual(
          ordered(column.data.acl),
          updates[table].includes(column.part) ? [grant('orqaly_api', 'UPDATE')] : [],
          'new_column_grants_not_exact'
        );
      assert(
        updates[table].every((name) => columns.some((column) => column.part === name)),
        'update_column_missing'
      );
    }
    for (const name of functions) {
      const rows = matching('function', name);
      assert.equal(rows.length, 1, 'exact_trigger_function_required');
      assert.equal(rows[0].part, '');
      const data = rows[0].data;
      assert(
        data.owner === 'postgres' && data.securityDefiner === false,
        'non_escalating_trigger_required'
      );
      assert.deepEqual(data.config, ['search_path=pg_catalog']);
      assert.deepEqual(
        data.acl.filter((value) => value.grantee !== 'postgres'),
        [],
        'trigger_function_public_execution_denied'
      );
    }
    for (const [table, name, fn, events] of triggers) {
      const found = matching('trigger', table, name);
      assert.equal(found.length, 1);
      assert.equal(found[0].data.enabled, 'O');
      assert.equal(
        found[0].data.definition,
        `CREATE TRIGGER ${name} BEFORE ${events} ON orqaly.${table} FOR EACH ROW EXECUTE FUNCTION orqaly.${fn}()`
      );
    }
  }
  const ledger = rows.find(
    (row) =>
      row.schema === 'workflow_v2_release' &&
      row.kind === 'constraint' &&
      row.part === ledgerConstraint
  );
  assert.equal(
    ledger?.data.definition,
    `CHECK (((migration_number >= 2) AND (migration_number <= ${applied ? 23 : 21})))`,
    'ledger_bound_mismatch'
  );
}
export function assertControlsCatalogDelta(before, after) {
  assertControlsCatalogState(before, false);
  assertControlsCatalogState(after, true);
  assert.deepEqual(retained(after), retained(before), 'unreviewed_catalog_or_privilege_change');
}
export async function assertControlsPrivileges(db, sources, applied) {
  if (!applied) return;
  for (const name of functions) {
    const source = sources.find(
      (entry) => entry.number === (name === functions[3] ? 23 : 22)
    ).source;
    const start = source.indexOf(`FUNCTION orqaly.${name}(`),
      body = source.indexOf('AS $$', start),
      end = source.indexOf('$$;', body + 5);
    assert(start >= 0 && body > start && end > body, 'reviewed_function_body_required');
    const actual = (
      await db.query('SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure($1)', [
        `orqaly.${name}()`,
      ])
    ).rows[0];
    assert.equal(actual?.prosrc, source.slice(body + 5, end), 'reviewed_function_body_changed');
  }
  for (const table of tables) {
    const value = (
      await db.query(
        "SELECT has_table_privilege('orqaly_api',$1,'DELETE') AS api_delete,has_table_privilege('orqaly_api',$1,'UPDATE') AS api_update,has_table_privilege('orqaly_worker',$1,'INSERT') AS worker_insert,has_table_privilege('orqaly_worker',$1,'UPDATE') AS worker_update,has_table_privilege('orqaly_worker',$1,'DELETE') AS worker_delete",
        [`orqaly.${table}`]
      )
    ).rows[0];
    assert(
      Object.values(value).every((allowed) => allowed === false),
      'broad_mutation_privilege_denied'
    );
  }
}
export async function captureControlsCustomers(db, columns) {
  const original = await captureChangeCustomers(db, columns);
  await db.query('SET LOCAL ROLE orqaly_api');
  try {
    await db.query(
      "SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)",
      [CONTROLS_PREVIEW_SCOPE.tenantId, CONTROLS_PREVIEW_SCOPE.ownerUserId]
    );
    for (const table of ['solution_conversation_turns', 'solution_revision_forks']) {
      // Includes existing020 lifecycle state that the older helper intentionally omitted.
      const rows = (
        await db.query(
          `SELECT to_jsonb(t) AS value FROM orqaly.${table} t WHERE tenant_id=$1 AND solution_id=ANY($2::uuid[]) AND owner_user_id=$3 ORDER BY to_jsonb(t)::text`,
          [
            CONTROLS_PREVIEW_SCOPE.tenantId,
            CONTROLS_PREVIEW_SCOPE.solutionIds,
            CONTROLS_PREVIEW_SCOPE.ownerUserId,
          ]
        )
      ).rows;
      original[`${table}_complete`] = { count: rows.length, sha256: sha(rows) };
    }
  } finally {
    await db.query('RESET ROLE');
  }
  return original;
}
export async function applyControlsMigrations(
  db,
  {
    mode,
    manifest,
    sources,
    preserveCustomers = captureControlsCustomers,
    preserveCluster = captureChangeCluster,
  }
) {
  assert(['inspect', 'apply'].includes(mode));
  assert.deepEqual(
    sources,
    validateControlsSources(
      sources.map((entry) => ({ ...entry, committedSource: entry.source })),
      manifest
    ),
    'validated_sources_required'
  );
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
      identity.database === CONTROLS_PREVIEW_SCOPE.database &&
        identity.role === 'postgres' &&
        Math.floor(identity.version / 10000) === 16,
      'exact_preview_database_pg16_role_required'
    );
    const ledgerQuery =
      'SELECT * FROM workflow_v2_release.applied_additive_migrations ORDER BY migration_number';
    const beforeLedger = (await db.query(ledgerQuery)).rows;
    const baseline = validateControlsLedger(beforeLedger, sources);
    const before = await captureMigrationCatalog(db);
    assertControlsCatalogState(before, baseline === 23);
    await assertControlsPrivileges(db, sources, baseline === 23);
    const cluster = await preserveCluster(db),
      customers = await preserveCustomers(db, before);
    if (mode === 'apply' && baseline === 21) {
      for (const number of [22, 23])
        await db.query(sources.find((entry) => entry.number === number).sql);
      await db.query(
        `ALTER TABLE workflow_v2_release.applied_additive_migrations DROP CONSTRAINT ${ledgerConstraint}; ALTER TABLE workflow_v2_release.applied_additive_migrations ADD CONSTRAINT ${ledgerConstraint} CHECK(migration_number BETWEEN 2 AND 23)`
      );
      for (const number of [22, 23]) {
        const source = sources.find((entry) => entry.number === number);
        await db.query(
          "INSERT INTO workflow_v2_release.applied_additive_migrations(component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit) VALUES('orqaly',$1,$2,$3,$4,$4)",
          [number, source.path, source.digest, manifest.commit]
        );
      }
    }
    const after = await captureMigrationCatalog(db),
      afterLedger = (await db.query(ledgerQuery)).rows;
    const afterVersion = validateControlsLedger(afterLedger, sources);
    assert.deepEqual(await preserveCluster(db), cluster, 'cluster_roles_or_database_acl_changed');
    assert.deepEqual(
      await preserveCustomers(db, before),
      customers,
      'protected_customer_or_workflow_data_changed'
    );
    await assertControlsPrivileges(db, sources, afterVersion === 23);
    if (mode === 'apply' && baseline === 21) {
      assert.equal(afterVersion, 23);
      assertControlsCatalogDelta(before, after);
      assert.deepEqual(
        afterLedger.filter((row) => row.migration_number <= 21),
        beforeLedger,
        'historical_ledger_changed'
      );
      for (const table of tables)
        assert.equal(
          (await db.query(`SELECT count(*)::integer AS count FROM orqaly.${table}`)).rows[0].count,
          0,
          'migration_created_customer_data'
        );
    } else {
      assert.deepEqual(after, before);
      assert.deepEqual(afterLedger, beforeLedger);
    }
    await db.query(mode === 'apply' && baseline === 21 ? 'COMMIT' : 'ROLLBACK');
    transaction = false;
    return {
      verified: true,
      schemaVersion: 'orqaly.solution-controls-migration.v1',
      recordedAt: new Date().toISOString(),
      project: CONTROLS_PREVIEW_SCOPE.project,
      instance: CONTROLS_PREVIEW_SCOPE.instance,
      database: identity.database,
      postgresVersion: identity.version,
      mode,
      status:
        baseline === 23
          ? 'already_applied_no_writes'
          : mode === 'apply'
            ? 'applied_verified'
            : 'ready_not_applied',
      sourceCommit: manifest.commit,
      migrationHashes: manifest.hashes,
      ledgerBefore: baseline,
      ledgerAfter: afterVersion,
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
    const { mode, manifest } = parseControlsArguments(process.argv.slice(2));
    assert.equal(
      capture('git', ['rev-parse', 'HEAD']).trim(),
      manifest.commit,
      'reviewed_source_commit_required'
    );
    const sources = validateControlsSources(
      readdirSync(resolve(root, migrationDir))
        .filter(
          (name) =>
            /^\d{3}_.*\.sql$/.test(name) &&
            Number(name.slice(0, 3)) >= 2 &&
            Number(name.slice(0, 3)) <= 23
        )
        .sort()
        .map((name) => ({
          number: Number(name.slice(0, 3)),
          path: `${migrationDir}/${name}`,
          source: readFileSync(resolve(root, migrationDir, name), 'utf8'),
          committedSource: capture('git', ['show', `${manifest.commit}:${migrationDir}/${name}`]),
        })),
      manifest
    );
    stage = 'owned_loopback_proxy';
    const probe = createServer();
    await new Promise((done, reject) => {
      probe.once('error', reject);
      probe.listen({ host: '127.0.0.1', port: CONTROLS_PREVIEW_SCOPE.port, exclusive: true }, done);
    });
    await new Promise((done) => probe.close(done));
    stage = 'existing_orqaly_admin_secret';
    const password = capture('gcloud', [
      'secrets',
      'versions',
      'access',
      '1',
      '--secret=orqaly-v2-preview-001-db-admin-password',
      `--project=${CONTROLS_PREVIEW_SCOPE.project}`,
    ]).trim();
    assert(password && !password.includes('\n'), 'admin_secret_shape_invalid');
    let proxyFailed = false;
    proxy = spawn(
      'cloud-sql-proxy',
      [
        CONTROLS_PREVIEW_SCOPE.instance,
        '--gcloud-auth',
        '--address=127.0.0.1',
        `--port=${CONTROLS_PREVIEW_SCOPE.port}`,
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
        port: CONTROLS_PREVIEW_SCOPE.port,
        user: 'postgres',
        password,
        database: CONTROLS_PREVIEW_SCOPE.database,
        application_name: 'orqaly-reviewed-additive022023',
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
    console.log(JSON.stringify(await applyControlsMigrations(db, { mode, manifest, sources })));
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
