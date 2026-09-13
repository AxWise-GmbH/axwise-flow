-- 087: Add executor assignment fields to goals
-- Links goals to organizations, consilium boards, teams, or agents.

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS executor_type TEXT DEFAULT 'organization'
  CHECK (executor_type IN ('organization', 'consilium', 'team', 'agent'));

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS org_id UUID DEFAULT NULL;

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS executor_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_goals_org_id ON public.goals(org_id) WHERE org_id IS NOT NULL;
