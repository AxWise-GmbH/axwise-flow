-- 183_data_isolation_backfill.sql
-- Part 1/2 of the data-isolation fix.
--
-- Why: a brand-new account could read (and write) every other user's rows.
-- team_tasks/partners/partner_history/agent_jobs have no owner column at all,
-- so their RLS policies fall back to `auth.role() = 'authenticated'` — i.e. any
-- logged-in user. There is nothing to scope against until these columns exist.
--
-- This half is ADDITIVE ONLY: owner columns, indexes, owner-resolution triggers
-- and a backfill. It changes no policy, so it cannot lock anyone out. Run it,
-- confirm the verification queries at the bottom all return 0, then run
-- 184_data_isolation_rls.sql in the same sitting (the leak stays open between).
--
-- Idempotent: safe to re-run.

-- ── 0. Helpers ─────────────────────────────────────────────────────────────

-- jsonb payloads hold unvalidated strings; a bare ::uuid cast on a non-uuid
-- raises 22P02 and would abort the whole backfill transaction.
create or replace function public.try_uuid(v text)
returns uuid language sql immutable as $$
  select case
    when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then v::uuid else null end;
$$;

-- ── 1. team_tasks ──────────────────────────────────────────────────────────
-- This table was created by hand in the Supabase dashboard and has never been
-- in a migration; its only definition lived as a string constant in
-- src/services/teamTaskBackend.js. No-op in prod — this is simply the first
-- time it enters version control. Columns mirror the live table exactly.

