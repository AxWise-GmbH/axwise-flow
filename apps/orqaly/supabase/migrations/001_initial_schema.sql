-- Orchestrator – Initial schema for Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Partners table: stores full partner object as jsonb for flexibility
create table if not exists public.partners (
  id text primary key,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_partners_data_name on public.partners ((data->>'name'));
create index if not exists idx_partners_data_funnel on public.partners ((data->>'funnelStatus'));

-- Meetings table
create table if not exists public.meetings (
  id text primary key,
  partner_id text references public.partners(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Workflows table
create table if not exists public.workflows (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  enabled boolean default true,
  data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Partner history table
create table if not exists public.partner_history (
  id uuid primary key default uuid_generate_v4(),
  partner_id text not null references public.partners(id) on delete cascade,
  type text not null,
  title text,
  detail text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Row Level Security (RLS)
alter table public.partners enable row level security;
alter table public.meetings enable row level security;
alter table public.workflows enable row level security;
alter table public.partner_history enable row level security;

-- Policies: allow authenticated users full access (simplified for single-tenant demo)
create policy "Users can manage partners" on public.partners
  for all using (auth.role() = 'authenticated');

create policy "Users can manage meetings" on public.meetings
  for all using (auth.role() = 'authenticated');

create policy "Users can manage workflows" on public.workflows
  for all using (auth.role() = 'authenticated');

create policy "Users can manage partner_history" on public.partner_history
  for all using (auth.role() = 'authenticated');

-- Indexes
create index if not exists idx_meetings_partner_id on public.meetings(partner_id);
create index if not exists idx_meetings_datetime on public.meetings ((data->>'datetime') desc nulls last);
create index if not exists idx_partner_history_partner_id on public.partner_history(partner_id);
