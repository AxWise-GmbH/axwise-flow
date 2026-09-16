import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from '../config.js';

const { Client } = pg;
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SYSTEM_SCHEMAS = new Set(['information_schema', 'pg_catalog']);
const AGENTIC_SCHEMAS = new Set(['public', 'agentic', 'agentic_meta']);
const AGENTIC_TABLES = new Set([
  'action_intents',
  'agent_delegations',
  'agent_events',
  'agent_mutation_requests',
  'agent_profile_versions',
  'agent_persona_versions',
  'agent_team_memberships',
  'agent_teams',
  'agents',
  'approval_requests',
  'approval_subject_action_intents',
  'approval_subjects',
  'execution_plan_proposals',
  'execution_plan_versions',
  'execution_plans',
  'execution_runs',
  'execution_steps',
  'materialization_requests',
  'memory_access_logs',
  'memory_items',
  'memory_namespaces',
  'notification_channel_grants',
  'notification_deliveries',
  'notification_preferences',
  'outbox_events',
  'run_events',
  'step_attempts',
  'step_receipts',
]);

async function migrationFiles() {
  const directory = path.join(serviceRoot, 'migrations');
  const names = (await fs.readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await fs.readFile(path.join(directory, name), 'utf8');
      return {
        name,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    })
  );
}

function isSystemSchema(name) {
  return SYSTEM_SCHEMAS.has(name) || name.startsWith('pg_');
}

/**
 * Refuse to initialize over an application/Supabase/legacy database.
 *
 * A pristine database may contain PostgreSQL's empty `public` schema. A database
 * previously initialized by this migrator may contain only `agentic`, its
 * migration marker, and no public/foreign application tables. Reusing a Cloud
 * SQL *instance* is supported; reusing an existing application database is not.
 */
export async function assertFreshOrAgenticDatabase(
  client,
  { knownMigrationNames = new Set() } = {}
) {
  const [schemaResult, tableResult] = await Promise.all([
    client.query(`
      select nspname as schema_name
        from pg_catalog.pg_namespace
       order by nspname
    `),
    client.query(`
      select n.nspname as schema_name, c.relname as table_name
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p')
       order by n.nspname, c.relname
    `),
  ]);

  const userSchemas = schemaResult.rows
    .map((row) => row.schema_name)
    .filter((name) => !isSystemSchema(name));
  const unknownSchemas = userSchemas.filter((name) => !AGENTIC_SCHEMAS.has(name));
  if (unknownSchemas.length) {
    throw new Error(`agentic_database_unknown_schemas:${unknownSchemas.join(',')}`);
  }

  const userTables = tableResult.rows.filter((row) => !isSystemSchema(row.schema_name));
  const markerPresent = userTables.some(
    (row) => row.schema_name === 'agentic_meta' && row.table_name === 'schema_migrations'
  );
  const foreignTables = userTables.filter((row) => {
    if (row.schema_name === 'agentic') {
      return !markerPresent || !AGENTIC_TABLES.has(row.table_name);
    }
    return !(
      markerPresent &&
      row.schema_name === 'agentic_meta' &&
      row.table_name === 'schema_migrations'
    );
  });
  if (foreignTables.length) {
    const identities = foreignTables.map((row) => `${row.schema_name}.${row.table_name}`);
    throw new Error(`agentic_database_not_empty:${identities.join(',')}`);
  }

  if (markerPresent) {
    const applied = await client.query(
      'select name from agentic_meta.schema_migrations order by name'
    );
    const unknownMigrations = applied.rows
      .map((row) => row.name)
      .filter((name) => !knownMigrationNames.has(name));
    if (unknownMigrations.length) {
      throw new Error(`agentic_database_unknown_migrations:${unknownMigrations.join(',')}`);
    }
  }
}

export async function migrate({ databaseUrl }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [716493021]);
    const migrations = await migrationFiles();
    await assertFreshOrAgenticDatabase(client, {
      knownMigrationNames: new Set(migrations.map((migration) => migration.name)),
    });
    await client.query(`
      create schema if not exists agentic_meta;
      create table if not exists agentic_meta.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query(
        'select checksum from agentic_meta.schema_migrations where name = $1',
        [migration.name]
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== migration.checksum) {
          throw new Error(`migration_checksum_mismatch:${migration.name}`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'insert into agentic_meta.schema_migrations (name, checksum) values ($1, $2)',
          [migration.name, migration.checksum]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [716493021]).catch(() => {});
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  await migrate({ databaseUrl: config.DATABASE_URL });
}
