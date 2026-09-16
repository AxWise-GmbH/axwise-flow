// Exact, separately approved THIRD customer preview. No old service, database,
// runtime-binding version or Orqaly deployment is modified by this operator.
// All credentials stay in memory or Secret Manager; only metadata is printed.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createBoundedHttpPolicy } from '../server/workflow-v2/native-workflow-review.js';

export const SCOPE_003 = Object.freeze({
  project: 'axwise-v2-preview-001',
  region: 'europe-west4',
  service: 'orqaly-solution-n8n-preview-003',
  accountId: 'orqaly-solution-n8n-pv-003',
  database: 'orqaly_solution_n8n_preview_003',
  role: 'orqaly_solution_n8n_preview_003_login',
  environmentId: 'orqaly-customer-webhook-preview-003',
  prefix: 'orqaly-solution-preview-003',
  sourceSolutionId: '8b606adc-91ba-46e5-86da-ece609df9c7d',
  oldEnvironments: 'orqaly-solution-preview-001-002-environments',
  oldNative: 'orqaly-solution-preview-001-002-native-bindings',
  environments: 'orqaly-solution-preview-001-002-003-environments',
  native: 'orqaly-solution-preview-001-002-003-native-bindings',
  sqlPort: 19493,
  runPort: 19494,
});
const { project, region, service, accountId, database, role, environmentId, prefix } = SCOPE_003;
const account = `${accountId}@${project}.iam.gserviceaccount.com`;
const apiAccount = `orqaly-v2-api-preview@${project}.iam.gserviceaccount.com`;
const workerAccount = `orqaly-v2-worker-preview@${project}.iam.gserviceaccount.com`;
const instance = `${project}:${region}:orqaly-v2-preview-001-pg`;
const origin = `https://${service}-161074549006.${region}.run.app`;
const old = [
  { n: '001', service: 'orqaly-solution-n8n-preview' },
  { n: '002', service: 'orqaly-solution-n8n-preview-002' },
];
export const NATIVE_003_KEY_SCOPES = Object.freeze([
  'workflow:create',
  'workflow:read',
  'workflow:list',
  'workflow:delete',
  'workflow:activate',
  'workflow:deactivate',
  'execution:read',
  'execution:list',
  'credential:create',
  'credential:read',
  'credential:list',
  'credential:delete',
]);
const fail = (code) => {
  throw new Error(code);
};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const native003ScopeHash = () => digest([...NATIVE_003_KEY_SCOPES].sort());
// Cloud Run omits `value` when an explicitly configured literal is empty.
// Preserve that distinction from an absent variable or a secret reference.
export const literal003Environment = (entries) =>
  Object.fromEntries(
    entries
      .filter((entry) => !Object.hasOwn(entry, 'valueFrom'))
      .map((entry) => [entry.name, entry.value ?? ''])
  );
