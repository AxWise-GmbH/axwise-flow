-- Knowledge document version snapshots.
-- Backs the per-row "review changes" content-diff viewer on the Knowledge page.
-- A snapshot is captured on create (v1) and on every write (v2, v3, ...).

create table if not exists public.knowledge_document_versions (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_no integer not null,
  title text,
  content text,
  category text,
  content_type text,
  change_type text not null default 'write', -- 'create' | 'write'
  actor_type text not null default 'user',   -- 'user' | 'agent'
  agent_id text,
  agent_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_kdv_document on public.knowledge_document_versions(document_id, version_no desc);
create index if not exists idx_kdv_user on public.knowledge_document_versions(user_id);

alter table public.knowledge_document_versions enable row level security;

drop policy if exists "kdv_user_select" on public.knowledge_document_versions;
create policy "kdv_user_select" on public.knowledge_document_versions
  for select using (auth.uid() = user_id);

drop policy if exists "kdv_service_all" on public.knowledge_document_versions;
create policy "kdv_service_all" on public.knowledge_document_versions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
