-- 136_semantic_memory.sql
set search_path to public, extensions;
-- Cross-goal semantic memory (Phase 2). Embeddings of finished goals'
-- project_overview, deliverables, and decisions, so each new goal in a
-- chain (and each goal in the same business_type) starts pre-loaded with
-- relevant prior context.

create extension if not exists vector;

create table if not exists public.goal_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid references public.goals(id) on delete cascade,
  business_type text,
  kind text not null check (kind in ('project_overview','deliverable','decision','kpi_outcome','summary')),
  content text not null,
  content_hash text not null,
  embedding extensions.vector(384),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (goal_id, kind, content_hash)
);
create index if not exists idx_goal_memory_user_business on public.goal_memory(user_id, business_type);
create index if not exists idx_goal_memory_goal on public.goal_memory(goal_id);
-- IVFFlat index for cosine similarity. Build later when there's data —
-- creating it on an empty table is fine but it'll be slow until tuned.
-- create index if not exists idx_goal_memory_embedding
--   on public.goal_memory using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.goal_memory enable row level security;
drop policy if exists "goal_memory_owner_select" on public.goal_memory;
create policy "goal_memory_owner_select" on public.goal_memory
  for select using (auth.uid() = user_id);
drop policy if exists "goal_memory_owner_insert" on public.goal_memory;
create policy "goal_memory_owner_insert" on public.goal_memory
  for insert with check (auth.uid() = user_id);

-- Every non-trivial agent decision logged so future chains can learn
-- which choices worked. Lightweight — no embeddings, just structured rows.
create table if not exists public.agent_decisions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references public.goals(id) on delete cascade,
  agent_role text not null,
  decision text not null,
  alternatives jsonb,
  rationale text,
  inputs jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_decisions_goal on public.agent_decisions(goal_id);
create index if not exists idx_agent_decisions_role on public.agent_decisions(agent_role, created_at desc);

-- pgvector cosine RPC: top-K similar memories for a user, optionally
-- restricted to a business_type. Used by lib/memory/retrieve.js.
create or replace function public.match_goal_memory(
  query_embedding extensions.vector(384),
  match_user_id uuid,
  match_business_type text default null,
  match_count int default 8
) returns table (
  id uuid,
  goal_id uuid,
  kind text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  business_type text,
  similarity float
) language sql stable as $$
  select
    gm.id, gm.goal_id, gm.kind, gm.content, gm.metadata, gm.created_at, gm.business_type,
    1 - (gm.embedding <=> query_embedding) as similarity
  from public.goal_memory gm
  where gm.user_id = match_user_id
    and (match_business_type is null or gm.business_type = match_business_type)
    and gm.embedding is not null
  order by gm.embedding <=> query_embedding
  limit match_count;
$$;

alter table public.agent_decisions enable row level security;
drop policy if exists "agent_decisions_via_goal" on public.agent_decisions;
create policy "agent_decisions_via_goal" on public.agent_decisions
  for select using (exists (
    select 1 from public.goals g where g.id = agent_decisions.goal_id and g.user_id = auth.uid()
  ));
