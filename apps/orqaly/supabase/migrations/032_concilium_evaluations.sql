-- Concilium evaluations: stores AI board evaluation results for jobs
-- Run in Supabase SQL Editor

create table if not exists public.concilium_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  concilium_id text references public.concilium(id) on delete set null,
  job_id text references public.jobs(id) on delete set null,
  agent_job_id uuid references public.agent_jobs(id) on delete set null,
  scores jsonb not null default '{}',
  overall_score numeric(4, 2) default 0,
  feedback text default '',
  approved boolean default false,
  summary text default '',
  model text default '',
  provider text default 'groq',
  usage jsonb not null default '{}',
  estimated_cost_usd numeric(10, 8) default 0,
  duration_ms integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_concilium_eval_concilium_id on public.concilium_evaluations(concilium_id);
create index if not exists idx_concilium_eval_job_id on public.concilium_evaluations(job_id);
create index if not exists idx_concilium_eval_user_id on public.concilium_evaluations(user_id);
create index if not exists idx_concilium_eval_created_at on public.concilium_evaluations(created_at desc);

alter table public.concilium_evaluations enable row level security;

create policy "Users can manage concilium_evaluations" on public.concilium_evaluations
  for all using (auth.role() = 'authenticated');
