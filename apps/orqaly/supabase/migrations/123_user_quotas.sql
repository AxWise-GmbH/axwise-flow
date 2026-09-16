-- 123_user_quotas.sql
-- Per-user quotas to cap blast radius from runaway goals or malicious users.
-- These caps protect platform infrastructure (Vercel invocations, Supabase storage)
-- from a single user accidentally racking up unbounded costs.
--
-- Quotas are enforced in lib/agent-handlers/enqueue.js before a job is queued.
-- All values are conservative defaults; raise them per-user for paying customers.

create table if not exists public.user_quotas (
  user_id              uuid primary key references auth.users(id) on delete cascade,

  -- Storage cap (MB) for files in your platform-default storage bucket.
  -- BYOS users with their own storage are not bound by this cap on their bucket.
  max_storage_mb       int  not null default 500,

  -- Goal/job rate caps (rolling windows enforced in app code).
  max_goals_per_day    int  not null default 50,
  max_jobs_per_hour    int  not null default 200,

  -- Concurrent active goals (enforced before enqueue).
  max_concurrent_goals int  not null default 10,

  -- Tier label for human-readable diagnostics. App code may use this to
  -- pick different defaults (free / pro / team / enterprise).
  tier                 text not null default 'free',

  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_user_quotas_tier on public.user_quotas(tier);

alter table public.user_quotas enable row level security;

drop policy if exists "Users read own quotas"  on public.user_quotas;
drop policy if exists "Service role manages quotas" on public.user_quotas;

-- Users can only read their own quota row (UI display).
create policy "Users read own quotas" on public.user_quotas
  for select using (auth.uid() = user_id);

-- All writes happen via service-role from the API layer; no user-side mutation.
-- (Service role bypasses RLS so no explicit insert/update/delete policies needed.)

create or replace function public.touch_user_quotas_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_user_quotas_touch on public.user_quotas;
create trigger trg_user_quotas_touch
  before update on public.user_quotas
  for each row execute function public.touch_user_quotas_updated_at();

-- Auto-create a default quota row when a new user signs up.
create or replace function public.create_default_user_quota()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_quotas (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists trg_auth_users_create_quota on auth.users;
create trigger trg_auth_users_create_quota
  after insert on auth.users
  for each row execute function public.create_default_user_quota();

-- Backfill: ensure every existing user has a quota row.
insert into public.user_quotas (user_id)
select id from auth.users
on conflict (user_id) do nothing;