export function parse003Arguments(args) {
  if (!['inspect', 'provision', 'bootstrap'].includes(args[0]) || args.length > 2)
    fail('explicit_003_operator_mode_required');
  const image = args[1]?.replace(/^--image=/, '') ?? null;
  if (
    image &&
    !/^europe-west4-docker\.pkg\.dev\/axwise-v2-preview-001\/workflow-v2-preview\/n8n-native-preview-003@sha256:[a-f0-9]{64}$/.test(
      image
    )
  )
    fail('exact_003_image_digest_required');
  if (args[0] !== 'inspect' && !image) fail('exact_003_image_digest_required');
  return { mode: args[0], image };
}
export function validate003Source(environments, native) {
  if (
    !Array.isArray(environments) ||
    !Array.isArray(native) ||
    environments.length !== 2 ||
    native.length !== 2
  )
    fail('existing_binding_count_mismatch');
  for (const item of old) {
    const id = `orqaly-customer-webhook-preview-${item.n}`;
    const binding = environments.find((entry) => entry.id === id);
    const editor = native.find((entry) => entry.environmentId === id);
    const expectedOrigin = `https://${item.service}-161074549006.${region}.run.app`;
    if (
      !binding ||
      !editor ||
      binding.origin !== expectedOrigin ||
      editor.origin !== expectedOrigin ||
      binding.useIdToken !== true ||
      editor.useIdToken !== true ||
      !binding.apiKey ||
      !editor.password ||
      editor.email !== 'operator@orqaly.invalid' ||
      !/^[a-f0-9-]{36}$/.test(binding.tenantId ?? '') ||
      !/^user_[A-Za-z0-9]+$/.test(binding.userId ?? '')
    )
      fail('existing_owner_binding_mismatch');
  }
  if (
    environments[0].tenantId !== environments[1].tenantId ||
    environments[0].userId !== environments[1].userId
  )
    fail('existing_binding_owner_mismatch');
  return { tenantId: environments[0].tenantId, userId: environments[0].userId };
}
let lastCloudCommand = null;
const cloud = (args, input) => {
  lastCloudCommand = args
    .slice(0, 3)
    .filter((v) => /^[a-zA-Z0-9_-]+$/.test(v))
    .join(' ');
  return execFileSync('gcloud', [...args, `--project=${project}`], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
};
const json = (args) => JSON.parse(cloud([...args, '--format=json']));
const secret = (name, version = '1') =>
  cloud(['secrets', 'versions', 'access', version, `--secret=${name}`]);
const existsSecret = (name) =>
  json(['secrets', 'list', `--filter=name:${name}`]).some((s) => s.name.endsWith(`/${name}`));
const describe = (name) => json(['run', 'services', 'describe', name, `--region=${region}`]);
const policy = (name) => json(['run', 'services', 'get-iam-policy', name, `--region=${region}`]);
const serviceExists = () =>
  json(['run', 'services', 'list', `--region=${region}`, `--filter=metadata.name:${service}`]).some(
    (s) => s.metadata.name === service
  );
function privateInvokers(value, allowed, requireAll = true) {
  const actual = (value.bindings ?? [])
    .filter((b) => b.role === 'roles/run.invoker')
    .flatMap((b) => b.members ?? []);
  const expected = allowed.map((a) => `serviceAccount:${a}`);
  if (
    actual.some((member) => !expected.includes(member)) ||
    (requireAll && expected.some((member) => !actual.includes(member)))
  )
    fail('unexpected_runtime_invoker');
  return actual;
}
function ensureAccessors(name, identities) {
  if (!identities) return;
  const access = json(['secrets', 'get-iam-policy', name]);
  const actual = (access.bindings ?? [])
    .filter((b) => b.role === 'roles/secretmanager.secretAccessor')
    .flatMap((b) => b.members ?? []);
  const expected = identities.map((a) => `serviceAccount:${a}`);
  if (actual.some((member) => !expected.includes(member))) fail('unexpected_003_secret_accessor');
  for (const member of expected)
    if (!actual.includes(member))
      cloud([
        'secrets',
        'add-iam-policy-binding',
        name,
        `--member=${member}`,
        '--role=roles/secretmanager.secretAccessor',
        '--quiet',
      ]);
}
function ensureSecret(name, factory, identities) {
  if (!existsSecret(name))
    cloud(['secrets', 'create', name, '--replication-policy=automatic', '--quiet']);
  const versions = json(['secrets', 'versions', 'list', name]);
  if (!versions.length)
    cloud(['secrets', 'versions', 'add', name, '--data-file=-', '--quiet'], factory());
  else if (
    versions.length !== 1 ||
    !versions[0].name.endsWith('/1') ||
    versions[0].state !== 'ENABLED'
  )
    fail('unexpected_003_secret_versions');
  ensureAccessors(name, identities);
}
function publishSecondVersion(name, previous, value, identities) {
  if (![`${prefix}-environment`, SCOPE_003.environments].includes(name))
    fail('scope_upgrade_secret_denied');
  const versions = json(['secrets', 'versions', 'list', name]);
  if (
    ![1, 2].includes(versions.length) ||
    versions.some((v) => v.state !== 'ENABLED') ||
    versions.some((v) => !['1', '2'].includes(v.name.split('/').at(-1)))
  )
    fail('scope_upgrade_versions_mismatch');
  if (digest(JSON.parse(secret(name))) !== digest(previous)) fail('scope_upgrade_baseline_changed');
  ensureAccessors(name, identities);
  if (versions.length === 1)
    cloud(['secrets', 'versions', 'add', name, '--data-file=-', '--quiet'], JSON.stringify(value));
  if (digest(JSON.parse(secret(name, '2'))) !== digest(value)) fail('scope_upgrade_value_mismatch');
}
export function validate003ScopeBundle(bundle, binding) {
  if (
    bundle?.schemaVersion !== 1 ||
    bundle.scopeHash !== native003ScopeHash() ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(bundle.keyId ?? '') ||
    typeof bundle.binding?.apiKey !== 'string' ||
    bundle.binding.apiKey.length < 16 ||
    digest({ ...bundle.binding, apiKey: binding.apiKey }) !== digest(binding)
  )
    fail('native_scope_bundle_mismatch');
  return bundle.binding;
}
const sameSecret = (name, value, identities) => {
  ensureSecret(name, () => JSON.stringify(value), identities);
  if (digest(JSON.parse(secret(name))) !== digest(value))
    fail('existing_003_secret_binding_mismatch');
};
async function freePort(port) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
}
async function freshLogin(databaseName, user, password, allowed) {
  const c = new pg.Client({
    host: '127.0.0.1',
    port: SCOPE_003.sqlPort,
    database: databaseName,
    user,
    password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  let connected = false;
  try {
    await c.connect();
    connected = true;
    if (!allowed) fail('cross_database_connection_not_denied');
    const value = (
      await c.query('SELECT current_database() AS database,current_user AS user,1 AS ok')
    ).rows[0];
    if (value.database !== databaseName || value.user !== user || value.ok !== 1)
      fail('database_login_scope_mismatch');
  } catch (error) {
    if (allowed || connected || error.code !== '42501') fail('database_isolation_check_failed');
  } finally {
    await c.end();
  }
}
async function isolateDatabase(password) {
  const owner = new pg.Client({
    host: '127.0.0.1',
    port: SCOPE_003.sqlPort,
    database,
    user: role,
    password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  let transaction = false,
    warning = false;
  owner.on('notice', (n) => {
    if (n.severity === 'WARNING') warning = true;
  });
  try {
    await owner.connect();
    await owner.query('BEGIN');
    transaction = true;
    const scope = (
      await owner.query(`SELECT current_database() AS database,current_user AS user,
      pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()`)
    ).rows[0];
    if (scope.database !== database || scope.user !== role || scope.owner !== role)
      fail('database_owner_scope_mismatch');
    const unexpected =
      await owner.query(`SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
      WHERE d.datname=current_database() AND (a.grantor<>d.datdba OR (a.grantee<>0 AND a.grantee<>d.datdba) OR a.is_grantable)`);
    if (unexpected.rowCount) fail('unexpected_003_database_acl');
    await owner.query('REVOKE ALL ON DATABASE orqaly_solution_n8n_preview_003 FROM PUBLIC');
    const publicAcl =
      await owner.query(`SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
      WHERE d.datname=current_database() AND a.grantee=0`);
    if (warning || publicAcl.rowCount) fail('database_acl_postcondition_failed');
    await owner.query('COMMIT');
    transaction = false;
  } finally {
    if (transaction) await owner.query('ROLLBACK').catch(() => {});
    await owner.end();
  }
  await freshLogin(database, role, password, true);
  for (const item of old) {
    const oldDatabase = `orqaly_solution_n8n_preview_${item.n}`,
      oldRole = `${oldDatabase}_login`;
    const oldPassword = secret(`orqaly-solution-preview-${item.n}-db-password`);
    await freshLogin(oldDatabase, oldRole, oldPassword, true);
    await freshLogin(oldDatabase, role, password, false);
    await freshLogin(database, oldRole, oldPassword, false);
  }
}
async function bootstrapOwner({ allowSetup = false } = {}) {
  const password = secret(`${prefix}-owner-password`);
  if (!/^Aa1[a-f0-9]{48}$/.test(password)) fail('owner_password_format_mismatch');
  const base = `http://127.0.0.1:${SCOPE_003.runPort}`;
  const call = async (path, body, cookie, method = 'POST') => {
    const response = await fetch(`${base}/rest/${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      ok: response.ok,
      body: await response.json(),
      cookie: response.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; '),
    };
  };
  let session = await call('login', { emailOrLdapLoginId: 'operator@orqaly.invalid', password });
  if (!session.ok && allowSetup)
    session = await call('owner/setup', {
      email: 'operator@orqaly.invalid',
      password,
      firstName: 'Orqaly',
      lastName: 'Isolated Preview',
    });
  if (!session.ok || !session.cookie) fail('native_owner_bootstrap_failed');
  const typesResponse = await fetch(`${base}/types/nodes.json`, {
    headers: { cookie: session.cookie },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!typesResponse.ok) fail('native_custom_type_metadata_unavailable');
  const types = await typesResponse.json();
  const custom = (Array.isArray(types) ? types : []).filter(
    (entry) => entry.name === 'CUSTOM.boundedHttp'
  );
  if (
    custom.length !== 1 ||
    !(Array.isArray(custom[0].version) ? custom[0].version : [custom[0].version]).includes(1)
  )
    fail('native_custom_type_not_loaded');
  const label = `Orqaly003 scopes ${native003ScopeHash().slice(0, 16)}`;
  const list = async () => {
    const result = await call(
      `api-keys?ownership=mine&label=${encodeURIComponent(label)}&take=100&skip=0`,
      undefined,
      session.cookie,
      'GET'
    );
    if (
      !result.ok ||
      !Array.isArray(result.body?.data?.items) ||
      result.body.data.counts?.mine > 100
    )
      fail('native_key_metadata_unavailable');
    return result.body.data.items.filter((item) => item.label === label);
  };
  const verify = async (record) => {
    const items = await list();
    if (
      items.length !== 1 ||
      items[0].id !== record.keyId ||
      digest([...items[0].scopes].sort()) !== native003ScopeHash() ||
      items[0].owner?.email !== 'operator@orqaly.invalid' ||
      !Number.isSafeInteger(items[0].expiresAt) ||
      items[0].expiresAt > Math.floor(Date.now() / 1000) + 31 * 86400 ||
      items[0].expiresAt <= Math.floor(Date.now() / 1000)
    )
      fail('native_key_scope_metadata_mismatch');
  };
  return {
    async issue() {
      // A lost create response cannot be replayed: raw keys are returned once.
      if ((await list()).length) fail('native_key_creation_requires_reconciliation');
      const issued = await call(
        'api-keys',
        {
          label,
          expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
          scopes: NATIVE_003_KEY_SCOPES,
        },
        session.cookie
      );
      if (
        !issued.ok ||
        !issued.body?.data?.rawApiKey ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(issued.body.data.id ?? '')
      )
        fail('native_management_key_issuance_failed');
      const record = {
        scopeHash: native003ScopeHash(),
        keyId: issued.body.data.id,
        apiKey: issued.body.data.rawApiKey,
      };
      await verify(record);
      return record;
    },
    verify,
    async verifyAccess(apiKey, credentialInventory) {
      const response = await fetch(
        `${base}/api/v1/${credentialInventory ? 'credentials?limit=100' : 'workflows?limit=1'}`,
        {
          headers: { 'X-N8N-API-KEY': apiKey },
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!response.ok || !Array.isArray((await response.json()).data))
        fail('native_key_access_verification_failed');
    },
  };
}

export async function run003Operator(args = process.argv.slice(2)) {
  const { mode, image } = parse003Arguments(args);
  let sqlProxy, runProxy, client;
  let stage = 'existing_bindings';
  try {
    const environments = JSON.parse(secret(SCOPE_003.oldEnvironments));
    const native = JSON.parse(secret(SCOPE_003.oldNative));
    const customer = validate003Source(environments, native);
    stage = 'existing_services';
    const baselines = old.map((item) => ({
      ...item,
      serviceState: describe(item.service),
      iam: policy(item.service),
    }));
    for (const baseline of baselines) privateInvokers(baseline.iam, [apiAccount]);
    if (
      describe('orqaly-v2-worker-preview').spec.template.spec.serviceAccountName !==
        workerAccount ||
      describe('orqaly-v2-api-preview').spec.template.spec.serviceAccountName !== apiAccount
    )
      fail('application_identity_mismatch');
    const projectPolicy = json(['projects', 'get-iam-policy', project]);
    if (
      (projectPolicy.bindings ?? []).some(
        (b) =>
          b.role === 'roles/run.invoker' &&
          (b.members ?? []).some((m) => ['allUsers', 'allAuthenticatedUsers'].includes(m))
      )
    )
      fail('project_public_invocation');
    const accountRoles = (projectPolicy.bindings ?? []).filter((b) =>
      (b.members ?? []).includes(`serviceAccount:${account}`)
    );
    if (accountRoles.some((b) => b.role !== 'roles/cloudsql.client' || b.condition))
      fail('runtime_account_authority_mismatch');
    stage = 'database_proxy';
    await freePort(SCOPE_003.sqlPort);
    sqlProxy = spawn(
      'cloud-sql-proxy',
      [instance, '--gcloud-auth', '--address=127.0.0.1', `--port=${SCOPE_003.sqlPort}`],
      { stdio: 'ignore' }
    );
    const adminPassword = secret('orqaly-v2-preview-001-db-admin-password');
    for (let i = 0; i < 40; i++) {
      if (sqlProxy.exitCode !== null) fail('owned_sql_proxy_failed');
      const candidate = new pg.Client({
        host: '127.0.0.1',
        port: SCOPE_003.sqlPort,
        database: 'orqaly_v2_preview_001',
        user: 'postgres',
        password: adminPassword,
        connectionTimeoutMillis: 1000,
        statement_timeout: 5000,
      });
      try {
        await candidate.connect();
        client = candidate;
        break;
      } catch {
        await candidate.end();
        await delay(500);
      }
    }
    if (!client) fail('preview_sql_unavailable');
    stage = 'database_preflight';
    const identity = (
      await client.query(
        "SELECT current_database() AS database,current_user AS user,current_setting('server_version_num')::int AS version"
      )
    ).rows[0];
    if (
      identity.database !== 'orqaly_v2_preview_001' ||
      identity.user !== 'postgres' ||
      Math.floor(identity.version / 10000) !== 16
    )
      fail('preview_sql_identity_mismatch');
    if (
      !(
        await client.query(
          "SELECT pg_try_advisory_lock(hashtextextended('orqaly.native-preview-003-operator',0)) AS locked"
        )
      ).rows[0].locked
    )
      fail('another_003_operator_running');
    // Table-owner reads still obey FORCE RLS. Resolve only the source tenant
    // and owner authenticated by the existing restricted binding secret.
    await client.query('BEGIN READ ONLY');
    let source;
    try {
      await client.query(
        "SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)",
        [customer.tenantId, customer.userId]
      );
      source = (
        await client.query(
          'SELECT tenant_id,owner_user_id,environment_id FROM orqaly.customer_solutions WHERE id=$1 AND tenant_id=$2 AND owner_user_id=$3',
          [SCOPE_003.sourceSolutionId, customer.tenantId, customer.userId]
        )
      ).rows;
    } finally {
      await client.query('ROLLBACK');
    }
    if (
      source.length !== 1 ||
      source[0].tenant_id !== customer.tenantId ||
      source[0].owner_user_id !== customer.userId ||
      source[0].environment_id !== 'orqaly-customer-webhook-preview-002'
    )
      fail('source_solution_owner_mismatch');
    const oldDatabases = (
      await client.query(
        "SELECT datname,datdba,datacl FROM pg_database WHERE datname IN ('orqaly_solution_n8n_preview_001','orqaly_solution_n8n_preview_002') ORDER BY datname"
      )
    ).rows;
    const roles = (
      await client.query(
        'SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,rolreplication,rolconnlimit FROM pg_roles WHERE rolname=$1',
        [role]
      )
    ).rows;
    if (
      roles.some(
        (r) =>
          r.rolsuper ||
          r.rolcreatedb ||
          r.rolcreaterole ||
          r.rolbypassrls ||
          r.rolinherit ||
          r.rolreplication ||
          r.rolconnlimit !== 8
      )
    )
      fail('existing_003_role_authority_mismatch');
    const databases = (
      await client.query(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
        [database]
      )
    ).rows;
    if (databases.some((d) => d.owner !== role)) fail('existing_003_database_owner_mismatch');
    const memberRoles = (
      await client.query(
        'SELECT roleid FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',
        [role]
      )
    ).rows;
    if (memberRoles.length) fail('runtime_database_role_memberships');
    if (mode === 'inspect')
      console.log(
        JSON.stringify({
          mode,
          ownerScopeVerified: true,
          sourceSolutionId: SCOPE_003.sourceSolutionId,
          service,
          account,
          database,
          role,
          environmentId,
          existingDatabase: databases.length === 1,
          existingRole: roles.length === 1,
          existingService: serviceExists(),
          oldEnvironments: environments.map((e) => e.id),
          oldPrivateServicesVerified: true,
          proposedImage: image,
          sqlMajor: 16,
          minInstances: 0,
          maxInstances: 1,
        })
      );
    if (mode === 'provision') {
      stage = 'provision';
      for (const kind of ['db-password', 'encryption-key', 'owner-password'])
        ensureSecret(
          `${prefix}-${kind}`,
          () => `Aa1${randomBytes(kind === 'owner-password' ? 24 : 32).toString('hex')}`
        );
      const password = secret(`${prefix}-db-password`);
      if (!/^Aa1[a-f0-9]{64}$/.test(password)) fail('database_password_format_mismatch');
      if (!roles.length)
        await client.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8`
        );
      if (!databases.length) {
        if (
          (await client.query("SELECT pg_has_role('postgres',$1,'MEMBER') AS member", [role]))
            .rows[0].member
        )
          fail('unexpected_admin_membership');
        await client.query(`GRANT ${role} TO postgres`);
        try {
          await client.query(`CREATE DATABASE ${database} OWNER ${role}`);
        } finally {
          await client.query(`REVOKE ${role} FROM postgres`);
        }
      }
      await isolateDatabase(password);
      if (
        (
          await client.query(
            "SELECT datname FROM pg_database WHERE datname LIKE 'orqaly%' AND datname<>$1 AND has_database_privilege($2,datname,'CONNECT')",
            [database, role]
          )
        ).rowCount
      )
        fail('other_product_database_access');
      const accounts = json(['iam', 'service-accounts', 'list', `--filter=email:${account}`]);
      if (!accounts.some((a) => a.email === account))
        cloud([
          'iam',
          'service-accounts',
          'create',
          accountId,
          '--display-name=Isolated native n8n preview 003',
          '--quiet',
        ]);
      if (!accountRoles.length)
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
        ensureSecret(`${prefix}-${kind}`, () => fail('secret_missing_after_provision'), [account]);
      ensureSecret(`${prefix}-owner-password`, () => fail('secret_missing_after_provision'), []);
      const nativePolicy = createBoundedHttpPolicy({ imageDigest: image.split('@')[1] });
      const baseEnv = baselines[1].serviceState.spec.template.spec.containers[0].env;
      const values = Object.fromEntries(
        baseEnv.filter((v) => Object.hasOwn(v, 'value')).map((v) => [v.name, v.value])
      );
      Object.assign(values, {
        DB_POSTGRESDB_DATABASE: database,
        DB_POSTGRESDB_USER: role,
        DB_POSTGRESDB_POOL_SIZE: '3',
        N8N_HOST: new URL(origin).hostname,
        WEBHOOK_URL: `${origin}/`,
        N8N_EDITOR_BASE_URL: origin,
        N8N_DISABLE_UI: 'false',
        N8N_RUNNERS_ENABLED: 'false',
        EXECUTIONS_MODE: 'regular',
        N8N_SSRF_PROTECTION_ENABLED: 'true',
        N8N_SSRF_ALLOWED_HOSTNAMES: '',
        N8N_SSRF_ALLOWED_IP_RANGES: '',
        N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true',
        N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES: 'true',
        NODES_INCLUDE: JSON.stringify([...new Set(nativePolicy.allowedNodes.map((n) => n.type))]),
        NODES_EXCLUDE: JSON.stringify([
          'n8n-nodes-base.httpRequest',
          'n8n-nodes-base.code',
          'n8n-nodes-base.executeCommand',
          'n8n-nodes-base.readWriteFile',
        ]),
        N8N_CUSTOM_EXTENSIONS: '/opt/orqaly-custom/nodes-orqaly-bounded-http',
        NODE_PATH: '/usr/local/lib/node_modules/n8n/node_modules',
      });
      if (!serviceExists())
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
          `--add-cloudsql-instances=${instance}`,
          '--network=workflow-v2-preview',
          '--subnet=workflow-v2-preview-ew4',
          '--vpc-egress=all-traffic',
          `--set-env-vars=^|^${Object.entries(values)
            .map(([key, value]) => `${key}=${value}`)
            .join('|')}`,
          `--set-secrets=DB_POSTGRESDB_PASSWORD=${prefix}-db-password:1,N8N_ENCRYPTION_KEY=${prefix}-encryption-key:1`,
          '--startup-probe=httpGet.path=/healthz/readiness,httpGet.port=8080,periodSeconds=5,timeoutSeconds=4,failureThreshold=24',
          '--liveness-probe=httpGet.path=/healthz,httpGet.port=8080,periodSeconds=30,timeoutSeconds=4,failureThreshold=3',
          '--quiet',
        ]);
      const runtime = describe(service),
        container = runtime.spec.template.spec.containers[0];
      const env = literal003Environment(container.env);
      if (
        runtime.spec.template.spec.serviceAccountName !== account ||
        container.image !== image ||
        env.DB_POSTGRESDB_DATABASE !== database ||
        env.DB_POSTGRESDB_USER !== role ||
        env.DB_POSTGRESDB_POOL_SIZE !== '3' ||
        env.N8N_SSRF_PROTECTION_ENABLED !== 'true' ||
        env.N8N_SSRF_ALLOWED_HOSTNAMES !== '' ||
        env.N8N_SSRF_ALLOWED_IP_RANGES !== '' ||
        env.N8N_RUNNERS_ENABLED !== 'false' ||
        env.N8N_DISABLE_UI !== 'false' ||
        env.N8N_BLOCK_ENV_ACCESS_IN_NODE !== 'true' ||
        env.N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES !== 'true' ||
        env.NODES_INCLUDE !== values.NODES_INCLUDE ||
        env.NODES_EXCLUDE !== values.NODES_EXCLUDE ||
        runtime.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'] !== '1' ||
        (runtime.spec.template.metadata.annotations['autoscaling.knative.dev/minScale'] ?? '0') !==
          '0' ||
        runtime.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'] ===
          'false' ||
        !['1', '1000m'].includes(container.resources?.limits?.cpu) ||
        container.resources?.limits?.memory !== '1Gi' ||
        runtime.spec.template.spec.containerConcurrency !== 1 ||
        runtime.spec.template.spec.timeoutSeconds !== 90
      )
        fail('existing_003_runtime_scope_mismatch');
      const invokers = privateInvokers(policy(service), [apiAccount, workerAccount], false);
      for (const identity of [apiAccount, workerAccount])
        if (!invokers.includes(`serviceAccount:${identity}`))
          cloud([
            'run',
            'services',
            'add-iam-policy-binding',
            service,
            `--region=${region}`,
            `--member=serviceAccount:${identity}`,
            '--role=roles/run.invoker',
            '--quiet',
          ]);
      privateInvokers(policy(service), [apiAccount, workerAccount]);
      console.log(
        JSON.stringify({
          provisioned: true,
          service,
          account,
          database,
          role,
          environmentId,
          image,
          nativePolicy,
          minInstances: 0,
          maxInstances: 1,
          publicInvoker: false,
          oldDatabasesChanged: false,
          freshOwnerConnections: 3,
          freshCrossConnectionsDenied42501: 4,
        })
      );
    }
    if (mode === 'bootstrap') {
      stage = 'bootstrap';
      if (!serviceExists() || describe(service).spec.template.spec.containers[0].image !== image)
        fail('provision_exact_003_first');
      privateInvokers(policy(service), [apiAccount, workerAccount]);
      const environmentSecret = `${prefix}-environment`;
      const existingEnvironment = existsSecret(environmentSecret);
      {
        await freePort(SCOPE_003.runPort);
        runProxy = spawn(
          'gcloud',
          [
            'run',
            'services',
            'proxy',
            service,
            `--project=${project}`,
            `--region=${region}`,
            `--port=${SCOPE_003.runPort}`,
          ],
          { stdio: 'ignore' }
        );
        let ready = false;
        for (let i = 0; i < 90; i++) {
          if (runProxy.exitCode !== null) fail('owned_runtime_proxy_failed');
          try {
            const response = await fetch(`http://127.0.0.1:${SCOPE_003.runPort}/rest/settings`, {
              signal: AbortSignal.timeout(2000),
            });
            if (response.ok) {
              ready = true;
              break;
            }
          } catch {}
          await delay(1000);
        }
        if (!ready) fail('native_bootstrap_not_ready');
        const owner = await bootstrapOwner({ allowSetup: !existingEnvironment });
        let initialKey;
        if (!existingEnvironment) {
          initialKey = await owner.issue();
          ensureSecret(
            environmentSecret,
            () =>
              JSON.stringify({
                id: environmentId,
                ...customer,
                name: 'Isolated native workflow preview 003',
                region,
                origin,
                apiKey: initialKey.apiKey,
                useIdToken: true,
                nativePolicy: createBoundedHttpPolicy({ imageDigest: image.split('@')[1] }),
              }),
            []
          );
        }
        const previousBinding = JSON.parse(secret(environmentSecret));
        if (
          previousBinding.id !== environmentId ||
          previousBinding.tenantId !== customer.tenantId ||
          previousBinding.userId !== customer.userId ||
          previousBinding.origin !== origin ||
          previousBinding.useIdToken !== true ||
          digest(previousBinding.nativePolicy) !==
            digest(createBoundedHttpPolicy({ imageDigest: image.split('@')[1] }))
        )
          fail('native_previous_binding_scope_mismatch');
        const scopeSecret = `${prefix}-management-scopes-v2`;
        if (!existsSecret(scopeSecret)) {
          const issued = initialKey ?? (await owner.issue());
          ensureSecret(
            scopeSecret,
            () =>
              JSON.stringify({
                schemaVersion: 1,
                scopeHash: issued.scopeHash,
                keyId: issued.keyId,
                binding: { ...previousBinding, apiKey: issued.apiKey },
              }),
            []
          );
        }
        const scopeBundle = JSON.parse(secret(scopeSecret));
        const upgradedBinding = validate003ScopeBundle(scopeBundle, previousBinding);
        await owner.verify(scopeBundle);
        await owner.verifyAccess(upgradedBinding.apiKey, true);
        await owner.verifyAccess(previousBinding.apiKey, false);
        // Old versions and the old native key stay enabled until the application
        // has adopted and independently verified the replacement binding.
        publishSecondVersion(environmentSecret, previousBinding, upgradedBinding, []);
        if (!existsSecret(SCOPE_003.environments))
          sameSecret(
            SCOPE_003.environments,
            [...environments, previousBinding],
            [apiAccount, workerAccount]
          );
        publishSecondVersion(
          SCOPE_003.environments,
          [...environments, previousBinding],
          [...environments, upgradedBinding],
          [apiAccount, workerAccount]
        );
      }
      const binding = JSON.parse(secret(environmentSecret, '2'));
      if (
        binding.id !== environmentId ||
        binding.tenantId !== customer.tenantId ||
        binding.userId !== customer.userId ||
        binding.origin !== origin ||
        binding.useIdToken !== true ||
        !binding.apiKey ||
        digest(binding.nativePolicy) !==
          digest(createBoundedHttpPolicy({ imageDigest: image.split('@')[1] }))
      )
        fail('native_binding_scope_mismatch');
      const editor = {
        environmentId,
        origin,
        email: 'operator@orqaly.invalid',
        password: secret(`${prefix}-owner-password`),
        useIdToken: true,
      };
      sameSecret(SCOPE_003.native, [...native, editor], [apiAccount]);
      console.log(
        JSON.stringify({
          bootstrapped: true,
          service,
          environmentId,
          origin,
          image,
          managementKeyScopes: NATIVE_003_KEY_SCOPES,
          managementScopeHash: native003ScopeHash(),
          credentialMetadataInventoryVerified: true,
          oldManagementKeyPreservedAndVerified: true,
          managementKeyLifetimeDays: 30,
          secretRefs: {
            ORQALY_SOLUTION_ENVIRONMENTS: `${SCOPE_003.environments}:2`,
            ORQALY_NATIVE_N8N_BINDINGS: `${SCOPE_003.native}:1`,
          },
          environmentAccessors: [apiAccount, workerAccount],
          nativeAccessor: apiAccount,
          oldEnvironmentIdsPreserved: environments.map((e) => e.id),
          applicationDeploymentsChanged: false,
        })
      );
    }
    stage = 'preservation';
    const afterDatabases = (
      await client.query(
        "SELECT datname,datdba,datacl FROM pg_database WHERE datname IN ('orqaly_solution_n8n_preview_001','orqaly_solution_n8n_preview_002') ORDER BY datname"
      )
    ).rows;
    if (digest(afterDatabases) !== digest(oldDatabases)) fail('old_database_catalog_changed');
    for (const baseline of baselines) {
      if (
        digest(describe(baseline.service).spec) !== digest(baseline.serviceState.spec) ||
        digest(policy(baseline.service)) !== digest(baseline.iam)
      )
        fail('old_runtime_changed');
    }
    console.log(
      JSON.stringify({
        preserved: true,
        oldRuntimeServices: old.map((v) => v.service),
        oldDatabaseCatalogUnchanged: true,
        oldBindingsHash: digest(environments),
        oldNativeBindingsHash: digest(native),
        credentialsLogged: false,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        mode,
        stage,
        lastCloudCommand,
        errorType: ['Error', 'SyntaxError', 'TypeError'].includes(error.name)
          ? error.name
          : 'Error',
        processStatus: Number.isInteger(error.status) ? error.status : null,
        databaseErrorCode: /^[0-9A-Z]{5}$/.test(error.code ?? '') ? error.code : null,
        code: /^[a-z][a-z0-9_]{1,100}$/.test(error.message ?? '')
          ? error.message
          : 'bounded_003_operator_failed',
        credentialsLogged: false,
      })
    );
    process.exitCode = 1;
  } finally {
    await client?.end();
    sqlProxy?.kill('SIGTERM');
    runProxy?.kill('SIGTERM');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await run003Operator();
