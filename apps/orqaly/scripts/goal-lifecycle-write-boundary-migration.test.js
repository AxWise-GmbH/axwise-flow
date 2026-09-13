import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/223_goal_lifecycle_server_write_boundary.sql'
);
const migration = readFileSync(migrationPath, 'utf8');
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

const lifecycleTables = ['goals', 'goal_log', 'goal_messages'];
const browserCrudTables = ['team_tasks', 'jobs'];
const allTables = [...lifecycleTables, ...browserCrudTables];

function policyBody(name) {
  const start = sql.indexOf(`create policy "${name}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(';', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 1);
}

function binaryAvailable(name) {
  return (process.env.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .some((directory) => existsSync(join(directory, name)));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `${basename(command)} ${args.join(' ')} failed with status ${result.status}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return result;
}

describe('goal lifecycle server-write boundary migration', () => {
  it('atomically replaces every policy on the five boundary tables', () => {
    expect(sql.startsWith('-- 223_goal_lifecycle_server_write_boundary.sql')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql).toContain('from pg_catalog.pg_policies as policy');
    expect(sql).toContain("policy.schemaname = 'public'");
    expect(sql).toContain("'drop policy %i on public.%i'");
    for (const table of allTables) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`'${table}'`);
    }
  });

  it('makes goals, logs, and messages owner-readable and service-writable only', () => {
    for (const table of lifecycleTables) {
      const ownerPolicy = policyBody(`${table}_owner_select`);
      const servicePolicy = policyBody(`${table}_service`);
      expect(ownerPolicy).toContain('for select to authenticated');
      expect(servicePolicy).toContain('for all to service_role');
      expect(servicePolicy).toContain('using (true)');
      expect(servicePolicy).toContain('with check (true)');
      expect(sql).not.toContain(`"${table}_owner_insert"`);
      expect(sql).not.toContain(`"${table}_owner_update"`);
      expect(sql).not.toContain(`"${table}_owner_delete"`);
    }
    expect(policyBody('goals_owner_select')).toContain('user_id = auth.uid()');
    for (const table of ['goal_log', 'goal_messages']) {
      const ownerPolicy = policyBody(`${table}_owner_select`);
      expect(ownerPolicy).toContain('from public.goals as goal');
      expect(ownerPolicy).toContain(`goal.id = ${table}.goal_id`);
      expect(ownerPolicy).toContain('goal.user_id = auth.uid()');
    }
  });

  it('allows browser mutation only when both old and new task/job rows are unbound', () => {
    for (const table of browserCrudTables) {
      expect(policyBody(`${table}_owner_select`)).toContain('user_id = auth.uid()');
      const insert = policyBody(`${table}_owner_manual_insert`);
      const update = policyBody(`${table}_owner_manual_update`);
      const deletion = policyBody(`${table}_owner_manual_delete`);
      const service = policyBody(`${table}_service`);
      for (const predicate of [insert, update, deletion]) {
        expect(predicate).toContain('user_id = auth.uid()');
        expect(predicate).toContain('goal_id is null');
        expect(predicate).toContain("not (coalesce(data, '{}'::jsonb) ? 'goal_id')");
        expect(predicate).toContain('materialization_attempt is null');
        expect(predicate).toContain(
          "not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')"
        );
      }
      expect(update.match(/user_id = auth\.uid\(\)/g)).toHaveLength(2);
      expect(update.match(/goal_id is null/g)).toHaveLength(2);
      expect(update.match(/materialization_attempt is null/g)).toHaveLength(2);
      expect(service).toContain('for all to service_role');
      expect(service).toContain('with check (true)');
    }
  });

  it('mirrors RLS with grants while preserving manual browser CRUD', () => {
    expect(sql).toMatch(
      /revoke all privileges on table public\.goals, public\.goal_log, public\.goal_messages, public\.team_tasks, public\.jobs from public, anon, authenticated;/
    );
    expect(sql).toMatch(
      /grant select on table public\.goals, public\.goal_log, public\.goal_messages, public\.team_tasks, public\.jobs to authenticated;/
    );
    expect(sql).toMatch(
      /grant insert, update, delete on table public\.team_tasks, public\.jobs to authenticated;/
    );
    expect(sql).not.toMatch(
      /grant (?:insert|update|delete)[^;]*public\.(?:goals|goal_log|goal_messages)[^;]*to authenticated;/
    );
    expect(sql).toMatch(
      /grant all privileges on table public\.goals, public\.goal_log, public\.goal_messages, public\.team_tasks, public\.jobs to service_role;/
    );
  });
});

