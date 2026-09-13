-- Strategy Center – user-scoped snapshots and activity tracking
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Stores strategy data snapshots per user and period (for history review)
create table if not exists public.strategy_center_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  period_key text not null,
  period_label text not null,
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_strategy_center_snapshots_user on public.strategy_center_snapshots(user_id);
create index if not exists idx_strategy_center_snapshots_created on public.strategy_center_snapshots(created_at desc);
create index if not exists idx_strategy_center_snapshots_period on public.strategy_center_snapshots(period_key);

alter table public.strategy_center_snapshots enable row level security;

create policy "Users can insert own strategy_center_snapshots"
  on public.strategy_center_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can read own strategy_center_snapshots"
  on public.strategy_center_snapshots for select
  using (auth.uid() = user_id);
