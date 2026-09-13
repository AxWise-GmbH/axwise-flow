-- Browser task execution tracking
-- Stores step-by-step progress for browser automation jobs (Account Creation Specialist)

create table if not exists public.browser_task_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.agent_jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  target_tool_id text,
  provider_url text not null,
  status text not null default 'running'
    check (status in ('running', 'success', 'failed', 'timeout')),
  steps jsonb not null default '[]',
  temp_email text,
  credential_saved boolean default false,
  error text,
  duration_ms integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_browser_task_runs_job_id on public.browser_task_runs(job_id);
create index if not exists idx_browser_task_runs_user_id on public.browser_task_runs(user_id);
create index if not exists idx_browser_task_runs_status on public.browser_task_runs(status);

alter table public.browser_task_runs enable row level security;

DO $$ BEGIN
  CREATE POLICY "Users can read own browser tasks"
    ON public.browser_task_runs FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
