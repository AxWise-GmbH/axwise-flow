-- Concilium teams: grouping boards and members into teams
-- Phase 4: Team management

CREATE TABLE IF NOT EXISTS public.concilium_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',

  -- Leadership
  leader_id       UUID REFERENCES public.concilium_members(id) ON DELETE SET NULL,

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction table: team ↔ member (many-to-many)
CREATE TABLE IF NOT EXISTS public.concilium_team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES public.concilium_teams(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES public.concilium_members(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_team_member UNIQUE (team_id, member_id)
);

-- Indexes
CREATE INDEX idx_teams_user_id          ON public.concilium_teams(user_id);
CREATE INDEX idx_teams_active           ON public.concilium_teams(is_active) WHERE is_active = true;
CREATE INDEX idx_team_members_team_id   ON public.concilium_team_members(team_id);
CREATE INDEX idx_team_members_member_id ON public.concilium_team_members(member_id);
CREATE INDEX idx_team_members_user_id   ON public.concilium_team_members(user_id);

-- RLS for teams
ALTER TABLE public.concilium_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own teams"
  ON public.concilium_teams FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all teams"
  ON public.concilium_teams FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS for team_members
ALTER TABLE public.concilium_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own team members"
  ON public.concilium_team_members FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all team members"
  ON public.concilium_team_members FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
