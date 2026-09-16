-- 125_user_storage_connections.sql
-- BYOS (Bring Your Own Storage): users connect their own storage backend
-- (Supabase project, S3, R2, GCS) so goal deliverables land in their account
-- instead of yours. Mirrors the structure of 114_user_api_keys.sql so the
-- envelope-crypto module can be reused without modification.
--
-- Encrypted connection credentials (e.g. Supabase service-role key, S3 secret)
-- live in vault.secrets; this table stores metadata + a pointer.

create table if not exists public.user_storage_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- Backend kind. v1 supports 'supabase' only; 's3', 'r2', 'gcs' added later.
  kind             text not null check (kind in ('supabase','s3','r2','gcs')),
  -- Slot allows multiple connections of the same kind (e.g. user has two
  -- different Supabase projects for staging vs prod artifacts).
  slot             text not null default 'primary',

  -- Display label the user picks ("My Project", "Marketing Bucket").
  label            text,

  -- Backend-specific metadata that's safe to expose to the user (NEVER keys).
  -- Examples:
  --   supabase: { url, bucket }
  --   s3/r2:    { endpoint, region, bucket }
  --   gcs:      { project_id, bucket }
  metadata         jsonb not null default '{}'::jsonb,

  -- Pointer to encrypted envelope in vault.secrets (encrypted via
  -- lib/security/storage-connections.js → envelope-crypto.js).
  vault_secret_id  uuid not null,

  -- Envelope metadata (matches 114_user_api_keys.sql)
  kek_id           text not null default 'ORQ_KEK_V1',
  algorithm        text not null default 'AES-256-GCM',
  envelope_version int  not null default 1,

  -- Versioning for rotation
  is_current       boolean not null default true,
  superseded_at    timestamptz,
  superseded_by    uuid references public.user_storage_connections(id) on delete set null,

  -- Last connection test (probe upload + read + delete)
  last_tested_at   timestamptz,
  last_test_ok     boolean,
  last_test_error  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_user_storage_connections_user on public.user_storage_connections(user_id);
create index if not exists idx_user_storage_connections_user_kind_curr on public.user_storage_connections(user_id, kind) where is_current;

-- Only one current connection per (user, kind, slot)
create unique index if not exists uq_user_storage_connections_current
  on public.user_storage_connections(user_id, kind, slot)
  where is_current;

alter table public.user_storage_connections enable row level security;

drop policy if exists "Users read own storage connections"   on public.user_storage_connections;
drop policy if exists "Users insert own storage connections" on public.user_storage_connections;
drop policy if exists "Users update own storage connections" on public.user_storage_connections;
drop policy if exists "Users delete own storage connections" on public.user_storage_connections;

create policy "Users read own storage connections"   on public.user_storage_connections for select using  (auth.uid() = user_id);
create policy "Users insert own storage connections" on public.user_storage_connections for insert with check (auth.uid() = user_id);
create policy "Users update own storage connections" on public.user_storage_connections for update using  (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own storage connections" on public.user_storage_connections for delete using  (auth.uid() = user_id);

create or replace function public.touch_user_storage_connections_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_user_storage_connections_touch on public.user_storage_connections;
create trigger trg_user_storage_connections_touch
  before update on public.user_storage_connections
  for each row execute function public.touch_user_storage_connections_updated_at();

create or replace function public.audit_user_storage_connections()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (action, entity, entity_id, user_id, details)
  values (
    case tg_op
      when 'INSERT' then 'STORAGE_CONNECTED'
      when 'UPDATE' then 'STORAGE_UPDATED'
      when 'DELETE' then 'STORAGE_DISCONNECTED'
    end,
    'user_storage_connections',
    coalesce(new.id::text, old.id::text),
    coalesce(new.user_id, old.user_id),
    jsonb_build_object(
      'kind',       coalesce(new.kind, old.kind),
      'slot',       coalesce(new.slot, old.slot),
      'label',      coalesce(new.label, old.label),
      'is_current', coalesce(new.is_current, old.is_current)
    )::text
  );
  return coalesce(new, old);
end; $$;

drop trigger if exists trg_user_storage_connections_audit on public.user_storage_connections;
create trigger trg_user_storage_connections_audit
  after insert or update or delete on public.user_storage_connections
  for each row execute function public.audit_user_storage_connections();
