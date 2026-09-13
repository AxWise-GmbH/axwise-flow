-- Communicator module
-- Tables: communication_logs, communication_channels, agent_personas

-- ─── communication_logs ────────────────────────────────────────────────────
create table if not exists public.communication_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  thread_id     uuid not null default gen_random_uuid(),
  sender_type   text not null check (sender_type in ('agent', 'system', 'user')),
  sender_id     uuid,
  sender_name   text not null default '',
  content       text not null default '',
  context_type  text not null default 'general'
                  check (context_type in ('build', 'deal', 'investment', 'consilium', 'command', 'general')),
  context_id    uuid,
  context_label text not null default '',
  platform      text not null default 'internal'
                  check (platform in ('internal', 'telegram', 'discord', 'slack', 'webhook')),
  metadata      jsonb not null default '{}'
);

create index if not exists idx_comm_logs_thread   on public.communication_logs(thread_id);
create index if not exists idx_comm_logs_type     on public.communication_logs(context_type);
create index if not exists idx_comm_logs_sender   on public.communication_logs(sender_id);
create index if not exists idx_comm_logs_created  on public.communication_logs(created_at desc);
create index if not exists idx_comm_logs_platform on public.communication_logs(platform);

alter table public.communication_logs enable row level security;

create policy "comm_logs_select" on public.communication_logs
  for select using (auth.uid() is not null);

create policy "comm_logs_insert" on public.communication_logs
  for insert with check (auth.uid() is not null);

create policy "comm_logs_delete" on public.communication_logs
  for delete using (auth.uid() is not null);

-- ─── communication_channels ────────────────────────────────────────────────
create table if not exists public.communication_channels (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  platform       text not null check (platform in ('telegram', 'discord', 'slack', 'webhook')),
  name           text not null default '',
  config         jsonb not null default '{}',
  status         text not null default 'inactive'
                   check (status in ('active', 'inactive', 'error')),
  connected_by   uuid references auth.users(id) on delete set null,
  last_active    timestamptz
);

create index if not exists idx_comm_channels_platform on public.communication_channels(platform);
create index if not exists idx_comm_channels_status   on public.communication_channels(status);

alter table public.communication_channels enable row level security;

create policy "comm_channels_select" on public.communication_channels
  for select using (auth.uid() is not null);

create policy "comm_channels_insert" on public.communication_channels
  for insert with check (auth.uid() is not null);

create policy "comm_channels_update" on public.communication_channels
  for update using (auth.uid() is not null);

create policy "comm_channels_delete" on public.communication_channels
  for delete using (auth.uid() is not null);

-- ─── agent_personas ────────────────────────────────────────────────────────
create table if not exists public.agent_personas (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  agent_id      text not null,
  platform      text not null default 'telegram'
                  check (platform in ('telegram', 'discord', 'slack')),
  persona_name  text not null default '',
  bot_token     text not null default '',
  bot_username  text not null default '',
  status        text not null default 'inactive'
                  check (status in ('active', 'inactive')),
  unique (agent_id, platform)
);

create index if not exists idx_agent_personas_agent on public.agent_personas(agent_id);

alter table public.agent_personas enable row level security;

create policy "agent_personas_select" on public.agent_personas
  for select using (auth.uid() is not null);

create policy "agent_personas_insert" on public.agent_personas
  for insert with check (auth.uid() is not null);

create policy "agent_personas_update" on public.agent_personas
  for update using (auth.uid() is not null);

create policy "agent_personas_delete" on public.agent_personas
  for delete using (auth.uid() is not null);
