// Destructive fixture setup is permitted ONLY in a brand-new disposable local
// database matching this gate's exact synthetic identity. Never use a service URL.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { canonicalHash, canonicalJson, sha256Hex } from '../lib/workflow-v2/canonical.js';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createGoalWorkflowViewService } from '../server/workflow-v2/goal-workflow-view-service.js';
import { readGoalWorkflowViewWithClient } from '../server/workflow-v2/goal-workflow-view-repository.js';
import { GOAL_WORKFLOW_VIEW_LIMITS as limits } from '../shared/workflow-v2/goal-workflow-view-contract.js';

const rawUrl = process.env.WORKFLOW_V2_GOAL_VIEW_TEST_DATABASE_URL;
assert(rawUrl, 'explicit disposable Goal view test database URL required');
const url = new URL(rawUrl);
assert(['postgres:', 'postgresql:'].includes(url.protocol));
assert.equal(url.hostname, '127.0.0.1', 'loopback-only test database required');
assert(/^[1-9][0-9]{3,4}$/.test(url.port) && Number(url.port) <= 65535);
assert(/^\/orqaly_goal_view_gate_[a-z0-9]+$/.test(url.pathname));
assert.equal(url.username, 'orqaly_goal_view_gate_admin');
assert.equal(url.password, 'goal-view-synthetic-fixture-only');
assert.equal(url.search, '', 'connection options cannot override the test boundary');
const login = {
  api: 'orqaly_goal_view_gate_api',
  identity: 'orqaly_goal_view_gate_identity',
  worker: 'orqaly_goal_view_gate_worker',
};
const roleUrl = (kind) => {
  const value = new URL(url);
  value.username = login[kind];
  return value.href;
};
const client = (connectionString) =>
  new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 15000,
  });
const admin = client(rawUrl),
  api = client(roleUrl('api'));
const checks = [],
  migrations = [];
let repository;
const check = async (name, run) => {
  await run();
  checks.push(name);
};
const expectCode = async (run, codes) => {
  try {
    await run();
  } catch (error) {
    assert(codes.includes(error.code), `unexpected SQLSTATE ${error.code}`);
    return;
  }
  assert.fail(`expected SQLSTATE ${codes.join('/')}`);
};
const request = 'Synthetic Goal view database fixture.';
const tenantA = randomUUID(),
  tenantB = randomUUID(),
  runA = randomUUID(),
  runB = randomUUID(),
  runC = randomUUID();
const ownerA = 'user_goalviewpga',
  ownerB = 'user_goalviewpgb',
  ownerC = 'user_goalviewpgc';
const stageIds = [],
  artifacts = [],
  sourceIds = [];
const input = {
  type: 'synthetic_database_fixture',
  privateInput: 'ATTEMPT_INPUT_MUST_NOT_BE_RETURNED' + 'x'.repeat(32_000),
};
const inputCanonical = canonicalJson(input),
  inputHash = canonicalHash(input);

