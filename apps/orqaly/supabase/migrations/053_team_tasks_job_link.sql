-- 053: Add job pool linkage and agent tracking to team_tasks
-- Enables agents to create tasks linked to job pool items they've taken.

-- team_tasks originally existed only as a dashboard-created production table.
-- Define its live-compatible base shape here so every later ALTER/publication
-- has a relation to operate on during a fresh bootstrap. Migration 183 still
-- adds ownership, triggers, indexes, and any columns missing in older installs.
create table if not exists public.team_tasks (
  id                text primary key,
  title             text default '',
  description       text default '',
  priority          text default 'medium',
  status            text default 'todo',
  assigned_to       text default '',
  deadline          date,
  estimate          text default '',
  git_commits       jsonb default '[]'::jsonb,
  attachments       jsonb default '[]'::jsonb,
  created_by        text,
  data              jsonb default '{}'::jsonb,
  job_pool_id       text,
  category          text,
  agent_id          text,
  sequence_order    integer default 0,
  goal_id           uuid,
  prompt_version_id uuid,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Add job_pool_id to link tasks to job pool items
alter table public.team_tasks
  add column if not exists job_pool_id text default null,
  add column if not exists category text default null,
  add column if not exists agent_id text default null;

-- Index for fast lookups by job_pool_id
create index if not exists idx_team_tasks_job_pool_id
  on public.team_tasks (job_pool_id) where job_pool_id is not null;

-- Index for agent task lookups
create index if not exists idx_team_tasks_agent_id
  on public.team_tasks (agent_id) where agent_id is not null;

-- Add task_id and job_pool_id to agent reports for cross-referencing
alter table public.concilium_agent_reports
  add column if not exists task_id text default null,
  add column if not exists job_pool_id text default null;
