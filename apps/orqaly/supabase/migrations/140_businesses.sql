-- 140_businesses.sql
-- Phase 6 — Business entity sits above goals: each business owns a goal
-- chain (Phase 1) + memory (Phase 2) + pulses (Phase 3) + KPIs (Phase 4)
-- + integrations (Phase 5). Master kill switch pauses everything in one
-- toggle.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  business_type text,                       -- mirrors goal_memory.business_type
  description text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  master_kill_switch boolean not null default false,  -- single toggle, pauses everything
  killed_at timestamptz,
  killed_reason text,
  seed_goal_id uuid references public.goals(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_businesses_user on public.businesses(user_id, status);

alter table public.businesses enable row level security;
drop policy if exists "businesses_owner_all" on public.businesses;
create policy "businesses_owner_all" on public.businesses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Link goals to a business (nullable for legacy goals).
alter table public.goals add column if not exists business_id uuid references public.businesses(id) on delete set null;
create index if not exists idx_goals_business on public.goals(business_id);

-- Link pulses / KPIs / integrations to a business too (no FK enforced to
-- avoid migration ordering issues — soft reference through metadata in
-- practice).
alter table public.agent_pulses add column if not exists business_id_fk uuid references public.businesses(id) on delete cascade;
alter table public.goal_kpis add column if not exists business_id_fk uuid references public.businesses(id) on delete cascade;
