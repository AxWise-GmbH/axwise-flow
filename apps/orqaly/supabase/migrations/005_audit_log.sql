-- Audit log: action, entity, user, when, details (for Audit Log page).
-- Run in Supabase Dashboard → SQL Editor → New query → paste and Run.
-- Safe to run multiple times (idempotent).

create extension if not exists "uuid-ossp";

create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  action text not null,
  entity text not null,
  entity_id text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  details text,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity);
create index if not exists idx_audit_log_user_id on public.audit_log(user_id);

alter table public.audit_log enable row level security;

drop policy if exists "Authenticated users can insert audit_log" on public.audit_log;
create policy "Authenticated users can insert audit_log" on public.audit_log
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read audit_log" on public.audit_log;
create policy "Authenticated users can read audit_log" on public.audit_log
  for select using (auth.role() = 'authenticated');
