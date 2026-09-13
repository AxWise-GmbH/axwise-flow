-- Keep pgvector operator lookup stable for all three vector-backed memory RPCs.
-- The functions retain their existing invoker-security behavior and tenant,
-- category, owner, and business-type predicates; only name resolution is
-- hardened here.

begin;

create or replace function public.search_knowledge(
  query_embedding extensions.vector(384),
  match_count int default 5,
  match_threshold float default 0.5,
  filter_user_id uuid default null,
  filter_category text default null
)
returns table (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  metadata jsonb,
  similarity float
)
language plpgsql
set search_path = pg_catalog, extensions
as $$
begin
  return query
  select
    kd.id,
    kd.title,
    kd.content,
    kd.source,
    kd.category,
    kd.metadata,
    1 - (kd.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_documents as kd
  where kd.user_id = coalesce(filter_user_id, auth.uid())
    and (filter_category is null or kd.category = filter_category)
    and kd.embedding is not null
    and 1 - (kd.embedding operator(extensions.<=>) query_embedding) > match_threshold
  order by kd.embedding operator(extensions.<=>) query_embedding
  limit match_count;
end;
$$;

create or replace function public.search_agent_memory(
  query_embedding extensions.vector(384),
  match_count int default 5,
  match_threshold float default 0.3,
  filter_user_id uuid default null,
  filter_owner_type text default null,
  filter_owner_id text default null
)
returns table (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  metadata jsonb,
  similarity float
)
language plpgsql
set search_path = pg_catalog, extensions
as $$
begin
  return query
  select
    kd.id,
    kd.title,
    kd.content,
    kd.source,
    kd.category,
    kd.metadata,
    1 - (kd.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_documents as kd
  where kd.user_id = coalesce(filter_user_id, auth.uid())
    and (filter_owner_type is null or kd.owner_type = filter_owner_type)
    and (filter_owner_id is null or kd.owner_id = filter_owner_id)
    and kd.embedding is not null
    and 1 - (kd.embedding operator(extensions.<=>) query_embedding) > match_threshold
  order by kd.embedding operator(extensions.<=>) query_embedding
  limit match_count;
end;
$$;

create or replace function public.match_goal_memory(
  query_embedding extensions.vector(384),
  match_user_id uuid,
  match_business_type text default null,
  match_count int default 8
)
returns table (
  id uuid,
  goal_id uuid,
  kind text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  business_type text,
  similarity float
)
language sql
stable
set search_path = pg_catalog, extensions
as $$
  select
    gm.id,
    gm.goal_id,
    gm.kind,
    gm.content,
    gm.metadata,
    gm.created_at,
    gm.business_type,
    1 - (gm.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.goal_memory as gm
  where gm.user_id = match_user_id
    and (match_business_type is null or gm.business_type = match_business_type)
    and gm.embedding is not null
  order by gm.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;

commit;
