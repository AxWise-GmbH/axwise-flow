-- 171: Per-user imported Marketplace libraries.
--
-- Backs the "Import From..." feature on the Marketplace tabs. A user can import
-- a curated external library (e.g. Ollama, Composio, CrewAI) or define their own
-- for any of the 6 categories (orgs, teams, agents, models, tools, skills). Each
-- imported library is one row holding the library metadata plus its authored
-- items (jsonb). Items render alongside the built-in catalog and stay usable via
-- each tab's existing action.
--
-- Rows are user-scoped (RLS), so an imported library is visible only to the user
-- who imported it. Run in the Supabase SQL Editor. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.marketplace_imported_libraries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- One of the 6 Marketplace tabs the library imports into.
  category    TEXT NOT NULL CHECK (category IN ('orgs','teams','agents','models','tools','skills')),
  -- Stable id of the source library: a curated id (e.g. 'ollama-library') or a
  -- generated 'custom-<ts>' for a user-defined one.
  source_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  author      TEXT,
  url         TEXT,
  -- true when the user defined the library themselves (vs a curated pick).
  custom      BOOLEAN NOT NULL DEFAULT false,
  -- The authored items, each already shaped for its tab's action + card.
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Re-importing the same library replaces the row rather than duplicating it.
  UNIQUE (user_id, category, source_id)
);

ALTER TABLE public.marketplace_imported_libraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_imported_libraries_owner ON public.marketplace_imported_libraries;
CREATE POLICY marketplace_imported_libraries_owner ON public.marketplace_imported_libraries
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS marketplace_imported_libraries_service ON public.marketplace_imported_libraries;
CREATE POLICY marketplace_imported_libraries_service ON public.marketplace_imported_libraries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_marketplace_imported_libraries_user_category
  ON public.marketplace_imported_libraries(user_id, category);
