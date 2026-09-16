-- Email templates (provider-managed, versioned) and delivery event tracking.
-- Supports external template sync (e.g., Google Stitch) + Resend lifecycle tracking.
-- Safe to run multiple times (idempotent).

create extension if not exists "uuid-ossp";

create table if not exists public.email_templates (
  id uuid primary key default uuid_generate_v4(),
  action_key text not null,
  provider text not null default 'stitch_google',
  version integer not null default 1,
  subject_template text not null,
  html_template text not null,
  text_template text,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(action_key, provider, version)
);

create unique index if not exists idx_email_templates_active_unique
  on public.email_templates(action_key, provider)
  where is_active = true;

create index if not exists idx_email_templates_action_provider
  on public.email_templates(action_key, provider, is_active, updated_at desc);

alter table public.email_templates enable row level security;

drop policy if exists "Authenticated users can read active email templates"
  on public.email_templates;
create policy "Authenticated users can read active email templates"
  on public.email_templates
  for select
  using (auth.role() = 'authenticated' and is_active = true);

drop policy if exists "Service role can manage email templates"
  on public.email_templates;
create policy "Service role can manage email templates"
  on public.email_templates
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.email_notification_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  action_key text not null,
  recipient_email text,
  status text not null default 'queued',
  resend_id text,
  template_source text not null default 'local',
  template_provider text,
  template_version integer,
  error_message text,
  payload_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  delivered_at timestamptz
);

create index if not exists idx_email_notification_events_user
  on public.email_notification_events(user_id, created_at desc);

create index if not exists idx_email_notification_events_action
  on public.email_notification_events(action_key, created_at desc);

create unique index if not exists idx_email_notification_events_resend
  on public.email_notification_events(resend_id)
  where resend_id is not null;

alter table public.email_notification_events enable row level security;

drop policy if exists "Users can read own email notification events"
  on public.email_notification_events;
create policy "Users can read own email notification events"
  on public.email_notification_events
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own email notification events"
  on public.email_notification_events;
create policy "Users can insert own email notification events"
  on public.email_notification_events
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Service role can manage email notification events"
  on public.email_notification_events;
create policy "Service role can manage email notification events"
  on public.email_notification_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

