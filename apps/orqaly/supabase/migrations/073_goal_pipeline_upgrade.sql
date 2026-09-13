-- 073: Goal Pipeline Upgrade — add stages, modes, intelligence tables
-- Supports: feasibility → PO analysis → PM planning → team formation →
--   tool provisioning → discovery → client approval → execute → evaluate → iterate
-- Self-improvement via goal_velocity + agent_performance tables

-- ── New columns on goals ──────────────────────────────────────

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'simple'
  CHECK (mode IN ('simple', 'advanced'));

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS feasibility_report JSONB DEFAULT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS tech_doc JSONB DEFAULT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS proposal JSONB DEFAULT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS velocity_data JSONB DEFAULT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS retrospective JSONB DEFAULT NULL;

-- ── Expand status enum ────────────────────────────────────────

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN (
    'feasibility',        -- Stage 0: pre-goal analysis
    'analyzing',          -- Stage 1: PO working
    'planning',           -- Stage 2: PM working (existing)
    'forming_team',       -- Stage 3: team formation + Consilium
    'provisioning_tools', -- Stage 4: auto-provisioning
    'estimating',         -- Stage 5: agent discovery
    'awaiting_approval',  -- Stage 6: client gate (advanced only)
    'active',             -- Stage 7: executing (existing)
    'paused',             -- user-paused (existing)
    'completed',          -- done (existing)
    'failed',             -- failed (existing)
    'cancelled',          -- cancelled (existing)
    'awaiting_tools'      -- fallback if auto-provision fails (existing)
  ));

-- ── Goal velocity (user-scoped learning) ──────────────────────

CREATE TABLE IF NOT EXISTS public.goal_velocity (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_category         TEXT NOT NULL,
  task_type             TEXT NOT NULL DEFAULT 'general',
  avg_tokens_per_task   NUMERIC(12,2) DEFAULT 0,
  avg_duration_seconds  INTEGER DEFAULT 0,
  success_rate          NUMERIC(5,4) DEFAULT 0,
  sample_count          INTEGER DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_velocity_user ON public.goal_velocity(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_velocity_category ON public.goal_velocity(goal_category, task_type);

ALTER TABLE public.goal_velocity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own velocity data" ON public.goal_velocity FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages all velocity data" ON public.goal_velocity FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Agent performance (global — shared across all users) ──────

CREATE TABLE IF NOT EXISTS public.agent_performance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  task_type             TEXT NOT NULL DEFAULT 'general',
  tasks_completed       INTEGER DEFAULT 0,
  tasks_failed          INTEGER DEFAULT 0,
  avg_quality_score     NUMERIC(5,2) DEFAULT 0,
  avg_tokens_used       NUMERIC(12,2) DEFAULT 0,
  avg_duration_seconds  INTEGER DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_performance_agent ON public.agent_performance(agent_id);

ALTER TABLE public.agent_performance ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated users, writable only by service role
CREATE POLICY "Authenticated users read agent performance" ON public.agent_performance FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY "Service role writes agent performance" ON public.agent_performance FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
