-- Jobs table: Job Pool entity linking agents, projects, workflows, tasks, partners, and concilium
-- Run this in Supabase SQL Editor

create table if not exists public.jobs (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  description text default '',
  status text default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  category text default null,
  assigned_agent_id text default null,
  assigned_agent_name text default '',
  requirements text default '',
  concilium_id text default null,
  concilium_name text default '',
  related_projects jsonb not null default '[]',
  related_workflows jsonb not null default '[]',
  related_tasks jsonb not null default '[]',
  related_partners jsonb not null default '[]',
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_jobs_user_id on public.jobs(user_id);
create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_jobs_assigned_agent_id on public.jobs(assigned_agent_id);
create index if not exists idx_jobs_concilium_id on public.jobs(concilium_id);
create index if not exists idx_jobs_category on public.jobs(category);

-- Row Level Security
alter table public.jobs enable row level security;

create policy "Users can manage jobs" on public.jobs
  for all using (auth.role() = 'authenticated');
