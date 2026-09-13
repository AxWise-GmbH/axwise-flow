import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/225_vector_search_operator_resolution.sql'
);
const migration = readFileSync(migrationPath, 'utf8');
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

function functionBody(name, nextName) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = nextName
    ? sql.indexOf(`create or replace function public.${nextName}(`, start)
    : sql.lastIndexOf('commit;');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
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

describe('vector search operator-resolution migration', () => {
  it('fixes all three exact RPC signatures atomically and idempotently', () => {
    expect(sql.startsWith('-- keep pgvector operator lookup stable')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql).toContain(
      'function public.search_knowledge( query_embedding extensions.vector(384), match_count int default 5, match_threshold float default 0.5, filter_user_id uuid default null, filter_category text default null )'
    );
    expect(sql).toContain(
      'function public.search_agent_memory( query_embedding extensions.vector(384), match_count int default 5, match_threshold float default 0.3, filter_user_id uuid default null, filter_owner_type text default null, filter_owner_id text default null )'
    );
    expect(sql).toContain(
      'function public.match_goal_memory( query_embedding extensions.vector(384), match_user_id uuid, match_business_type text default null, match_count int default 8 )'
    );
  });

  it('pins every operator lookup without changing invoker-security or stability', () => {
    const goalMemory = functionBody('match_goal_memory');
    expect(sql.match(/set search_path = pg_catalog, extensions/g)).toHaveLength(3);
    expect(sql.match(/operator\(extensions\.<=>\)/g)).toHaveLength(8);
    expect(sql).not.toContain('security definer');
    expect(goalMemory).toContain('language sql stable set search_path = pg_catalog, extensions');
  });

  it('preserves every tenant, category, owner, and business-type filter', () => {
    const knowledge = functionBody('search_knowledge', 'search_agent_memory');
    const agentMemory = functionBody('search_agent_memory', 'match_goal_memory');
    const goalMemory = functionBody('match_goal_memory');

    for (const body of [knowledge, agentMemory]) {
      expect(body).toContain('kd.user_id = coalesce(filter_user_id, auth.uid())');
      expect(body).toContain('kd.embedding is not null');
      expect(body).toContain('> match_threshold');
      expect(body).toContain('limit match_count');
    }
    expect(knowledge).toContain('(filter_category is null or kd.category = filter_category)');
    expect(agentMemory).toContain(
      '(filter_owner_type is null or kd.owner_type = filter_owner_type)'
    );
    expect(agentMemory).toContain('(filter_owner_id is null or kd.owner_id = filter_owner_id)');
    expect(goalMemory).toContain('gm.user_id = match_user_id');
    expect(goalMemory).toContain(
      '(match_business_type is null or gm.business_type = match_business_type)'
    );
    expect(goalMemory).toContain('gm.embedding is not null');
    expect(goalMemory).toContain('limit match_count');
  });
});

const canRunPostgres = ['initdb', 'pg_ctl', 'psql'].every(binaryAvailable);

