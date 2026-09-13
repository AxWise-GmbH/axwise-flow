-- AI Notification & Action Center schema
-- Safe to run multiple times (idempotent).

create extension if not exists "uuid-ossp";

create table if not exists public.notifications (
  id text primary key,
  timestamp timestamptz not null default now(),
  priority text not null,
  entity_type text not null,
  entity_id text not null,
  trigger_type text not null,
  profit_impact_score numeric not null default 0,
  revenue_at_risk numeric default 0,
  status text not null default 'active',
  assigned_to text[] default '{}',
  data jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete cascade
);

create index if not exists idx_notifications_priority_status on public.notifications(priority, status);
create index if not exists idx_notifications_entity on public.notifications(entity_type, entity_id);
create index if not exists idx_notifications_timestamp on public.notifications(timestamp desc);
create index if not exists idx_notifications_user on public.notifications(user_id);

create table if not exists public.action_options (
  id text primary key,
  notification_id text not null references public.notifications(id) on delete cascade,
  type text not null,
  description text,
  daily_recovery numeric default 0,
  annual_impact numeric default 0,
  implementation_time text,
  cost numeric default 0,
  risk text,
  requires_approval boolean default false,
  voice_command text,
  text_command text,
  data jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete cascade
);

create index if not exists idx_action_options_notification on public.action_options(notification_id);
create index if not exists idx_action_options_user on public.action_options(user_id);

create table if not exists public.notification_interactions (
  id text primary key,
  notification_id text not null references public.notifications(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  actor_id text,
  timestamp timestamptz not null default now(),
  action text not null,
  duration_seconds integer,
  method text,
  details jsonb
);

create index if not exists idx_notification_interactions_notification on public.notification_interactions(notification_id);
create index if not exists idx_notification_interactions_user on public.notification_interactions(user_id);

create table if not exists public.action_executions (
  id text primary key,
  notification_id text not null references public.notifications(id) on delete cascade,
  action_id text references public.action_options(id) on delete set null,
  executed_at timestamptz not null default now(),
  executed_by text not null,
  method text not null,
  changes_made jsonb,
  backup_id text,
  validation_status text,
  user_id uuid references auth.users(id) on delete cascade
);

create index if not exists idx_action_executions_notification on public.action_executions(notification_id);
create index if not exists idx_action_executions_user on public.action_executions(user_id);

create table if not exists public.notification_outcomes (
  id text primary key,
  notification_id text not null references public.notifications(id) on delete cascade,
  predicted_impact numeric default 0,
  actual_impact numeric default 0,
  variance_percent numeric default 0,
  effectiveness_score numeric default 0,
  issue_recurred boolean default false,
  measured_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade
);

create index if not exists idx_notification_outcomes_notification on public.notification_outcomes(notification_id);
create index if not exists idx_notification_outcomes_user on public.notification_outcomes(user_id);

create table if not exists public.notification_learning (
  id text primary key,
  notification_id text not null references public.notifications(id) on delete cascade,
  patterns_identified text[] default '{}',
  model_updates text[] default '{}',
  accuracy_score numeric default 0,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade
);

create index if not exists idx_notification_learning_notification on public.notification_learning(notification_id);
create index if not exists idx_notification_learning_user on public.notification_learning(user_id);

alter table public.notifications enable row level security;
alter table public.action_options enable row level security;
alter table public.notification_interactions enable row level security;
alter table public.action_executions enable row level security;
alter table public.notification_outcomes enable row level security;
alter table public.notification_learning enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "Users can write own notifications" on public.notifications;
create policy "Users can write own notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read own action_options" on public.action_options;
create policy "Users can read own action_options" on public.action_options
  for select using (auth.uid() = user_id);

drop policy if exists "Users can write own action_options" on public.action_options;
create policy "Users can write own action_options" on public.action_options
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read own notification_interactions" on public.notification_interactions;
create policy "Users can read own notification_interactions" on public.notification_interactions
  for select using (auth.uid() = user_id);

drop policy if exists "Users can write own notification_interactions" on public.notification_interactions;
create policy "Users can write own notification_interactions" on public.notification_interactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read own action_executions" on public.action_executions;
create policy "Users can read own action_executions" on public.action_executions
  for select using (auth.uid() = user_id);

drop policy if exists "Users can write own action_executions" on public.action_executions;
create policy "Users can write own action_executions" on public.action_executions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read own notification_outcomes" on public.notification_outcomes;
create policy "Users can read own notification_outcomes" on public.notification_outcomes
  for select using (auth.uid() = user_id);

drop policy if exists "Users can write own notification_outcomes" on public.notification_outcomes;
create policy "Users can write own notification_outcomes" on public.notification_outcomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read own notification_learning" on public.notification_learning;
create policy "Users can read own notification_learning" on public.notification_learning
  for select using (auth.uid() = user_id);

drop policy if exists "Users can write own notification_learning" on public.notification_learning;
create policy "Users can write own notification_learning" on public.notification_learning
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
