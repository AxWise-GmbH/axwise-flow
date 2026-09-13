-- 092: Goal Units (departments) — group goals within organizations
-- Units hold up to 6 teams, support chaining (sequential execution),
-- and provide department-level budget tracking.

-- Goal Units table
CREATE TABLE IF NOT EXISTS public.goal_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  unit_type   TEXT NOT NULL DEFAULT 'bundle'
    CHECK (unit_type IN ('bundle', 'chain', 'initiative')),
  org_id      UUID DEFAULT NULL,
  status      TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  max_teams   INTEGER DEFAULT 6,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_units_user ON public.goal_units(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_units_org ON public.goal_units(org_id) WHERE org_id IS NOT NULL;

ALTER TABLE public.goal_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own units" ON public.goal_units FOR ALL
  USING (user_id = auth.uid());
CREATE POLICY "Service role manages all units" ON public.goal_units FOR ALL
  USING (auth.role() = 'service_role');

-- Unit members — goals within a unit with ordering and dependencies
CREATE TABLE IF NOT EXISTS public.goal_unit_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id        UUID NOT NULL REFERENCES public.goal_units(id) ON DELETE CASCADE,
  goal_id        UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  sequence_order INTEGER DEFAULT 0,
  depends_on     UUID DEFAULT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_members_unit ON public.goal_unit_members(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_members_goal ON public.goal_unit_members(goal_id);

ALTER TABLE public.goal_unit_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own unit members" ON public.goal_unit_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.goal_units u WHERE u.id = unit_id AND u.user_id = auth.uid()));
CREATE POLICY "Service role manages all unit members" ON public.goal_unit_members FOR ALL
  USING (auth.role() = 'service_role');

-- Add unit_id to goals for quick lookups
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS unit_id UUID DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_goals_unit ON public.goals(unit_id) WHERE unit_id IS NOT NULL;
