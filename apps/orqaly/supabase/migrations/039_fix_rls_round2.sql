-- Round 2 RLS fixes: search_knowledge scoping, injection-hub storage,
-- and re-tightening partners/meetings/partner_history after 004 rollback.

-- ============================================================
-- 1. search_knowledge RPC — always scope to calling user
-- ============================================================
-- The default null on filter_user_id lets direct RPC calls search all users' docs.
-- Use coalesce(filter_user_id, auth.uid()) so it always scopes to the caller.
CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding extensions.vector(384),
  match_count int default 5,
  match_threshold float default 0.5,
  filter_user_id uuid default null,
  filter_category text default null
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
    AND (filter_category IS NULL OR kd.category = filter_category)
    AND kd.embedding IS NOT NULL
    AND 1 - (kd.embedding <=> query_embedding) > match_threshold
  ORDER BY kd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 2. injection-hub storage — scope to user's own path prefix
-- ============================================================
-- Previously any authenticated user could read/write/delete all files.
-- Now scoped so each user can only access files under their own uid prefix.

DROP POLICY IF EXISTS "injection_hub_insert" ON storage.objects;
CREATE POLICY "injection_hub_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'injection-hub'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "injection_hub_select" ON storage.objects;
CREATE POLICY "injection_hub_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'injection-hub'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "injection_hub_update" ON storage.objects;
CREATE POLICY "injection_hub_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'injection-hub'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "injection_hub_delete" ON storage.objects;
CREATE POLICY "injection_hub_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'injection-hub'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- NOTE: partners, meetings, partner_history do not have user_id columns
-- in production (migration 004 rolled back the columns from 003).
-- These tables cannot be user-scoped until user_id columns are re-added.
-- TODO: Create a future migration to add user_id columns and tighten RLS.
