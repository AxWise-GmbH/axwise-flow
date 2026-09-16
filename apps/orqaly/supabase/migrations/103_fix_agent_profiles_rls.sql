-- Fix agent_profiles RLS: allow any authenticated user to read profiles
-- The original policy required auth.uid() = user_id which blocks reads
-- when the frontend Supabase client session doesn't match exactly.

DROP POLICY IF EXISTS "agent_profiles_select" ON public.agent_profiles;

CREATE POLICY "agent_profiles_read_authenticated"
  ON public.agent_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
