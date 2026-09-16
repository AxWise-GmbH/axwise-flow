-- 138_kpi_feedback.sql
-- Phase 4 — KPI feedback engine. goal_kpis is the contract surface
-- between integrations (Phase 5) and the auto-pivot logic. When a KPI
-- breaches threshold or N consecutive iterations show flat ROI, the
-- system spawns a focused optimization continuation automatically.

create table if not exists public.goal_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid references public.goals(id) on delete cascade,
  business_id uuid,
  key text not null,                       -- 'revenue_usd' | 'cac' | 'conversion_rate' | 'mrr' | ...
  label text,                              -- human-friendly display label
  target numeric,
  current numeric,
  prev numeric,
  source text not null,                    -- 'stripe' | 'posthog' | 'ga4' | 'manual'
  source_external_id text,                 -- correlation id back to the source system
  unit text default 'usd',                 -- 'usd' | 'count' | 'percent' | ...
  direction text default 'higher_is_better' check (direction in ('higher_is_better','lower_is_better')),
  threshold_pct numeric default 20,        -- breach threshold (percent change from target)
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (goal_id, key)
);
create index if not exists idx_goal_kpis_user on public.goal_kpis(user_id);
create index if not exists idx_goal_kpis_goal on public.goal_kpis(goal_id);

alter table public.goal_kpis enable row level security;
drop policy if exists "goal_kpis_owner_all" on public.goal_kpis;
create policy "goal_kpis_owner_all" on public.goal_kpis
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tag goals with kind so the UI can distinguish "expansion loop"
-- continuations from "fix loop" optimization continuations.
alter table public.goals
  add column if not exists goal_kind text default 'expansion'
    check (goal_kind in ('expansion','optimization','seed'));
