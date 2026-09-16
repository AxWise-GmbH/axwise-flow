-- 106_agent_memory.sql
-- Extend knowledge_documents for agent long-term memory:
-- 1. Add 'conversation' content type
-- 2. Create agent-scoped search RPC
-- 3. Add composite index for owner lookups

-- 1. Allow 'conversation' content type
ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS chk_kd_content_type;
ALTER TABLE knowledge_documents ADD CONSTRAINT chk_kd_content_type
  CHECK (content_type IN ('note', 'file', 'link', 'template', 'conversation'));

-- 2. Composite index for agent-scoped queries
CREATE INDEX IF NOT EXISTS idx_kd_owner_user
  ON knowledge_documents(user_id, owner_type, owner_id);

-- 3. Agent-scoped semantic search function
CREATE OR REPLACE FUNCTION public.search_agent_memory(
  query_embedding extensions.vector(384),
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.3,
  filter_user_id uuid DEFAULT NULL,
  filter_owner_type text DEFAULT NULL,
  filter_owner_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kd.id,
    kd.title,
    kd.content,
    kd.source,
    kd.category,
    kd.metadata,
    1 - (kd.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_documents kd
  WHERE
    kd.user_id = coalesce(filter_user_id, auth.uid())
    AND (filter_owner_type IS NULL OR kd.owner_type = filter_owner_type)
    AND (filter_owner_id IS NULL OR kd.owner_id = filter_owner_id)
    AND kd.embedding IS NOT NULL
    AND 1 - (kd.embedding <=> query_embedding) > match_threshold
  ORDER BY kd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
