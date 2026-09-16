-- Report Snapshots – shared report data snapshots (no user-scope)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

create extension if not exists "uuid-ossp";

-- Stores computed report snapshots; all users see the same data
create table if not exists public.report_snapshots (
  id uuid primary key default uuid_generate_v4(),
  report_type text not null,
  filters jsonb not null default '{}',
  version text not null default '',
  computed_at timestamptz not null default now(),
  ttl_seconds int not null default 45,
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_report_snapshots_type on public.report_snapshots(report_type);
create index if not exists idx_report_snapshots_computed on public.report_snapshots(computed_at desc);
create index if not exists idx_report_snapshots_type_filters on public.report_snapshots(report_type, filters);

-- RLS enabled but open to all authenticated users (shared data)
alter table public.report_snapshots enable row level security;

create policy "Authenticated users can read report_snapshots" on public.report_snapshots
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can manage report_snapshots" on public.report_snapshots
  for all using (auth.role() = 'authenticated');
