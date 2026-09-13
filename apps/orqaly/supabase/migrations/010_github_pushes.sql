-- GitHub Pushes – tracks git pushes and the tasks they relate to
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Main table: each row represents a single git push event
create table if not exists public.github_pushes (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  repo text not null default '',
  branch text not null default 'main',
  commit_sha text not null default '',
  commit_message text not null default '',
  commit_author text not null default '',
  commit_url text not null default '',
  pushed_at timestamptz not null default now(),
  notes text not null default '',
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Junction table: links a push to one or more tasks
-- task_ref is flexible: it can be a partner-task id (T-xxx-xxx) or a project id
create table if not exists public.github_push_tasks (
  id uuid primary key default uuid_generate_v4(),
  push_id text not null references public.github_pushes(id) on delete cascade,
  task_ref text not null,
  task_title text not null default '',
  task_type text not null default 'partner_task',
  partner_id text,
  project_id text,
  data jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_github_pushes_user_id on public.github_pushes(user_id);
create index if not exists idx_github_pushes_repo on public.github_pushes(repo);
create index if not exists idx_github_pushes_branch on public.github_pushes(branch);
create index if not exists idx_github_pushes_pushed_at on public.github_pushes(pushed_at desc);
create index if not exists idx_github_push_tasks_push_id on public.github_push_tasks(push_id);
create index if not exists idx_github_push_tasks_task_ref on public.github_push_tasks(task_ref);

-- Row Level Security
alter table public.github_pushes enable row level security;
alter table public.github_push_tasks enable row level security;

-- Policies: authenticated users full access (same pattern as other tables)
create policy "Users can manage github_pushes" on public.github_pushes
  for all using (auth.role() = 'authenticated');

create policy "Users can manage github_push_tasks" on public.github_push_tasks
  for all using (auth.role() = 'authenticated');
