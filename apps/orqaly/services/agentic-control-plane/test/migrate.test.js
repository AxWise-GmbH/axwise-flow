import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { assertFreshOrAgenticDatabase } from '../src/db/migrate.js';

function clientWith({ schemas, tables, migrations = [] }) {
  let queryNumber = 0;
  return {
    async query() {
      queryNumber += 1;
      if (queryNumber === 1) return { rows: schemas.map((schema_name) => ({ schema_name })) };
      if (queryNumber === 2) return { rows: tables };
      return { rows: migrations.map((name) => ({ name })) };
    },
  };
}

test('fresh database preflight permits only an empty public schema', async () => {
  await assert.doesNotReject(() =>
    assertFreshOrAgenticDatabase(
      clientWith({ schemas: ['pg_catalog', 'information_schema', 'public'], tables: [] })
    )
  );
});

test('fresh database preflight permits a database already owned by this migrator', async () => {
  await assert.doesNotReject(() =>
    assertFreshOrAgenticDatabase(
      clientWith({
        schemas: ['pg_catalog', 'public', 'agentic', 'agentic_meta'],
        tables: [
          { schema_name: 'agentic', table_name: 'agents' },
          { schema_name: 'agentic_meta', table_name: 'schema_migrations' },
        ],
        migrations: ['001_agent_identity_and_runs.sql'],
      }),
      { knownMigrationNames: new Set(['001_agent_identity_and_runs.sql']) }
    )
  );
});

test('fresh database preflight rejects an existing application table', async () => {
  await assert.rejects(
    () =>
      assertFreshOrAgenticDatabase(
        clientWith({
          schemas: ['pg_catalog', 'public'],
          tables: [{ schema_name: 'public', table_name: 'users' }],
        })
      ),
    /agentic_database_not_empty:public\.users/
  );
});

test('fresh database preflight rejects a Supabase or other foreign schema', async () => {
  await assert.rejects(
    () =>
      assertFreshOrAgenticDatabase(
        clientWith({ schemas: ['pg_catalog', 'public', 'auth'], tables: [] })
      ),
    /agentic_database_unknown_schemas:auth/
  );
});

test('agentic tables without this migrator marker are not treated as trusted', async () => {
  await assert.rejects(
    () =>
      assertFreshOrAgenticDatabase(
        clientWith({
          schemas: ['pg_catalog', 'public', 'agentic'],
          tables: [{ schema_name: 'agentic', table_name: 'agents' }],
        })
      ),
    /agentic_database_not_empty:agentic\.agents/
  );
});

test('marker-owned database rejects an unknown Agent table', async () => {
  await assert.rejects(
    () =>
      assertFreshOrAgenticDatabase(
        clientWith({
          schemas: ['pg_catalog', 'public', 'agentic', 'agentic_meta'],
          tables: [
            { schema_name: 'agentic', table_name: 'unreviewed_table' },
            { schema_name: 'agentic_meta', table_name: 'schema_migrations' },
          ],
        })
      ),
    /agentic_database_not_empty:agentic\.unreviewed_table/
  );
});

test('marker-owned database rejects an unknown migration record', async () => {
  await assert.rejects(
    () =>
      assertFreshOrAgenticDatabase(
        clientWith({
          schemas: ['pg_catalog', 'public', 'agentic', 'agentic_meta'],
          tables: [{ schema_name: 'agentic_meta', table_name: 'schema_migrations' }],
          migrations: ['999_unknown.sql'],
        }),
        { knownMigrationNames: new Set(['001_agent_identity_and_runs.sql']) }
      ),
    /agentic_database_unknown_migrations:999_unknown\.sql/
  );
});

test('first-class Agent tables are recognized as migrator-owned tables', async () => {
  await assert.doesNotReject(() =>
    assertFreshOrAgenticDatabase(
      clientWith({
        schemas: ['pg_catalog', 'public', 'agentic', 'agentic_meta'],
        tables: [
          { schema_name: 'agentic', table_name: 'agent_profile_versions' },
          { schema_name: 'agentic', table_name: 'agent_mutation_requests' },
          { schema_name: 'agentic', table_name: 'agent_events' },
          { schema_name: 'agentic_meta', table_name: 'schema_migrations' },
        ],
        migrations: ['009_first_class_agent_profiles.sql'],
      }),
      { knownMigrationNames: new Set(['009_first_class_agent_profiles.sql']) }
    )
  );
});

test('first-class Agent migration is additive, tenant-isolated and keeps revisions immutable', async () => {
  const sql = await fs.readFile(
    new URL('../migrations/009_first_class_agent_profiles.sql', import.meta.url),
    'utf8'
  );

  assert.match(sql, /alter column source_task_id drop not null/);
  assert.match(sql, /add column workflow_run_id uuid/);
  assert.match(sql, /set expires_at = created_at \+ interval '90 days'/);
  assert.match(sql, /agent_kind = 'temporary' and expires_at is not null/);
  assert.match(sql, /create table agentic\.agent_profile_versions/);
  assert.match(sql, /create table agentic\.agent_mutation_requests/);
  assert.match(sql, /create table agentic\.agent_events/);
  assert.match(sql, /create trigger agentic_profile_immutable/);
  assert.match(sql, /create trigger agentic_agent_event_immutable/);
  assert.match(sql, /alter table agentic\.%I force row level security/);
  assert.match(sql, /org_id = nullif\(current_setting\(''app\.organization_id''/);
  assert.match(sql, /workspace_id = nullif\(current_setting\(''app\.workspace_id''/);
  assert.match(sql, /user_id = nullif\(current_setting\(''app\.user_id''/);
  assert.doesNotMatch(sql, /drop table|truncate table|delete from agentic\.agents/i);
});
