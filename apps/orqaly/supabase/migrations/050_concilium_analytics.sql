-- Concilium analytics: period-based aggregation for dashboards
-- Phase 4: Analytics and reporting

CREATE TABLE IF NOT EXISTS public.concilium_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id        TEXT,

  -- Period
  period_type     TEXT NOT NULL CHECK (period_type IN ('hourly', 'daily', 'weekly', 'monthly')),
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,

  -- Evaluation metrics
  total_evaluations   INTEGER NOT NULL DEFAULT 0,
  approved_count      INTEGER NOT NULL DEFAULT 0,
  rejected_count      INTEGER NOT NULL DEFAULT 0,
  avg_overall_score   NUMERIC(4,2) DEFAULT 0,

  -- Consensus metrics
  consensus_reached_count INTEGER NOT NULL DEFAULT 0,
  human_review_count  INTEGER NOT NULL DEFAULT 0,

  -- Cost metrics
  total_cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_tokens        BIGINT NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,

  -- Member metrics
  active_members      INTEGER NOT NULL DEFAULT 0,
  member_failures     INTEGER NOT NULL DEFAULT 0,

  -- Security metrics
  security_events     INTEGER NOT NULL DEFAULT 0,
  fraud_events        INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_analytics_period UNIQUE (user_id, board_id, period_type, period_start)
);

CREATE INDEX idx_analytics_user_id    ON public.concilium_analytics(user_id);
CREATE INDEX idx_analytics_board_id   ON public.concilium_analytics(board_id);
CREATE INDEX idx_analytics_period     ON public.concilium_analytics(period_type, period_start DESC);

ALTER TABLE public.concilium_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own analytics"
  ON public.concilium_analytics FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages all analytics"
  ON public.concilium_analytics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
