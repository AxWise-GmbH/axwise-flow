// Operator-only: rotate the existing Preview Gateway login, not its privileges.
// All secret material stays in memory; never print raw exceptions/URLs.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { parse } from 'pg-connection-string';

const project = 'axwise-v2-preview-001';
const secret = (name) =>
  execFileSync(
    'gcloud',
    ['secrets', 'versions', 'access', '1', `--secret=${name}`, `--project=${project}`],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
const add = (name, value) =>
  execFileSync(
    'gcloud',
    [
      'secrets',
      'versions',
      'add',
      name,
      '--data-file=-',
      `--project=${project}`,
      '--format=value(name)',
    ],
    { input: value, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  )
    .trim()
    .split('/')
    .at(-1);

let admin;
try {
  if (process.env.ORQALY_ROTATE_PREVIEW_GATEWAY !== 'rotate-existing-preview-login') {
    throw new Error('confirmation_required');
  }
  const current = secret('orqaly-v2-preview-001-db-gateway-url');
  const config = parse(current);
  if (
    config.user !== 'orqaly_v2_001_gateway_login' ||
    config.database !== 'orqaly_v2_preview_001'
  ) {
    throw new Error('unexpected_target');
  }
  const password = randomBytes(24).toString('hex');
  const replacement = current.replace(`:${encodeURIComponent(config.password)}@`, `:${password}@`);
  if (replacement === current) throw new Error('url_replacement_failed');
  admin = new pg.Client({
    host: '127.0.0.1',
    port: 19471,
    user: 'postgres',
    password: secret('orqaly-v2-preview-001-db-admin-password'),
    database: config.database,
  });
  await admin.connect();
  const passwordVersion = add('orqaly-v2-preview-001-db-gateway-password', password);
  const urlVersion = add('orqaly-v2-preview-001-db-gateway-url', replacement);
  // Strict hex, not arbitrary input; PostgreSQL utility statements cannot bind parameters.
  if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('invalid_generated_material');
  await admin.query(`ALTER ROLE orqaly_v2_001_gateway_login PASSWORD '${password}'`);
  const probe = new pg.Client({ ...config, host: '127.0.0.1', port: 19471, password });
  await probe.connect();
  await probe.end();
  console.log(JSON.stringify({ rotated: true, passwordVersion, urlVersion }));
} catch (error) {
  console.error(JSON.stringify({ rotated: false, code: error.code || 'rotation_failed' }));
  process.exitCode = 1;
} finally {
  await admin?.end().catch(() => {});
}
