// Incident recovery, limited to the preview API database login. Never logs
// credentials, connection strings, subprocess errors or database error objects.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const project = 'axwise-v2-preview-001';
const secretName = 'orqaly-v2-preview-001-db-api-url';
const mode = process.argv[2];
let proxy;
let client;
const cloud = (args, input) =>
  execFileSync('gcloud', [...args, `--project=${project}`], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
try {
  if (!['stage', 'rotate'].includes(mode)) throw new Error('mode_required');
  const versions = JSON.parse(cloud(['secrets', 'versions', 'list', secretName, '--format=json']));
  if (mode === 'stage') {
    if (versions.some((item) => item.name.endsWith('/2'))) {
      console.log(JSON.stringify({ staged: true, version: 2, existing: true }));
    } else {
      if (versions.length !== 1 || !versions[0].name.endsWith('/1'))
        throw new Error('unexpected_versions');
      const old = cloud(['secrets', 'versions', 'access', '1', `--secret=${secretName}`]);
      const prefix = 'postgresql://orqaly_v2_001_api_login:';
      if (!old.startsWith(prefix) || !old.includes('@/orqaly_v2_preview_001?host=/cloudsql/'))
        throw new Error('unexpected_connection_shape');
      const password = randomBytes(32).toString('hex');
      const updated = `${prefix}${password}${old.slice(old.indexOf('@/'))}`;
      const result = JSON.parse(
        cloud(['secrets', 'versions', 'add', secretName, '--data-file=-', '--format=json'], updated)
      );
      if (!result.name.endsWith('/2')) throw new Error('unexpected_new_version');
      console.log(JSON.stringify({ staged: true, version: 2 }));
    }
  } else {
    const updated = cloud(['secrets', 'versions', 'access', '2', `--secret=${secretName}`]);
    const match = updated.match(
      /^postgresql:\/\/orqaly_v2_001_api_login:([a-f0-9]{64})@\/orqaly_v2_preview_001\?host=\/cloudsql\//
    );
    if (!match) throw new Error('unexpected_new_credential_shape');
    const adminPassword = cloud([
      'secrets',
      'versions',
      'access',
      '1',
      '--secret=orqaly-v2-preview-001-db-admin-password',
    ]);
    proxy = spawn(
      'cloud-sql-proxy',
      [
        `${project}:europe-west4:orqaly-v2-preview-001-pg`,
        '--gcloud-auth',
        '--address=127.0.0.1',
        '--port=19479',
      ],
      { stdio: 'ignore' }
    );
    for (let attempt = 0; attempt < 40; attempt++) {
      if (proxy.exitCode !== null) throw new Error('proxy_failed');
      const candidate = new pg.Client({
        host: '127.0.0.1',
        port: 19479,
        user: 'postgres',
        password: adminPassword,
        database: 'orqaly_v2_preview_001',
        connectionTimeoutMillis: 1000,
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
    if (!client) throw new Error('connection_failed');
    await client.query(`ALTER ROLE orqaly_v2_001_api_login PASSWORD '${match[1]}'`);
    const check = new pg.Client({
      host: '127.0.0.1',
      port: 19479,
      user: 'orqaly_v2_001_api_login',
      password: match[1],
      database: 'orqaly_v2_preview_001',
      connectionTimeoutMillis: 5000,
    });
    try {
      await check.connect();
      await check.query('SELECT 1');
    } finally {
      await check.end();
    }
    console.log(JSON.stringify({ rotated: true, newCredentialVerified: true, version: 2 }));
  }
} catch {
  console.error(
    JSON.stringify({
      mode,
      success: false,
      message: 'Credential recovery step failed; sensitive errors suppressed.',
    })
  );
  process.exitCode = 1;
} finally {
  await client?.end();
  proxy?.kill('SIGTERM');
}
