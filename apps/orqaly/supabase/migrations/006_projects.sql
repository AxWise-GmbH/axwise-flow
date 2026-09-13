-- Projects table: connects partners, workflows, and campaigns
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

create table if not exists public.projects (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  status text default 'Active',
  partner_id text references public.partners(id) on delete set null,
  workflow_id text references public.workflows(id) on delete set null,
  campaign_id text,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_projects_partner_id on public.projects(partner_id);
create index if not exists idx_projects_workflow_id on public.projects(workflow_id);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_name on public.projects(name);

-- Row Level Security
alter table public.projects enable row level security;

-- Policy: allow authenticated users full access (same pattern as other tables)
create policy "Users can manage projects" on public.projects
  for all using (auth.role() = 'authenticated');
