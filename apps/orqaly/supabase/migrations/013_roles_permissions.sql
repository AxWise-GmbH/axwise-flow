-- Roles & Permissions tables (Supabase → SQL Editor)
-- Idempotent migration: safe to run multiple times.

create extension if not exists "uuid-ossp";

-- Roles table
create table if not exists public.roles (
  id text primary key,
  name text not null,
  description text default '',
  built_in boolean default false,
  deletable boolean default true,
  color text default '#6366F1',
  pages jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User roles junction table (one role per user)
create table if not exists public.user_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  role_id text references public.roles(id) on delete set null,
  assigned_at timestamptz default now(),
  unique(user_id)
);

-- Indexes
create index if not exists idx_roles_name on public.roles(name);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role_id on public.user_roles(role_id);

-- RLS
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "Authenticated users can read roles" on public.roles;
create policy "Authenticated users can read roles" on public.roles
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage roles" on public.roles;
create policy "Authenticated users can manage roles" on public.roles
  for all using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read user_roles" on public.user_roles;
create policy "Authenticated users can read user_roles" on public.user_roles
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage user_roles" on public.user_roles;
create policy "Authenticated users can manage user_roles" on public.user_roles
  for all using (auth.role() = 'authenticated');

-- Seed built-in roles
insert into public.roles (id, name, description, built_in, deletable, color, pages)
values
  ('role-super-admin', 'Super Admin', 'Full unrestricted access to all pages and actions', true, false, '#D32F2F', '{}'::jsonb),
  ('role-manager', 'Manager', 'Full access to operational pages with management capabilities', true, false, '#1976D2', '{}'::jsonb),
  ('role-viewer', 'Viewer', 'Read-only access — can view all pages but cannot perform actions', true, false, '#757575', '{}'::jsonb)
on conflict (id) do nothing;

