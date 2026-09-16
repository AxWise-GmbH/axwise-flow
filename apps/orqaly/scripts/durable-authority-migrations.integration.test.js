import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { describe, it } from 'vitest';

const migrationPaths = [
  resolve('supabase/migrations/227_agent_jobs_durable_authority_and_live_lease.sql'),
  resolve('supabase/migrations/228_communication_logs_tenant_authority.sql'),
  resolve('supabase/migrations/229_concilium_agent_report_types.sql'),
];

function binaryAvailable(name) {
  return (process.env.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .some((directory) => existsSync(join(directory, name)));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
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

const canRunPostgres = ['initdb', 'pg_ctl', 'psql'].every(binaryAvailable);

describe.runIf(canRunPostgres)('durable authority migrations in real PostgreSQL', () => {
  it('applies twice and enforces jobs, leases, communication tenancy, and report types', () => {
    const temporaryRoot = existsSync('/tmp') ? '/tmp' : tmpdir();
    const root = mkdtempSync(join(temporaryRoot, 'orqaly-authority-'));
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
create role service_role nologin bypassrls;

create schema auth;
create function auth.uid() returns uuid
language sql stable
as $uid$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $uid$;
create table auth.users (
  id uuid primary key,
  email text
);

create function public.try_uuid(v text)
returns uuid language sql immutable as $try_uuid$
  select case
    when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then v::uuid else null end
$try_uuid$;

create table public.organizations (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.agent_teams (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.concilium_teams (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.concilium (
  id text primary key,
  user_id uuid references auth.users(id)
);
create table public.workflows (
  id text primary key,
  user_id uuid references auth.users(id)
);
create table public.agents (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  status text default 'active'
);
create table public.agent_blueprints (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.concilium_agents (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.communication_channels (
  id uuid primary key,
  connected_by uuid references auth.users(id)
);
create table public.knowledge_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  status text not null default 'active',
  updated_at timestamptz not null default now(),
  org_id uuid,
  team_id uuid,
  agent_team_id uuid,
  concilium_id text,
  workflow_id text,
  executor_type text,
  executor_id text,
  parent_goal_id uuid,
  continuation_goal_id uuid,
  data jsonb not null default '{}'::jsonb
);
create table public.jobs (
  id text primary key,
  user_id uuid references auth.users(id),
  goal_id uuid,
  assigned_agent_id text,
  concilium_id text,
  status text default 'active',
  updated_at timestamptz not null default now()
);
create table public.team_tasks (
  id text primary key,
  user_id uuid references auth.users(id),
  title text default '',
  description text default '',
  assigned_to text default '',
  job_pool_id text,
  goal_id uuid,
  agent_id text,
  status text default 'todo',
  prompt_version_id uuid,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.investment_deals (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.investment_pools (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
create table public.investment_investors (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);

create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  status text not null default 'queued'
    constraint agent_jobs_status_check check (status in ('queued', 'running', 'done', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  worker_scope text not null default 'production',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_jobs enable row level security;
create policy "Authenticated read agent_jobs"
  on public.agent_jobs for select to authenticated using (true);
grant select on public.agent_jobs to authenticated;
create function public.agent_jobs_set_owner()
returns trigger language plpgsql as $old_owner$
begin
  if new.user_id is null then new.user_id := public.try_uuid(new.payload ->> '_userId'); end if;
  return new;
end
$old_owner$;
create trigger trg_agent_jobs_set_owner before insert on public.agent_jobs
for each row execute function public.agent_jobs_set_owner();

create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null default gen_random_uuid(),
  sender_type text not null check (sender_type in ('agent', 'system', 'user')),
  sender_id uuid,
  sender_name text not null default '',
  content text not null default '',
  context_type text not null default 'general'
    constraint communication_logs_context_type_check
    check (context_type in ('build','deal','investment','consilium','command','general','organization')),
  context_id uuid,
  context_label text not null default '',
  platform text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb
);
alter table public.communication_logs enable row level security;
create policy comm_logs_select on public.communication_logs
  for select to authenticated using (true);
create policy comm_logs_insert on public.communication_logs
  for insert to authenticated with check (true);
create policy comm_logs_delete on public.communication_logs
  for delete to authenticated using (true);
create policy comm_logs_select_own on public.communication_logs
  for select to authenticated using (sender_id = auth.uid());
grant all privileges on public.communication_logs to authenticated, service_role;

create table public.concilium_agent_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  agent_id uuid not null references public.concilium_agents(id),
  report_type text not null default 'check_in'
    constraint concilium_agent_reports_report_type_check
    check (report_type in ('check_in','activity','error','completion','status_change')),
  summary text default ''
);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.test');
insert into public.organizations(id, user_id) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111');
insert into public.goals(id, user_id) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('a1000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222');
insert into public.agents(id, user_id) values
  ('a2000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('a2000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111');
insert into public.concilium_agents(id, user_id) values
  ('a2000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222'),
  ('a3000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111');
insert into public.communication_channels(id, connected_by) values
  ('a4000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111');

insert into public.agent_jobs(id, user_id, status, payload) values
  (
    'b0000000-0000-4000-8000-000000000001',
    '11111111-1111-1111-1111-111111111111', 'queued',
    '{"type":"run-llm","_userId":"11111111-1111-1111-1111-111111111111","prompt":"valid"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    '11111111-1111-1111-1111-111111111111', 'running',
    '{"type":"run-llm","_userId":"11111111-1111-1111-1111-111111111111"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    '11111111-1111-1111-1111-111111111111', 'queued',
    '{"type":"run-llm","_userId":"22222222-2222-2222-2222-222222222222"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    '11111111-1111-1111-1111-111111111111', 'queued',
    '{"type":"orchestrate-goal","goalId":"a1000000-0000-4000-8000-000000000099"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000005',
    null, 'queued', '{"type":"run-llm"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000006',
    '11111111-1111-1111-1111-111111111111', 'queued',
    '{"type":"browser-task","_userId":"11111111-1111-1111-1111-111111111111"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000008',
    '22222222-2222-2222-2222-222222222222', 'queued',
    '{"type":"run-llm","_userId":"22222222-2222-2222-2222-222222222222"}'
  );

insert into public.communication_logs(
  id, thread_id, sender_type, sender_id, content, context_type, metadata
) values
  (
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'user', '11111111-1111-1111-1111-111111111111', 'owned user', 'general', '{}'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000001',
    'system', null, 'thread-propagated', 'general', '{}'
  ),
  (
    'c0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000002',
    'agent', 'a2000000-0000-4000-8000-000000000001', 'owned agent', 'general', '{}'
  ),
  (
    'c0000000-0000-4000-8000-000000000004',
    'd0000000-0000-4000-8000-000000000003',
    'agent', 'a2000000-0000-4000-8000-000000000002', 'ambiguous agent', 'general', '{}'
  ),
  (
    'c0000000-0000-4000-8000-000000000005',
    'd0000000-0000-4000-8000-000000000004',
    'system', null, 'ownerless', 'general', '{}'
  );
`,
        'utf8'
      );

      run('psql', [...connection, '--file', bootstrapPath]);
      for (const migrationPath of migrationPaths) {
        run('psql', [...connection, '--file', migrationPath]);
      }
      run('psql', [
        ...connection,
        '--command',
        `
insert into public.agent_jobs(id, user_id, payload) values (
  'b0000000-0000-4000-8000-000000000007',
  '11111111-1111-1111-1111-111111111111',
  '{"type":"run-llm","prompt":"survive migration reapplication"}'
);
update public.agent_jobs
set status = 'running',
    lease_token = 'e0000000-0000-4000-8000-000000000007',
    heartbeat_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + interval '75 seconds'
where id = 'b0000000-0000-4000-8000-000000000007';
`,
      ]);
      for (const migrationPath of migrationPaths) {
        run('psql', [...connection, '--file', migrationPath]);
      }

      writeFileSync(
        assertionsPath,
        `
create function public.assert_true(actual boolean, label text) returns void
language plpgsql
as $assert$
begin
  if actual is not true then raise exception 'assertion failed: %', label; end if;
end
$assert$;

create function public.expect_failure(statement text, label text) returns void
language plpgsql
as $expect$
declare failed boolean := false;
begin
  begin
    execute statement;
  exception when others then
    failed := true;
  end;
  if not failed then raise exception 'statement unexpectedly succeeded: %', label; end if;
end
$expect$;

select public.assert_true(
  (select status = 'queued'
     and payload ->> '_userId' = user_id::text
     and payload ->> 'userId' = user_id::text
     and payload ->> 'user_id' = user_id::text
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000001'),
  'valid legacy queue row is canonicalized'
);
select public.assert_true(
  (select status = 'failed' and error like 'JOB_LIVE_LEASE_REQUIRED:%'
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000002'),
  'markerless legacy running row is terminalized'
);
select public.assert_true(
  (select status = 'failed' and error like 'JOB_OWNER_VALIDATION_ERROR:%'
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000003'),
  'mismatched legacy owner alias is terminalized'
);
select public.assert_true(
  (select status = 'failed' and error like 'JOB_OWNER_VALIDATION_ERROR:%'
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000004'),
  'orphan legacy entity is terminalized'
);
select public.assert_true(
  (select status = 'failed' and user_id is null
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000005'),
  'ownerless legacy work remains recorded but terminal'
);
select public.assert_true(
  (select status = 'queued'
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000006'),
  'ops-owned browser queue row remains runnable'
);
select public.assert_true(
  (select status = 'running'
      and lease_token = 'e0000000-0000-4000-8000-000000000007'
      and lease_expires_at > heartbeat_at
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000007'),
  'valid live lease survives idempotent migration reapplication'
);

select public.expect_failure(
  $$insert into public.agent_jobs(id, user_id, payload) values (
    'b1000000-0000-4000-8000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '{"type":"run-llm","_userId":"22222222-2222-2222-2222-222222222222"}'
  )$$,
  'new owner alias mismatch'
);
select public.expect_failure(
  $$insert into public.agent_jobs(id, user_id, payload) values (
    'b1000000-0000-4000-8000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '{"type":"orchestrate-goal","goalId":"a1000000-0000-4000-8000-000000000002"}'
  )$$,
  'new foreign entity reference'
);
select public.expect_failure(
  $$update public.agent_jobs
      set status = 'running'
    where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'marker-only claim without live lease'
);
select public.expect_failure(
  $$insert into public.agent_jobs(
      id, user_id, status, payload, lease_token, heartbeat_at, lease_expires_at
    ) values (
      'b1000000-0000-4000-8000-000000000003',
      '11111111-1111-1111-1111-111111111111',
      'running',
      '{"type":"run-llm"}',
      'e1000000-0000-4000-8000-000000000003',
      clock_timestamp(),
      clock_timestamp() + interval '75 seconds'
    )$$,
  'direct running insert'
);

update public.agent_jobs
set
  status = 'running',
  lease_token = 'e0000000-0000-4000-8000-000000000001',
  heartbeat_at = clock_timestamp(),
  lease_expires_at = clock_timestamp() + interval '75 seconds'
where id = 'b0000000-0000-4000-8000-000000000001';
select public.assert_true(
  (select status = 'running' and lease_token = 'e0000000-0000-4000-8000-000000000001'
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000001'),
  'valid exact claim succeeds'
);

do $heartbeat$
declare prior_updated_at timestamptz;
begin
  select updated_at into prior_updated_at from public.agent_jobs
  where id = 'b0000000-0000-4000-8000-000000000001';
  update public.agent_jobs
  set heartbeat_at = heartbeat_at + interval '1 second',
      lease_expires_at = lease_expires_at + interval '1 second'
  where id = 'b0000000-0000-4000-8000-000000000001'
    and lease_token = 'e0000000-0000-4000-8000-000000000001';
  perform public.assert_true(
    (select updated_at = prior_updated_at
     from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000001'),
    'heartbeat is independent from updated_at'
  );
end
$heartbeat$;

select public.expect_failure(
  $$update public.agent_jobs
      set heartbeat_at = heartbeat_at - interval '1 second'
    where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'heartbeat rewind'
);
select public.expect_failure(
  $$update public.agent_jobs
      set lease_expires_at = heartbeat_at + interval '10 minutes'
    where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'unbounded lease expiry'
);

select public.expect_failure(
  $$update public.agent_jobs
      set payload = payload || '{"goalId":"a1000000-0000-4000-8000-000000000001"}'
    where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'payload mutation while leased'
);
select public.expect_failure(
  $$update public.agent_jobs
      set lease_token = 'e0000000-0000-4000-8000-000000000002'
    where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'lease transfer while running'
);

update public.agent_jobs
set status = 'done', result = '{"ok":true}'
where id = 'b0000000-0000-4000-8000-000000000001'
  and lease_token = 'e0000000-0000-4000-8000-000000000001';
select public.assert_true(
  (select status = 'done' and lease_token is null and heartbeat_at is null and lease_expires_at is null
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000001'),
  'terminal transition atomically revokes lease'
);
select public.expect_failure(
  $$update public.agent_jobs
      set status = 'running',
          lease_token = 'e1000000-0000-4000-8000-000000000004',
          heartbeat_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + interval '75 seconds'
    where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'terminal direct reclaim'
);
update public.agent_jobs set status = 'cancelled'
where id = 'b0000000-0000-4000-8000-000000000006';
select public.assert_true(
  (select status = 'cancelled' and lease_token is null
   from public.agent_jobs where id = 'b0000000-0000-4000-8000-000000000006'),
  'cancelled is a terminal lease-free status'
);

select public.assert_true(
  (select count(*) = 3 from public.communication_logs),
  'only provably owned communication history remains live'
);
select public.assert_true(
  (select count(*) = 3 from public.communication_logs
   where user_id = '11111111-1111-1111-1111-111111111111'),
  'direct and unique-thread ownership backfill succeeds'
);
select public.assert_true(
  (select count(*) = 2 from public.communication_logs_security_quarantine),
  'ambiguous and ownerless history is quarantined'
);
select public.assert_true(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'communication_logs'
      and policyname = 'comm_logs_select_own'
  ),
  'legacy permissive select policy is removed'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.communication_logs(
  sender_type, sender_id, content, context_type, context_id, metadata
) values (
  'user', '11111111-1111-1111-1111-111111111111', 'goal chat',
  'goal', 'a1000000-0000-4000-8000-000000000001', '{}'
);
insert into public.communication_logs(
  sender_type, sender_id, content, context_type, context_id, metadata
) values (
  'agent', 'a2000000-0000-4000-8000-000000000001', 'agent chat',
  'agent-chat', 'a2000000-0000-4000-8000-000000000001', '{}'
);
select public.expect_failure(
  $$insert into public.communication_logs(
      user_id, sender_type, sender_id, content, context_type, metadata
    ) values (
      '22222222-2222-2222-2222-222222222222', 'user',
      '11111111-1111-1111-1111-111111111111', 'forged', 'general', '{}'
    )$$,
  'authenticated cross-tenant communication insert'
);
select public.assert_true(
  (select count(*) = 5 from public.communication_logs),
  'owner sees only owned communication rows including current contexts'
);

select public.assert_true(
  (select count(*) > 0 from public.agent_jobs),
  'owner can poll owned jobs'
);
select public.assert_true(
  (select count(*) = 0 from public.agent_jobs
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'owner cannot poll another tenant job'
);
select public.expect_failure(
  $$insert into public.agent_jobs(user_id, payload) values (
      '11111111-1111-1111-1111-111111111111',
      '{"type":"run-llm","prompt":"client-forged"}'
    )$$,
  'authenticated owner cannot insert queue jobs directly'
);
select public.expect_failure(
  $$update public.agent_jobs set status = 'cancelled'
    where id = 'b0000000-0000-4000-8000-000000000006'$$,
  'authenticated owner cannot revoke a worker lease or queue row'
);
select public.expect_failure(
  $$delete from public.agent_jobs
    where id = 'b0000000-0000-4000-8000-000000000006'$$,
  'authenticated owner cannot delete queue history'
);
reset role;

insert into public.concilium_agent_reports(user_id, agent_id, report_type) values
  (
    '11111111-1111-1111-1111-111111111111',
    'a3000000-0000-4000-8000-000000000001',
    'system_audit'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'a3000000-0000-4000-8000-000000000001',
    'supervisor_intervention'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'a3000000-0000-4000-8000-000000000001',
    'approval_request'
  );
select public.expect_failure(
  $$insert into public.concilium_agent_reports(user_id, agent_id, report_type) values (
    '11111111-1111-1111-1111-111111111111',
    'a3000000-0000-4000-8000-000000000001',
    'arbitrary_untrusted_type'
  )$$,
  'arbitrary Concilium report type'
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
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
