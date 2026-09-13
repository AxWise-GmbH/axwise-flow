-- Goals: autonomous goal orchestration layer above jobs
-- Supports plan → execute → evaluate → iterate loop

CREATE TABLE IF NOT EXISTS public.goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What the user wants
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  target_value    NUMERIC(12,2) DEFAULT NULL,
  target_unit     TEXT DEFAULT 'usd',

  -- Budget
  budget_usd      NUMERIC(10,4) NOT NULL DEFAULT 10.0000,
  spent_usd       NUMERIC(10,4) NOT NULL DEFAULT 0.0000,

  -- Status
  status          TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'active', 'paused', 'completed', 'failed', 'cancelled')),

  -- Progress
  current_value   NUMERIC(12,2) DEFAULT 0,
  iteration       INTEGER NOT NULL DEFAULT 0,
  max_iterations  INTEGER NOT NULL DEFAULT 5,

  -- Team + evaluation
  team_id         UUID REFERENCES public.concilium_teams(id) ON DELETE SET NULL,
  concilium_id    TEXT DEFAULT NULL,

  -- Plan (LLM-generated)
  plan            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_user_id ON public.goals(user_id);
CREATE INDEX idx_goals_status ON public.goals(status) WHERE status IN ('planning', 'active');

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own goals" ON public.goals FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages all goals" ON public.goals FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Goal activity log
CREATE TABLE IF NOT EXISTS public.goal_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_usd    NUMERIC(10,4) DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goal_log_goal_id ON public.goal_log(goal_id);

ALTER TABLE public.goal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own goal logs" ON public.goal_log FOR ALL
  USING (EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_log.goal_id AND g.user_id = auth.uid()));
CREATE POLICY "Service role manages all goal logs" ON public.goal_log FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Add goal_id to jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_goal_id ON public.jobs(goal_id) WHERE goal_id IS NOT NULL;
