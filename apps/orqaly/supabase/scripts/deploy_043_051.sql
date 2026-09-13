-- ============================================================================
-- Combined deployment: Migrations 043-051 (Consilium v2)
-- Fully idempotent — safe to re-run.
-- ============================================================================

-- ======= Migration 043: Concilium v2 Schema =======

-- 1. Extend existing concilium table
ALTER TABLE public.concilium
  ADD COLUMN IF NOT EXISTS uuid_id             UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS legacy_id           TEXT,
  ADD COLUMN IF NOT EXISTS security_level      TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS description         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS approval_threshold  NUMERIC(3,2) DEFAULT 0.60,
  ADD COLUMN IF NOT EXISTS confidence_threshold NUMERIC(3,2) DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS auto_quarantine_on_violation BOOLEAN DEFAULT false;

-- Add check constraint if not exists (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'concilium_security_level_check'
  ) THEN
    ALTER TABLE public.concilium ADD CONSTRAINT concilium_security_level_check
      CHECK (security_level IN ('minimal', 'standard', 'strict', 'paranoid'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_concilium_uuid_id ON public.concilium(uuid_id);

-- Fix RLS: idempotent policy replacement
DROP POLICY IF EXISTS "Users can manage concilium" ON public.concilium;
DROP POLICY IF EXISTS "Users manage own concilium" ON public.concilium;
DROP POLICY IF EXISTS "Service role manages all concilium" ON public.concilium;

CREATE POLICY "Users manage own concilium"
  ON public.concilium FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all concilium"
  ON public.concilium FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Concilium Members
CREATE TABLE IF NOT EXISTS public.concilium_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'evaluator'
    CHECK (role IN ('chairman', 'evaluator', 'auditor', 'specialist', 'observer')),
  resume          TEXT DEFAULT '',
  skills          JSONB NOT NULL DEFAULT '[]',
  comments        JSONB NOT NULL DEFAULT '[]',
  provider        TEXT NOT NULL DEFAULT 'groq'
    CHECK (provider IN ('groq', 'openai', 'anthropic', 'deepseek', 'glm')),
  model           TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  temperature     NUMERIC(3,2) DEFAULT 0.7,
  max_tokens      INTEGER DEFAULT 4096,
  total_evaluations    INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
  avg_cost_usd         NUMERIC(10,8) NOT NULL DEFAULT 0,
  total_tokens_used    BIGINT NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  quarantined     BOOLEAN NOT NULL DEFAULT false,
  quarantine_reason TEXT,
  quarantined_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concilium_members_user_id      ON public.concilium_members(user_id);
CREATE INDEX IF NOT EXISTS idx_concilium_members_concilium_id ON public.concilium_members(concilium_id);
CREATE INDEX IF NOT EXISTS idx_concilium_members_provider     ON public.concilium_members(provider);
CREATE INDEX IF NOT EXISTS idx_concilium_members_active       ON public.concilium_members(active) WHERE active = true;

ALTER TABLE public.concilium_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own members" ON public.concilium_members;
DROP POLICY IF EXISTS "Service role manages all members" ON public.concilium_members;

CREATE POLICY "Users manage own members"
  ON public.concilium_members FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all members"
  ON public.concilium_members FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. Concilium Member Permissions
CREATE TABLE IF NOT EXISTS public.concilium_member_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES public.concilium_members(id) ON DELETE CASCADE,
  can_evaluate    BOOLEAN NOT NULL DEFAULT true,
  can_recommend   BOOLEAN NOT NULL DEFAULT false,
  can_override    BOOLEAN NOT NULL DEFAULT false,
  max_evaluations_per_day INTEGER NOT NULL DEFAULT 100,
  max_tokens_per_day      INTEGER NOT NULL DEFAULT 100000,
  max_cost_per_month_usd  NUMERIC(10,4) NOT NULL DEFAULT 50.0000,
  forbidden_actions JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_member_permissions UNIQUE (member_id)
);

CREATE INDEX IF NOT EXISTS idx_member_perms_user_id   ON public.concilium_member_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_member_perms_member_id ON public.concilium_member_permissions(member_id);

ALTER TABLE public.concilium_member_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own member permissions" ON public.concilium_member_permissions;
DROP POLICY IF EXISTS "Service role manages all member permissions" ON public.concilium_member_permissions;

CREATE POLICY "Users manage own member permissions"
  ON public.concilium_member_permissions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all member permissions"
  ON public.concilium_member_permissions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Concilium Criteria
CREATE TABLE IF NOT EXISTS public.concilium_criteria (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  weight          NUMERIC(3,2) NOT NULL DEFAULT 1.00
    CHECK (weight >= 0 AND weight <= 1),
  rubric          TEXT DEFAULT '',
  examples        JSONB NOT NULL DEFAULT '[]',
  version         INTEGER NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_criteria_user_id      ON public.concilium_criteria(user_id);
CREATE INDEX IF NOT EXISTS idx_criteria_concilium_id ON public.concilium_criteria(concilium_id);
CREATE INDEX IF NOT EXISTS idx_criteria_active       ON public.concilium_criteria(is_active) WHERE is_active = true;

ALTER TABLE public.concilium_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own criteria" ON public.concilium_criteria;
DROP POLICY IF EXISTS "Service role manages all criteria" ON public.concilium_criteria;

CREATE POLICY "Users manage own criteria"
  ON public.concilium_criteria FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all criteria"
  ON public.concilium_criteria FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. Concilium Consensus Rules
CREATE TABLE IF NOT EXISTS public.concilium_consensus_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,
  consensus_type  TEXT NOT NULL DEFAULT 'majority'
    CHECK (consensus_type IN ('unanimous', 'majority', 'weighted', 'custom')),
  quorum          INTEGER NOT NULL DEFAULT 2,
  approval_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  split_decision_strategy TEXT NOT NULL DEFAULT 'chairman_decides'
    CHECK (split_decision_strategy IN (
      'chairman_decides', 'reject', 'escalate_to_human', 're_evaluate'
    )),
  custom_rules    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_consensus_per_board UNIQUE (concilium_id)
);

CREATE INDEX IF NOT EXISTS idx_consensus_user_id      ON public.concilium_consensus_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_consensus_concilium_id ON public.concilium_consensus_rules(concilium_id);

ALTER TABLE public.concilium_consensus_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own consensus rules" ON public.concilium_consensus_rules;
DROP POLICY IF EXISTS "Service role manages all consensus rules" ON public.concilium_consensus_rules;

CREATE POLICY "Users manage own consensus rules"
  ON public.concilium_consensus_rules FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all consensus rules"
  ON public.concilium_consensus_rules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. Concilium Action Registry
CREATE TABLE IF NOT EXISTS public.concilium_action_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,
  action_name     TEXT NOT NULL,
  description     TEXT DEFAULT '',
  risk_level      TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requires_approval  BOOLEAN NOT NULL DEFAULT false,
  min_approvers      INTEGER NOT NULL DEFAULT 1,
  allowed_roles      JSONB NOT NULL DEFAULT '["chairman", "evaluator"]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_action_per_board UNIQUE (concilium_id, action_name)
);