async function insertRun(tenantId, runId, owner) {
  await admin.query(
    `INSERT INTO orqaly.workflow_runs (tenant_id,id,owner_user_id,mode,status,contract_version,request_hash,request_payload,row_version)
    VALUES ($1,$2,$3,'simple','completed','orqaly.workflow.v2',$4,$5::jsonb,9)`,
    [
      tenantId,
      runId,
      owner,
      sha256Hex(request),
      JSON.stringify({ request, privateField: 'REQUEST_BODY_MUST_NOT_BE_RETURNED' }),
    ]
  );
}
async function insertStage(tenantId, runId, ordinal) {
  const stageId = randomUUID();
  await admin.query(
    `INSERT INTO orqaly.workflow_stages (tenant_id,run_id,id,stage_key,kind,status,ordinal,input_hash,row_version)
    VALUES ($1,$2,$3,$4,'execution','completed',$5,$6,4)`,
    [tenantId, runId, stageId, `stage-${ordinal}`, ordinal, inputHash]
  );
  return stageId;
}
async function insertArtifact(
  tenantId,
  runId,
  stageId,
  attemptNumber,
  { markdown = false, index = 0 } = {}
) {
  const attemptId = randomUUID(),
    operationId = randomUUID(),
    artifactId = randomUUID();
  await admin.query(
    `INSERT INTO orqaly.stage_attempts (tenant_id,run_id,stage_id,id,attempt_number,status,activity_type,operation_id,input_hash,input_payload,input_canonical,lease_token,lease_owner,lease_expires_at)
    VALUES ($1,$2,$3,$4,$5,'succeeded','axwise_operation',$6,$7,$8::jsonb,$9,$10,'LEASE_OWNER_MUST_NOT_BE_RETURNED',clock_timestamp()+interval '1 minute')`,
    [
      tenantId,
      runId,
      stageId,
      attemptId,
      attemptNumber,
      operationId,
      inputHash,
      JSON.stringify(input),
      inputCanonical,
      randomUUID(),
    ]
  );
  const text = markdown ? 'MARKDOWN_BODY_MUST_NOT_BE_RETURNED' : null;
  const payload = markdown
    ? { markdown: text }
    : { fixture: index, privatePayload: 'ARTIFACT_PAYLOAD_MUST_NOT_BE_RETURNED' };
  const contentType = markdown ? 'text/markdown' : 'application/json';
  const canonical = canonicalJson({ contentType, payload, markdown: text }),
    artifactHash = sha256Hex(canonical);
  const kind = markdown ? 'final_markdown' : 'research';
  await admin.query(
    `INSERT INTO orqaly.artifacts (tenant_id,run_id,stage_id,attempt_id,id,kind,content_type,content_hash,input_hash,source_operation_id,payload,markdown,canonical_content)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
    [
      tenantId,
      runId,
      stageId,
      attemptId,
      artifactId,
      kind,
      contentType,
      artifactHash,
      inputHash,
      operationId,
      JSON.stringify(payload),
      text,
      canonical,
    ]
  );
  return { artifactId, artifactHash, kind, inputHash, runId, contentType };
}
async function counts() {
  const result = await admin.query(`SELECT
    (SELECT count(*)::integer FROM orqaly.tenants) AS tenants,
    (SELECT count(*)::integer FROM orqaly.tenant_identity_bindings) AS bindings,
    (SELECT count(*)::integer FROM orqaly.tenant_agents) AS agents,
    (SELECT count(*)::integer FROM orqaly.workflow_runs) AS runs,
    (SELECT count(*)::integer FROM orqaly.workflow_stages) AS stages,
    (SELECT count(*)::integer FROM orqaly.stage_attempts) AS attempts,
    (SELECT count(*)::integer FROM orqaly.artifacts) AS artifacts,
    (SELECT count(*)::integer FROM orqaly.artifact_lineage) AS lineage,
    (SELECT count(*)::integer FROM orqaly.workflow_events) AS events,
    (SELECT count(*)::integer FROM orqaly.outbox_events) AS outbox`);
  return result.rows[0];
}
async function withRead(tenantId, callback) {
  await api.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await api.query("SELECT set_config('orqaly.tenant_id',$1,true)", [tenantId]);
    return await callback(api);
  } finally {
    await api.query('ROLLBACK');
  }
}

try {
  await admin.connect();
  assert.equal(
    (await admin.query('SELECT current_database() AS name')).rows[0].name,
    url.pathname.slice(1)
  );
  assert.equal(
    (await admin.query("SELECT to_regnamespace('orqaly')::text AS schema")).rows[0].schema,
    null,
    'gate must start with a brand-new database; never migrate an existing schema'
  );
  const server = (
    await admin.query(
      "SELECT version(), current_setting('server_version_num')::integer AS version_num"
    )
  ).rows[0];
  assert(server.version_num >= 160000 && server.version_num < 170000, 'PostgreSQL 16 required');
  const directory = new URL('../database/workflow-v2/migrations/', import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^[0-9]{3}_.+\.sql$/.test(name)).sort();
  assert.equal(names.length, 24, 'reviewed 001–024 migration set required');
  for (const name of names) {
    const bytes = await readFile(new URL(name, directory));
    await admin.query(bytes.toString('utf8'));
    migrations.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const [kind, name] of Object.entries(login)) {
    await admin.query(
      `CREATE ROLE ${name} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD 'goal-view-synthetic-fixture-only'`
    );
    await admin.query(`GRANT orqaly_${kind} TO ${name} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`);
  }
  await api.connect();
  repository = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: roleUrl('identity'),
    apiDatabaseUrl: roleUrl('api'),
    workerDatabaseUrl: null,
  });
  const service = createGoalWorkflowViewService({ repository });
  await admin.query(
    "INSERT INTO orqaly.tenants (id,display_name) VALUES ($1,'Synthetic A'),($2,'Synthetic B')",
    [tenantA, tenantB]
  );
  await admin.query(
    `INSERT INTO orqaly.tenant_identity_bindings (tenant_id,environment,subject_type,subject_id)
    VALUES ($1,'preview','user',$2),($3,'preview','user',$4),($1,'preview','user',$5)`,
    [tenantA, ownerA, tenantB, ownerB, ownerC]
  );
  await insertRun(tenantA, runA, ownerA);
  await insertRun(tenantB, runB, ownerB);
  await insertRun(tenantA, runC, ownerC);
  for (let index = 0; index <= limits.stages; index += 1) {
    const stageId = await insertStage(tenantA, runA, index);
    stageIds.push(stageId);
    const artifact = await insertArtifact(tenantA, runA, stageId, 1, {
      markdown: index === limits.stages,
      index,
    });
    artifacts.push(artifact);
    await admin.query(
      'UPDATE orqaly.workflow_stages SET output_artifact_id=$1 WHERE tenant_id=$2 AND id=$3',
      [artifact.artifactId, tenantA, stageId]
    );
  }
  await admin.query(
    'UPDATE orqaly.workflow_runs SET final_artifact_id=$1 WHERE tenant_id=$2 AND id=$3',
    [artifacts.at(-1).artifactId, tenantA, runA]
  );
  for (let index = 0; index <= limits.lineage; index += 1) {
    const artifact = await insertArtifact(tenantA, runA, stageIds[0], index + 2, {
      index: 1000 + index,
    });
    sourceIds.push(artifact.artifactId);
  }
  await admin.query(
    `INSERT INTO orqaly.artifact_lineage (tenant_id,run_id,artifact_id,source_artifact_id)
    SELECT $1,$2,$3,value FROM unnest($4::uuid[]) AS value`,
    [tenantA, runA, artifacts[0].artifactId, sourceIds]
  );
  const otherStage = await insertStage(tenantB, runB, 0);
  const otherArtifact = await insertArtifact(tenantB, runB, otherStage, 1);
  const before = await counts();
  let result;
  await check('least_privilege_login_roles', async () => {
    const roles = (
      await admin.query(
        'SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',
        [Object.values(login)]
      )
    ).rows;
    assert.equal(roles.length, 3);
    for (const role of roles) {
      assert.equal(role.rolcanlogin, true);
      for (const key of ['rolsuper', 'rolbypassrls', 'rolcreatedb', 'rolcreaterole'])
        assert.equal(role[key], false);
    }
    assert.equal((await api.query('SELECT current_user AS name')).rows[0].name, login.api);
  });
  await check('core_metadata_tables_force_rls', async () => {
    const rows = (
      await admin.query(
        'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])',
        [
          [
            'orqaly.workflow_runs',
            'orqaly.workflow_stages',
            'orqaly.artifacts',
            'orqaly.artifact_lineage',
          ],
        ]
      )
    ).rows;
    assert.equal(rows.length, 4);
    assert(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
  });
  await check('api_has_no_rows_without_tenant_context', async () => {
    assert.equal(
      (await api.query('SELECT count(*)::integer AS n FROM orqaly.workflow_runs')).rows[0].n,
      0
    );
  });
  await check('owned_read_executes_real_sql_and_strict_projection', async () => {
    result = await service.read({ userId: ownerA }, runA);
    assert.equal(result.workflow.source.id, runA);
    assert.equal(result.workflow.scope.tenantId, tenantA);
    assert.equal(result.workflow.scope.ownerUserId, ownerA);
    assert.equal(result.workflow.rowVersion, 9);
  });
  await check('stage_and_output_overflow_is_explicit', async () => {
    assert.equal(result.workflow.steps.length, limits.stages);
    assert.equal(result.workflow.outputs.length, limits.outputs);
    assert.equal(result.coverage.stages.complete, false);
    assert.equal(result.coverage.outputs.complete, false);
    assert(!result.workflow.steps.some((step) => step.id === stageIds.at(-1)));
  });
  await check('exact_artifact_identity_hash_kind_and_input_metadata', async () => {
    for (const output of result.workflow.outputs) {
      const expected = artifacts.find(
        (artifact) => artifact.artifactId === output.reference.artifactId
      );
      assert(expected);
      for (const key of ['runId', 'artifactId', 'artifactHash', 'kind'])
        assert.equal(output.reference[key], expected[key]);
      assert.equal(output.inputHash, expected.inputHash);
      assert.equal(output.contentType, expected.contentType);
    }
  });
  await check('bounded_ordered_lineage_preserves_partial_coverage', async () => {
    const output = result.workflow.outputs.find(
      (item) => item.reference.artifactId === artifacts[0].artifactId
    );
    assert.deepEqual(output.sourceArtifactIds, [...sourceIds].sort().slice(0, limits.lineage));
    assert.deepEqual(result.coverage.lineage.incompleteArtifactIds, [artifacts[0].artifactId]);
  });
  await check('no_body_attempt_lease_or_history_payload_leak', async () => {
    const json = JSON.stringify(result);
    assert(!json.includes('MUST_NOT_BE_RETURNED'));
    for (const key of ['attempts', 'dependencies', 'approvals', 'history', 'content'])
      assert.equal(result.coverage[key], 'not_loaded');
    assert.deepEqual(result.workflow.attempts, []);
    assert.deepEqual(result.workflow.approvals, []);
    assert.deepEqual(result.workflow.dependencies, []);
  });
  await check('same_tenant_other_owner_is_not_found', async () => {
    await assert.rejects(
      service.read({ userId: ownerC }, runA),
      (error) => error.status === 404 && error.code === 'RUN_NOT_FOUND'
    );
  });
  await check('cross_tenant_owner_is_not_found', async () => {
    await assert.rejects(
      service.read({ userId: ownerB }, runA),
      (error) => error.status === 404 && error.code === 'RUN_NOT_FOUND'
    );
  });
  await check('unknown_run_is_not_found', async () => {
    await assert.rejects(
      service.read({ userId: ownerA }, randomUUID()),
      (error) => error.status === 404 && error.code === 'RUN_NOT_FOUND'
    );
  });
  await check('empty_owned_run_is_complete_not_truncated', async () => {
    const empty = await service.read({ userId: ownerC }, runC);
    assert.equal(empty.workflow.steps.length, 0);
    assert.equal(empty.workflow.outputs.length, 0);
    assert.equal(empty.coverage.stages.complete, true);
    assert.equal(empty.coverage.outputs.complete, true);
  });
  await check('tenant_rls_remains_effective_even_for_mismatched_query_scope', async () => {
    await withRead(tenantA, async (connection) => {
      assert.equal(await readGoalWorkflowViewWithClient(connection, tenantB, ownerB, runB), null);
    });
  });
  await check('legacy_tenant_read_policy_is_not_incidentally_changed', async () => {
    await withRead(tenantA, async (connection) => {
      const rows = await connection.query(
        'SELECT id FROM orqaly.workflow_runs WHERE tenant_id=$1 ORDER BY id',
        [tenantA]
      );
      assert.deepEqual(rows.rows.map((row) => row.id).sort(), [runA, runC].sort());
    });
  });
  await check('three_metadata_queries_for_full_or_empty_owned_run', async () => {
    for (const [owner, runId] of [
      [ownerA, runA],
      [ownerC, runC],
    ])
      await withRead(tenantA, async (connection) => {
        let count = 0;
        await readGoalWorkflowViewWithClient(
          {
            query: (...args) => {
              count += 1;
              return connection.query(...args);
            },
          },
          tenantA,
          owner,
          runId
        );
        assert.equal(count, 3);
      });
  });
  await check('one_metadata_query_for_owner_miss', async () => {
    await withRead(tenantA, async (connection) => {
      let count = 0;
      const value = await readGoalWorkflowViewWithClient(
        {
          query: (...args) => {
            count += 1;
            return connection.query(...args);
          },
        },
        tenantA,
        ownerC,
        runA
      );
      assert.equal(value, null);
      assert.equal(count, 1);
    });
  });
  await check('read_only_identity_resolves_existing_select_first_binding', async () => {
    assert.equal(await repository.resolveExistingTenant({ userId: ownerA }), tenantA);
  });
  await check('unbound_identity_cannot_provision_in_read_only_transaction', async () => {
    assert.equal(
      await repository.resolveExistingTenant({ userId: 'user_goalviewneverprovisioned' }),
      null
    );
    await assert.rejects(
      service.read({ userId: 'user_goalviewneverprovisioned' }, runA),
      (error) => error.status === 403 && error.code === 'TENANT_NOT_BOUND'
    );
  });
  await check('all_read_operations_leave_row_counts_unchanged', async () => {
    assert.deepEqual(await counts(), before);
  });
  await check('suspended_identity_is_denied_not_falsely_not_found', async () => {
    await admin.query("UPDATE orqaly.tenants SET status='suspended' WHERE id=$1", [tenantB]);
    try {
      await assert.rejects(
        service.read({ userId: ownerB }, runB),
        (error) => error.status === 403 && error.code === 'TENANT_NOT_BOUND'
      );
    } finally {
      await admin.query("UPDATE orqaly.tenants SET status='active' WHERE id=$1", [tenantB]);
    }
  });
  await check('api_has_no_direct_mutation_grants', async () => {
    const row = (
      await api.query(
        "SELECT has_table_privilege(current_user,'orqaly.workflow_runs','UPDATE') AS update_run, has_table_privilege(current_user,'orqaly.artifacts','INSERT') AS insert_artifact"
      )
    ).rows[0];
    assert.equal(row.update_run, false);
    assert.equal(row.insert_artifact, false);
  });
  await check('read_only_transaction_rejects_mutation_even_for_fixture_admin', async () => {
    await admin.query('BEGIN READ ONLY');
    try {
      await expectCode(
        () =>
          admin.query(
            'UPDATE orqaly.workflow_runs SET row_version=row_version+1 WHERE tenant_id=$1 AND id=$2',
            [tenantA, runA]
          ),
        ['25006']
      );
    } finally {
      await admin.query('ROLLBACK');
    }
  });
  await check('foreign_lineage_source_is_rejected_by_real_composite_fk', async () => {
    await expectCode(
      () =>
        admin.query(
          'INSERT INTO orqaly.artifact_lineage (tenant_id,run_id,artifact_id,source_artifact_id) VALUES ($1,$2,$3,$4)',
          [tenantA, runA, artifacts[0].artifactId, otherArtifact.artifactId]
        ),
      ['23503']
    );
  });
  await check('repeatable_read_does_not_mix_concurrent_stage_versions', async () => {
    try {
      await withRead(tenantA, async (connection) => {
        const value = await readGoalWorkflowViewWithClient(
          {
            query: async (sql, params) => {
              const rows = await connection.query(sql, params);
              if (sql.includes('FROM orqaly.workflow_runs AS run'))
                await admin.query(
                  "UPDATE orqaly.workflow_stages SET status='failed',row_version=5 WHERE tenant_id=$1 AND id=$2",
                  [tenantA, stageIds[0]]
                );
              return rows;
            },
          },
          tenantA,
          ownerA,
          runA
        );
        assert.equal(value.snapshot.stages[0].status, 'completed');
        assert.equal(value.snapshot.stages[0].rowVersion, 4);
      });
    } finally {
      await admin.query(
        "UPDATE orqaly.workflow_stages SET status='completed',row_version=4 WHERE tenant_id=$1 AND id=$2",
        [tenantA, stageIds[0]]
      );
    }
  });
  await check(
    'final_fixture_counts_still_match_after_rolled_back_and_restored_checks',
    async () => {
      assert.deepEqual(await counts(), before);
    }
  );
  process.stdout.write(
    JSON.stringify(
      {
        verified: true,
        server: server.version,
        database: url.pathname.slice(1),
        host: url.hostname,
        port: Number(url.port),
        testsPassed: checks.length,
        checks,
        migrations,
        fixtureCounts: before,
        limitations: [
          'Disposable local PostgreSQL 16; not Cloud SQL.',
          'Superuser used only for migration, role setup, synthetic fixtures and audit; reader and identity use separate non-superuser logins.',
          'Container cleanup is performed and verified by the owning gate operator after this process closes its clients.',
        ],
      },
      null,
      2
    ) + '\n'
  );
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      verified: false,
      completedChecks: checks,
      name: error.name,
      code: error.code,
      message: error.message,
    }) + '\n'
  );
  process.exitCode = 1;
} finally {
  await repository?.close();
  await Promise.allSettled([api.end(), admin.end()]);
}
