-- Audit: actor type (user vs agent) + system agents table for Permissions → Agents tab
-- Run in Supabase SQL Editor or: supabase db push
-- Idempotent: safe to run multiple times.

-- 1. Extend audit_log for agent attribution
alter table public.audit_log
  add column if not exists actor_type text default 'user';

alter table public.audit_log
  add column if not exists agent_id text;

alter table public.audit_log
  add column if not exists agent_name text;

comment on column public.audit_log.actor_type is 'user or agent';
comment on column public.audit_log.agent_id is 'Agent identifier when actor_type = agent';
comment on column public.audit_log.agent_name is 'Agent display name when actor_type = agent';

create index if not exists idx_audit_log_actor_type_agent_id
  on public.audit_log(actor_type, agent_id);

-- 2. System agents: registry for Permissions → Agents tab (role assignment + audit visibility)
create table if not exists public.system_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'custom',
  role_id text references public.roles(id) on delete set null,
  agent_hub_id uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.system_agents is 'AI agents with system access; listed on Permissions → Agents tab';
comment on column public.system_agents.type is 'claw, openai, custom, etc.';
comment on column public.system_agents.agent_hub_id is 'Optional link to agent_hub_agents.id when registered from Agent Hub';

create index if not exists idx_system_agents_role_id on public.system_agents(role_id);
create index if not exists idx_system_agents_type on public.system_agents(type);
create index if not exists idx_system_agents_agent_hub_id on public.system_agents(agent_hub_id);

alter table public.system_agents enable row level security;

drop policy if exists "Authenticated users can read system_agents" on public.system_agents;
create policy "Authenticated users can read system_agents" on public.system_agents
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage system_agents" on public.system_agents;
create policy "Authenticated users can manage system_agents" on public.system_agents
  for all using (auth.role() = 'authenticated');
