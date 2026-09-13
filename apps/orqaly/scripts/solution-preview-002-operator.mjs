// Fixed-scope operator for the separately approved SECOND customer preview.
// Never updates environment001, Orqaly services, signing keys, or application schemas.
// Credentials remain in process memory / Secret Manager; outputs contain refs only.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { bootstrapSolutionOwner } from '../infra/n8n/bootstrap-solution-owner.mjs';

const project = 'axwise-v2-preview-001';
const region = 'europe-west4';
const instance = `${project}:${region}:orqaly-v2-preview-001-pg`;
const oldService = 'orqaly-solution-n8n-preview';
const service = 'orqaly-solution-n8n-preview-002';
const accountId = 'orqaly-solution-n8n-pv-002';
const account = `${accountId}@${project}.iam.gserviceaccount.com`;
const apiAccount = `orqaly-v2-api-preview@${project}.iam.gserviceaccount.com`;
const database = 'orqaly_solution_n8n_preview_002';
const databaseRole = 'orqaly_solution_n8n_preview_002_login';
const prefix = 'orqaly-solution-preview-002';
const environmentId = 'orqaly-customer-webhook-preview-002';
const origin = `https://${service}-161074549006.${region}.run.app`;
const oldOrigin = `https://${oldService}-161074549006.${region}.run.app`;
const image = `europe-west4-docker.pkg.dev/${project}/workflow-v2-preview/n8n@sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2`;
const aggregateEnvironments = 'orqaly-solution-preview-001-002-environments';
const aggregateNative = 'orqaly-solution-preview-001-002-native-bindings';
const mode = process.argv[2];
if (!['inspect', 'provision', 'bootstrap'].includes(mode))
  throw new Error('explicit_002_operator_mode_required');
