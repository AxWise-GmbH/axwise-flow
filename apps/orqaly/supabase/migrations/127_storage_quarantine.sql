-- 127_storage_quarantine.sql
-- Quarantine table for orphaned files found during BYOS Phase 5 file
-- relocation. When scripts/survey-storage.js can't classify a file (no
-- matching user/goal in DB), the file is moved to a _quarantine/ prefix
-- and recorded here for 30 days of manual review before hard-delete.

create table if not exists public.storage_quarantine (
  id                uuid primary key default gen_random_uuid(),

  -- Original location of the orphaned file
  original_bucket   text not null,
  original_path     text not null,

  -- Where it was moved to (so admins can inspect it)
  quarantine_bucket text not null,
  quarantine_path   text not null,

  -- File metadata captured at quarantine time
  bytes             bigint not null default 0,
  mime              text,
  checksum_sha256   text,

  -- Why it was quarantined: 'no_matching_user', 'no_matching_goal',
  -- 'malformed_path', 'collision', etc.
  reason            text not null,
  -- Free-form details (e.g. attempted lookups, candidate matches)
  details           jsonb not null default '{}'::jsonb,

  -- Lifecycle
  quarantined_at    timestamptz not null default now(),
  -- Set by `scripts/execute-moves.js` cron after 30 days; cron then hard-deletes
  -- the underlying file and removes this row.
  hard_delete_after timestamptz not null default (now() + interval '30 days'),
  -- Set when an admin reviews the row (resolved = restored or confirmed-delete).
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users(id) on delete set null,
  resolution        text check (resolution in ('restore', 'delete', 'pending')) default 'pending'
);

create unique index if not exists uq_storage_quarantine_original
  on public.storage_quarantine(original_bucket, original_path);
create index if not exists idx_storage_quarantine_pending on public.storage_quarantine(hard_delete_after) where resolution = 'pending';

alter table public.storage_quarantine enable row level security;

-- Admin-only table; no end-user policies. Service-role inserts/selects/updates.
drop policy if exists "Service role only" on public.storage_quarantine;
