import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/226_goal_memory_completed_source.sql'
);
const migration = readFileSync(migrationPath, 'utf8');
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

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

describe('goal-memory completed-source migration', () => {
  it('preserves the exact RPC contract and pgvector operator hardening', () => {
    expect(sql).toContain('begin;');
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql).toContain(
      'function public.match_goal_memory( query_embedding extensions.vector(384), match_user_id uuid, match_business_type text default null, match_count int default 8 )'
    );
    expect(sql).toContain('language sql stable set search_path = pg_catalog, extensions');
    expect(sql.match(/operator\(extensions\.<=>\)/g)).toHaveLength(2);
    expect(sql).not.toContain('security definer');
  });

  it('requires exact memory/source ownership and a currently completed source', () => {
    expect(sql).toContain('function public.guard_goal_memory_completed_source()');
    expect(sql).toContain('language plpgsql set search_path = pg_catalog');
    expect(sql).toContain('before insert or update of user_id, goal_id on public.goal_memory');
    expect(sql).toContain('drop policy if exists "goal_memory_owner_insert"');
    expect(sql).toContain('inner join public.goals as source_goal');
    expect(sql).toContain('source_goal.id = gm.goal_id');
    expect(sql).toContain('source_goal.user_id = gm.user_id');
    expect(sql).toContain('gm.user_id = match_user_id');
    expect(sql).toContain('source_goal.user_id = match_user_id');
    expect(sql).toContain("source_goal.status = 'completed'");
    expect(sql).toContain(
      '(match_business_type is null or gm.business_type = match_business_type)'
    );
  });
});

const canRunPostgres = ['initdb', 'pg_ctl', 'psql'].every(binaryAvailable);

describe.runIf(canRunPostgres)('goal-memory source invariant in real PostgreSQL', () => {
  it('excludes forged, stale, cross-user, and newly-cancelled rows for all callers', () => {
    const temporaryRoot = existsSync('/tmp') ? '/tmp' : tmpdir();
    const root = mkdtempSync(join(temporaryRoot, 'orqaly-goal-memory-source-'));
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
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;

create type extensions.vector;
create function extensions.vector_in(cstring, oid, integer)
returns extensions.vector language internal immutable strict as 'textin';
create function extensions.vector_out(extensions.vector)
returns cstring language internal immutable strict as 'textout';
create function extensions.vector_typmod_in(cstring[])
returns integer language internal immutable strict as 'varchartypmodin';
create function extensions.vector_typmod_out(integer)
returns cstring language internal immutable strict as 'varchartypmodout';
create type extensions.vector (
  input = extensions.vector_in,
  output = extensions.vector_out,
  typmod_in = extensions.vector_typmod_in,
  typmod_out = extensions.vector_typmod_out,
  internallength = variable,
  alignment = int4,
  storage = extended
);
create function extensions.vector_cosine_distance(
  extensions.vector,
  extensions.vector
)
returns double precision
language sql
immutable
strict
set search_path = pg_catalog
as $distance$ select 0::double precision $distance$;
create operator extensions.<=> (
  leftarg = extensions.vector,
  rightarg = extensions.vector,
  function = extensions.vector_cosine_distance
);

create function auth.uid() returns uuid
language sql stable
as $uid$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $uid$;

create table public.goals (
  id uuid primary key,
  user_id uuid not null,
  status text not null
);
create table public.goal_memory (
  id uuid primary key,
  user_id uuid not null,
  goal_id uuid,
  kind text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  business_type text,
  embedding extensions.vector(384)
);

alter table public.goals enable row level security;
create policy goals_owner_select on public.goals
  for select to authenticated using (user_id = auth.uid());
alter table public.goal_memory enable row level security;
create policy goal_memory_owner_select on public.goal_memory
  for select to authenticated using (user_id = auth.uid());
create policy goal_memory_owner_insert on public.goal_memory
  for insert to authenticated with check (user_id = auth.uid());

grant usage on schema public, auth, extensions to authenticated, service_role;
grant usage on type extensions.vector to authenticated, service_role;
grant execute on function auth.uid() to authenticated;
grant select, update on table public.goals to authenticated, service_role;
grant select, insert on table public.goal_memory to authenticated, service_role;
`,
        'utf8'
      );
      run('psql', [...connection, '--file', bootstrapPath]);
      run('psql', [...connection, '--file', migrationPath]);
      run('psql', [...connection, '--file', migrationPath]);

      writeFileSync(
        assertionsPath,
        `
create function public.assert_true(actual boolean, label text) returns void
language plpgsql
as $assert$
begin
  if actual is not true then
    raise exception 'assertion failed: %', label;
  end if;
end
$assert$;
grant execute on function public.assert_true(boolean, text) to authenticated, service_role;
grant execute on function public.match_goal_memory(
  extensions.vector, uuid, text, integer
) to authenticated, service_role;

insert into public.goals (id, user_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'completed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'cancelled'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-1111-1111-1111-111111111111', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'completed');

-- Simulate rows that predate the write guard, including corrupted rows a
-- service-role caller could historically create. The RPC must quarantine
-- these by its live source join without relying on destructive cleanup.
alter table public.goal_memory disable trigger goal_memory_completed_source_guard;
insert into public.goal_memory (
  id, user_id, goal_id, kind, content, business_type, embedding
) values
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc1',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'summary', 'valid-user-a', 'research', '[1,0]'
  ),
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc2',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'summary', 'cancelled-user-a', 'research', '[1,0]'
  ),
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc3',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'summary', 'stale-user-a', 'research', '[1,0]'
  ),
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc4',
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'summary', 'forged-source-owner', 'research', '[1,0]'
  ),
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc5',
    '11111111-1111-1111-1111-111111111111',
    null,
    'summary', 'orphan-user-a', 'research', '[1,0]'
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    '22222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'summary', 'valid-user-b', 'research', '[1,0]'
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddddd2',
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'summary', 'forged-memory-owner', 'research', '[1,0]'
  );