const fail = (code) => {
  throw new Error(code);
};
const cloud = (args, input) =>
  execFileSync('gcloud', [...args, `--project=${project}`], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
const json = (args) => JSON.parse(cloud([...args, '--format=json']));
const secret = (name) => cloud(['secrets', 'versions', 'access', '1', `--secret=${name}`]);
const existsSecret = (name) =>
  json(['secrets', 'list', `--filter=name:${name}`]).some((item) => item.name.endsWith(`/${name}`));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const accessor = (name, identity) => {
  const policy = json(['secrets', 'get-iam-policy', name]);
  const members = (policy.bindings || [])
    .filter((item) => item.role === 'roles/secretmanager.secretAccessor')
    .flatMap((item) => item.members || []);
  if (members.some((member) => member !== `serviceAccount:${identity}`))
    fail('unexpected_secret_accessor');
  if (!members.includes(`serviceAccount:${identity}`))
    cloud([
      'secrets',
      'add-iam-policy-binding',
      name,
      `--member=serviceAccount:${identity}`,
      '--role=roles/secretmanager.secretAccessor',
      '--quiet',
    ]);
};
function ensureSecret(name, valueFactory) {
  if (!existsSecret(name))
    cloud(['secrets', 'create', name, '--replication-policy=automatic', '--quiet']);
  const versions = json(['secrets', 'versions', 'list', name]);
  if (versions.length) {
    if (
      versions.length !== 1 ||
      !versions[0].name.endsWith('/1') ||
      versions[0].state !== 'ENABLED'
    )
      fail('unexpected_002_secret_versions');
    return;
  }
  cloud(['secrets', 'versions', 'add', name, '--data-file=-', '--quiet'], valueFactory());
}
const sameSecret = (name, value) => {
  ensureSecret(name, () => JSON.stringify(value));
  if (digest(JSON.parse(secret(name))) !== digest(value)) fail('existing_002_binding_mismatch');
  accessor(name, apiAccount);
};
let sqlProxy, runProxy, client;
async function connect() {
  const password = secret('orqaly-v2-preview-001-db-admin-password');
  sqlProxy = spawn(
    'cloud-sql-proxy',
    [instance, '--gcloud-auth', '--address=127.0.0.1', '--port=19483'],
    { stdio: 'ignore' }
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    if (sqlProxy.exitCode !== null) fail('owned_sql_proxy_failed');
    const candidate = new pg.Client({
      host: '127.0.0.1',
      port: 19483,
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
  fail('preview_database_unavailable');
}
const describe = (name) => json(['run', 'services', 'describe', name, `--region=${region}`]);
const serviceExists = () =>
  json(['run', 'services', 'list', `--region=${region}`, `--filter=metadata.name:${service}`]).some(
    (item) => item.metadata.name === service
  );
function checkPrivatePolicy(name, allowEmpty = false) {
  const policy = json(['run', 'services', 'get-iam-policy', name, `--region=${region}`]);
  const invokers = (policy.bindings || [])
    .filter((item) => item.role === 'roles/run.invoker')
    .flatMap((item) => item.members || []);
  if (
    invokers.some((member) => member !== `serviceAccount:${apiAccount}`) ||
    (!allowEmpty && invokers.length !== 1)
  )
    fail('unexpected_runtime_invoker');
  return invokers;
}
async function isolateNewDatabase(password) {
  // Cloud SQL's administrative login is not a PostgreSQL superuser. A REVOKE
  // after dropping its temporary owner-role membership can merely emit a
  // warning. Apply this NEW002 database ACL using its actual owner instead.
  const owner = new pg.Client({
    host: '127.0.0.1',
    port: 19483,
    user: databaseRole,
    password,
    database,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  let transaction = false;
  let warning = false;
  owner.on('notice', (notice) => {
    if (notice.severity === 'WARNING') warning = true;
  });
  try {
    await owner.connect();
    await owner.query('BEGIN');
    transaction = true;
    const scope = (
      await owner.query(`SELECT current_database() AS database,
      current_user AS user,pg_get_userbyid(datdba) AS owner
      FROM pg_database WHERE datname=current_database()`)
    ).rows[0];
    if (scope.database !== database || scope.user !== databaseRole || scope.owner !== databaseRole)
      fail('new_database_owner_scope_mismatch');
    const unexpected = await owner.query(`SELECT 1
      FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
      WHERE d.datname=current_database() AND (a.grantor<>d.datdba
        OR (a.grantee<>0 AND a.grantee<>d.datdba) OR a.is_grantable)`);
    if (unexpected.rowCount) fail('unexpected_new_database_acl');
    await owner.query('REVOKE ALL ON DATABASE orqaly_solution_n8n_preview_002 FROM PUBLIC');
    const permissions = (
      await owner.query(`SELECT
      has_database_privilege(current_user,current_database(),'CONNECT') AS owner_connect,
      (SELECT count(*)::int FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
        WHERE d.datname=current_database() AND a.grantee=0) AS public_grants`)
    ).rows[0];
    if (warning || !permissions.owner_connect || permissions.public_grants !== 0)
      fail('new_database_acl_postcondition_failed');
    await owner.query('COMMIT');
    transaction = false;
  } finally {
    if (transaction) await owner.query('ROLLBACK').catch(() => {});
    await owner.end();
  }
  const oldDatabase = 'orqaly_solution_n8n_preview_001';
  const oldRole = `${oldDatabase}_login`;
  const oldPassword = secret('orqaly-solution-preview-001-db-password');
  for (const [target, role, credential, shouldConnect] of [
    [database, databaseRole, password, true],
    [oldDatabase, oldRole, oldPassword, true],
    [oldDatabase, databaseRole, password, false],
    [database, oldRole, oldPassword, false],
  ]) {
    const probe = new pg.Client({
      host: '127.0.0.1',
      port: 19483,
      database: target,
      user: role,
      password: credential,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    let connected = false;
    try {
      await probe.connect();
      connected = true;
      if (!shouldConnect) fail('cross_database_connection_not_denied');
      const result = (
        await probe.query('SELECT current_database() AS database,current_user AS user,1 AS ok')
      ).rows[0];
      if (result.database !== target || result.user !== role || result.ok !== 1)
        fail('fresh_database_connection_scope_mismatch');
    } catch (error) {
      if (shouldConnect || connected || error.code !== '42501')
        fail('fresh_database_isolation_check_failed');
    } finally {
      await probe.end();
    }
  }
  console.log(
    JSON.stringify({
      new002PublicAclEmpty: true,
      freshOwnerConnections: 'both_verified_select_1',
      freshCrossDatabaseConnections: 'both_denied_42501',
      existing001AclChanged: false,
    })
  );
}
async function inspectRoleAccess(databaseName) {
  if (databaseName !== 'orqaly_solution_n8n_preview_001')
    fail('unapproved_cross_database_metadata_target');
  const probe = new pg.Client({
    host: '127.0.0.1',
    port: 19483,
    user: databaseRole,
    password: secret(`${prefix}-db-password`),
    database: databaseName,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  try {
    await probe.connect();
    await probe.query('BEGIN READ ONLY');
    const schemas = await probe.query(`
      SELECT nspname AS schema,
        has_schema_privilege(oid,'USAGE') AS usage,
        has_schema_privilege(oid,'CREATE') AS create
      FROM pg_namespace
      WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
      ORDER BY nspname`);
    const tables = await probe.query(`
      SELECT n.nspname AS schema, count(*)::int AS relations,
        count(*) FILTER (WHERE has_table_privilege(c.oid,'SELECT'))::int AS selectable,
        count(*) FILTER (WHERE has_table_privilege(c.oid,'INSERT'))::int AS insertable,
        count(*) FILTER (WHERE has_table_privilege(c.oid,'UPDATE'))::int AS updatable,
        count(*) FILTER (WHERE has_table_privilege(c.oid,'DELETE'))::int AS deletable,
        count(*) FILTER (WHERE has_table_privilege(c.oid,'TRUNCATE'))::int AS truncatable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_'
        AND n.nspname <> 'information_schema'
      GROUP BY n.nspname ORDER BY n.nspname`);
    const sequences = await probe.query(`
      SELECT n.nspname AS schema, count(*)::int AS sequences,
        count(*) FILTER (WHERE has_sequence_privilege(c.oid,'USAGE'))::int AS usable,
        count(*) FILTER (WHERE has_sequence_privilege(c.oid,'SELECT'))::int AS readable,
        count(*) FILTER (WHERE has_sequence_privilege(c.oid,'UPDATE'))::int AS updatable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='S' AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      GROUP BY n.nspname ORDER BY n.nspname`);
    const functions = await probe.query(`
      SELECT n.nspname AS schema, count(*)::int AS functions,
        count(*) FILTER (WHERE has_function_privilege(p.oid,'EXECUTE'))::int AS executable,
        count(*) FILTER (WHERE p.prosecdef AND has_function_privilege(p.oid,'EXECUTE'))::int AS executable_security_definer
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      GROUP BY n.nspname ORDER BY n.nspname`);
    const securityDefiners = await probe.query(`
      SELECT n.nspname AS schema, p.proname AS function,
        pg_get_function_identity_arguments(p.oid) AS arguments,
        pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.prosecdef AND has_function_privilege(p.oid,'EXECUTE')
        AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      ORDER BY n.nspname,p.proname`);
    await probe.query('ROLLBACK');
    return {
      database: databaseName,
      connectedAs002: true,
      schemas: schemas.rows,
      tables: tables.rows,
      sequences: sequences.rows,
      functions: functions.rows,
      executableSecurityDefiners: securityDefiners.rows,
      customerRowsRead: false,
    };
  } finally {
    await probe.end();
  }
}
try {
  await connect();
  const scopedRun = await client.query(
    'SELECT tenant_id,owner_user_id FROM orqaly.workflow_runs WHERE id=$1',
    ['837fdcaf-3536-5901-b044-94faf03d7a7b']
  );
  if (scopedRun.rowCount !== 1) fail('preview_owner_scope_ambiguous');
  const customer = scopedRun.rows[0];
  const oldEnvironments = JSON.parse(secret('orqaly-solution-preview-001-environments'));
  const oldNative = JSON.parse(secret('orqaly-solution-preview-001-native-bindings'));
  if (
    oldEnvironments.length !== 1 ||
    oldNative.length !== 1 ||
    oldEnvironments[0].id !== 'orqaly-customer-webhook-preview-001' ||
    oldEnvironments[0].tenantId !== customer.tenant_id ||
    oldEnvironments[0].userId !== customer.owner_user_id ||
    oldEnvironments[0].origin !== oldOrigin ||
    oldEnvironments[0].useIdToken !== true ||
    oldNative[0].environmentId !== oldEnvironments[0].id ||
    oldNative[0].origin !== oldOrigin ||
    oldNative[0].useIdToken !== true
  )
    fail('existing_001_scope_mismatch');
  const baseline = describe(oldService);
  const existingContainer = baseline.spec.template.spec.containers[0];
  if (existingContainer.image !== image) fail('existing_pinned_image_mismatch');
  checkPrivatePolicy(oldService);
  const projectPolicy = json(['projects', 'get-iam-policy', project]);
  if (
    (projectPolicy.bindings || []).some(
      (binding) =>
        binding.role === 'roles/run.invoker' &&
        (binding.members || []).some((member) =>
          ['allUsers', 'allAuthenticatedUsers'].includes(member)
        )
    )
  )
    fail('project_has_public_runtime_invocation');
  const memberships = (projectPolicy.bindings || []).filter((binding) =>
    (binding.members || []).includes(`serviceAccount:${account}`)
  );
  if (memberships.some((binding) => binding.role !== 'roles/cloudsql.client' || binding.condition))
    fail('runtime_account_has_unexpected_project_authority');
  const roleQuery = await client.query(
    'SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,rolreplication FROM pg_roles WHERE rolname=$1',
    [databaseRole]
  );
  const dbQuery = await client.query(
    'SELECT d.datname,r.rolname AS owner FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',
    [database]
  );
  if (
    roleQuery.rows.some(
      (role) =>
        role.rolsuper ||
        role.rolcreatedb ||
        role.rolcreaterole ||
        role.rolbypassrls ||
        role.rolinherit ||
        role.rolreplication
    )
  )
    fail('existing_002_role_is_privileged');
  if (dbQuery.rows.some((db) => db.owner !== databaseRole))
    fail('existing_002_database_owner_mismatch');
  const inheritedConnections = roleQuery.rowCount
    ? await client.query(
        "SELECT datname,datacl FROM pg_database WHERE datname LIKE 'orqaly%' AND datname<>$1 AND has_database_privilege($2,datname,'CONNECT')",
        [database, databaseRole]
      )
    : { rows: [] };
  if (mode === 'inspect') {
    const accessDetails = [];
    for (const entry of inheritedConnections.rows)
      accessDetails.push(await inspectRoleAccess(entry.datname));
    const activeDatabaseRoles = await client.query(
      `SELECT datname,usename,state,count(*)::int AS sessions
       FROM pg_stat_activity WHERE datname IN ($1,$2)
       GROUP BY datname,usename,state ORDER BY datname,usename,state`,
      ['orqaly_solution_n8n_preview_001', database]
    );
    const databaseRoleMemberships = await client.query(
      `SELECT r.rolname AS granted_role,m.admin_option
       FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
       JOIN pg_roles member_role ON member_role.oid=m.member
       WHERE member_role.rolname=$1`,
      [databaseRole]
    );
    console.log(
      JSON.stringify({
        scopeMatchesExistingOwner: true,
        existing001Private: true,
        service,
        account,
        database,
        databaseRole,
        existing002Database: dbQuery.rowCount,
        existing002Role: roleQuery.rowCount,
        existing002Service: serviceExists(),
        existing002AccountRoles: memberships.map((item) => item.role),
        inheritedConnections: inheritedConnections.rows,
        accessDetails,
        activeDatabaseRoles: activeDatabaseRoles.rows,
        databaseRoleMemberships: databaseRoleMemberships.rows,
        pinnedImage: image,
        ports: [19483, 19484],
      })
    );
  }
  if (mode === 'provision') {
    for (const kind of ['db-password', 'encryption-key', 'owner-password'])
      ensureSecret(
        `${prefix}-${kind}`,
        () => `Aa1${randomBytes(kind === 'owner-password' ? 24 : 32).toString('hex')}`
      );
    const password = secret(`${prefix}-db-password`);
    if (!/^Aa1[a-f0-9]{64}$/.test(password)) fail('unexpected_generated_password_format');
    if (!roleQuery.rowCount)
      await client.query(
        `CREATE ROLE ${databaseRole} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
    const memberRoles = await client.query(
      'SELECT roleid FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',
      [databaseRole]
    );
    if (memberRoles.rowCount) fail('runtime_database_role_has_memberships');
    if (!dbQuery.rowCount) {
      const standing = await client.query("SELECT pg_has_role('postgres',$1,'MEMBER') AS member", [
        databaseRole,
      ]);
      if (standing.rows[0].member) fail('unexpected_admin_role_membership');
      await client.query(`GRANT ${databaseRole} TO postgres`);
      try {
        await client.query(`CREATE DATABASE ${database} OWNER ${databaseRole}`);
      } finally {
        await client.query(`REVOKE ${databaseRole} FROM postgres`);
      }
    }
    await isolateNewDatabase(password);
    const forbidden = await client.query(
      "SELECT datname FROM pg_database WHERE datname LIKE 'orqaly%' AND datname<>$1 AND has_database_privilege($2,datname,'CONNECT')",
      [database, databaseRole]
    );
    if (forbidden.rowCount) fail('runtime_role_can_connect_other_product_database');
    const accounts = json(['iam', 'service-accounts', 'list', `--filter=email:${account}`]);
    if (!accounts.some((item) => item.email === account))
      cloud([
        'iam',
        'service-accounts',
        'create',
        accountId,
        '--display-name=Isolated customer n8n preview 002',
        '--quiet',
      ]);
    if (!memberships.length)
      cloud([
        'projects',
        'add-iam-policy-binding',
        project,
        `--member=serviceAccount:${account}`,
        '--role=roles/cloudsql.client',
        '--condition=None',
        '--quiet',
      ]);
    for (const kind of ['db-password', 'encryption-key']) accessor(`${prefix}-${kind}`, account);
    if (!serviceExists()) {
      const values = Object.fromEntries(
        existingContainer.env
          .filter((item) => Object.hasOwn(item, 'value'))
          .map((item) => [item.name, item.value])
      );
      if (
        values.NODES_INCLUDE !==
          JSON.stringify([
            'n8n-nodes-base.webhook',
            'n8n-nodes-base.set',
            'n8n-nodes-base.respondToWebhook',
          ]) ||
        values.EXECUTIONS_MODE !== 'regular' ||
        values.N8N_RUNNERS_ENABLED !== 'false' ||
        values.N8N_DISABLE_UI !== 'false'
      )
        fail('existing_runtime_capability_scope_changed');
      Object.assign(values, {
        DB_POSTGRESDB_DATABASE: database,
        DB_POSTGRESDB_USER: databaseRole,
        N8N_HOST: new URL(origin).hostname,
        WEBHOOK_URL: `${origin}/`,
        N8N_EDITOR_BASE_URL: origin,
        N8N_DISABLE_UI: 'false',
      });
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
    }
    const runtime = describe(service);
    const container = runtime.spec.template.spec.containers[0];
    const env = Object.fromEntries(container.env.map((item) => [item.name, item.value]));
    if (
      runtime.spec.template.spec.serviceAccountName !== account ||
      container.image !== image ||
      env.DB_POSTGRESDB_DATABASE !== database ||
      env.DB_POSTGRESDB_USER !== databaseRole ||
      env.N8N_DISABLE_UI !== 'false' ||
      runtime.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'] !== '1'
    )
      fail('existing_002_runtime_scope_mismatch');
    const invokers = checkPrivatePolicy(service, true);
    if (!invokers.length)
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
    checkPrivatePolicy(service);
    console.log(
      JSON.stringify({
        provisioned: true,
        service,
        account,
        database,
        databaseRole,
        environmentId,
        origin,
        minInstances: 0,
        maxInstances: 1,
        publicInvoker: false,
        nativeUi: true,
        secretRefs: [
          `${prefix}-db-password:1`,
          `${prefix}-encryption-key:1`,
          `${prefix}-owner-password:1`,
        ],
      })
    );
  }
  if (mode === 'bootstrap') {
    if (!serviceExists()) fail('provision_002_first');
    checkPrivatePolicy(service);
    const environmentSecret = `${prefix}-environment`;
    if (!existsSecret(environmentSecret)) {
      runProxy = spawn(
        'gcloud',
        [
          'run',
          'services',
          'proxy',
          service,
          `--project=${project}`,
          `--region=${region}`,
          '--port=19484',
        ],
        { stdio: 'ignore' }
      );
      let ready = false;
      for (let attempt = 0; attempt < 45; attempt++) {
        if (runProxy.exitCode !== null) fail('owned_runtime_proxy_failed');
        try {
          const response = await fetch('http://127.0.0.1:19484/rest/settings', {
            signal: AbortSignal.timeout(2000),
          });
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(1000);
      }
      if (!ready) fail('runtime_bootstrap_not_ready');
      const password = secret(`${prefix}-owner-password`);
      if (!/^Aa1[a-f0-9]{48}$/.test(password)) fail('unexpected_owner_password_format');
      const apiKey = await bootstrapSolutionOwner({
        origin: 'http://127.0.0.1:19484',
        email: 'operator@orqaly.invalid',
        password,
      });
      ensureSecret(environmentSecret, () =>
        JSON.stringify({
          id: environmentId,
          tenantId: customer.tenant_id,
          userId: customer.owner_user_id,
          name: 'Isolated workflow build preview 002',
          region,
          origin,
          apiKey,
          useIdToken: true,
        })
      );
    }
    const binding = JSON.parse(secret(environmentSecret));
    if (
      binding.id !== environmentId ||
      binding.tenantId !== customer.tenant_id ||
      binding.userId !== customer.owner_user_id ||
      binding.origin !== origin ||
      binding.useIdToken !== true ||
      !binding.apiKey
    )
      fail('existing_002_environment_binding_mismatch');
    const nativeBinding = {
      environmentId,
      origin,
      email: 'operator@orqaly.invalid',
      password: secret(`${prefix}-owner-password`),
      useIdToken: true,
    };
    sameSecret(aggregateEnvironments, [...oldEnvironments, binding]);
    sameSecret(aggregateNative, [...oldNative, nativeBinding]);
    console.log(
      JSON.stringify({
        bootstrapped: true,
        environmentId,
        service,
        origin,
        managementKeyLifetimeDays: 30,
        existing001Unchanged: true,
        secrets: {
          ORQALY_SOLUTION_ENVIRONMENTS: { name: aggregateEnvironments, version: '1' },
          ORQALY_NATIVE_N8N_BINDINGS: { name: aggregateNative, version: '1' },
          ORQALY_NATIVE_N8N_SIGNING_KEY: {
            name: 'orqaly-solution-preview-001-native-signing-key',
            version: '1',
          },
        },
        accessor: apiAccount,
        apiDeploymentChanged: false,
      })
    );
  }
  if (digest(describe(oldService).spec) !== digest(baseline.spec))
    fail('existing_001_runtime_changed_during_operator');
} catch (error) {
  console.error(
    JSON.stringify({
      mode,
      code: /^[a-z][a-z0-9_]{1,100}$/.test(error.message || '')
        ? error.message
        : 'bounded_002_operator_failed',
      credentialsLogged: false,
    })
  );
  process.exitCode = 1;
} finally {
  await client?.end();
  sqlProxy?.kill('SIGTERM');
  runProxy?.kill('SIGTERM');
}
