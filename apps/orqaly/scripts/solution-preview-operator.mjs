// Bounded operator tooling, not a public API provisioner. All cloud targets are
// fixed to the single preview environment explicitly approved on 2026-09-05.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { bootstrapSolutionOwner } from '../infra/n8n/bootstrap-solution-owner.mjs';
import { readPreviewSolutionAssignments } from './solution-preview-scope.mjs';

const project = 'axwise-v2-preview-001';
const region = 'europe-west4';
const sql = `${project}:${region}:orqaly-v2-preview-001-pg`;
const service = 'orqaly-solution-n8n-preview';
const account = `${service}@${project}.iam.gserviceaccount.com`;
const apiAccount = `orqaly-v2-api-preview@${project}.iam.gserviceaccount.com`;
const database = 'orqaly_solution_n8n_preview_001';
const databaseRole = 'orqaly_solution_n8n_preview_001_login';
const secretPrefix = 'orqaly-solution-preview-001';
const image = `europe-west4-docker.pkg.dev/${project}/workflow-v2-preview/n8n@sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2`;
const origin = `https://${service}-161074549006.${region}.run.app`;
const mode = process.argv[2];
if (
  ![
    'inspect',
    'provision',
    'bootstrap',
    'migrate',
    'migrate-revisions',
    'migrate-builds',
    'configure-native',
  ].includes(mode)
)
  throw new Error('explicit_operator_mode_required');
