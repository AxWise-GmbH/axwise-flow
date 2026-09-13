-- Concilium fraud events: abuse detection and logging
-- Phase 1: Stop the bleeding — fraud tracking with auto-action

CREATE TABLE IF NOT EXISTS public.concilium_fraud_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id        TEXT,
  board_id        TEXT,

  -- Fraud details
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'rate_limit_exceeded', 'spam_pattern', 'cost_anomaly',
    'repeated_failures', 'suspicious_timing', 'token_reuse',
    'rapid_fire_requests', 'budget_exceeded'
  )),

  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description     TEXT NOT NULL,

  -- Action taken
  auto_action     TEXT CHECK (auto_action IN ('none', 'throttle', 'quarantine', 'block')),
  blocked_until   TIMESTAMPTZ,

  -- Evidence
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_count   INTEGER,
  cost_attempted  NUMERIC(10,4),

  -- Review
  reviewed        BOOLEAN NOT NULL DEFAULT false,
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_events_user_id    ON public.concilium_fraud_events(user_id);
CREATE INDEX idx_fraud_events_agent_id   ON public.concilium_fraud_events(agent_id);
CREATE INDEX idx_fraud_events_board_id   ON public.concilium_fraud_events(board_id);
CREATE INDEX idx_fraud_events_severity   ON public.concilium_fraud_events(severity);
CREATE INDEX idx_fraud_events_type       ON public.concilium_fraud_events(event_type);
CREATE INDEX idx_fraud_events_created_at ON public.concilium_fraud_events(created_at DESC);
CREATE INDEX idx_fraud_events_unreviewed ON public.concilium_fraud_events(reviewed)
  WHERE reviewed = false;

-- RLS
ALTER TABLE public.concilium_fraud_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own fraud events"
  ON public.concilium_fraud_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages all fraud events"
  ON public.concilium_fraud_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
