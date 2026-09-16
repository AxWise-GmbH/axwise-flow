-- Library Universe — curated + promoted best-in-class deliverable examples.
--
-- Phase 5. Extends the existing knowledge_documents table rather than creating
-- a new one. Library entries are rows with category='library_example' and a
-- specific metadata shape:
--
--   metadata = {
--     deliverable_type: 'landing_page' | 'presentation' | 'smm_banner' | 'smm_strategy' | 'code',
--     asset_url: 'https://...',                    -- live URL or downloadable file
--     preview_url: 'https://...',                  -- thumbnail for the library card
--     quality_score: 95,                           -- 0-100
--     source: 'curated' | 'promoted',
--     source_goal_id: 'uuid or null',
--     what_makes_it_great: 'string, ≤200 chars',
--     brand: 'optional name',                      -- e.g. "Linear", "Stripe"
--     promoted_by: 'user_id or null',
--     promoted_at: 'ISO timestamp or null'
--   }
--
-- The 50 hand-curated anchor entries are NOT inserted from this migration —
-- they come from scripts/seed-library-universe.mjs which runs server-side and
-- uses the service role key. Reason: migrations run as part of `supabase db
-- reset` but the seed is user-specific (owner_id + user_id).

-- Fast filter by deliverable_type nested inside metadata. The tab filters on
-- this field very often; without the GIN index each query does a seq scan on
-- the whole knowledge_documents table.
CREATE INDEX IF NOT EXISTS idx_kd_library_deliverable_type
  ON public.knowledge_documents ((metadata->>'deliverable_type'))
  WHERE category = 'library_example';

-- Fast "library entries only" filter — partial index keeps it small even as
-- the main knowledge_documents table grows.
CREATE INDEX IF NOT EXISTS idx_kd_library_category
  ON public.knowledge_documents (created_at DESC)
  WHERE category = 'library_example';

-- Fast lookup by source goal id when a goal was promoted — lets us surface
-- "promoted from goal X" badges on the library card without scanning.
CREATE INDEX IF NOT EXISTS idx_kd_library_source_goal
  ON public.knowledge_documents ((metadata->>'source_goal_id'))
  WHERE category = 'library_example' AND metadata->>'source_goal_id' IS NOT NULL;

-- Fast filter for curated-only vs promoted-only views.
CREATE INDEX IF NOT EXISTS idx_kd_library_source
  ON public.knowledge_documents ((metadata->>'source'))
  WHERE category = 'library_example';
