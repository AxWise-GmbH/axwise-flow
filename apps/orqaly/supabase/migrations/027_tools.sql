-- Tools table: system-defined tools (Data Hub, SMS Sendout, Mail Sendout)
-- Run this in Supabase SQL Editor

create table if not exists public.tools (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text default '',
  status text default 'active' check (status in ('active', 'blocked', 'inactive')),
  connection_type text default 'internal' check (connection_type in ('api', 'internal', 'webhook', 'sdk')),
  used_by jsonb not null default '[]',
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_tools_user_id on public.tools(user_id);
create index if not exists idx_tools_status on public.tools(status);
create index if not exists idx_tools_name on public.tools(name);
create index if not exists idx_tools_connection_type on public.tools(connection_type);

-- Row Level Security
alter table public.tools enable row level security;

create policy "Users can manage tools" on public.tools
  for all using (auth.role() = 'authenticated');