function cloud(args, input) {
  return execFileSync('gcloud', [...args, `--project=${project}`], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
}
function json(args) {
  return JSON.parse(cloud([...args, '--format=json']));
}
function secret(name, version = '1') {
  return cloud(['secrets', 'versions', 'access', version, `--secret=${name}`]);
}
function latestEnabledVersion(name) {
  const enabled = json(['secrets', 'versions', 'list', name])
    .filter((value) => value.state === 'ENABLED')
    .sort((a, b) => Number(b.name.split('/').at(-1)) - Number(a.name.split('/').at(-1)));
  const version = enabled[0]?.name.split('/').at(-1);
  if (!version || !/^[1-9][0-9]*$/.test(version))
    throw new Error('required_existing_secret_has_no_enabled_version');
  return version;
}
function ensureSecret(name, valueFactory) {
  const found = json(['secrets', 'list', `--filter=name:${name}`]).filter((value) =>
    value.name.endsWith(`/${name}`)
  );
  if (!found.length)
    cloud(['secrets', 'create', name, '--replication-policy=automatic', '--quiet']);
  const versions = json(['secrets', 'versions', 'list', name]).filter(
    (value) => value.state === 'ENABLED'
  );
  if (versions.length)
    return versions
      .sort((a, b) => Number(b.name.split('/').at(-1)) - Number(a.name.split('/').at(-1)))[0]
      .name.split('/')
      .at(-1);
  const version = JSON.parse(
    cloud(['secrets', 'versions', 'add', name, '--data-file=-', '--format=json'], valueFactory())
  );
  return version.name.split('/').at(-1);
}
function grantSecret(name, identity) {
  cloud([
    'secrets',
    'add-iam-policy-binding',
    name,
    `--member=serviceAccount:${identity}`,
    '--role=roles/secretmanager.secretAccessor',
    '--quiet',
  ]);
}
let proxy;
let client;
async function connect() {
  const password = secret('orqaly-v2-preview-001-db-admin-password');
  proxy = spawn('cloud-sql-proxy', [sql, '--gcloud-auth', '--address=127.0.0.1', '--port=19479'], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (proxy.exitCode !== null) throw new Error('preview_sql_proxy_failed');
    const candidate = new pg.Client({
      host: '127.0.0.1',
      port: 19479,
      user: 'postgres',
      password,
      database: 'orqaly_v2_preview_001',
      connectionTimeoutMillis: 1000,
    });
    try {
      await candidate.connect();
      client = candidate;
      return;
    } catch {
      await candidate.end();
      await delay(500);
    }
  }
  throw new Error('preview_database_connection_failed');
}
async function scope() {
  const result = await client.query(
    `SELECT tenant_id,owner_user_id FROM orqaly.workflow_runs WHERE id=$1`,
    ['837fdcaf-3536-5901-b044-94faf03d7a7b']
  );
  if (result.rowCount !== 1) throw new Error('preview_customer_scope_ambiguous');
  return result.rows[0];
}
try {
  await connect();
  const customer = await scope();
  if (mode === 'inspect') {
    const ledger = await client.query(
      `SELECT migration_number,sha256 FROM workflow_v2_release.applied_additive_migrations WHERE component='orqaly' ORDER BY migration_number`
    );
    const existing = await client.query(
      'SELECT datname,datacl FROM pg_database WHERE datname LIKE $1',
      ['orqaly%']
    );
    console.log(
      JSON.stringify(
        {
          customer,
          ledger: ledger.rows,
          databases: existing.rows,
          planned: { service, database, databaseRole, account },
        },
        null,
        2
      )
    );
  }
  if (mode === 'provision') {
    const versions = {};
    for (const kind of ['db-password', 'encryption-key', 'owner-password']) {
      versions[kind] = ensureSecret(
        `${secretPrefix}-${kind}`,
        () => `Aa1${randomBytes(kind === 'owner-password' ? 24 : 32).toString('hex')}`
      );
    }
    const dbPassword = secret(`${secretPrefix}-db-password`, versions['db-password']);
    if (!/^Aa1[a-f0-9]{64}$/.test(dbPassword))
      throw new Error('unexpected_generated_credential_format');
    const roles = await client.query('SELECT * FROM pg_roles WHERE rolname=$1', [databaseRole]);
    if (!roles.rowCount)
      await client.query(
        `CREATE ROLE ${databaseRole} LOGIN PASSWORD '${dbPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
    else if (
      roles.rows[0].rolsuper ||
      roles.rows[0].rolcreatedb ||
      roles.rows[0].rolcreaterole ||
      roles.rows[0].rolbypassrls ||
      roles.rows[0].rolinherit
    )
      throw new Error('existing_solution_role_is_privileged');
    const databases = await client.query(
      'SELECT d.datname,r.rolname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',
      [database]
    );
    if (!databases.rowCount) {
      const memberships = await client.query(
        `SELECT pg_has_role('postgres',$1,'MEMBER') AS member`,
        [databaseRole]
      );
      if (memberships.rows[0].member) throw new Error('unexpected_standing_admin_membership');
      await client.query(`GRANT ${databaseRole} TO postgres`);
      try {
        await client.query(`CREATE DATABASE ${database} OWNER ${databaseRole}`);
      } finally {
        await client.query(`REVOKE ${databaseRole} FROM postgres`);
      }
    } else if (databases.rows[0].rolname !== databaseRole)
      throw new Error('solution_database_owner_mismatch');
    // Revoking public access to this new database does not alter existing DB ACLs.
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    const forbidden = await client.query(
      `SELECT datname FROM pg_database WHERE datname LIKE 'orqaly%'
      AND datname<>$1 AND has_database_privilege($2,datname,'CONNECT')`,
      [database, databaseRole]
    );
    if (forbidden.rowCount)
      throw new Error('solution_role_can_connect_to_another_product_database');
    const accounts = json(['iam', 'service-accounts', 'list', `--filter=email:${account}`]);
    if (!accounts.some((value) => value.email === account))
      cloud([
        'iam',
        'service-accounts',
        'create',
        service,
        '--display-name=Isolated customer n8n preview',
      ]);
    cloud([
      'projects',
      'add-iam-policy-binding',
      project,
      `--member=serviceAccount:${account}`,
      '--role=roles/cloudsql.client',
      '--condition=None',
      '--quiet',
    ]);
    for (const kind of ['db-password', 'encryption-key'])
      grantSecret(`${secretPrefix}-${kind}`, account);
    const values = {
      DB_TYPE: 'postgresdb',
      DB_POSTGRESDB_HOST: `/cloudsql/${sql}`,
      DB_POSTGRESDB_PORT: '5432',
      DB_POSTGRESDB_DATABASE: database,
      DB_POSTGRESDB_USER: databaseRole,
      N8N_LISTEN_ADDRESS: '0.0.0.0',
      N8N_PORT: '8080',
      N8N_PROTOCOL: 'https',
      N8N_HOST: new URL(origin).hostname,
      WEBHOOK_URL: `${origin}/`,
      N8N_EDITOR_BASE_URL: origin,
      N8N_PROXY_HOPS: '1',
      TZ: 'UTC',
      GENERIC_TIMEZONE: 'UTC',
      N8N_DISABLE_UI: 'true',
      N8N_PUBLIC_API_DISABLED: 'false',
      N8N_PUBLIC_API_SWAGGERUI_DISABLED: 'true',
      N8N_SECURE_COOKIE: 'true',
      N8N_SAMESITE_COOKIE: 'strict',
      N8N_DIAGNOSTICS_ENABLED: 'false',
      N8N_TEMPLATES_ENABLED: 'false',
      N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
      N8N_PERSONALIZATION_ENABLED: 'false',
      N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true',
      N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES: 'true',
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
      N8N_SSRF_PROTECTION_ENABLED: 'true',
      N8N_RUNNERS_ENABLED: 'false',
      NODES_INCLUDE: JSON.stringify([
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.set',
        'n8n-nodes-base.respondToWebhook',
      ]),
      EXECUTIONS_MODE: 'regular',
      EXECUTIONS_TIMEOUT: '30',
      EXECUTIONS_TIMEOUT_MAX: '30',
      N8N_PAYLOAD_SIZE_MAX: '1',
      EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'none',
      EXECUTIONS_DATA_SAVE_ON_ERROR: 'none',
      EXECUTIONS_DATA_SAVE_ON_PROGRESS: 'false',
      EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS: 'false',
      EXECUTIONS_DATA_PRUNE: 'true',
      EXECUTIONS_DATA_MAX_AGE: '24',
      EXECUTIONS_DATA_PRUNE_MAX_COUNT: '1000',
      N8N_CONCURRENCY_PRODUCTION_LIMIT: '1',
      N8N_LOG_LEVEL: 'warn',
    };
    const existingService = json([
      'run',
      'services',
      'list',
      `--region=${region}`,
      `--filter=metadata.name:${service}`,
    ]);
    if (existingService.length)
      throw new Error('solution_service_already_exists_use_reviewed_update');
    cloud([
      'run',
      'deploy',
      service,
      `--region=${region}`,
      `--image=${image}`,
      `--service-account=${account}`,
      '--no-allow-unauthenticated',
      '--ingress=all',
      '--execution-environment=gen2',
      '--port=8080',
      '--cpu=1',
      '--memory=1Gi',
      '--min=0',
      '--max=1',
      '--max-instances=1',
      '--concurrency=1',
      '--timeout=90s',
      '--cpu-throttling',
      `--add-cloudsql-instances=${sql}`,
      '--network=workflow-v2-preview',
      '--subnet=workflow-v2-preview-ew4',
      '--vpc-egress=all-traffic',
      `--set-env-vars=^|^${Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join('|')}`,
      `--set-secrets=DB_POSTGRESDB_PASSWORD=${secretPrefix}-db-password:${versions['db-password']},N8N_ENCRYPTION_KEY=${secretPrefix}-encryption-key:${versions['encryption-key']}`,
      '--startup-probe=httpGet.path=/healthz/readiness,httpGet.port=8080,periodSeconds=5,timeoutSeconds=4,failureThreshold=24',
      '--liveness-probe=httpGet.path=/healthz,httpGet.port=8080,periodSeconds=30,timeoutSeconds=4,failureThreshold=3',
      '--quiet',
    ]);
    cloud([
      'run',
      'services',
      'add-iam-policy-binding',
      service,
      `--region=${region}`,
      `--member=serviceAccount:${apiAccount}`,
      '--role=roles/run.invoker',
      '--quiet',
    ]);
    console.log(
      JSON.stringify({
        provisioned: true,
        service,
        database,
        account,
        origin,
        maxInstances: 1,
        publicInvoker: false,
        versions,
      })
    );
  }
  if (mode === 'bootstrap') {
    // gcloud's authenticated proxy must have been explicitly started on loopback.
    const localOrigin = 'http://127.0.0.1:19480';
    const secretName = `${secretPrefix}-environments`;
    const containers = json(['secrets', 'list', `--filter=name:${secretName}`]);
    const enabled = containers.length
      ? json(['secrets', 'versions', 'list', secretName]).filter((item) => item.state === 'ENABLED')
      : [];
    if (enabled.length) {
      const version = enabled.at(-1).name.split('/').at(-1);
      const existing = JSON.parse(secret(secretName, version));
      if (
        existing.length !== 1 ||
        existing[0].tenantId !== customer.tenant_id ||
        existing[0].userId !== customer.owner_user_id ||
        existing[0].origin !== origin
      )
        throw new Error('existing_environment_binding_scope_mismatch');
      console.log(JSON.stringify({ alreadyBootstrapped: true, secretName, version }));
    } else {
      const ownerSecret = `${secretPrefix}-owner-password`;
      const ownerVersions = json(['secrets', 'versions', 'list', ownerSecret]).filter(
        (item) => item.state === 'ENABLED'
      );
      const ownerVersion = ownerVersions
        .sort((a, b) => Number(b.name.split('/').at(-1)) - Number(a.name.split('/').at(-1)))[0]
        .name.split('/')
        .at(-1);
      let ownerPassword = secret(ownerSecret, ownerVersion);
      // The first generated preview value exceeded n8n's validated 64-character
      // maximum and was never accepted. Add a valid version, without logging it.
      if (ownerPassword.length > 64) {
        ownerPassword = `Aa1${randomBytes(24).toString('hex')}`;
        cloud(
          ['secrets', 'versions', 'add', ownerSecret, '--data-file=-', '--format=json'],
          ownerPassword
        );
      }
      const apiKey = await bootstrapSolutionOwner({
        origin: localOrigin,
        email: 'operator@orqaly.invalid',
        password: ownerPassword,
      });
      const binding = {
        id: 'orqaly-customer-webhook-preview-001',
        tenantId: customer.tenant_id,
        userId: customer.owner_user_id,
        name: 'Your isolated n8n preview',
        region,
        origin,
        apiKey,
        useIdToken: true,
      };
      const version = ensureSecret(secretName, () => JSON.stringify([binding]));
      grantSecret(secretName, apiAccount);
      console.log(
        JSON.stringify({
          bootstrapped: true,
          secretName,
          version,
          environmentId: binding.id,
          managementKeyLifetimeDays: 30,
        })
      );
    }
  }
  if (mode === 'migrate') {
    const path = 'database/workflow-v2/migrations/011_customer_solutions.sql';
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    const source = readFileSync(path, 'utf8');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (hash(execFileSync('git', ['show', `HEAD:${path}`])) !== hash(source))
      throw new Error('uncommitted_solution_migration');
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('orqaly-preview-additive-migration'))"
    );
    const prior = await client.query(
      `SELECT migration_number,sha256 FROM workflow_v2_release.applied_additive_migrations WHERE component='orqaly' AND migration_number IN (10,11)`
    );
    if (
      prior.rows.find((row) => row.migration_number === 10)?.sha256 !==
      hash(readFileSync('database/workflow-v2/migrations/010_committed_receipt_recovery.sql'))
    )
      throw new Error('baseline_010_mismatch');
    const existing = prior.rows.find((row) => row.migration_number === 11);
    if (existing && existing.sha256 !== hash(source)) throw new Error('solution_schema_drift');
    if (!existing) {
      await client.query(source.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
      await client.query(`ALTER TABLE workflow_v2_release.applied_additive_migrations DROP CONSTRAINT applied_additive_migrations_migration_number_check;
        ALTER TABLE workflow_v2_release.applied_additive_migrations ADD CONSTRAINT applied_additive_migrations_migration_number_check CHECK(migration_number BETWEEN 2 AND 11)`);
      await client.query(
        `INSERT INTO workflow_v2_release.applied_additive_migrations(component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit)
        VALUES('orqaly',11,$1,$2,$3,$3)`,
        [path, hash(source), commit]
      );
    }
    await client.query('COMMIT');
    console.log(
      JSON.stringify({ migration: 11, sha256: hash(source), commit, applied: !existing })
    );
  }
  if (mode === 'migrate-revisions') {
    const path = 'database/workflow-v2/migrations/012_solution_revisions.sql';
    const baselinePath = 'database/workflow-v2/migrations/011_customer_solutions.sql';
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    const source = readFileSync(path, 'utf8');
    const baseline = readFileSync(baselinePath);
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (
      hash(execFileSync('git', ['show', `HEAD:${path}`], { stdio: ['ignore', 'pipe', 'pipe'] })) !==
      hash(source)
    )
      throw new Error('uncommitted_solution_revision_migration');
    if (
      hash(
        execFileSync('git', ['show', `HEAD:${baselinePath}`], { stdio: ['ignore', 'pipe', 'pipe'] })
      ) !== hash(baseline)
    )
      throw new Error('uncommitted_solution_baseline_migration');
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('orqaly-preview-additive-migration'))"
    );
    const prior = await client.query(
      `SELECT migration_number,sha256 FROM workflow_v2_release.applied_additive_migrations
       WHERE component='orqaly' AND migration_number >= 11`
    );
    if (prior.rows.some((value) => value.migration_number > 12))
      throw new Error('newer_solution_migration_requires_reviewed_operator');
    if (prior.rows.find((value) => value.migration_number === 11)?.sha256 !== hash(baseline))
      throw new Error('baseline_011_mismatch');
    const existing = prior.rows.find((value) => value.migration_number === 12);
    if (existing && existing.sha256 !== hash(source))
      throw new Error('solution_revision_schema_drift');
    if (!existing) {
      await client.query(source.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
      await client.query(`ALTER TABLE workflow_v2_release.applied_additive_migrations
        DROP CONSTRAINT applied_additive_migrations_migration_number_check;
        ALTER TABLE workflow_v2_release.applied_additive_migrations
        ADD CONSTRAINT applied_additive_migrations_migration_number_check CHECK(migration_number BETWEEN 2 AND 12)`);
      await client.query(
        `INSERT INTO workflow_v2_release.applied_additive_migrations
          (component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit)
         VALUES('orqaly',12,$1,$2,$3,$3)`,
        [path, hash(source), commit]
      );
    }
    await client.query('COMMIT');
    console.log(
      JSON.stringify({ migration: 12, sha256: hash(source), commit, applied: !existing })
    );
  }
  if (mode === 'migrate-builds') {
    const path = 'database/workflow-v2/migrations/013_solution_build_requests.sql';
    const baselinePath = 'database/workflow-v2/migrations/012_solution_revisions.sql';
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    const source = readFileSync(path, 'utf8');
    const baseline = readFileSync(baselinePath);
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (
      hash(execFileSync('git', ['show', `HEAD:${path}`], { stdio: ['ignore', 'pipe', 'pipe'] })) !==
      hash(source)
    )
      throw new Error('uncommitted_solution_build_migration');
    if (
      hash(
        execFileSync('git', ['show', `HEAD:${baselinePath}`], { stdio: ['ignore', 'pipe', 'pipe'] })
      ) !== hash(baseline)
    )
      throw new Error('uncommitted_solution_revision_baseline');
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('orqaly-preview-additive-migration'))"
    );
    const prior = await client.query(
      `SELECT migration_number,sha256 FROM workflow_v2_release.applied_additive_migrations
       WHERE component='orqaly' AND migration_number>=12`
    );
    if (prior.rows.some((value) => value.migration_number > 13))
      throw new Error('newer_build_migration_requires_reviewed_operator');
    if (prior.rows.find((value) => value.migration_number === 12)?.sha256 !== hash(baseline))
      throw new Error('baseline_012_mismatch');
    const existing = prior.rows.find((value) => value.migration_number === 13);
    if (existing && existing.sha256 !== hash(source))
      throw new Error('solution_build_schema_drift');
    if (!existing) {
      // SQL013 is the sole application schema/privilege change. This wrapper
      // adds only the exact additive migration ledger entry and its bound.
      await client.query(source.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
      await client.query(`ALTER TABLE workflow_v2_release.applied_additive_migrations
        DROP CONSTRAINT applied_additive_migrations_migration_number_check;
        ALTER TABLE workflow_v2_release.applied_additive_migrations
        ADD CONSTRAINT applied_additive_migrations_migration_number_check CHECK(migration_number BETWEEN 2 AND 13)`);
      await client.query(
        `INSERT INTO workflow_v2_release.applied_additive_migrations
        (component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit)
        VALUES('orqaly',13,$1,$2,$3,$3)`,
        [path, hash(source), commit]
      );
    }
    await client.query('COMMIT');
    console.log(
      JSON.stringify({ migration: 13, sha256: hash(source), commit, applied: !existing })
    );
  }
  if (mode === 'configure-native') {
    // Reuse the current customer's executor and existing owner credential.
    // This mode creates no n8n user, runtime, database, or public service access.
    const environmentSecret = `${secretPrefix}-environments`;
    const environmentVersion = latestEnabledVersion(environmentSecret);
    let environments;
    try {
      environments = JSON.parse(secret(environmentSecret, environmentVersion));
    } catch {
      throw new Error('existing_environment_binding_invalid');
    }
    if (!Array.isArray(environments) || environments.length !== 1)
      throw new Error('existing_environment_binding_scope_mismatch');
    const environment = environments[0];
    if (
      environment.id !== 'orqaly-customer-webhook-preview-001' ||
      environment.tenantId !== customer.tenant_id ||
      environment.userId !== customer.owner_user_id ||
      environment.origin !== origin ||
      environment.useIdToken !== true
    )
      throw new Error('existing_environment_binding_scope_mismatch');
    // customer_solutions forces RLS and has a policy only for orqaly_api.
    // Check the assignment as the existing API login in a scoped read-only
    // transaction, not as the migration owner. No role grant or RLS bypass.
    const apiUrl = new URL(
      secret('orqaly-v2-preview-001-db-api-url', '2').replace('@/', '@localhost/')
    );
    apiUrl.hostname = '127.0.0.1';
    apiUrl.port = '19479';
    apiUrl.searchParams.delete('host');
    apiUrl.searchParams.delete('sslmode');
    const apiReader = new pg.Client({
      connectionString: apiUrl.href,
      connectionTimeoutMillis: 5000,
    });
    let assigned;
    try {
      await apiReader.connect();
      const rows = await readPreviewSolutionAssignments(apiReader, {
        tenantId: customer.tenant_id,
        ownerUserId: customer.owner_user_id,
        environmentId: environment.id,
      });
      assigned = { rowCount: rows.length, rows };
    } finally {
      await apiReader.end();
    }
    if (assigned.rowCount !== 1 || assigned.rows[0].id !== '2031decc-b21e-48b5-9bd5-3ed3d4dfd024')
      throw new Error('existing_environment_solution_assignment_mismatch');
    const ownerSecret = `${secretPrefix}-owner-password`;
    const ownerVersion = latestEnabledVersion(ownerSecret);
    const ownerPassword = secret(ownerSecret, ownerVersion);
    if (ownerPassword.length < 8 || ownerPassword.length > 64)
      throw new Error('existing_n8n_owner_credential_invalid');
    const binding = {
      environmentId: environment.id,
      origin: environment.origin,
      email: 'operator@orqaly.invalid',
      password: ownerPassword,
      useIdToken: true,
    };
    const bindingsName = `${secretPrefix}-native-bindings`;
    const bindingsVersion = ensureSecret(bindingsName, () => JSON.stringify([binding]));
    let existingBindings;
    try {
      existingBindings = JSON.parse(secret(bindingsName, bindingsVersion));
    } catch {
      throw new Error('existing_native_binding_invalid');
    }
    if (
      !Array.isArray(existingBindings) ||
      existingBindings.length !== 1 ||
      Object.keys(existingBindings[0]).sort().join(',') !== Object.keys(binding).sort().join(',') ||
      Object.entries(binding).some(([key, value]) => existingBindings[0][key] !== value)
    )
      throw new Error('existing_native_binding_mismatch');
    const signingName = `${secretPrefix}-native-signing-key`;
    const signingVersion = ensureSecret(signingName, () => randomBytes(32).toString('base64url'));
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret(signingName, signingVersion)))
      throw new Error('existing_native_signing_key_invalid');
    for (const name of [bindingsName, signingName]) {
      const policy = json(['secrets', 'get-iam-policy', name]);
      const accessors = (policy.bindings ?? []).filter(
        (value) => value.role === 'roles/secretmanager.secretAccessor'
      );
      if (
        accessors.some((value) =>
          (value.members ?? []).some((member) => member !== `serviceAccount:${apiAccount}`)
        )
      )
        throw new Error('native_secret_has_unexpected_accessor');
      grantSecret(name, apiAccount);
    }
    console.log(
      JSON.stringify({
        configured: true,
        environmentId: environment.id,
        solutionId: assigned.rows[0].id,
        existingEnvironment: { name: environmentSecret, version: environmentVersion },
        existingOwnerCredential: { name: ownerSecret, version: ownerVersion },
        secrets: {
          ORQALY_NATIVE_N8N_BINDINGS: { name: bindingsName, version: bindingsVersion },
          ORQALY_NATIVE_N8N_SIGNING_KEY: { name: signingName, version: signingVersion },
        },
        accessor: apiAccount,
        serviceUpdated: false,
      })
    );
  }
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    JSON.stringify({
      mode,
      code: /^[a-z][a-z0-9_]{1,100}$/.test(error.message ?? '')
        ? error.message
        : /^[A-Z0-9_]{2,100}$/.test(error.code ?? '')
          ? error.code
          : 'operator_failed',
      message: 'Inspect the bounded operator step; no credentials logged.',
    })
  );
  process.exitCode = 1;
} finally {
  await client?.end();
  proxy?.kill('SIGTERM');
}