create table if not exists public.team_tasks (
  id                text primary key,
  title             text default '',
  description       text default '',
  priority          text default 'medium',
  status            text default 'todo',
  assigned_to       text default '',
  deadline          date,
  estimate          text default '',
  git_commits       jsonb default '[]'::jsonb,
  attachments       jsonb default '[]'::jsonb,
  created_by        text,
  data              jsonb default '{}'::jsonb,
  job_pool_id       text,      -- 053
  category          text,      -- 053
  agent_id          text,      -- 053
  sequence_order    integer default 0,  -- 061
  goal_id           uuid,      -- 095
  prompt_version_id uuid,      -- 097 (FK added by 097 in prod only)
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Converge a database that skipped the unguarded ALTERs in 053/061/095/097.
alter table public.team_tasks
  add column if not exists job_pool_id       text,
  add column if not exists category          text,
  add column if not exists agent_id          text,
  add column if not exists sequence_order    integer default 0,
  add column if not exists goal_id           uuid,
  add column if not exists prompt_version_id uuid;

-- Nullable on purpose. lib/goal-handlers/stages/team-formation.js inserts task
-- rows without an owner; NOT NULL would hard-fail every goal's task plan and
-- take the pipeline down. Nullable + DEFAULT + trigger degrades to an invisible
-- row (recoverable with an UPDATE) instead of a rejected insert (data lost).
-- Tighten to NOT NULL in a later migration once the NULL count stays at 0.
alter table public.team_tasks
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.team_tasks alter column user_id set default auth.uid();

create index if not exists idx_team_tasks_user_id on public.team_tasks(user_id);
create index if not exists idx_team_tasks_user_status on public.team_tasks(user_id, status);

comment on column public.team_tasks.user_id is
  'Owner. Defaults to auth.uid(); resolved from goal_id by trg_team_tasks_set_owner for service_role inserts. RLS (184) hides rows where user_id <> auth.uid().';

-- team-formation.js inserts as service_role with goal_id but no user_id.
-- SECURITY DEFINER so the goals lookup is not itself filtered by goals RLS.
create or replace function public.team_tasks_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.user_id is null and new.goal_id is not null then
    select g.user_id into new.user_id from public.goals g where g.id = new.goal_id;
  end if;
  if new.user_id is null then
    select g.user_id into new.user_id from public.goals g
     where g.id = public.try_uuid(new.data->>'goal_id');
  end if;
  if new.user_id is null and new.job_pool_id is not null then
    select j.user_id into new.user_id from public.jobs j where j.id = new.job_pool_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_tasks_set_owner on public.team_tasks;
create trigger trg_team_tasks_set_owner
  before insert on public.team_tasks
  for each row execute function public.team_tasks_set_owner();

-- ── 2. partners ────────────────────────────────────────────────────────────
-- Re-adds the column 003 added and 004 rolled back, closing the TODO left at
-- 039_fix_rls_round2.sql:86-89.

alter table public.partners
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.partners alter column user_id set default auth.uid();

create index if not exists idx_partners_user_id on public.partners(user_id);

comment on column public.partners.user_id is
  'Owner. Re-added by 183 after 004 rolled back 003. RLS (184) hides rows where user_id <> auth.uid().';

-- ── 3. partner_history ─────────────────────────────────────────────────────

alter table public.partner_history
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.partner_history alter column user_id set default auth.uid();

create index if not exists idx_partner_history_user_id on public.partner_history(user_id);

create or replace function public.partner_history_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.user_id is null and new.partner_id is not null then
    select p.user_id into new.user_id from public.partners p where p.id = new.partner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_partner_history_set_owner on public.partner_history;
create trigger trg_partner_history_set_owner
  before insert on public.partner_history
  for each row execute function public.partner_history_set_owner();

-- ── 4. agent_jobs ──────────────────────────────────────────────────────────
-- Written exclusively by service_role (which bypasses RLS), so the worker
-- cannot be broken by a SELECT policy. It IS read from the browser with the
-- anon key, so the rows still need an owner or those reports go blank.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: ~10k rows builds in well under a
-- second, and CONCURRENTLY cannot run inside the transaction the Supabase SQL
-- Editor wraps a pasted script in.

alter table public.agent_jobs
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.agent_jobs alter column user_id set default auth.uid();

create index if not exists idx_agent_jobs_user_id on public.agent_jobs(user_id);
create index if not exists idx_agent_jobs_user_status on public.agent_jobs(user_id, status);

comment on column public.agent_jobs.user_id is
  'Owner. Resolved by trg_agent_jobs_set_owner from payload._userId / goalId / taskId. Workers use service_role and bypass RLS. The existing idx_agent_jobs_status still serves claimNextJob, which is deliberately not user-filtered.';

create or replace function public.agent_jobs_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then return new; end if;
  new.user_id := auth.uid();
  if new.user_id is null then
    new.user_id := public.try_uuid(new.payload->>'_userId');
  end if;
  if new.user_id is null then
    select g.user_id into new.user_id from public.goals g
     where g.id = public.try_uuid(new.payload->>'goalId');
  end if;
  if new.user_id is null then
    select g.user_id into new.user_id from public.goals g
     where g.id = public.try_uuid(new.payload->>'parentGoalId');
  end if;
  if new.user_id is null and (new.payload->>'taskId') is not null then
    select t.user_id into new.user_id from public.team_tasks t
     where t.id = new.payload->>'taskId';
  end if;
  return new;
end;
$$;

-- BEFORE INSERT. Coexists with 064's AFTER INSERT webhook trigger; BEFORE runs
-- first, so the webhook payload sees the resolved user_id.
drop trigger if exists trg_agent_jobs_set_owner on public.agent_jobs;
create trigger trg_agent_jobs_set_owner
  before insert on public.agent_jobs
  for each row execute function public.agent_jobs_set_owner();

-- ── 5. prompt_versions / agent_performance_metrics ─────────────────────────
-- Both currently carry a policy NAMED "Service role can manage ..." that has no
-- TO clause, so it defaults to PUBLIC — any user can read and forge rows. 184
-- fixes the policy; they need an owner column first. Both are empty today.

alter table public.prompt_versions
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.prompt_versions alter column user_id set default auth.uid();
create index if not exists idx_prompt_versions_user_id on public.prompt_versions(user_id);

create or replace function public.prompt_versions_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then new.user_id := auth.uid(); end if;
  if new.user_id is null and new.agent_id is not null then
    select a.user_id into new.user_id from public.concilium_agents a where a.id = new.agent_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prompt_versions_set_owner on public.prompt_versions;
create trigger trg_prompt_versions_set_owner
  before insert on public.prompt_versions
  for each row execute function public.prompt_versions_set_owner();

alter table public.agent_performance_metrics
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.agent_performance_metrics alter column user_id set default auth.uid();
create index if not exists idx_agent_perf_user_id on public.agent_performance_metrics(user_id);

create or replace function public.agent_perf_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then new.user_id := auth.uid(); end if;
  if new.user_id is null and new.agent_id is not null then
    select a.user_id into new.user_id from public.concilium_agents a where a.id = new.agent_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agent_perf_set_owner on public.agent_performance_metrics;
create trigger trg_agent_perf_set_owner
  before insert on public.agent_performance_metrics
  for each row execute function public.agent_perf_set_owner();

-- ── 6. Backfill ────────────────────────────────────────────────────────────
-- Ordered by dependency: partners -> partner_history, goals -> team_tasks ->
-- agent_jobs. NOTHING IS EVER DELETED. Each step reports its row count.
--
-- Attribution is by real ownership wherever a signal exists — every one of the
-- 88 team_tasks resolves through goal_id to its true owner, so they are NOT all
-- assigned to the main account. The main account is only a last-resort fallback
-- for rows that carry no ownership signal at all (chiefly older agent_jobs).

do $$
declare
  v_main uuid;
  n bigint;
begin
  -- Resolved at run time; never hardcode a uuid.
  select id into v_main
    from auth.users
   where lower(email) = 'misters.builder@gmail.com'
   limit 1;

  if v_main is null then
    -- A brand-new/local database has no auth users and no legacy rows yet.
    -- Migrations run before seed.sql, so requiring the production fallback
    -- account here makes a clean `supabase start` impossible. It is safe to
    -- skip only when there is nothing to attribute; an existing database with
    -- any orphaned row still fails closed exactly as production requires.
    if exists (select 1 from public.partners where user_id is null)
       or exists (select 1 from public.partner_history where user_id is null)
       or exists (select 1 from public.team_tasks where user_id is null)
       or exists (select 1 from public.agent_jobs where user_id is null)
       or exists (select 1 from public.meetings where user_id is null)
       or exists (select 1 from public.workflows where user_id is null)
       or exists (select 1 from public.prompt_versions where user_id is null)
       or exists (select 1 from public.agent_performance_metrics where user_id is null)
    then
      raise exception
        'Fallback owner misters.builder@gmail.com not found in auth.users - aborting; no rows touched.';
    end if;
    raise notice 'Fallback owner absent and no legacy orphan rows exist - clean bootstrap backfill skipped.';
    return;
  end if;
  raise notice 'Fallback owner resolved: %', v_main;

  -- partners: no owner signal exists on the row, so all orphans -> main.
  update public.partners set user_id = v_main where user_id is null;
  get diagnostics n = row_count; raise notice 'partners -> main: %', n;

  -- partner_history: inherit from the parent partner first.
  update public.partner_history h
     set user_id = p.user_id
    from public.partners p
   where p.id = h.partner_id and h.user_id is null and p.user_id is not null;
  get diagnostics n = row_count; raise notice 'partner_history <- partners: %', n;

  update public.partner_history set user_id = v_main where user_id is null;
  get diagnostics n = row_count; raise notice 'partner_history -> main: %', n;

  -- team_tasks: goal_id is the strongest signal and covers all 88 rows today.
  update public.team_tasks t
     set user_id = g.user_id
    from public.goals g
   where g.id = t.goal_id and t.user_id is null;
  get diagnostics n = row_count; raise notice 'team_tasks <- goals.goal_id: %', n;

  -- Rows predating 095 keep the goal id only inside the data JSONB.
  update public.team_tasks t
     set user_id = g.user_id
    from public.goals g
   where g.id = public.try_uuid(t.data->>'goal_id') and t.user_id is null;
  get diagnostics n = row_count; raise notice 'team_tasks <- goals.data: %', n;

  update public.team_tasks t
     set user_id = j.user_id
    from public.jobs j
   where j.id = t.job_pool_id and t.user_id is null and j.user_id is not null;
  get diagnostics n = row_count; raise notice 'team_tasks <- jobs: %', n;

  update public.team_tasks set user_id = v_main where user_id is null;
  get diagnostics n = row_count; raise notice 'team_tasks -> main (fallback): %', n;

  -- agent_jobs: payload._userId is canonical (set by enqueue.js). The
  -- auth.users guard prevents an FK violation from a deleted user's id.
  update public.agent_jobs
     set user_id = public.try_uuid(payload->>'_userId')
   where user_id is null
     and public.try_uuid(payload->>'_userId') is not null
     and public.try_uuid(payload->>'_userId') in (select id from auth.users);
  get diagnostics n = row_count; raise notice 'agent_jobs <- payload._userId: %', n;

  update public.agent_jobs a
     set user_id = g.user_id
    from public.goals g
   where g.id = public.try_uuid(a.payload->>'goalId') and a.user_id is null;
  get diagnostics n = row_count; raise notice 'agent_jobs <- goals: %', n;

  update public.agent_jobs a
     set user_id = g.user_id
    from public.goals g
   where g.id = public.try_uuid(a.payload->>'parentGoalId') and a.user_id is null;
  get diagnostics n = row_count; raise notice 'agent_jobs <- parent goals: %', n;

  -- team_tasks is fully owned by now, so this resolves execute-task jobs.
  update public.agent_jobs a
     set user_id = t.user_id
    from public.team_tasks t
   where t.id = a.payload->>'taskId' and a.user_id is null;
  get diagnostics n = row_count; raise notice 'agent_jobs <- team_tasks: %', n;

  update public.agent_jobs set user_id = v_main where user_id is null;
  get diagnostics n = row_count; raise notice 'agent_jobs -> main (fallback): %', n;

  -- These already have user_id; only legacy NULL rows need an owner.
  update public.meetings  set user_id = v_main where user_id is null;
  get diagnostics n = row_count; raise notice 'meetings -> main: %', n;

  update public.workflows set user_id = v_main where user_id is null;
  get diagnostics n = row_count; raise notice 'workflows -> main: %', n;

  update public.prompt_versions pv
     set user_id = a.user_id
    from public.concilium_agents a
   where a.id = pv.agent_id and pv.user_id is null;
  update public.prompt_versions set user_id = v_main where user_id is null;

  update public.agent_performance_metrics m
     set user_id = a.user_id
    from public.concilium_agents a
   where a.id = m.agent_id and m.user_id is null;
  update public.agent_performance_metrics set user_id = v_main where user_id is null;

  -- job_requests exists in migration 059 but was never applied to this project.
  -- Guarded so a blind ALTER cannot abort the whole script; the SQL Editor wraps
  -- a pasted file in one transaction, so an error here would roll back
  -- everything above.
  if to_regclass('public.job_requests') is not null then
    execute 'update public.job_requests set user_id = $1 where user_id is null' using v_main;
    get diagnostics n = row_count; raise notice 'job_requests -> main: %', n;
  else
    raise notice 'job_requests absent - skipped';
  end if;
end $$;

-- ── 7. Verification — run before applying 184. Every count must be 0. ───────
--
-- select count(*) from public.team_tasks                where user_id is null;
-- select count(*) from public.partners                  where user_id is null;
-- select count(*) from public.partner_history           where user_id is null;
-- select count(*) from public.agent_jobs                where user_id is null;
-- select count(*) from public.meetings                  where user_id is null;
-- select count(*) from public.workflows                 where user_id is null;
-- select count(*) from public.prompt_versions           where user_id is null;
-- select count(*) from public.agent_performance_metrics where user_id is null;
--
-- Expected task attribution (via goal_id, not a blanket assignment):
--   select u.email, count(*) from public.team_tasks t
--     join auth.users u on u.id = t.user_id group by 1 order by 2 desc;
--   -> misters.builder@gmail.com 54 | demo@orchestratori.app 31 | vitalijs@axwise.de 3
