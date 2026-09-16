-- Job requests table: user-submitted requests that get parsed into jobs
-- Run this in Supabase SQL Editor

create table if not exists public.job_requests (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  request_text text not null default '',
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  parsed_title text default null,
  parsed_category text default null,
  parsed_requirements text default null,
  parsed_priority text default 'medium' check (parsed_priority in ('low', 'medium', 'high', 'urgent')),
  assigned_concilium_id text default null,
  assigned_concilium_name text default '',
  result_job_id text default null,
  result_agent_id text default null,
  processing_notes text default '',
  cost_usd numeric(10, 4) default 0,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_job_requests_user_id on public.job_requests(user_id);
create index if not exists idx_job_requests_status on public.job_requests(status);
create index if not exists idx_job_requests_priority on public.job_requests(parsed_priority);
create index if not exists idx_job_requests_created_at on public.job_requests(created_at desc);

-- Row Level Security
alter table public.job_requests enable row level security;

create policy "Users can manage job_requests" on public.job_requests
  for all using (auth.role() = 'authenticated');