alter table public.goal_memory enable trigger goal_memory_completed_source_guard;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
set search_path = pg_catalog, public;
select public.assert_true(
  (
    select coalesce(array_agg(content order by content), array[]::text[])
      = array['valid-user-a']::text[]
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '11111111-1111-1111-1111-111111111111',
      'research',
      20
    )
  ),
  'authenticated caller sees only its live completed exact-owner source'
);
select public.assert_true(
  (
    select count(*) = 0
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '22222222-2222-2222-2222-222222222222',
      'research',
      20
    )
  ),
  'authenticated caller cannot use an explicit cross-user scope'
);
do $authenticated_guard$
begin
  begin
    insert into public.goal_memory (
      id, user_id, goal_id, kind, content, business_type, embedding
    ) values (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
      'summary', 'authenticated-active-write', 'research', '[1,0]'
    );
    raise exception 'authenticated write accepted a non-completed source';
  exception
    when check_violation or insufficient_privilege then null;
  end;
  begin
    insert into public.goal_memory (
      id, user_id, goal_id, kind, content, business_type, embedding
    ) values (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',
      '11111111-1111-1111-1111-111111111111',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'summary', 'authenticated-forged-owner-write', 'research', '[1,0]'
    );
    raise exception 'authenticated write accepted a cross-owner source';
  exception
    when check_violation or insufficient_privilege then null;
  end;
end
$authenticated_guard$;
select public.assert_true(
  (
    select count(*) = 0
    from public.goal_memory
    where id in (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3'
    )
  ),
  'authenticated inserts reject active and cross-owner sources'
);
reset role;

set role service_role;
set search_path = pg_catalog, public;
select public.assert_true(
  (
    select coalesce(array_agg(content order by content), array[]::text[])
      = array['valid-user-a']::text[]
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '11111111-1111-1111-1111-111111111111',
      'research',
      20
    )
  ),
  'service role remains explicitly scoped to user a'
);
select public.assert_true(
  (
    select coalesce(array_agg(content order by content), array[]::text[])
      = array['valid-user-b']::text[]
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '22222222-2222-2222-2222-222222222222',
      'research',
      20
    )
  ),
  'service role remains explicitly scoped to user b'
);

do $guard$
begin
  begin
    insert into public.goal_memory (
      id, user_id, goal_id, kind, content, business_type, embedding
    ) values (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
      'summary', 'late-active-write', 'research', '[1,0]'
    );
    raise exception 'write guard accepted a non-completed source';
  exception
    when check_violation then null;
  end;
end
$guard$;
select public.assert_true(
  (
    select count(*) = 0
    from public.goal_memory
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
  ),
  'write guard rejects a source that is no longer completed'
);

update public.goals
set status = 'cancelled'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
select public.assert_true(
  (
    select count(*) = 1
    from public.goal_memory
    where id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
  ),
  'cancellation does not rely on memory cleanup'
);
select public.assert_true(
  (
    select count(*) = 0
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '11111111-1111-1111-1111-111111111111',
      'research',
      20
    )
  ),
  'completed to cancelled is excluded immediately by the live join'
);
reset role;

select public.assert_true(
  (
    select procedure.pronargs = 4
      and procedure.pronargdefaults = 2
      and procedure.prosecdef is false
      and procedure.provolatile = 's'
      and procedure.proconfig @> array['search_path=pg_catalog, extensions']::text[]
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'match_goal_memory'
  ),
  'match_user_id remains required and the RPC remains stable invoker-security'
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
