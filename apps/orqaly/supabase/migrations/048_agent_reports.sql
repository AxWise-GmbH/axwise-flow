-- Agent reports: check-in and activity reports from managed agents
-- Phase 4: Agent lifecycle reporting

CREATE TABLE IF NOT EXISTS public.concilium_agent_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES public.concilium_agents(id) ON DELETE CASCADE,
  board_id        TEXT,

  -- Report type
  report_type     TEXT NOT NULL DEFAULT 'check_in'
    CHECK (report_type IN ('check_in', 'activity', 'error', 'completion', 'status_change')),

  -- Content
  summary         TEXT DEFAULT '',
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metrics for this report period
  requests_made   INTEGER DEFAULT 0,
  tokens_used     INTEGER DEFAULT 0,
  cost_usd        NUMERIC(10,4) DEFAULT 0,
  errors_count    INTEGER DEFAULT 0,

  -- Token verification
  verified        BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_reports_user_id   ON public.concilium_agent_reports(user_id);
CREATE INDEX idx_agent_reports_agent_id  ON public.concilium_agent_reports(agent_id);
CREATE INDEX idx_agent_reports_board_id  ON public.concilium_agent_reports(board_id);
CREATE INDEX idx_agent_reports_type      ON public.concilium_agent_reports(report_type);
CREATE INDEX idx_agent_reports_created   ON public.concilium_agent_reports(created_at DESC);

ALTER TABLE public.concilium_agent_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own agent reports"
  ON public.concilium_agent_reports FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages all agent reports"
  ON public.concilium_agent_reports FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
