-- ============================================================
-- 144_communicator_security.sql — Communicator Phase 1
--   Locks down RLS, adds role enum, plus tables for:
--     • link-code onboarding
--     • update_id idempotency
--     • pending-tool-call confirmation flow
--     • stranger-DM logging
-- ============================================================

-- ── Minimal role enum on users ─────────────────────────────────────────────
-- Single-column, expandable check constraint. When adding new roles
-- (operator, viewer, billing-admin, marketplace creator/customer, etc.),
-- just edit the check — no schema refactor.
--
-- public.users was originally provisioned directly in the hosted dashboard,
-- while this and later migrations extend it. Define the minimal owner-scoped
-- profile table and auth sync here so a local/fresh environment has the same
-- prerequisite without changing an existing hosted table.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users
  add column if not exists email text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.users enable row level security;

drop policy if exists "users_owner_select" on public.users;
create policy "users_owner_select" on public.users
  for select using (id = auth.uid());

drop policy if exists "users_owner_update" on public.users;
create policy "users_owner_update" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_auth_users_sync_profile on auth.users;
create trigger trg_auth_users_sync_profile
  after insert or update of email on auth.users
  for each row execute function public.sync_auth_user_profile();

insert into public.users (id, email)
select id, email from auth.users
on conflict (id) do nothing;

alter table if exists public.users
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name   = 'users'
      and constraint_name = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('admin', 'member'));
  end if;
end $$;

create index if not exists idx_users_role on public.users(role);

-- ── Tighten RLS on communication_channels (owner-scoped) ───────────────────
drop policy if exists "comm_channels_select" on public.communication_channels;
drop policy if exists "comm_channels_insert" on public.communication_channels;
drop policy if exists "comm_channels_update" on public.communication_channels;
drop policy if exists "comm_channels_delete" on public.communication_channels;

create policy "comm_channels_select_own" on public.communication_channels
  for select using (connected_by = auth.uid());

create policy "comm_channels_insert_own" on public.communication_channels
  for insert with check (connected_by = auth.uid());

create policy "comm_channels_update_own" on public.communication_channels
  for update using (connected_by = auth.uid())
              with check (connected_by = auth.uid());

create policy "comm_channels_delete_own" on public.communication_channels
  for delete using (connected_by = auth.uid());

-- ── Add owner_id on agent_personas and scope RLS ──────────────────────────
alter table if exists public.agent_personas
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists idx_agent_personas_owner on public.agent_personas(owner_id);

drop policy if exists "agent_personas_select" on public.agent_personas;
drop policy if exists "agent_personas_insert" on public.agent_personas;
drop policy if exists "agent_personas_update" on public.agent_personas;
drop policy if exists "agent_personas_delete" on public.agent_personas;

create policy "agent_personas_select_own" on public.agent_personas
  for select using (owner_id = auth.uid() or owner_id is null);

create policy "agent_personas_insert_own" on public.agent_personas
  for insert with check (owner_id = auth.uid());

create policy "agent_personas_update_own" on public.agent_personas
  for update using (owner_id = auth.uid())
              with check (owner_id = auth.uid());

create policy "agent_personas_delete_own" on public.agent_personas
  for delete using (owner_id = auth.uid());

-- ── Scope communication_logs SELECT to authored / owned rows ──────────────
-- (Service role bypasses RLS, so inserts from webhook still work.)
drop policy if exists "comm_logs_select" on public.communication_logs;
create policy "comm_logs_select_own" on public.communication_logs
  for select using (
    sender_id = auth.uid() or
    exists (
      select 1 from public.communication_channels c
      where c.id = (metadata->>'channel_id')::uuid
        and c.connected_by = auth.uid()
    )
  );

-- ── New table: telegram_link_codes ─────────────────────────────────────────
-- 6-char codes (URL-safe), single-use, 10-min TTL. Connect-Telegram flow.
create table if not exists public.telegram_link_codes (
  code         text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  bot_username text not null default '',           -- which shared/BYO bot
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  used_at      timestamptz
);

create index if not exists idx_link_codes_user on public.telegram_link_codes(user_id);
create index if not exists idx_link_codes_expires on public.telegram_link_codes(expires_at);

alter table public.telegram_link_codes enable row level security;

create policy "link_codes_select_own" on public.telegram_link_codes
  for select using (user_id = auth.uid());

create policy "link_codes_insert_own" on public.telegram_link_codes
  for insert with check (user_id = auth.uid());

create policy "link_codes_delete_own" on public.telegram_link_codes
  for delete using (user_id = auth.uid());

-- ── New table: processed_updates ──────────────────────────────────────────
-- Idempotency for Telegram update_id. Stops duplicate tool calls on retry.
create table if not exists public.processed_updates (
  platform      text not null,
  update_id     text not null,
  channel_id    uuid,
  processed_at  timestamptz not null default now(),
  primary key (platform, update_id)
);

create index if not exists idx_processed_updates_recent
  on public.processed_updates(processed_at desc);

alter table public.processed_updates enable row level security;

-- Service-role-only. Webhook handler uses the admin client.
create policy "processed_updates_admin_only" on public.processed_updates
  for all using (false);

-- ── New table: pending_tool_calls ─────────────────────────────────────────
-- Holds high-risk tool calls awaiting Approve/Reject button tap.
create table if not exists public.pending_tool_calls (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  channel_id   uuid references public.communication_channels(id) on delete cascade,
  tool         text not null,
  args         jsonb not null default '{}',
  risk_level   text not null default 'high',
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  resolved_at  timestamptz,
  resolution   text check (resolution in ('approved', 'rejected', 'expired'))
);

create index if not exists idx_pending_tool_calls_user on public.pending_tool_calls(user_id);
create index if not exists idx_pending_tool_calls_expires on public.pending_tool_calls(expires_at);

alter table public.pending_tool_calls enable row level security;

create policy "pending_tool_calls_select_own" on public.pending_tool_calls
  for select using (user_id = auth.uid());

-- ── New table: communicator_strangers ─────────────────────────────────────
-- Logs DMs from un-allowlisted Telegram users (probe detection).
create table if not exists public.communicator_strangers (
  id                  uuid primary key default gen_random_uuid(),
  telegram_user_id    text not null,
  telegram_username   text,
  first_name          text,
  last_name           text,
  first_message       text,
  bot_username        text not null default '',
  attempt_count       integer not null default 1,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  last_replied_at     timestamptz,
  unique (telegram_user_id, bot_username)
);

create index if not exists idx_strangers_last_seen
  on public.communicator_strangers(last_seen_at desc);

alter table public.communicator_strangers enable row level security;

-- Admin-only visibility.
create policy "strangers_admin_only_select" on public.communicator_strangers
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- ── Optional: enable realtime on key tables for the visual onboarding ─────
-- Frontend subscribes to communication_channels filtered by user_id to
-- flip the stepper to ✓ Connected the moment the bot links the account.
do $$
begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin execute 'alter publication supabase_realtime add table public.communication_channels'; exception when others then null; end;
    begin execute 'alter publication supabase_realtime add table public.telegram_link_codes'; exception when others then null; end;
  end if;
end $$;
