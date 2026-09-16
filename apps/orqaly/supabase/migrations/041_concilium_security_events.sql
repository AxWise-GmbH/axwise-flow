-- Concilium security events: immutable audit trail for security incidents
-- Phase 1: Stop the bleeding — abuse detection and logging

CREATE TABLE IF NOT EXISTS public.concilium_security_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  board_id        TEXT,
  evaluation_id   UUID,
  member_id       UUID,

  -- Event details
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'jailbreak_attempt', 'prompt_injection', 'permission_violation',
    'collusion_detected', 'rate_limit_exceeded', 'cost_limit_exceeded',
    'spam_detected', 'suspicious_pattern', 'unauthorized_action',
    'member_quarantined', 'board_lockdown', 'human_override',
    'agent_accepted', 'agent_paused', 'agent_terminated'
  )),

  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description     TEXT NOT NULL,

  -- Evidence
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ip       TEXT,
  detection_method TEXT,

  -- Response
  auto_action_taken TEXT,
  human_review_required BOOLEAN NOT NULL DEFAULT false,
  reviewed_by     UUID REFERENCES auth.users(id),
  review_decision TEXT,
  reviewed_at     TIMESTAMPTZ,

  -- Immutable timestamp
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sec_events_user_id     ON public.concilium_security_events(user_id);
CREATE INDEX idx_sec_events_board_id    ON public.concilium_security_events(board_id);
CREATE INDEX idx_sec_events_severity    ON public.concilium_security_events(severity);
CREATE INDEX idx_sec_events_type        ON public.concilium_security_events(event_type);
CREATE INDEX idx_sec_events_created_at  ON public.concilium_security_events(created_at DESC);
CREATE INDEX idx_sec_events_unreviewed  ON public.concilium_security_events(human_review_required)
  WHERE human_review_required = true AND reviewed_at IS NULL;

-- RLS: immutable for users (INSERT + SELECT only), service role can update for resolution
ALTER TABLE public.concilium_security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own security events"
  ON public.concilium_security_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages all security events"
  ON public.concilium_security_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
