-- Agent HUB – modular agent orchestration platform
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Agent registry: modular, reusable agents
create table if not exists public.agent_hub_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_id text not null unique,
  role text not null,
  capabilities jsonb not null default '[]',
  input_format text,
  output_format text,
  constraints jsonb default '{}',
  performance_kpis jsonb default '{}',
  availability_status text default 'available',
  cost_per_task numeric(10,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agent HUB projects: structured specifications
create table if not exists public.agent_hub_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id text not null,
  title text not null,
  description text,
  objectives jsonb default '[]',
  budget numeric(12,2),
  deadline timestamptz,
  priority_level text default 'medium',
  required_capabilities jsonb default '[]',
  expected_kpis jsonb default '{}',
  risk_level text default 'medium',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agent-to-project assignments
create table if not exists public.agent_hub_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references public.agent_hub_projects(id) on delete cascade,
  agent_id uuid references public.agent_hub_agents(id) on delete cascade,
  responsibilities jsonb default '[]',
  match_score numeric(5,2),
  assigned_at timestamptz default now(),
  unique(project_id, agent_id)
);

-- Tasks: orchestration layer
create table if not exists public.agent_hub_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references public.agent_hub_projects(id) on delete cascade,
  agent_id uuid references public.agent_hub_agents(id) on delete cascade,
  title text not null,
  description text,
  status text default 'created',
  input_payload jsonb default '{}',
  output_payload jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- KPI tracking
create table if not exists public.agent_hub_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  kpi_name text not null,
  kpi_value numeric(12,4),
  period_key text,
  recorded_at timestamptz default now()
);

create index if not exists idx_agent_hub_agents_user on public.agent_hub_agents(user_id);
create index if not exists idx_agent_hub_agents_status on public.agent_hub_agents(availability_status);
create index if not exists idx_agent_hub_projects_user on public.agent_hub_projects(user_id);
create index if not exists idx_agent_hub_projects_status on public.agent_hub_projects(status);
create index if not exists idx_agent_hub_assignments_project on public.agent_hub_assignments(project_id);
create index if not exists idx_agent_hub_tasks_project on public.agent_hub_tasks(project_id);
create index if not exists idx_agent_hub_tasks_status on public.agent_hub_tasks(status);
create index if not exists idx_agent_hub_kpis_entity on public.agent_hub_kpis(entity_type, entity_id);

alter table public.agent_hub_agents enable row level security;
alter table public.agent_hub_projects enable row level security;
alter table public.agent_hub_assignments enable row level security;
alter table public.agent_hub_tasks enable row level security;
alter table public.agent_hub_kpis enable row level security;

create policy "Users manage own agent_hub_agents" on public.agent_hub_agents for all using (auth.uid() = user_id);
create policy "Users manage own agent_hub_projects" on public.agent_hub_projects for all using (auth.uid() = user_id);
create policy "Users manage own agent_hub_assignments" on public.agent_hub_assignments for all using (auth.uid() = user_id);
create policy "Users manage own agent_hub_tasks" on public.agent_hub_tasks for all using (auth.uid() = user_id);
create policy "Users manage own agent_hub_kpis" on public.agent_hub_kpis for all using (auth.uid() = user_id);
