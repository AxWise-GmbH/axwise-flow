-- Fix tools RLS: scope to owner only (previously any authenticated user could access all tools)
-- This prevents cross-user access to tool API keys stored in the data JSONB column.

DROP POLICY IF EXISTS "Users can manage tools" ON public.tools;

CREATE POLICY "Users manage own tools" ON public.tools
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
