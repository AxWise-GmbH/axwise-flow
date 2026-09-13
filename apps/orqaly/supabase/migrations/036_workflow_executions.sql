-- Workflow execution tracking tables
-- Stores per-run state and per-node step results
-- Run in Supabase SQL Editor

-- ── Workflow executions (one row per workflow run) ────────────────
create table if not exists public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id text references public.workflows(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending',
  trigger_data jsonb not null default '{}',
  node_outputs jsonb not null default '{}',
  variables jsonb not null default '{}',
  current_node_id text,
  execution_path text[] default '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_wf_exec_workflow_id on public.workflow_executions(workflow_id);
create index if not exists idx_wf_exec_user_id on public.workflow_executions(user_id);
create index if not exists idx_wf_exec_status on public.workflow_executions(status);
create index if not exists idx_wf_exec_created_at on public.workflow_executions(created_at desc);

alter table public.workflow_executions enable row level security;

create policy "Users can manage workflow_executions" on public.workflow_executions
  for all using (auth.uid() = user_id);

-- ── Workflow step results (one row per node execution) ───────────
create table if not exists public.workflow_step_results (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid references public.workflow_executions(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null default 'pending',
  input_data jsonb not null default '{}',
  output_data jsonb not null default '{}',
  error text,
  duration_ms integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_wf_step_execution_id on public.workflow_step_results(execution_id);
create index if not exists idx_wf_step_node_id on public.workflow_step_results(node_id);
create index if not exists idx_wf_step_status on public.workflow_step_results(status);

alter table public.workflow_step_results enable row level security;

create policy "Users can manage workflow_step_results" on public.workflow_step_results
  for all using (
    exists (
      select 1 from public.workflow_executions we
      where we.id = workflow_step_results.execution_id
      and we.user_id = auth.uid()
    )
  );
