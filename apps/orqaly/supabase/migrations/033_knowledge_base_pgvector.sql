-- Knowledge base with pgvector for RAG (Retrieval Augmented Generation)
-- Requires pgvector extension (available on all Supabase plans)
-- Run in Supabase SQL Editor

-- Enable the vector extension
create extension if not exists vector with schema extensions;

-- Knowledge base documents table
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  source text default '',
  category text default 'general',
  metadata jsonb not null default '{}',
  embedding extensions.vector(384),
  token_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_knowledge_docs_user_id on public.knowledge_documents(user_id);
create index if not exists idx_knowledge_docs_category on public.knowledge_documents(category);
create index if not exists idx_knowledge_docs_created_at on public.knowledge_documents(created_at desc);

-- HNSW index for fast similarity search
create index if not exists idx_knowledge_docs_embedding on public.knowledge_documents
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.knowledge_documents enable row level security;

create policy "Users can manage knowledge_documents" on public.knowledge_documents
  for all using (auth.uid() = user_id);

-- Similarity search function
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
    1 - (kd.embedding <=> query_embedding) as similarity
  from public.knowledge_documents kd
  where
    (filter_user_id is null or kd.user_id = filter_user_id)
    and (filter_category is null or kd.category = filter_category)
    and kd.embedding is not null
    and 1 - (kd.embedding <=> query_embedding) > match_threshold
  order by kd.embedding <=> query_embedding
  limit match_count;
end;
$$;