CREATE INDEX IF NOT EXISTS idx_action_reg_user_id      ON public.concilium_action_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_action_reg_concilium_id ON public.concilium_action_registry(concilium_id);

ALTER TABLE public.concilium_action_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own action registry" ON public.concilium_action_registry;
DROP POLICY IF EXISTS "Service role manages all action registry" ON public.concilium_action_registry;

CREATE POLICY "Users manage own action registry"
  ON public.concilium_action_registry FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all action registry"
  ON public.concilium_action_registry FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ======= Migration 044: Migrate Concilium Data =======

UPDATE public.concilium
SET uuid_id = gen_random_uuid(),
    legacy_id = id
WHERE uuid_id IS NULL;

INSERT INTO public.concilium_members (user_id, concilium_id, name, role, provider, model)
SELECT
  c.user_id, c.id,
  COALESCE(llm->>'label', CONCAT(llm->>'provider', ' – ', llm->>'model')),
  'evaluator',
  COALESCE(llm->>'provider', 'groq'),
  COALESCE(llm->>'model', 'llama-3.3-70b-versatile')
FROM public.concilium c,
     jsonb_array_elements(c.llms) AS llm
WHERE c.user_id IS NOT NULL
  AND jsonb_array_length(c.llms) > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.concilium_criteria (user_id, concilium_id, name, weight, rubric, sort_order)