describe.runIf(canRunPostgres)('vector search migration in real PostgreSQL', () => {
  it('reproduces old lookup failures, fixes all three RPCs, and preserves tenant filtering', () => {
    const temporaryRoot = existsSync('/tmp') ? '/tmp' : tmpdir();
    const root = mkdtempSync(join(temporaryRoot, 'orqaly-vector-search-'));
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
create schema auth;
create schema extensions;

-- A minimal varlena test type with pgvector's schema/name/typmod shape lets
-- stock PostgreSQL exercise operator lookup without requiring a system-wide
-- pgvector package. The test operator returns zero distance for every pair.
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

create table public.knowledge_documents (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  content text not null default '',
  source text not null default '',
  category text not null default 'general',
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(384),
  owner_type text,
  owner_id text
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
alter table public.knowledge_documents enable row level security;
create policy knowledge_documents_owner_select on public.knowledge_documents
  for select to authenticated using (user_id = auth.uid());
alter table public.goal_memory enable row level security;
create policy goal_memory_owner_select on public.goal_memory
  for select to authenticated using (user_id = auth.uid());
grant usage on schema auth, extensions to authenticated;
grant usage on type extensions.vector to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on table public.knowledge_documents to authenticated;
grant select on table public.goal_memory to authenticated;

-- These are the deployed pre-225 definitions: operands are extension-owned,
-- but the unqualified operator depends on the caller's search_path.
create or replace function public.search_knowledge(
  query_embedding extensions.vector(384),
  match_count int default 5,
  match_threshold float default 0.5,
  filter_user_id uuid default null,
  filter_category text default null
)
returns table (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $function$
begin
  return query
  select
    kd.id, kd.title, kd.content, kd.source, kd.category, kd.metadata,
    1 - (kd.embedding <=> query_embedding)
  from public.knowledge_documents as kd
  where kd.user_id = coalesce(filter_user_id, auth.uid())
    and (filter_category is null or kd.category = filter_category)
    and kd.embedding is not null
    and 1 - (kd.embedding <=> query_embedding) > match_threshold
  order by kd.embedding <=> query_embedding
  limit match_count;
end;
$function$;

create or replace function public.search_agent_memory(
  query_embedding extensions.vector(384),
  match_count int default 5,
  match_threshold float default 0.3,
  filter_user_id uuid default null,
  filter_owner_type text default null,
  filter_owner_id text default null
)
returns table (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $function$
begin
  return query
  select
    kd.id, kd.title, kd.content, kd.source, kd.category, kd.metadata,
    1 - (kd.embedding <=> query_embedding)
  from public.knowledge_documents as kd
  where kd.user_id = coalesce(filter_user_id, auth.uid())
    and (filter_owner_type is null or kd.owner_type = filter_owner_type)
    and (filter_owner_id is null or kd.owner_id = filter_owner_id)
    and kd.embedding is not null
    and 1 - (kd.embedding <=> query_embedding) > match_threshold
  order by kd.embedding <=> query_embedding
  limit match_count;
end;
$function$;

-- Migration 136 created this SQL function while extensions was present in
-- the migration session's path, but did not pin that path on the function.
set search_path = public, extensions;
create or replace function public.match_goal_memory(
  query_embedding extensions.vector(384),
  match_user_id uuid,
  match_business_type text default null,
  match_count int default 8
)
returns table (
  id uuid,
  goal_id uuid,
  kind text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  business_type text,
  similarity float
)
language sql
stable
as $function$
  select
    gm.id,
    gm.goal_id,
    gm.kind,
    gm.content,
    gm.metadata,
    gm.created_at,
    gm.business_type,
    1 - (gm.embedding <=> query_embedding) as similarity
  from public.goal_memory as gm
  where gm.user_id = match_user_id
    and (match_business_type is null or gm.business_type = match_business_type)
    and gm.embedding is not null
  order by gm.embedding <=> query_embedding
  limit match_count;
$function$;
`,
        'utf8'
      );
      run('psql', [...connection, '--file', bootstrapPath]);

      const preMigrationCalls = [
        `select * from public.search_knowledge(
           '[1,0]'::extensions.vector(384), 5, 0.5, null, null
         );`,
        `select * from public.search_agent_memory(
           '[1,0]'::extensions.vector(384), 5, 0.3, null, null, null
         );`,
        `select * from public.match_goal_memory(
           '[1,0]'::extensions.vector(384),
           '11111111-1111-1111-1111-111111111111', null, 8
         );`,
      ];
      for (const statement of preMigrationCalls) {
        const before = spawnSync(
          'psql',
          [...connection, '--command', `set search_path = pg_catalog, public; ${statement}`],
          { encoding: 'utf8' }
        );
        expect(before.status).not.toBe(0);
        expect(`${before.stdout}\n${before.stderr}`).toContain(
          'operator does not exist: extensions.vector <=> extensions.vector'
        );
      }

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
grant execute on function public.assert_true(boolean, text) to authenticated;

insert into public.knowledge_documents (
  id, user_id, title, category, embedding, owner_type, owner_id
) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    'tenant-a-agent', 'target', '[1,0]', 'agent', 'agent-a'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '11111111-1111-1111-1111-111111111111',
    'tenant-a-other-owner', 'other', '[1,0]', 'agent', 'agent-b'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    '22222222-2222-2222-2222-222222222222',
    'tenant-b-agent', 'target', '[1,0]', 'agent', 'agent-a'
  );

insert into public.goal_memory (
  id, user_id, goal_id, kind, content, business_type, embedding
) values
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc1',
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    'summary', 'tenant-a-target-memory', 'target', '[1,0]'
  ),
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc2',
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-ddddddddddd2',
    'summary', 'tenant-a-other-memory', 'other', '[1,0]'
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
    '22222222-2222-2222-2222-222222222222',
    'ffffffff-ffff-ffff-ffff-fffffffffff1',
    'summary', 'tenant-b-target-memory', 'target', '[1,0]'
  );

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
set search_path = pg_catalog, public;

select public.assert_true(
  (
    select coalesce(array_agg(title order by title), array[]::text[])
      = array['tenant-a-agent']::text[]
    from public.search_knowledge(
      '[1,0]'::extensions.vector(384), 10, 0.5, null, 'target'
    )
  ),
  'knowledge search uses caller tenant and category filters'
);
select public.assert_true(
  (
    select coalesce(array_agg(title order by title), array[]::text[])
      = array['tenant-a-agent']::text[]
    from public.search_agent_memory(
      '[1,0]'::extensions.vector(384), 10, 0.3, null, 'agent', 'agent-a'
    )
  ),
  'agent memory uses caller tenant and owner filters'
);
select public.assert_true(
  (
    select coalesce(array_agg(content order by content), array[]::text[])
      = array['tenant-a-target-memory']::text[]
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '11111111-1111-1111-1111-111111111111', 'target', 10
    )
  ),
  'goal memory uses the exact user and business-type filters'
);
select public.assert_true(
  (
    select count(*) = 1
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '11111111-1111-1111-1111-111111111111', null, 1
    )
  ),
  'goal memory retains its caller-supplied result limit'
);
select public.assert_true(
  (
    select count(*) = 0
    from public.search_knowledge(
      '[1,0]'::extensions.vector(384), 10, 0.5,
      '22222222-2222-2222-2222-222222222222', 'target'
    )
  ),
  'explicit cross-tenant filter remains constrained by invoker RLS'
);
select public.assert_true(
  (
    select count(*) = 0
    from public.match_goal_memory(
      '[1,0]'::extensions.vector(384),
      '22222222-2222-2222-2222-222222222222', 'target', 10
    )
  ),
  'goal-memory cross-tenant filter remains constrained by invoker RLS'
);
reset role;

select public.assert_true(
  (
    select count(*) = 3
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'search_knowledge',
        'search_agent_memory',
        'match_goal_memory'
      )
      and procedure.prosecdef is false
      and procedure.proconfig
        @> array['search_path=pg_catalog, extensions']::text[]
  ),
  'all vector search functions retain invoker security and a fixed search path'
);
select public.assert_true(
  (
    select count(*) = 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    join pg_catalog.pg_language as language
      on language.oid = procedure.prolang
    where namespace.nspname = 'public'
      and procedure.proname = 'match_goal_memory'
      and language.lanname = 'sql'
      and procedure.provolatile = 's'
      and procedure.prosecdef is false
  ),
  'goal memory remains a stable SQL invoker function'
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
