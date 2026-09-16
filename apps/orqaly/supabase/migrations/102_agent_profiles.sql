-- Agent Identity Profiles — rich personality cards for AI agents
-- Each agent gets a full character sheet: identity, contact, communication style,
-- backstory, behavior rules, and AI-generated photos.

-- ─── agent_profiles ───────────────────────────────────────────────────────────
create table if not exists public.agent_profiles (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references public.agents(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- Identity
  display_name     text not null default '',
  pronouns         text not null default '',
  age              integer,
  gender           text not null default '',

  -- Professional
  job_title        text not null default '',
  role             text not null default '',
  organization     text not null default '',

  -- Location
  location         text not null default '',
  timezone         text not null default '',

  -- Bio
  bio              text not null default '',

  -- Contact
  email            text not null default '',
  phone            text not null default '',
  linkedin_url     text not null default '',
  whatsapp         text not null default '',
  telegram         text not null default '',

  -- Photos (Supabase Storage paths)
  headshot_path    text,
  casual_photo_path text,

  -- Email signature (plain text or HTML)
  email_signature  text not null default '',

  -- Communication style (JSONB)
  communication_tone jsonb not null default '{}'::jsonb,
  -- { style, verbosity, emoji_usage, formality, greeting_style }

  -- Message templates (JSONB array)
  message_templates jsonb not null default '[]'::jsonb,
  -- [{ name, subject, body, category }]

  -- Backstory
  backstory        text not null default '',

  -- Behavior rules (application logic, not LLM)
  behavior_rules   jsonb not null default '{}'::jsonb,
  -- { reply_delay_min_sec, reply_delay_max_sec, escalation_rules[], topics_to_avoid[] }

  -- Overflow
  metadata         jsonb not null default '{}'::jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint uq_agent_profiles_agent_user unique (agent_id, user_id)
);

-- Indexes
create index if not exists idx_agent_profiles_agent_id on public.agent_profiles(agent_id);
create index if not exists idx_agent_profiles_user_id  on public.agent_profiles(user_id);

-- RLS
alter table public.agent_profiles enable row level security;

create policy "agent_profiles_select"
  on public.agent_profiles for select
  using (auth.uid() = user_id);

create policy "agent_profiles_insert"
  on public.agent_profiles for insert
  with check (auth.uid() = user_id);

create policy "agent_profiles_update"
  on public.agent_profiles for update
  using (auth.uid() = user_id);

create policy "agent_profiles_delete"
  on public.agent_profiles for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.agent_profiles_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_agent_profiles_updated_at
  before update on public.agent_profiles
  for each row execute function public.agent_profiles_set_updated_at();

-- Storage bucket for agent avatars (run via Supabase dashboard or CLI)
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('agent-avatars', 'agent-avatars', false, 2097152, '{"image/jpeg","image/png","image/webp"}');
