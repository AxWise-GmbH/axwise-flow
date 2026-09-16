// Additive Preview repair, with immutable source and ledger verification.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';

const number = process.argv[2] === '010' ? 10 : 9;
const path = `database/workflow-v2/migrations/${number === 10 ? '010_committed_receipt_recovery' : '009_executable_action_recovery'}.sql`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
let client;
try {
  if (
    process.env.ORQALY_APPLY_PREVIEW_RECOVERY !==
    `apply-reviewed-migration-${String(number).padStart(3, '0')}`
  ) {
    throw new Error('confirmation_required');
  }
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const source = execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' });
  if (hash(source) !== hash(readFileSync(path))) throw new Error('uncommitted_migration');
  const baselineHash = hash(
    readFileSync(
      `database/workflow-v2/migrations/${number === 10 ? '009_executable_action_recovery' : '008_agentic_execution_preview'}.sql`
    )
  );
  const password = execFileSync(
    'gcloud',
    [
      'secrets',
      'versions',
      'access',
      '1',
      '--secret=orqaly-v2-preview-001-db-admin-password',
      '--project=axwise-v2-preview-001',
    ],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
  client = new pg.Client({
    host: '127.0.0.1',
    port: 19471,
    user: 'postgres',
    password,
    database: 'orqaly_v2_preview_001',
  });
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('orqaly-preview-recovery-009'))");
  const prior = await client.query(
    `SELECT migration_number,sha256 FROM workflow_v2_release.applied_additive_migrations
    WHERE component='orqaly' AND migration_number IN ($1,$2)`,
    [number - 1, number]
  );
  if (prior.rows.find((row) => row.migration_number === number - 1)?.sha256 !== baselineHash) {
    throw new Error('baseline_mismatch');
  }
  const existing = prior.rows.find((row) => row.migration_number === number);
  if (existing && existing.sha256 !== hash(source)) throw new Error('recovery_migration_drift');
  if (!existing) {
    await client.query(source.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
    await client.query(`ALTER TABLE workflow_v2_release.applied_additive_migrations
      DROP CONSTRAINT applied_additive_migrations_migration_number_check;
      ALTER TABLE workflow_v2_release.applied_additive_migrations
      ADD CONSTRAINT applied_additive_migrations_migration_number_check CHECK(migration_number BETWEEN 2 AND ${number})`);
    await client.query(
      `INSERT INTO workflow_v2_release.applied_additive_migrations(
      component,migration_number,migration_path,sha256,first_applied_source_commit,source_commit)
      VALUES('orqaly',$1,$2,$3,$4,$4)`,
      [number, path, hash(source), sourceCommit]
    );
  }
  await client.query('COMMIT');
  console.log(
    JSON.stringify({ migration: number, sha256: hash(source), sourceCommit, applied: !existing })
  );
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ migration: number, code: error.code || 'apply_failed' }));
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
