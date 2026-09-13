-- 126_goal_artifacts.sql
-- Single source of truth for every file a goal produces.
--
-- Today, deliverables live in three places at once:
--   - goals.data.deliverables JSONB column
--   - 3 storage buckets (goal-deliverables, agent-avatars, user-key-imports)
--     with inconsistent paths
--   - knowledge_documents table rows (textual reports)
--
-- After this migration, every file gets one row here. Frontend reads from
-- this table only; legacy locations are dual-written during BYOS Phase 2 and
-- retired in BYOS Phase 6.
--
-- Path convention: {userId}/{goalId}/{kind}/{filename}
-- Validated server-side by lib/storage/path.js — StorageWriter.upload()
-- rejects non-canonical paths to prevent regression.

create table if not exists public.goal_artifacts (
  id                       uuid primary key default gen_random_uuid(),
  goal_id                  uuid not null references public.goals(id) on delete cascade,
  -- task_id is nullable because some artifacts are produced at goal-level
  -- (e.g. the final summary PDF) rather than by a specific task.
  task_id                  uuid,
  user_id                  uuid not null references auth.users(id) on delete cascade,

  -- Which storage backend this artifact lives on. NULL means "platform default
  -- Supabase storage" (used when the user hasn't connected their own).
  storage_connection_id    uuid references public.user_storage_connections(id) on delete set null,

  -- Artifact classification — drives UI grouping and per-kind behaviors.
  -- Constrained to a known list so frontend display logic is predictable.
  kind                     text not null check (kind in (
    'pdf', 'image', 'html', 'deck', 'data', 'report',
    'banner', 'video', 'audio', 'archive', 'other'
  )),

  -- Canonical storage path: {userId}/{goalId}/{kind}/{filename}
  -- Enforced by lib/storage/path.js validator.
  storage_path             text not null,
  -- Bucket name within the storage backend. NULL for backends without buckets.
  storage_bucket           text,

  -- Public-or-signed URL for frontend rendering. May be NULL if access is
  -- always proxied through the API.
  public_url               text,

  -- File metadata
  filename                 text not null,
  bytes                    bigint not null default 0,
  mime                     text,
  checksum_sha256          text,

  -- Provenance — which code path created this artifact.
  -- Examples: 'tool-runner', 'complete-stage', 'render-deck',
  -- 'nda-renderer', 'generate-agent-avatar', 'landing-pages'.
  source                   text,

  -- Lifecycle
  created_at               timestamptz not null default now(),
  expires_at               timestamptz,
  -- Soft-delete: row stays for audit; physical file may be removed by cron.
  deleted_at               timestamptz
);

create index if not exists idx_goal_artifacts_goal      on public.goal_artifacts(goal_id);
create index if not exists idx_goal_artifacts_user      on public.goal_artifacts(user_id);
create index if not exists idx_goal_artifacts_goal_kind on public.goal_artifacts(goal_id, kind) where deleted_at is null;
create index if not exists idx_goal_artifacts_path      on public.goal_artifacts(storage_path);
create index if not exists idx_goal_artifacts_active    on public.goal_artifacts(user_id) where deleted_at is null;

alter table public.goal_artifacts enable row level security;

drop policy if exists "Users read own artifacts"   on public.goal_artifacts;
drop policy if exists "Users insert own artifacts" on public.goal_artifacts;
drop policy if exists "Users update own artifacts" on public.goal_artifacts;
drop policy if exists "Users delete own artifacts" on public.goal_artifacts;

create policy "Users read own artifacts"   on public.goal_artifacts for select using  (auth.uid() = user_id);
create policy "Users insert own artifacts" on public.goal_artifacts for insert with check (auth.uid() = user_id);
create policy "Users update own artifacts" on public.goal_artifacts for update using  (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own artifacts" on public.goal_artifacts for delete using  (auth.uid() = user_id);

-- Audit trail: every artifact creation/deletion shows up in audit_log.
create or replace function public.audit_goal_artifacts()
returns trigger language plpgsql security definer as $$
begin
  -- Only fire on INSERT and on DELETE-via-soft-delete (deleted_at flip).
  if tg_op = 'INSERT' then
    insert into public.audit_log (action, entity, entity_id, user_id, details)
    values (
      'ARTIFACT_UPLOADED',
      'goal_artifacts',
      new.id::text,
      new.user_id,
      jsonb_build_object(
        'goal_id',   new.goal_id,
        'kind',      new.kind,
        'bytes',     new.bytes,
        'mime',      new.mime,
        'source',    new.source,
        'storage_connection_id', new.storage_connection_id
      )::text
    );
  elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    insert into public.audit_log (action, entity, entity_id, user_id, details)
    values (
      'ARTIFACT_DELETED',
      'goal_artifacts',
      new.id::text,
      new.user_id,
      jsonb_build_object('goal_id', new.goal_id, 'kind', new.kind, 'storage_path', new.storage_path)::text
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_goal_artifacts_audit on public.goal_artifacts;
create trigger trg_goal_artifacts_audit
  after insert or update on public.goal_artifacts
  for each row execute function public.audit_goal_artifacts();
