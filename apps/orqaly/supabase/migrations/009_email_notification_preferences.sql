-- Email notification preferences per user.
-- Stores a JSONB object mapping action keys to booleans.
-- Safe to run multiple times (idempotent).

create extension if not exists "uuid-ossp";

create table if not exists public.email_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_email_notification_preferences_user
  on public.email_notification_preferences(user_id);

-- RLS: users can only manage their own preferences
alter table public.email_notification_preferences enable row level security;

drop policy if exists "Users can manage own email_notification_preferences"
  on public.email_notification_preferences;

create policy "Users can manage own email_notification_preferences"
  on public.email_notification_preferences
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
