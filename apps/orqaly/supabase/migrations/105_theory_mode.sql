-- Theory Mode: business projections for goals
-- Stores AI-generated business outcome forecasts at multiple time horizons

CREATE TABLE IF NOT EXISTS public.goal_projections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id           UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  projection_type   TEXT NOT NULL CHECK (projection_type IN ('preview', 'detailed')),

  -- Projections per time horizon (1mo/3mo/6mo/1yr/custom)
  horizons          JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Agent comments per horizon
  agent_comments    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Competitor analysis
  competitors       JSONB DEFAULT '[]'::jsonb,

  -- Scenario modeling (pessimistic/expected/optimistic)
  scenarios         JSONB DEFAULT '{}'::jsonb,

  -- Similar goals from goal_velocity
  similar_goals     JSONB DEFAULT '[]'::jsonb,

  -- Summary & methodology
  summary           TEXT,
  assumptions       JSONB DEFAULT '[]'::jsonb,
  methodology       TEXT,

  -- Cost of generating this projection
  projection_cost_usd NUMERIC(10,4) DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_projections_goal ON public.goal_projections(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_projections_user ON public.goal_projections(user_id);

ALTER TABLE public.goal_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own projections" ON public.goal_projections
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role manages projections" ON public.goal_projections
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Add theory_mode flag to goals
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS theory_mode BOOLEAN DEFAULT false;
