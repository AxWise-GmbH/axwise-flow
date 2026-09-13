-- Concilium table: Groups of LLMs assembled for a purpose, linked to jobs
-- Run this in Supabase SQL Editor

create table if not exists public.concilium (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null default '',
  quantity integer not null default 1,
  llms jsonb not null default '[]',
  purpose text default '',
  status text default 'active' check (status in ('active', 'paused', 'disbanded')),
  created_by_id text default null,
  created_by_name text default '',
  change_log jsonb not null default '[]',
  started_at timestamptz default now(),
  working_on jsonb not null default '[]',
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_concilium_user_id on public.concilium(user_id);
create index if not exists idx_concilium_status on public.concilium(status);
create index if not exists idx_concilium_name on public.concilium(name);

-- Row Level Security
alter table public.concilium enable row level security;

create policy "Users can manage concilium" on public.concilium
  for all using (auth.role() = 'authenticated');
