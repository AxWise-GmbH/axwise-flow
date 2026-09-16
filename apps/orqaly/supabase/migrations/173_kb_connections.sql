-- 173: Knowledge Base source connections (Obsidian / Notion / Google Drive).
--
-- One row per connected external source. Each connection has a MODE:
--   'sync' (download) - the source's files are ingested into knowledge_documents
--   'live'            - files are NOT stored; Orqaly reads them over the
--                       connection at query time (federated). Obsidian is
--                       download-only (no cloud API).
--
-- Secrets are NOT stored here - they live in the existing vaulted stores and are
-- referenced via credential_ref:
--   Notion:        { kind: 'byok', provider: 'data:notion' }        -> user_api_keys
--   Google Drive:  { kind: 'oauth', provider: 'google-drive', credential_id }
--                                                            -> integration_credentials
--   Obsidian:      { kind: 'none' }                          (client-side .md import)
--
-- Mirrors 125_user_storage_connections.sql. Run in the Supabase SQL Editor.
-- Additive + idempotent.

create table if not exists public.kb_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  source_type       text not null check (source_type in ('notion','obsidian','google-drive')),
  -- Allow multiple connections of the same source (e.g. two Notion workspaces).
  slot              text not null default 'primary',
  label             text,

  -- 'sync' = download into the KB; 'live' = read over the connection at query time.
  mode              text not null default 'sync' check (mode in ('sync','live')),
  enabled           boolean not null default true,

  -- Safe-to-display scope (NEVER secrets): folder/page ids, workspace, vault name.
  scope             jsonb not null default '{}'::jsonb,
  -- Pointer to where the credential actually lives (vault / integration_credentials).
  credential_ref    jsonb not null default '{}'::jsonb,

  -- Sync state (download mode).
  sync_interval_secs int,
  last_synced_at    timestamptz,
  last_sync_ok      boolean,
  last_sync_error   text,
  docs_synced_count integer not null default 0,

  -- Versioning (matches the storage-connections pattern).
  is_current        boolean not null default true,
  superseded_at     timestamptz,
  superseded_by     uuid references public.kb_connections(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_kb_connections_user on public.kb_connections(user_id);
create index if not exists idx_kb_connections_user_enabled on public.kb_connections(user_id, enabled) where enabled;

-- Only one current connection per (user, source_type, slot).
create unique index if not exists uq_kb_connections_current
  on public.kb_connections(user_id, source_type, slot)
  where is_current;

alter table public.kb_connections enable row level security;

drop policy if exists kb_connections_owner on public.kb_connections;
create policy kb_connections_owner on public.kb_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists kb_connections_service on public.kb_connections;
create policy kb_connections_service on public.kb_connections
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create or replace function public.touch_kb_connections_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_kb_connections_touch on public.kb_connections;
create trigger trg_kb_connections_touch
  before update on public.kb_connections
  for each row execute function public.touch_kb_connections_updated_at();

create or replace function public.audit_kb_connections()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (action, entity, entity_id, user_id, details)
  values (
    case tg_op
      when 'INSERT' then 'KB_SOURCE_CONNECTED'
      when 'UPDATE' then 'KB_SOURCE_UPDATED'
      when 'DELETE' then 'KB_SOURCE_DISCONNECTED'
    end,
    'kb_connections',
    coalesce(new.id::text, old.id::text),
    coalesce(new.user_id, old.user_id),
    jsonb_build_object(
      'source_type', coalesce(new.source_type, old.source_type),
      'slot',        coalesce(new.slot, old.slot),
      'mode',        coalesce(new.mode, old.mode),
      'label',       coalesce(new.label, old.label)
    )::text
  );
  return coalesce(new, old);
end; $$;

drop trigger if exists trg_kb_connections_audit on public.kb_connections;
create trigger trg_kb_connections_audit
  after insert or update or delete on public.kb_connections
  for each row execute function public.audit_kb_connections();