SELECT c.user_id, c.id, crit.name, crit.weight, crit.rubric, crit.sort_order
FROM public.concilium c
CROSS JOIN (VALUES
  ('Quality',        0.30, 'Evaluate overall quality of the work product.', 0),
  ('Completeness',   0.25, 'Assess whether all requirements are addressed.', 1),
  ('Accuracy',       0.25, 'Check factual correctness and precision.', 2),
  ('Actionability',  0.20, 'Rate how actionable and practical the recommendations are.', 3)
) AS crit(name, weight, rubric, sort_order)
WHERE c.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.concilium_consensus_rules (user_id, concilium_id, consensus_type, quorum, approval_threshold, split_decision_strategy)
SELECT c.user_id, c.id, 'majority', 2, 0.50, 'chairman_decides'
FROM public.concilium c
WHERE c.user_id IS NOT NULL
ON CONFLICT (concilium_id) DO NOTHING;

-- ======= Migration 045: Concilium Evaluations v2 =======

ALTER TABLE public.concilium_evaluations
  ADD COLUMN IF NOT EXISTS board_id          TEXT,
  ADD COLUMN IF NOT EXISTS agent_id          TEXT,
  ADD COLUMN IF NOT EXISTS member_responses  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS decision_level    TEXT DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS consensus_type    TEXT,
  ADD COLUMN IF NOT EXISTS human_review_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_review_status   TEXT DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS total_cost_usd    NUMERIC(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens      INTEGER DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concilium_evaluations_decision_level_check') THEN
    ALTER TABLE public.concilium_evaluations ADD CONSTRAINT concilium_evaluations_decision_level_check
      CHECK (decision_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concilium_evaluations_human_review_status_check') THEN
    ALTER TABLE public.concilium_evaluations ADD CONSTRAINT concilium_evaluations_human_review_status_check
      CHECK (human_review_status IN ('not_required', 'pending', 'approved', 'rejected', 'overridden'));
  END IF;
END $$;

UPDATE public.concilium_evaluations
SET board_id = concilium_id
WHERE board_id IS NULL AND concilium_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eval_board_id ON public.concilium_evaluations(board_id);
CREATE INDEX IF NOT EXISTS idx_eval_decision_level ON public.concilium_evaluations(decision_level);
CREATE INDEX IF NOT EXISTS idx_eval_human_review ON public.concilium_evaluations(human_review_required)
  WHERE human_review_required = true AND human_review_status = 'pending';

-- ======= Migration 046: Concilium Feedback =======

CREATE TABLE IF NOT EXISTS public.concilium_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluation_id   UUID NOT NULL REFERENCES public.concilium_evaluations(id) ON DELETE CASCADE,
  board_id        TEXT,
  was_board_correct   BOOLEAN,
  false_positive      BOOLEAN DEFAULT false,
  false_negative      BOOLEAN DEFAULT false,
  user_notes          TEXT DEFAULT '',
  quality_rating      INTEGER CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_feedback_per_eval UNIQUE (evaluation_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id       ON public.concilium_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_evaluation_id ON public.concilium_feedback(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_feedback_board_id      ON public.concilium_feedback(board_id);
CREATE INDEX IF NOT EXISTS idx_feedback_correct       ON public.concilium_feedback(was_board_correct)
  WHERE was_board_correct IS NOT NULL;

ALTER TABLE public.concilium_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own feedback" ON public.concilium_feedback;
DROP POLICY IF EXISTS "Service role manages all feedback" ON public.concilium_feedback;

CREATE POLICY "Users manage own feedback"
  ON public.concilium_feedback FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all feedback"
  ON public.concilium_feedback FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ======= Migration 047: Concilium Agents =======

CREATE TABLE IF NOT EXISTS public.concilium_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id        TEXT REFERENCES public.concilium(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  agent_type      TEXT DEFAULT 'external'
    CHECK (agent_type IN ('external', 'internal', 'hybrid')),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'active', 'paused', 'terminated', 'expired')),
  tracking_token  TEXT UNIQUE,
  check_in_interval_ms INTEGER NOT NULL DEFAULT 300000,
  last_check_in   TIMESTAMPTZ,
  missed_check_ins INTEGER NOT NULL DEFAULT 0,
  max_missed_check_ins INTEGER NOT NULL DEFAULT 3,
  total_requests      INTEGER NOT NULL DEFAULT 0,
  total_tokens_used   BIGINT NOT NULL DEFAULT 0,
  total_cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_evaluations   INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
  allowed_actions     JSONB NOT NULL DEFAULT '[]',
  max_requests_per_hour INTEGER NOT NULL DEFAULT 60,
  max_cost_per_day_usd NUMERIC(10,4) NOT NULL DEFAULT 5.0000,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_at     TIMESTAMPTZ,
  paused_at       TIMESTAMPTZ,
  terminated_at   TIMESTAMPTZ,
  termination_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Use unique index names that don't conflict with the marketplace agents table
CREATE INDEX IF NOT EXISTS idx_concilium_agents_user_id   ON public.concilium_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_concilium_agents_board_id  ON public.concilium_agents(board_id);
CREATE INDEX IF NOT EXISTS idx_concilium_agents_status    ON public.concilium_agents(status);
CREATE INDEX IF NOT EXISTS idx_concilium_agents_token     ON public.concilium_agents(tracking_token) WHERE tracking_token IS NOT NULL;

ALTER TABLE public.concilium_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agents" ON public.concilium_agents;
DROP POLICY IF EXISTS "Service role manages all agents" ON public.concilium_agents;

CREATE POLICY "Users manage own agents"
  ON public.concilium_agents FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all agents"
  ON public.concilium_agents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ======= Migration 048: Agent Reports =======

CREATE TABLE IF NOT EXISTS public.concilium_agent_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES public.concilium_agents(id) ON DELETE CASCADE,
  board_id        TEXT,
  report_type     TEXT NOT NULL DEFAULT 'check_in'
    CHECK (report_type IN ('check_in', 'activity', 'error', 'completion', 'status_change', 'system_audit')),
  summary         TEXT DEFAULT '',
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  requests_made   INTEGER DEFAULT 0,
  tokens_used     INTEGER DEFAULT 0,
  cost_usd        NUMERIC(10,4) DEFAULT 0,
  errors_count    INTEGER DEFAULT 0,
  verified        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_reports_user_id   ON public.concilium_agent_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_reports_agent_id  ON public.concilium_agent_reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_reports_board_id  ON public.concilium_agent_reports(board_id);
CREATE INDEX IF NOT EXISTS idx_agent_reports_type      ON public.concilium_agent_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_agent_reports_created   ON public.concilium_agent_reports(created_at DESC);

ALTER TABLE public.concilium_agent_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own agent reports" ON public.concilium_agent_reports;
DROP POLICY IF EXISTS "Service role manages all agent reports" ON public.concilium_agent_reports;

CREATE POLICY "Users read own agent reports"
  ON public.concilium_agent_reports FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages all agent reports"
  ON public.concilium_agent_reports FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ======= Migration 049: Concilium Teams =======

CREATE TABLE IF NOT EXISTS public.concilium_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  leader_id       UUID REFERENCES public.concilium_members(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.concilium_team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES public.concilium_teams(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES public.concilium_members(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_team_member UNIQUE (team_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_teams_user_id          ON public.concilium_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_active           ON public.concilium_teams(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_team_members_team_id   ON public.concilium_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member_id ON public.concilium_team_members(member_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id   ON public.concilium_team_members(user_id);

ALTER TABLE public.concilium_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concilium_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own teams" ON public.concilium_teams;
DROP POLICY IF EXISTS "Service role manages all teams" ON public.concilium_teams;
DROP POLICY IF EXISTS "Users manage own team members" ON public.concilium_team_members;
DROP POLICY IF EXISTS "Service role manages all team members" ON public.concilium_team_members;

CREATE POLICY "Users manage own teams"
  ON public.concilium_teams FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all teams"
  ON public.concilium_teams FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users manage own team members"
  ON public.concilium_team_members FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all team members"
  ON public.concilium_team_members FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ======= Migration 050: Concilium Analytics =======

CREATE TABLE IF NOT EXISTS public.concilium_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id        TEXT,
  period_type     TEXT NOT NULL CHECK (period_type IN ('hourly', 'daily', 'weekly', 'monthly')),
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  total_evaluations   INTEGER NOT NULL DEFAULT 0,
  approved_count      INTEGER NOT NULL DEFAULT 0,
  rejected_count      INTEGER NOT NULL DEFAULT 0,
  avg_overall_score   NUMERIC(4,2) DEFAULT 0,
  consensus_reached_count INTEGER NOT NULL DEFAULT 0,
  human_review_count  INTEGER NOT NULL DEFAULT 0,
  total_cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_tokens        BIGINT NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
  active_members      INTEGER NOT NULL DEFAULT 0,
  member_failures     INTEGER NOT NULL DEFAULT 0,
  security_events     INTEGER NOT NULL DEFAULT 0,
  fraud_events        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_analytics_period UNIQUE (user_id, board_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_analytics_user_id    ON public.concilium_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_board_id   ON public.concilium_analytics(board_id);
CREATE INDEX IF NOT EXISTS idx_analytics_period     ON public.concilium_analytics(period_type, period_start DESC);

ALTER TABLE public.concilium_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own analytics" ON public.concilium_analytics;
DROP POLICY IF EXISTS "Service role manages all analytics" ON public.concilium_analytics;

CREATE POLICY "Users read own analytics"
  ON public.concilium_analytics FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages all analytics"
  ON public.concilium_analytics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ======= Migration 051: UUID Migration =======

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS concilium_uuid_id UUID;

UPDATE public.jobs j
SET concilium_uuid_id = c.uuid_id
FROM public.concilium c
WHERE j.concilium_id = c.id
  AND j.concilium_uuid_id IS NULL
  AND c.uuid_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_concilium_uuid_id
  ON public.jobs (concilium_uuid_id)
  WHERE concilium_uuid_id IS NOT NULL;

ALTER TABLE public.concilium_evaluations
  ADD COLUMN IF NOT EXISTS concilium_uuid_id UUID;

UPDATE public.concilium_evaluations e
SET concilium_uuid_id = c.uuid_id
FROM public.concilium c
WHERE e.concilium_id = c.id
  AND e.concilium_uuid_id IS NULL
  AND c.uuid_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_concilium_evaluations_uuid_id
  ON public.concilium_evaluations (concilium_uuid_id)
  WHERE concilium_uuid_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_backfill_concilium_uuid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.concilium_id IS NOT NULL AND NEW.concilium_uuid_id IS NULL THEN
    SELECT uuid_id INTO NEW.concilium_uuid_id
    FROM public.concilium
    WHERE id = NEW.concilium_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_backfill_uuid ON public.jobs;
CREATE TRIGGER trg_jobs_backfill_uuid
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_backfill_concilium_uuid();

DROP TRIGGER IF EXISTS trg_evaluations_backfill_uuid ON public.concilium_evaluations;
CREATE TRIGGER trg_evaluations_backfill_uuid
  BEFORE INSERT OR UPDATE ON public.concilium_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_backfill_concilium_uuid();

-- ======= Done =======
-- All v2 tables created. The frontend seed will now work.
