-- Make agent_profiles readable by anyone (including anon key)
-- Profile data is not sensitive — it's public agent identity info.

DROP POLICY IF EXISTS "agent_profiles_read_authenticated" ON public.agent_profiles;
DROP POLICY IF EXISTS "agent_profiles_select" ON public.agent_profiles;

CREATE POLICY "agent_profiles_public_read"
  ON public.agent_profiles FOR SELECT
  USING (true);
