// Real, disposable PostgreSQL16/17 security proof for migration014.
// Usage: node scripts/solution-app-keys-postgres.mjs [--postgres-major=16|17]
// Default16 matches the currently deployed preview Cloud SQL engine.
// Local database only. Runtime behavior is an explicit fixture, not n8n proof.
// No cloud credentials, external HTTP requests, model calls or raw key output.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import {
  compileSolutionWorkflow,
  expectedSolutionOutput,
} from '../server/workflow-v2/solution-compiler.js';
import { publicInvocation } from '../server/workflow-v2/solution-service.js';
import {
  applyReviewedMigration,
  captureMigrationCatalog,
} from './solution-app-keys-preview-migrate.mjs';

if (
  process.argv.length > 3 ||
  (process.argv[2] && !/^--postgres-major=(16|17)$/.test(process.argv[2]))
)
  throw new Error('only_postgres_major_16_or_17_supported');
const postgresMajor = Number(process.argv[2]?.split('=')[1] || 16);
const suffix = randomBytes(6).toString('hex');
const containerName = `orqaly-app-keys-pg-${suffix}`;
const password = randomBytes(24).toString('hex');
const docker = (args, env = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let started = false;
let admin;
let repository;
let serverVersion;
let migration014Sha256;
let phase = 'local_postgres_start';
const directClients = [];
const checks = [];
function check(name) {
  phase = name;
  checks.push(name);
  process.stdout.write(`check: ${name}\n`);
}
async function expectCode(run, code) {
  await assert.rejects(run, (error) => error.code === code);
}

try {
  docker(
    [
      'run',
      '--detach',
      '--name',
      containerName,
      '--publish',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD',
      `postgres:${postgresMajor}-alpine`,
    ],
    { POSTGRES_PASSWORD: password }
  );
  started = true;
  const port = docker(['port', containerName, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert(port, 'owned_loopback_port_required');
  for (let n = 0; n < 60; n++) {
    try {
      docker(['exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch {
      await delay(250);
    }
  }
  admin = new pg.Client({
    connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,
    statement_timeout: 10_000,
  });
  await admin.connect();
  serverVersion = Number(
    (await admin.query("SELECT current_setting('server_version_num') AS version")).rows[0].version
  );
  assert.equal(Math.floor(serverVersion / 10_000), postgresMajor, 'database_major_mismatch');
  check('all_additive_migrations_through014');
  const files = (await readdir('database/workflow-v2/migrations'))
    .filter((file) => /^\d{3}.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 14)
    .sort();
  assert(files.includes('014_solution_application_keys.sql'), 'migration014_required');
  for (const file of files) {
    phase = `migration_${file}`;
    const sql = await readFile(`database/workflow-v2/migrations/${file}`, 'utf8');
    if (file === '014_solution_application_keys.sql')
      migration014Sha256 = createHash('sha256').update(sql).digest('hex');
    try {
      if (file !== '014_solution_application_keys.sql' || postgresMajor !== 16) {
        await admin.query(sql);
      } else {
        check('preview_migration_operator_inspect_rollback_apply_and_replay_on_pg16');
        await admin.query(`
          CREATE SCHEMA workflow_v2_release;
          CREATE TABLE workflow_v2_release.applied_additive_migrations (
            component text NOT NULL CHECK(component='orqaly'),
            migration_number integer NOT NULL,
            migration_path text NOT NULL,
            sha256 text NOT NULL,
            first_applied_source_commit text NOT NULL,
            source_commit text NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            PRIMARY KEY(component,migration_number),
            CONSTRAINT applied_additive_migrations_migration_number_check
              CHECK(migration_number BETWEEN 2 AND 13)
          )`);
        for (const prior of files.filter(
          (name) => Number(name.slice(0, 3)) >= 2 && Number(name.slice(0, 3)) < 14
        )) {
          const path = `database/workflow-v2/migrations/${prior}`;
          const checksum = createHash('sha256')
            .update(await readFile(path, 'utf8'))
            .digest('hex');
          await admin.query(
            `INSERT INTO workflow_v2_release.applied_additive_migrations
            (component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit)
            VALUES('orqaly',$1,$2,$3,$4,$4)`,
            [Number(prior.slice(0, 3)), path, checksum, 'a'.repeat(40)]
          );
        }
        const operatorOptions = {
          source: sql.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, ''),
          commit: 'a'.repeat(40),
          // This fresh local fixture has no customer data yet. Production uses
          // the fixed-scope full data hashes; only this test injects a sentinel.
          preserveCustomer: async (client) => ({
            count: Number(
              (await client.query('SELECT count(*) FROM orqaly.workflow_runs')).rows[0].count
            ),
          }),
        };
        const inspected = await applyReviewedMigration(admin, {
          ...operatorOptions,
          mode: 'inspect',
        });
        assert.equal(inspected.status, 'ready_not_applied');
        const catalog = await captureMigrationCatalog(admin);
        await assert.rejects(
          () =>
            applyReviewedMigration(admin, {
              ...operatorOptions,
              mode: 'apply',
              source: `${operatorOptions.source}\nALTER TABLE orqaly.customer_solutions ADD COLUMN unreviewed_test_only text;`,
            }),
          /preexisting_catalog_or_privileges_changed/
        );
        assert.deepEqual(
          await captureMigrationCatalog(admin),
          catalog,
          'failed_operator_change_must_rollback'
        );
        const applied = await applyReviewedMigration(admin, { ...operatorOptions, mode: 'apply' });
        assert.equal(applied.status, 'applied_verified');
        assert.equal(applied.ledgerAfter, 14);
        assert.equal(
          (await applyReviewedMigration(admin, { ...operatorOptions, mode: 'apply' })).status,
          'already_applied_verified_no_writes'
        );
      }
    } catch (error) {
      // Static migration source only, before credentials/fixtures are created.
      // Positions identify a broken DDL file without dumping SQL/error objects.
      process.stderr.write(
        `${JSON.stringify({
          migration: file,
          code: error.code,
          position: error.position ?? null,
          line: error.position ? sql.slice(0, Number(error.position) - 1).split('\n').length : null,
          internalPosition: error.internalPosition ?? null,
        })}\n`
      );
      throw error;
    }
  }

  for (const role of ['identity', 'api', 'worker'])
    await admin.query(
      `CREATE ROLE app_keys_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE orqaly_${role}`
    );
  const url = (role) => `postgresql://app_keys_test_${role}:${password}@127.0.0.1:${port}/postgres`;
  repository = createPostgresRepositories({
    environment: 'preview',
    identityDatabaseUrl: url('identity'),
    apiDatabaseUrl: url('api'),
    workerDatabaseUrl: url('worker'),
  });
  await repository.readiness();
  for (const role of ['identity', 'api', 'worker']) {
    const client = new pg.Client({ connectionString: url(role), statement_timeout: 5000 });
    await client.connect();
    directClients.push({ role, client });
  }
  const api = directClients.find((value) => value.role === 'api').client;
  const auth = { userId: `user_appkeys${suffix}` };
  const foreign = { userId: `user_foreign${suffix}` };
  const sameTenantOther = { userId: `user_otherowner${suffix}` };
  const tenantId = await repository.resolveTenant(auth);
  const foreignTenantId = await repository.resolveTenant(foreign);
  await admin.query(
    `INSERT INTO orqaly.tenant_identity_bindings(tenant_id,environment,subject_type,subject_id)
     VALUES($1,'preview','user',$2)`,
    [tenantId, sameTenantOther.userId]
  );
  assert.equal(await repository.resolveTenant(sameTenantOther), tenantId);
  const tx = (scope, run) => repository.solutionTransaction(scope, run);
  const spec = {
    kind: 'webhook_transform_v1',
    fields: [
      { source: 'name', target: 'customer_name', transform: 'trim' },
      { source: 'email', target: 'email', transform: 'lowercase' },
    ],
  };
  async function fixtureSolution(owner = auth, tenant = tenantId) {
    const id = randomUUID();
    const compiled = compileSolutionWorkflow({ id, spec });
    await admin.query(
      `INSERT INTO orqaly.customer_solutions
       (tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,
        workflow_hash,create_key,create_hash,status,environment_id,deployment,approved_at,tested_at)
       VALUES($1,$2,$3,$4,'PG application key fixture','Local security test only',$5,$6,$7,$8,$9,$8,
        'active',$10,$11,clock_timestamp(),clock_timestamp())`,
      [
        tenant,
        id,
        owner.userId,
        randomUUID(),
        spec,
        { name: 'Fixture Agent', profileVersion: 1 },
        compiled.workflow,
        compiled.workflowHash,
        `fixture_${id}`,
        `local-app-key-${id}`,
        {
          workflowId: `fixture${id.replaceAll('-', '')}`,
          versionId: randomUUID(),
          workflowHash: compiled.workflowHash,
          verifiedAt: new Date().toISOString(),
        },
      ]
    );
    return { id, workflowHash: compiled.workflowHash };
  }
  const solution = await fixtureSolution();
  const foreignSolution = await fixtureSolution(foreign, foreignTenantId);
  const sameTenantSolution = await fixtureSolution(sameTenantOther);

  check('restricted_login_roles_and_forced_tenant_rls');
  for (const { client } of directClients) {
    const identity = (
      await client.query(
        `SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`
      )
    ).rows[0];
    assert.deepEqual(identity, {
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
  }
  const secured = (
    await admin.query(
      `SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
       WHERE oid IN ('orqaly.solution_application_keys'::regclass,'orqaly.solution_application_usage'::regclass)
       ORDER BY relname`
    )
  ).rows;
  assert.equal(secured.length, 2);
  assert(secured.every((value) => value.relrowsecurity && value.relforcerowsecurity));
  for (const { role, client } of directClients.filter((value) => value.role !== 'api')) {
    for (const table of ['solution_application_keys', 'solution_application_usage'])
      await expectCode(() => client.query(`SELECT * FROM orqaly.${table}`), '42501');
    assert(['identity', 'worker'].includes(role));
  }
  for (const table of ['solution_application_keys', 'solution_application_usage']) {
    const grants = (
      await api.query(
        `SELECT has_table_privilege(current_user,$1,'SELECT') AS can_select,
         has_table_privilege(current_user,$1,'INSERT') AS can_insert,
         has_table_privilege(current_user,$1,'UPDATE') AS broad_update,
         has_table_privilege(current_user,$1,'DELETE') AS can_delete,
         has_table_privilege(current_user,$1,'TRUNCATE') AS can_truncate`,
        [`orqaly.${table}`]
      )
    ).rows[0];
    assert.deepEqual(grants, {
      can_select: true,
      can_insert: true,
      broad_update: false,
      can_delete: false,
      can_truncate: false,
    });
  }

  const { createSolutionApplicationKeyService, hashSolutionApplicationKey } =
    await import('../server/workflow-v2/solution-application-key-service.js');
  let clock = Date.now();
  let runtimeCalls = 0;
  let hold;
  const runtimeFixture = {
    async executeClaimedInvocation(scope, claimed) {
      runtimeCalls++;
      if (hold) {
        // Before introducing a competing caller, a fresh transaction must get
        // both locks immediately. Do not mistake a legitimate concurrent claim's
        // brief lock for the originating transaction remaining open.
        await tx(scope.tenantId, async (client) => {
          await client.query(
            'SELECT id FROM orqaly.customer_solutions WHERE tenant_id=$1 AND id=$2 FOR UPDATE NOWAIT',
            [scope.tenantId, claimed.solution.id]
          );
          await client.query(
            'SELECT id FROM orqaly.solution_application_keys WHERE tenant_id=$1 AND id=$2 FOR UPDATE NOWAIT',
            [scope.tenantId, claimed.invocation.application_key_id]
          );
        });
        const current = hold;
        current.entered();
        await current.release;
      }
      const saved = await tx(
        scope.tenantId,
        async (client) =>
          (
            await client.query(
              `UPDATE orqaly.solution_invocations SET status='succeeded',output=$4,
           execution_id=$5,completed_at=clock_timestamp()
           WHERE tenant_id=$1 AND solution_id=$2 AND id=$3 RETURNING *`,
              [
                scope.tenantId,
                claimed.solution.id,
                claimed.invocation.id,
                expectedSolutionOutput(claimed.solution.spec, claimed.invocation.input),
                `fixture_${runtimeCalls}`,
              ]
            )
          ).rows[0]
      );
      return { invocation: publicInvocation(saved) };
    },
  };
  const makeService = () =>
    createSolutionApplicationKeyService({
      repository,
      solutionService: runtimeFixture,
      environment: 'preview',
      now: () => clock,
    });
  let service = makeService();
  const create = (target, key, label = 'Local fixture application', owner = auth) =>
    service.create(
      owner,
      target.id,
      { label, expiresInDays: 30, workflowHash: target.workflowHash },
      0,
      key
    );
  const body = { input: { name: ' Ada ', email: 'ADA@EXAMPLE.COM' } };
  const header = (value) => `Bearer ${value.token}`;
  const usage = async (id) =>
    (
      await admin.query(
        'SELECT * FROM orqaly.solution_application_usage WHERE tenant_id=$1 AND solution_id=$2',
        [tenantId, id]
      )
    ).rows[0];
  const countInvocations = async (id) =>
    Number(
      (
        await admin.query(
          'SELECT count(*) AS count FROM orqaly.solution_invocations WHERE tenant_id=$1 AND solution_id=$2',
          [tenantId, id]
        )
      ).rows[0].count
    );

  check('ninety_day_expiry_uses_elapsed_hours_across_dst');
  const dstSolution = await fixtureSolution();
  const dstNow = Date.parse('2026-02-01T12:00:00.000Z');
  const dstService = createSolutionApplicationKeyService({
    repository: {
      ...repository,
      solutionTransaction: (tenant, callback) =>
        tx(tenant, async (client) => {
          await client.query("SET LOCAL TIME ZONE 'America/New_York'");
          return callback(client);
        }),
    },
    solutionService: runtimeFixture,
    environment: 'preview',
    now: () => dstNow,
  });
  const dstKey = await dstService.create(
    auth,
    dstSolution.id,
    { label: 'DST expiry fixture', expiresInDays: 90, workflowHash: dstSolution.workflowHash },
    0,
    'dst_expiry_key'
  );
  assert.equal(
    new Date(dstKey.key.expiresAt).valueOf() - new Date(dstKey.key.createdAt).valueOf(),
    90 * 86_400_000
  );

  check('owner_checks_one_time_key_and_secret_hash_only');
  const created = await create(solution, 'create_primary');
  assert.match(created.token, /^orqaly_app_preview_v1\./);
  assert.equal(created.key.status, 'active');
  const stored = (
    await admin.query(
      'SELECT * FROM orqaly.solution_application_keys WHERE tenant_id=$1 AND id=$2',
      [tenantId, created.key.id]
    )
  ).rows[0];
  assert.equal(stored.token_hash, hashSolutionApplicationKey(created.token));
  assert(!JSON.stringify(stored).includes(created.token));
  assert(!JSON.stringify(stored).includes(created.token.split('.').at(-1)));
  assert.equal(stored.owner_user_id, auth.userId);
  const listed = await service.list(auth, solution.id);
  assert.equal(listed.keys.length, 1);
  assert(!JSON.stringify(listed).includes(created.token));
  assert(!JSON.stringify(listed).includes(stored.token_hash));
  for (const wrongOwner of [foreign, sameTenantOther]) {
    await expectCode(() => service.list(wrongOwner, solution.id), 'SOLUTION_NOT_FOUND');
    await expectCode(
      () => create(solution, `create_wrong_${wrongOwner.userId}`, 'Wrong owner', wrongOwner),
      'SOLUTION_NOT_FOUND'
    );
    await expectCode(
      () => service.revoke(wrongOwner, solution.id, created.key.id, 1),
      'SOLUTION_NOT_FOUND'
    );
  }
  for (const wrongSolution of [foreignSolution, sameTenantSolution])
    await expectCode(
      () => service.invoke(header(created), wrongSolution.id, body, 'wrong_solution'),
      'APP_KEY_INVALID'
    );
  await expectCode(() => create(solution, 'create_primary'), 'APP_KEY_ALREADY_CREATED');
  await expectCode(
    () =>
      service.create(
        auth,
        solution.id,
        { label: 'Wrong version', workflowHash: solution.workflowHash },
        1,
        'stale_version'
      ),
    'SOLUTION_VERSION_CONFLICT'
  );
  await expectCode(
    () =>
      service.create(
        auth,
        solution.id,
        { label: 'Wrong release', workflowHash: '0'.repeat(64) },
        0,
        'wrong_release'
      ),
    'APP_KEY_RELEASE_CHANGED'
  );

  check('cross_tenant_rls_and_immutable_key_columns');
  const noScope = await api.query('SELECT id FROM orqaly.solution_application_keys');
  assert.equal(noScope.rowCount, 0);
  const foreignRead = await tx(foreignTenantId, (client) =>
    client.query('SELECT id FROM orqaly.solution_application_keys WHERE id=$1', [created.key.id])
  );
  assert.equal(foreignRead.rowCount, 0);
  const foreignWrite = await tx(foreignTenantId, (client) =>
    client.query(
      'UPDATE orqaly.solution_application_keys SET revoked_at=clock_timestamp() WHERE id=$1 RETURNING id',
      [created.key.id]
    )
  );
  assert.equal(foreignWrite.rowCount, 0);
  for (const column of [
    'tenant_id',
    'solution_id',
    'id',
    'owner_user_id',
    'environment',
    'label',
    'token_hash',
    'workflow_hash',
    'create_key',
    'created_at',
    'expires_at',
  ])
    await expectCode(
      () =>
        tx(tenantId, (client) =>
          client.query(
            `UPDATE orqaly.solution_application_keys SET ${column}=${column} WHERE id=$1`,
            [created.key.id]
          )
        ),
      '42501'
    );
  for (const statement of [
    'DELETE FROM orqaly.solution_application_keys WHERE id=$1',
    'UPDATE orqaly.solution_invocations SET application_key_id=NULL WHERE id=$1',
    'UPDATE orqaly.solution_invocations SET application_key_label=NULL WHERE id=$1',
  ])
    await expectCode(
      () => tx(tenantId, (client) => client.query(statement, [created.key.id])),
      '42501'
    );
  await expectCode(
    () =>
      tx(tenantId, (client) =>
        client.query(
          `INSERT INTO orqaly.solution_application_keys
     (tenant_id,solution_id,id,owner_user_id,environment,label,token_hash,workflow_hash,create_key,expires_at)
     VALUES($1,$2,$3,$4,'preview','Forged owner',$5,$5,'forged_owner',clock_timestamp()+interval '30 days')`,
          [tenantId, solution.id, randomUUID(), sameTenantOther.userId, '1'.repeat(64)]
        )
      ),
    '23503'
  );

  check('concurrent_key_creation_elects_one_and_enforces_five_key_limit');
  const raced = await Promise.allSettled([
    create(solution, 'create_same_retry'),
    create(solution, 'create_same_retry'),
  ]);
  assert.equal(raced.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(
    raced.find((item) => item.status === 'rejected').reason.code,
    'APP_KEY_ALREADY_CREATED'
  );
  await create(solution, 'create_third');
  await create(solution, 'create_fourth');
  const limitRace = await Promise.allSettled([
    create(solution, 'create_fifth'),
    create(solution, 'create_sixth'),
  ]);
  assert.equal(limitRace.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(limitRace.find((item) => item.status === 'rejected').reason.code, 'APP_KEY_LIMIT');
  assert.equal((await service.list(auth, solution.id)).keys.length, 5);

  check('bounded_key_listing_prioritizes_live_grants_over_revoked_history');
  const listingSolution = await fixtureSolution();
  const listingKey = await create(listingSolution, 'listing_live_key');
  await admin.query(
    `INSERT INTO orqaly.solution_application_keys
     (tenant_id,solution_id,id,owner_user_id,environment,label,token_hash,workflow_hash,
      create_key,created_at,expires_at,revoked_at,row_version)
     SELECT $1,$2,gen_random_uuid(),$3,'preview','Revoked fixture',repeat('a',64),$4,
       'listing_revoked_'||n,$5::timestamptz+n*interval '1 second',
       $5::timestamptz+interval '1 day',
       $5::timestamptz+n*interval '1 second',2
     FROM generate_series(1,110) n`,
    [tenantId, listingSolution.id, auth.userId, listingSolution.workflowHash, new Date(clock)]
  );
  const boundedListing = await service.list(auth, listingSolution.id);
  assert.equal(boundedListing.keys.length, 100);
  assert.equal(boundedListing.keys[0].id, listingKey.key.id);
  assert.equal(boundedListing.keys[0].status, 'active');
  assert(boundedListing.keys.slice(1).every((item) => item.status === 'revoked'));

  check('valid_call_replay_restart_and_same_key_only_receipts');
  const result = await service.invoke(header(created), solution.id, body, 'invoke_original');
  assert.equal(result.invocation.status, 'succeeded');
  assert.equal(result.invocation.input, undefined);
  assert.equal(result.invocation.actor, undefined);
  assert.deepEqual(result.invocation.output, { customer_name: 'Ada', email: 'ada@example.com' });
  assert.equal(runtimeCalls, 1);
  const beforeReplay = await usage(solution.id);
  service = makeService();
  const replay = await service.invoke(header(created), solution.id, body, 'invoke_original');
  assert.equal(replay.replayed, true);
  assert.equal(replay.invocation.id, result.invocation.id);
  assert.equal(runtimeCalls, 1);
  assert.deepEqual(await usage(solution.id), beforeReplay);
  assert.equal(
    (await service.readInvocation(header(created), solution.id, result.invocation.id)).invocation
      .id,
    result.invocation.id
  );
  const otherKey = raced.find((item) => item.status === 'fulfilled').value;
  await expectCode(
    () => service.readInvocation(header(otherKey), solution.id, result.invocation.id),
    'INVOCATION_NOT_FOUND'
  );
  await expectCode(
    () =>
      service.invoke(
        header(created),
        solution.id,
        { input: { name: ' Grace ', email: 'GRACE@EXAMPLE.COM' } },
        'invoke_original'
      ),
    'IDEMPOTENCY_CONFLICT'
  );
  const receipt = (
    await admin.query('SELECT * FROM orqaly.solution_invocations WHERE tenant_id=$1 AND id=$2', [
      tenantId,
      result.invocation.id,
    ])
  ).rows[0];
  assert.equal(receipt.application_key_id, created.key.id);
  assert.equal(receipt.application_key_label, created.key.label);
  assert.equal(receipt.mode, 'production');
  assert(!JSON.stringify(receipt).includes(created.token));

  check('invalid_environment_expiry_suspension_and_pause_fail_closed');
  for (const invalid of [
    'Bearer invalid',
    header(created).replace('_preview_', '_production_'),
    header(created).replace(tenantId, foreignTenantId),
    `${header(created).slice(0, -1)}${created.token.at(-1) === 'a' ? 'b' : 'a'}`,
  ])
    await expectCode(
      () => service.invoke(invalid, solution.id, body, 'invalid_auth'),
      'APP_KEY_INVALID'
    );
  clock += 31 * 86_400_000;
  await expectCode(
    () => service.invoke(header(created), solution.id, body, 'expired_auth'),
    'APP_KEY_INVALID'
  );
  await expectCode(
    () => service.readInvocation(header(created), solution.id, result.invocation.id),
    'APP_KEY_INVALID'
  );
  clock -= 31 * 86_400_000;
  await admin.query("UPDATE orqaly.tenants SET status='suspended' WHERE id=$1", [tenantId]);
  await expectCode(
    () => service.invoke(header(created), solution.id, body, 'suspended_auth'),
    'APP_KEY_INVALID'
  );
  await admin.query("UPDATE orqaly.tenants SET status='active' WHERE id=$1", [tenantId]);
  await admin.query(
    "UPDATE orqaly.customer_solutions SET status='paused' WHERE tenant_id=$1 AND id=$2",
    [tenantId, solution.id]
  );
  await expectCode(
    () => service.invoke(header(created), solution.id, body, 'paused_auth'),
    'SOLUTION_NOT_ACTIVE'
  );
  await expectCode(
    () => service.invoke(header(created), solution.id, body, 'invoke_original'),
    'SOLUTION_NOT_ACTIVE'
  );
  await admin.query(
    "UPDATE orqaly.customer_solutions SET status='active' WHERE tenant_id=$1 AND id=$2",
    [tenantId, solution.id]
  );
  assert.equal(await countInvocations(solution.id), 1);
  assert.deepEqual(await usage(solution.id), beforeReplay);

  check('concurrent_inflight_claim_replay_and_revocation_without_open_network_transaction');
  let entered;
  let release;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  hold = {
    entered,
    release: new Promise((resolve) => {
      release = resolve;
    }),
  };
  const pending = service.invoke(header(created), solution.id, body, 'held_invocation');
  await Promise.race([
    enteredPromise,
    pending.then(() => {
      throw new Error('fixture_finished_before_inflight_gate');
    }),
  ]);
  try {
    const inFlightReplay = await service.invoke(
      header(created),
      solution.id,
      body,
      'held_invocation'
    );
    assert.equal(inFlightReplay.replayed, true);
    assert.equal(inFlightReplay.invocation.status, 'running');
    await expectCode(
      () => service.invoke(header(otherKey), solution.id, body, 'competing_key'),
      'SOLUTION_BUSY'
    );
    await expectCode(
      () => service.revoke(auth, solution.id, created.key.id, 0),
      'APP_KEY_VERSION_CONFLICT'
    );
    const revoked = await service.revoke(auth, solution.id, created.key.id, created.key.rowVersion);
    assert.equal(revoked.key.status, 'revoked');
    await expectCode(
      () => service.invoke(header(created), solution.id, body, 'after_revoke'),
      'APP_KEY_INVALID'
    );
    await expectCode(
      () => service.readInvocation(header(created), solution.id, result.invocation.id),
      'APP_KEY_INVALID'
    );
  } finally {
    hold = undefined;
    release();
  }
  assert.equal((await pending).invocation.status, 'succeeded');
  assert.equal(await countInvocations(solution.id), 2);
  assert.equal((await usage(solution.id)).minute_count, 2);

  check('database_one_way_revocation_monotonic_usage_and_table_owner_guard');
  for (const assignment of [
    'revoked_at=NULL',
    "last_used_at=last_used_at-interval '1 second'",
    'row_version=row_version+1',
  ])
    await expectCode(
      () =>
        tx(tenantId, (client) =>
          client.query(`UPDATE orqaly.solution_application_keys SET ${assignment} WHERE id=$1`, [
            created.key.id,
          ])
        ),
      '55000'
    );
  for (const assignment of [
    "label=label||'changed'",
    "token_hash=repeat('0',64)",
    "expires_at=expires_at+interval '1 second'",
  ])
    await expectCode(
      () =>
        admin.query(
          `UPDATE orqaly.solution_application_keys SET ${assignment} WHERE tenant_id=$1 AND id=$2`,
          [tenantId, created.key.id]
        ),
      '55000'
    );

  check('active_release_change_invalidates_existing_key_without_mutating_release');
  const released = await fixtureSolution();
  const oldReleaseKey = await create(released, 'release_key_old');
  const revisionId = randomUUID();
  const revisedSpec = {
    ...spec,
    fields: spec.fields.map((field) =>
      field.source === 'name' ? { ...field, transform: 'uppercase' } : field
    ),
  };
  const revised = compileSolutionWorkflow({ id: revisionId, spec: revisedSpec });
  await admin.query(
    `INSERT INTO orqaly.solution_revisions
     (tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,
      workflow,workflow_hash,spec,status,review,environment_id,approved_workflow_hash,approved_at,deployment,tested_at)
     SELECT tenant_id,id,$3,owner_user_id,2,1,workflow,spec,$4,$5,$6,'active',
       '{"valid":true}'::jsonb,environment_id,$5,clock_timestamp(),$7,clock_timestamp()
     FROM orqaly.customer_solutions WHERE tenant_id=$1 AND id=$2`,
    [
      tenantId,
      released.id,
      revisionId,
      revised.workflow,
      revised.workflowHash,
      revisedSpec,
      {
        workflowId: `fixture${revisionId.replaceAll('-', '')}`,
        versionId: randomUUID(),
        workflowHash: revised.workflowHash,
        verifiedAt: new Date(clock).toISOString(),
      },
    ]
  );
  await admin.query(
    'UPDATE orqaly.customer_solutions SET active_revision_id=$3 WHERE tenant_id=$1 AND id=$2',
    [tenantId, released.id, revisionId]
  );
  assert.equal((await service.list(auth, released.id)).keys[0].status, 'release_changed');
  await expectCode(
    () => service.invoke(header(oldReleaseKey), released.id, body, 'changed_release'),
    'APP_KEY_RELEASE_CHANGED'
  );
  await expectCode(
    () => service.readInvocation(header(oldReleaseKey), released.id, randomUUID()),
    'APP_KEY_RELEASE_CHANGED'
  );
  assert.equal(await countInvocations(released.id), 0);

  async function seededQuota(target, minuteCount, dayCount) {
    await admin.query(
      `INSERT INTO orqaly.solution_application_usage(tenant_id,solution_id,minute_start,minute_count,day_start,day_count)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,solution_id) DO UPDATE SET
       minute_start=EXCLUDED.minute_start,minute_count=EXCLUDED.minute_count,
       day_start=EXCLUDED.day_start,day_count=EXCLUDED.day_count`,
      [
        tenantId,
        target.id,
        new Date(Math.floor(clock / 60_000) * 60_000),
        minuteCount,
        new Date(Math.floor(clock / 86_400_000) * 86_400_000),
        dayCount,
      ]
    );
  }
  for (const period of ['minute', 'day']) {
    check(`concurrent_${period}_quota_shared_across_keys_and_rollback`);
    const target = await fixtureSolution();
    const keys = await Promise.all([
      create(target, `quota_${period}_a`),
      create(target, `quota_${period}_b`),
    ]);
    await seededQuota(target, period === 'minute' ? 59 : 0, period === 'day' ? 999 : 0);
    const outcomes = await Promise.allSettled(
      keys.map((key, n) => service.invoke(header(key), target.id, body, `quota_race_${n}`))
    );
    assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
    assert(
      ['APP_KEY_RATE_LIMITED', 'SOLUTION_BUSY'].includes(
        outcomes.find((item) => item.status === 'rejected').reason.code
      )
    );
    assert.equal(await countInvocations(target.id), 1);
    const atLimit = await usage(target.id);
    assert.equal(atLimit[`${period}_count`], period === 'minute' ? 60 : 1000);
    await expectCode(
      () => service.invoke(header(keys[1]), target.id, body, 'after_limit'),
      'APP_KEY_RATE_LIMITED'
    );
    assert.deepEqual(await usage(target.id), atLimit);
    assert.equal(await countInvocations(target.id), 1);
    clock += period === 'minute' ? 60_000 : 86_400_000;
    await service.invoke(header(keys[1]), target.id, body, 'after_window');
    assert.equal((await usage(target.id))[`${period}_count`], 1);
    assert.equal(await countInvocations(target.id), 2);
  }
  check('database_quota_bounds_and_append_only_actor_columns');
  await expectCode(
    () =>
      tx(tenantId, (client) =>
        client.query(
          'UPDATE orqaly.solution_application_usage SET minute_count=61 WHERE solution_id=$1',
          [solution.id]
        )
      ),
    '23514'
  );
  await expectCode(
    () =>
      tx(tenantId, (client) =>
        client.query(
          'UPDATE orqaly.solution_application_usage SET day_count=1001 WHERE solution_id=$1',
          [solution.id]
        )
      ),
    '23514'
  );
  await expectCode(
    () =>
      tx(tenantId, (client) =>
        client.query('DELETE FROM orqaly.solution_application_usage WHERE solution_id=$1', [
          solution.id,
        ])
      ),
    '42501'
  );
  check('abandoned_running_claim_does_not_age_into_new_effect_authority');
  await admin.query(
    `INSERT INTO orqaly.solution_invocations
     (tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,status,
      revision_id,application_key_id,application_key_label,created_at)
     SELECT tenant_id,solution_id,$3,owner_user_id,mode,'abandoned_fixture',request_hash,workflow_hash,input,
      'running',revision_id,application_key_id,application_key_label,'2000-01-01T00:00:00Z'
     FROM orqaly.solution_invocations WHERE tenant_id=$1 AND id=$2`,
    [tenantId, result.invocation.id, randomUUID()]
  );
  const beforeAbandoned = runtimeCalls;
  await expectCode(
    () => service.invoke(header(otherKey), solution.id, body, 'abandoned_blocked'),
    'SOLUTION_BUSY'
  );
  assert.equal(runtimeCalls, beforeAbandoned);
  assert.equal(await countInvocations(solution.id), 3);
  process.stdout.write(
    `${JSON.stringify({ verified: true, boundary: 'real_local_PostgreSQL_security_with_runtime_fixture_not_n8n', postgresMajor, serverVersion, migration014Sha256, checks, rawKeysLogged: false, cloudCalls: false })}\n`
  );
} catch (error) {
  const code = /^[A-Z0-9_]+$/.test(String(error.code || '')) ? error.code : 'CHECK_FAILED';
  const location =
    error.stack?.match(/solution-app-keys-postgres\.mjs:(\d+):(\d+)/)?.[0] ?? 'unknown';
  process.stderr.write(
    `solution_app_keys_postgres_failed phase=${phase} code=${code} location=${location}\n`
  );
  process.exitCode = 1;
} finally {
  await repository?.close().catch(() => {});
  for (const { client } of directClients) await client.end().catch(() => {});
  await admin?.end().catch(() => {});
  if (started) {
    try {
      docker(['rm', '--force', containerName]);
    } catch {
      process.stderr.write('owned_local_postgres_cleanup_failed\n');
      process.exitCode = 1;
    }
  }
}
