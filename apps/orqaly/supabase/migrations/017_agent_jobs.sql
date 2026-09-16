-- Agent async jobs: enqueue payloads for worker (Inngest/Trigger.dev/cron later).
-- Run in Supabase SQL Editor if not using CLI.

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_agent_jobs_status on public.agent_jobs(status);
create index if not exists idx_agent_jobs_created_at on public.agent_jobs(created_at desc);

alter table public.agent_jobs enable row level security;

-- API uses service role (bypasses RLS). Allow authenticated users to read for status polling.
create policy "Authenticated read agent_jobs"
  on public.agent_jobs for select
  using (auth.role() = 'authenticated');

-- Inserts/updates from API use service role (bypasses RLS).