const canRunPostgres = ['initdb', 'pg_ctl', 'psql'].every(binaryAvailable);

describe.runIf(canRunPostgres)('goal lifecycle boundary in real PostgreSQL', () => {
  it('blocks lifecycle forgery, preserves manual CRUD, and retains service writes', () => {
    // Keep the Unix-socket path below PostgreSQL's platform limit.  macOS's
    // os.tmpdir() lives under a long /var/folders path, while /tmp is the
    // stable short, writable alias intended for this purpose.
    const temporaryRoot = existsSync('/tmp') ? '/tmp' : tmpdir();
    const root = mkdtempSync(join(temporaryRoot, 'orqaly-goal-rls-'));
    const dataDirectory = join(root, 'data');
    const socketDirectory = join(root, 'socket');
    const postgresLogPath = join(root, 'postgres.log');
    const bootstrapPath = join(root, 'bootstrap.sql');
    const assertionsPath = join(root, 'assertions.sql');
    mkdirSync(socketDirectory);

    const connection = [
      '-X',
      '--set=ON_ERROR_STOP=1',
      '--host',
      socketDirectory,
      '--username',
      'postgres',
      '--dbname',
      'postgres',
    ];

    try {
      run('initdb', [
        '--pgdata',
        dataDirectory,
        '--auth=trust',
        '--username=postgres',
        '--no-locale',
        '--encoding=UTF8',
      ]);
      run('pg_ctl', [
        '--pgdata',
        dataDirectory,
        '--log',
        postgresLogPath,
        '--options',
        `-F -c listen_addresses='' -c unix_socket_directories='${socketDirectory}'`,
        '--wait',
        'start',
      ]);

      writeFileSync(
        bootstrapPath,
        `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

create table public.goals (
  id uuid primary key,
  user_id uuid not null,
  title text not null default ''
);
create table public.goal_log (
  id text primary key,
  goal_id uuid not null references public.goals(id),
  details jsonb not null default '{}'::jsonb
);
create table public.goal_messages (
  id text primary key,
  goal_id uuid not null references public.goals(id),
  message text not null default ''
);
create table public.team_tasks (
  id text primary key,
  user_id uuid,
  goal_id uuid,
  materialization_attempt text,
  title text not null default '',
  data jsonb default '{}'::jsonb
);
create table public.jobs (
  id text primary key,
  user_id uuid,
  goal_id uuid,
  materialization_attempt text,
  description text not null default '',
  data jsonb not null default '{}'::jsonb
);

alter table public.goals enable row level security;
alter table public.goal_log enable row level security;
alter table public.goal_messages enable row level security;
alter table public.team_tasks enable row level security;
alter table public.jobs enable row level security;

create policy "Users manage own goals" on public.goals
  for all to authenticated using (true) with check (true);
create policy "Users see own goal logs" on public.goal_log
  for all to authenticated using (true) with check (true);
create policy "Users see own goal messages" on public.goal_messages
  for all to authenticated using (true) with check (true);
create policy "team_tasks_owner_all" on public.team_tasks
  for all to authenticated using (true) with check (true);
create policy "dashboard emergency job writes" on public.jobs
  for all to authenticated using (true) with check (true);

grant all privileges on all tables in schema public to authenticated, service_role;
`,
        'utf8'
      );
      run('psql', [...connection, '--file', bootstrapPath]);
      run('psql', [...connection, '--file', migrationPath]);
      // Re-running proves the complete-policy replacement is idempotent.
      run('psql', [...connection, '--file', migrationPath]);

      writeFileSync(
        assertionsPath,
        `
create function public.assert_true(actual boolean, label text) returns void
language plpgsql
as $$
begin
  if actual is not true then
    raise exception 'assertion failed: %', label;
  end if;
end
$$;

create function public.expect_denied(statement text, label text) returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'statement unexpectedly succeeded: %', label;
exception
  when insufficient_privilege then null;
end
$$;

grant execute on function public.assert_true(boolean, text) to authenticated, service_role;
grant execute on function public.expect_denied(text, text) to authenticated;

insert into public.goals (id, user_id, title) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner goal'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'other goal');
insert into public.goal_log (id, goal_id) values
  ('owner-log', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('other-log', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.goal_messages (id, goal_id) values
  ('owner-message', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('other-message', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.team_tasks (
  id, user_id, goal_id, materialization_attempt, title, data
) values
  (
    'bound-task', '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formation-1', 'bound',
    '{"goal_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","materialization_attempt":"work-1"}'
  ),
  (
    'other-task', '22222222-2222-2222-2222-222222222222',
    null, null, 'other', '{}'
  );
insert into public.jobs (
  id, user_id, goal_id, materialization_attempt, description, data
) values
  (
    'bound-job', '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formation-1', 'bound', '{}'
  ),
  (
    'other-job', '22222222-2222-2222-2222-222222222222',
    null, null, 'other', '{}'
  );

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select public.assert_true((select count(*) = 1 from public.goals), 'owner goal select');
select public.assert_true((select count(*) = 1 from public.goal_log), 'owner log select');
select public.assert_true((select count(*) = 1 from public.goal_messages), 'owner message select');
select public.assert_true((select count(*) = 1 from public.team_tasks), 'owner task select');
select public.assert_true((select count(*) = 1 from public.jobs), 'owner job select');

select public.expect_denied(
  $sql$update public.goals set title = 'forged' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$sql$,
  'browser goal update'
);
select public.expect_denied(
  $sql$insert into public.goal_log (id, goal_id) values ('forged-log', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$sql$,
  'browser log insert'
);
select public.expect_denied(
  $sql$insert into public.goal_messages (id, goal_id) values ('forged-message', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$sql$,
  'browser message insert'
);

insert into public.team_tasks (id, user_id, title, data) values
  ('manual-task', '11111111-1111-1111-1111-111111111111', 'manual', '{"notes":"safe"}'),
  ('manual-task-delete', '11111111-1111-1111-1111-111111111111', 'delete', '{}');
update public.team_tasks set title = 'manual updated' where id = 'manual-task';
delete from public.team_tasks where id = 'manual-task-delete';
select public.assert_true(
  (select title = 'manual updated' from public.team_tasks where id = 'manual-task'),
  'manual task CRUD'
);

insert into public.jobs (id, user_id, description, data) values
  ('manual-job', '11111111-1111-1111-1111-111111111111', 'manual', '{"teamName":"safe"}'),
  ('manual-job-delete', '11111111-1111-1111-1111-111111111111', 'delete', '{}');
update public.jobs set description = 'manual updated' where id = 'manual-job';
delete from public.jobs where id = 'manual-job-delete';
select public.assert_true(
  (select description = 'manual updated' from public.jobs where id = 'manual-job'),
  'manual job CRUD'
);

select public.expect_denied(
  $sql$insert into public.team_tasks (id, user_id, goal_id) values ('forge-task-goal', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$sql$,
  'task typed goal binding'
);
select public.expect_denied(
  $sql$insert into public.team_tasks (id, user_id, data) values ('forge-task-json-goal', '11111111-1111-1111-1111-111111111111', '{"goal_id":null}')$sql$,
  'task JSON goal binding'
);
select public.expect_denied(
  $sql$insert into public.team_tasks (id, user_id, materialization_attempt) values ('forge-task-attempt', '11111111-1111-1111-1111-111111111111', 'formation-forged')$sql$,
  'task typed attempt binding'
);
select public.expect_denied(
  $sql$update public.team_tasks set data = '{"materialization_attempt":"work-forged"}' where id = 'manual-task'$sql$,
  'manual task promotion to lifecycle state'
);
select public.expect_denied(
  $sql$insert into public.team_tasks (id, user_id) values ('forge-task-owner', '22222222-2222-2222-2222-222222222222')$sql$,
  'task owner forgery'
);

select public.expect_denied(
  $sql$insert into public.jobs (id, user_id, goal_id) values ('forge-job-goal', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$sql$,
  'job typed goal binding'
);
select public.expect_denied(
  $sql$insert into public.jobs (id, user_id, data) values ('forge-job-json-goal', '11111111-1111-1111-1111-111111111111', '{"goal_id":null}')$sql$,
  'job JSON goal binding'
);
select public.expect_denied(
  $sql$insert into public.jobs (id, user_id, data) values ('forge-job-json-attempt', '11111111-1111-1111-1111-111111111111', '{"materialization_attempt":null}')$sql$,
  'job JSON attempt binding'
);
select public.expect_denied(
  $sql$update public.jobs set materialization_attempt = 'formation-forged' where id = 'manual-job'$sql$,
  'manual job promotion to lifecycle state'
);
select public.expect_denied(
  $sql$update public.jobs set user_id = '22222222-2222-2222-2222-222222222222' where id = 'manual-job'$sql$,
  'job owner forgery'
);

-- USING evaluates OLD: attempts to first detach a server row simply affect no
-- row and cannot turn it into a browser-writable row.
update public.team_tasks
   set goal_id = null, materialization_attempt = null, data = '{}'
 where id = 'bound-task';
delete from public.jobs where id = 'bound-job';
reset role;
select public.assert_true(
  (select goal_id is not null and materialization_attempt = 'formation-1'
     from public.team_tasks where id = 'bound-task'),
  'bound task cannot be detached'
);
select public.assert_true(
  exists (select 1 from public.jobs where id = 'bound-job'),
  'bound job cannot be deleted'
);

set role service_role;
update public.goals
   set title = 'trusted update'
 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.team_tasks set title = 'trusted bound update' where id = 'bound-task';
update public.jobs set description = 'trusted bound update' where id = 'bound-job';
insert into public.goal_log (id, goal_id)
values ('trusted-log', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
reset role;

select public.assert_true(
  (select title = 'trusted update' from public.goals
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'service goal write'
);
select public.assert_true(
  (select title = 'trusted bound update' from public.team_tasks where id = 'bound-task'),
  'service bound task write'
);
select public.assert_true(
  (select description = 'trusted bound update' from public.jobs where id = 'bound-job'),
  'service bound job write'
);

select public.assert_true(
  not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename in ('goals', 'goal_log', 'goal_messages', 'team_tasks', 'jobs')
       and policyname in (
         'Users manage own goals',
         'Users see own goal logs',
         'Users see own goal messages',
         'team_tasks_owner_all',
         'dashboard emergency job writes'
       )
  ),
  'historical and unknown broad policies removed'
);
`,
        'utf8'
      );
      run('psql', [...connection, '--file', assertionsPath]);
    } finally {
      if (existsSync(dataDirectory)) {
        spawnSync('pg_ctl', ['--pgdata', dataDirectory, '--mode=immediate', '--wait', 'stop'], {
          encoding: 'utf8',
        });
      }
      rmSync(root, { force: true, recursive: true });
    }
  }, 30_000);
});
