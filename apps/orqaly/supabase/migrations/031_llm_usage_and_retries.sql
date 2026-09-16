-- LLM usage tracking + agent_jobs retry support
-- Run in Supabase SQL Editor

-- ── Add retry support to agent_jobs ─────────────────────────────
alter table public.agent_jobs
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3;

-- ── LLM usage tracking table ────────────────────────────────────
create table if not exists public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.agent_jobs(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'groq',
  model text not null default '',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 8) not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_llm_usage_job_id on public.llm_usage(job_id);
create index if not exists idx_llm_usage_user_id on public.llm_usage(user_id);
create index if not exists idx_llm_usage_provider on public.llm_usage(provider);
create index if not exists idx_llm_usage_created_at on public.llm_usage(created_at desc);

alter table public.llm_usage enable row level security;

-- Authenticated users can read their own usage
create policy "Users read own llm_usage"
  on public.llm_usage for select
  using (auth.uid() = user_id or auth.role() = 'authenticated');

-- Service role handles inserts (from API)
