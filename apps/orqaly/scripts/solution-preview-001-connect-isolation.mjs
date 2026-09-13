// Narrow, separately approved hardening for the existing preview database.
// The sole database mutation is PUBLIC CONNECT removal on database001.
// Owner credentials stay in memory; no workflow/customer rows are accessed.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const project = 'axwise-v2-preview-001';
const instance = `${project}:europe-west4:orqaly-v2-preview-001-pg`;
const database001 = 'orqaly_solution_n8n_preview_001';
const database002 = 'orqaly_solution_n8n_preview_002';
const owner001 = `${database001}_login`;
const owner002 = `${database002}_login`;
if (process.argv[2] !== 'apply-approved-connect-only')
  throw new Error('explicit_approved_connect_only_mode_required');

const secret = (name) =>
  execFileSync(
    'gcloud',
    ['secrets', 'versions', 'access', '1', `--secret=${name}`, `--project=${project}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
const connection = (database, user, password) =>
  new pg.Client({
    host: '127.0.0.1',
    port: 19483,
    database,
    user,
    password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
const acl = async (client) =>
  (
    await client.query(
      `SELECT pg_get_userbyid(a.grantor) AS grantor,
        CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
        a.privilege_type AS privilege,a.is_grantable AS grantable
       FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
       WHERE d.datname=$1 ORDER BY grantor,grantee,privilege,grantable`,
      [database001]
    )
  ).rows;
async function simpleConnection(database, user, password, shouldConnect) {
  const candidate = connection(database, user, password);
  let connected = false;
  try {
    await candidate.connect();
    connected = true;
    assert.equal(shouldConnect, true);
    assert.equal((await candidate.query('SELECT 1 AS ok')).rows[0].ok, 1);
  } catch (error) {
    // A network/authentication error is not proof of database isolation.
    if (shouldConnect || connected || error.code !== '42501')
      throw new Error('database_connection_assertion_failed');
  } finally {
    await candidate.end();
  }
}

let proxy,
  client,
  transaction = false,
  commitAttempted = false,
  commitConfirmed = false;
try {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('owned_proxy_port_unavailable')));
    probe.listen(19483, '127.0.0.1', () => probe.close(resolve));
  });
  const password001 = secret('orqaly-solution-preview-001-db-password');
  const password002 = secret('orqaly-solution-preview-002-db-password');
  proxy = spawn(
    'cloud-sql-proxy',
    [instance, '--gcloud-auth', '--address=127.0.0.1', '--port=19483'],
    {
      stdio: 'ignore',
    }
  );
  let proxyError = false;
  proxy.on('error', () => {
    proxyError = true;
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (proxyError || proxy.exitCode !== null) throw new Error('owned_sql_proxy_failed');
    const candidate = connection(database001, owner001, password001);
    try {
      await candidate.connect();
      client = candidate;
      break;
    } catch {
      await candidate.end();
      await delay(500);
    }
  }
  if (!client) throw new Error('owner_connection_unavailable');
  await client.query('BEGIN');
  transaction = true;
  const scope = (
    await client.query(
      `SELECT current_database() AS database,current_user AS user,
       pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()`
    )
  ).rows[0];
  assert.deepEqual(scope, { database: database001, user: owner001, owner: owner001 });
  const before = await acl(client);
  const allowed = new Set(['CONNECT', 'CREATE', 'TEMPORARY']);
  assert.equal(
    before.every(
      (row) =>
        row.grantor === owner001 &&
        !row.grantable &&
        [owner001, 'PUBLIC'].includes(row.grantee) &&
        allowed.has(row.privilege)
    ),
    true
  );
  assert.deepEqual(
    before
      .filter((row) => row.grantee === owner001)
      .map((row) => row.privilege)
      .sort(),
    ['CONNECT', 'CREATE', 'TEMPORARY']
  );
  assert.equal(
    before.some((row) => row.grantee === 'PUBLIC' && row.privilege === 'TEMPORARY'),
    true
  );
  assert.equal(
    before.some((row) => row.grantee === 'PUBLIC' && row.privilege === 'CREATE'),
    false
  );
  const expected = before.filter(
    (row) => !(row.grantee === 'PUBLIC' && row.privilege === 'CONNECT')
  );
  const changed = before.length !== expected.length;
  if (changed)
    await client.query('REVOKE CONNECT ON DATABASE orqaly_solution_n8n_preview_001 FROM PUBLIC');
  const after = await acl(client);
  assert.deepEqual(after, expected);
  const permissions = (
    await client.query(
      `SELECT has_database_privilege($1,$3,'CONNECT') AS owner_connect,
      has_database_privilege($2,$3,'CONNECT') AS other_connect,
      EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
        WHERE d.datname=$3 AND a.grantee=0 AND a.privilege_type='TEMPORARY') AS public_temp`,
      [owner001, owner002, database001]
    )
  ).rows[0];
  assert.deepEqual(permissions, { owner_connect: true, other_connect: false, public_temp: true });
  commitAttempted = true;
  await client.query('COMMIT');
  commitConfirmed = true;
  transaction = false;
  await client.end();
  client = undefined;
  await simpleConnection(database001, owner001, password001, true);
  await simpleConnection(database002, owner002, password002, true);
  await simpleConnection(database001, owner002, password002, false);
  await simpleConnection(database002, owner001, password001, false);
  console.log(
    JSON.stringify({
      changed,
      exactOperation: 'REVOKE CONNECT ON DATABASE orqaly_solution_n8n_preview_001 FROM PUBLIC',
      allOtherAclPreserved: true,
      publicTempPreserved: true,
      fresh001OwnerConnection: true,
      fresh002OwnerConnection: true,
      fresh002To001Denied: true,
      fresh001To002Denied: true,
      denialSqlState: '42501',
      existingSessionsTerminated: false,
      customerRowsRead: false,
      credentialsLogged: false,
    })
  );
} catch {
  let rollbackConfirmed = false;
  if (transaction) {
    try {
      await client?.query('ROLLBACK');
      rollbackConfirmed = true;
    } catch {}
  }
  console.error(
    JSON.stringify({
      code: 'bounded_connect_isolation_failed',
      transactionRolledBack: rollbackConfirmed,
      commitAttempted,
      commitConfirmed,
      credentialsLogged: false,
    })
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  proxy?.kill('SIGTERM');
}
