-- 133_deliverable_refinements.sql
--
-- Stores LLM- and image-refinements of any deliverable surface
-- (knowledge_documents, landing_pages, goal_artifacts). v1 = the original
-- (implicit, not stored as a row here); v2 / v3 = rows in this table.
-- Cap of 2 refinements per deliverable is enforced server-side via
-- optimistic concurrency on the parent table's refinement_count column.
--
-- Why a separate table instead of a JSONB column on each parent:
--   - Unifies the audit trail across three different deliverable surfaces.
--   - Each refinement records its prompt + model + cost + duration for
--     later analytics.
--   - Makes RLS straightforward (per-row policy on user_id).

create table if not exists public.deliverable_refinements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  parent_kind     text not null check (parent_kind in
                    ('knowledge_document','landing_page','goal_artifact')),
  parent_id       text not null,
  version         int  not null check (version between 2 and 3),
  user_prompt     text not null,
  refined_content text,        -- markdown / HTML bodies
  refined_url     text,        -- image / pdf URLs
  refined_mime    text,
  status          text not null default 'pending'
                    check (status in ('pending','done','failed')),
  error           text,
  model           text,
  output_tokens   int default 0,
  duration_ms     int default 0,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  unique (parent_kind, parent_id, version)
);

create index if not exists idx_refinements_parent
  on public.deliverable_refinements (parent_kind, parent_id);
create index if not exists idx_refinements_user
  on public.deliverable_refinements (user_id);

alter table public.deliverable_refinements enable row level security;

drop policy if exists "refinements_select_own" on public.deliverable_refinements;
drop policy if exists "refinements_insert_own" on public.deliverable_refinements;
drop policy if exists "refinements_update_own" on public.deliverable_refinements;

create policy "refinements_select_own" on public.deliverable_refinements
  for select using (auth.uid() = user_id);
create policy "refinements_insert_own" on public.deliverable_refinements
  for insert with check (auth.uid() = user_id);
create policy "refinements_update_own" on public.deliverable_refinements
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cap counter on each parent table. The handler increments via
--   update <table> set refinement_count = $new
--   where id = $id and refinement_count = $old
-- so two simultaneous refinement attempts on the same item produce
-- exactly one winner (the other gets 0 rows affected and returns 409).
alter table public.knowledge_documents
  add column if not exists refinement_count int not null default 0;
alter table public.landing_pages
  add column if not exists refinement_count int not null default 0;
alter table public.goal_artifacts
  add column if not exists refinement_count int not null default 0;
