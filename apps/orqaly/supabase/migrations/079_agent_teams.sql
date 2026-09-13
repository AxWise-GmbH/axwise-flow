-- 079: Agent Teams — workforce teams for goal execution
-- Separate from concilium_teams (governance). References agents(id) directly.

CREATE TABLE IF NOT EXISTS public.agent_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  leader_id   UUID DEFAULT NULL,
  goal_id     UUID DEFAULT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_teams_user ON public.agent_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_teams_active ON public.agent_teams(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_teams_goal ON public.agent_teams(goal_id) WHERE goal_id IS NOT NULL;

ALTER TABLE public.agent_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_teams_user ON public.agent_teams FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY agent_teams_service ON public.agent_teams FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.agent_team_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.agent_teams(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_agent_team_member UNIQUE (team_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_team_members_team ON public.agent_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_agent_team_members_member ON public.agent_team_members(member_id);

ALTER TABLE public.agent_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_team_members_user ON public.agent_team_members FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY agent_team_members_service ON public.agent_team_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Add agent_team_id to goals (new goals use this, legacy goals keep team_id)
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS agent_team_id UUID DEFAULT NULL;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_teams;
