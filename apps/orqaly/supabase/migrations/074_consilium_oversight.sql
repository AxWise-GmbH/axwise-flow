-- 074: Consilium Oversight — agent accountability + goal-board linking
-- Supports: agent rules, warnings, elimination, budget reallocation

-- ── Agent rules per goal/team ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID REFERENCES public.goals(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  rule_type   TEXT NOT NULL DEFAULT 'behavior'
    CHECK (rule_type IN ('behavior', 'reporting', 'quality', 'budget', 'tool_usage')),
  rule_text   TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_rules_goal ON public.agent_rules(goal_id);
CREATE INDEX IF NOT EXISTS idx_agent_rules_agent ON public.agent_rules(agent_id);

ALTER TABLE public.agent_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent rules" ON public.agent_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.goals g WHERE g.id = agent_rules.goal_id AND g.user_id = auth.uid()));
CREATE POLICY "Service role manages all agent rules" ON public.agent_rules FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Agent warnings/flags ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_warnings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID REFERENCES public.goals(id) ON DELETE CASCADE,
  agent_id    UUID NOT NULL,
  warning_type TEXT NOT NULL DEFAULT 'performance'
    CHECK (warning_type IN ('performance', 'timeout', 'rule_violation', 'budget_overrun', 'quality')),
  message     TEXT NOT NULL,
  details     JSONB DEFAULT '{}'::jsonb,
  resolved    BOOLEAN DEFAULT false,
  action_taken TEXT DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_warnings_goal ON public.agent_warnings(goal_id);
CREATE INDEX IF NOT EXISTS idx_agent_warnings_agent ON public.agent_warnings(agent_id);

ALTER TABLE public.agent_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own goal agent warnings" ON public.agent_warnings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.goals g WHERE g.id = agent_warnings.goal_id AND g.user_id = auth.uid()));
CREATE POLICY "Service role manages all agent warnings" ON public.agent_warnings FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Goal-board default linking ────────────────────────────────
-- Allow goals to auto-link to user's default board

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS default_board_id TEXT DEFAULT NULL;
