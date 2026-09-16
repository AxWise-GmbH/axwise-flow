-- Concilium rate limits: per-entity (user/agent/board/team) request + cost caps
-- Phase 1: Stop the bleeding — cost controls and abuse prevention

CREATE TABLE IF NOT EXISTS public.concilium_rate_limits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Entity identification
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('user', 'agent', 'board', 'team')),
  entity_id       TEXT NOT NULL,

  -- Request limits
  max_requests_per_hour   INTEGER NOT NULL DEFAULT 100,
  max_requests_per_day    INTEGER NOT NULL DEFAULT 1000,

  -- Token limits
  max_tokens_per_day      INTEGER NOT NULL DEFAULT 500000,

  -- Cost limits (USD)
  max_cost_per_day_usd    NUMERIC(10,4) NOT NULL DEFAULT 10.0000,
  max_cost_per_month_usd  NUMERIC(10,4) NOT NULL DEFAULT 100.0000,

  -- Current counters
  current_requests_hour   INTEGER NOT NULL DEFAULT 0,
  current_requests_day    INTEGER NOT NULL DEFAULT 0,
  current_tokens_day      INTEGER NOT NULL DEFAULT 0,
  current_cost_day_usd    NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
  current_cost_month_usd  NUMERIC(10,4) NOT NULL DEFAULT 0.0000,

  -- Reset timestamps
  hour_reset_at           TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour',
  day_reset_at            TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 day',
  month_reset_at          TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',

  -- Quarantine
  quarantined             BOOLEAN NOT NULL DEFAULT false,
  quarantine_reason       TEXT,
  quarantined_at          TIMESTAMPTZ,

  -- Metadata
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_rate_limit_entity UNIQUE (entity_type, entity_id),
  CONSTRAINT valid_limits CHECK (
    max_requests_per_hour > 0
    AND max_requests_per_day > 0
    AND max_tokens_per_day > 0
    AND max_cost_per_day_usd > 0
    AND max_cost_per_month_usd > 0
  )
);

CREATE INDEX idx_concilium_rl_user_id     ON public.concilium_rate_limits(user_id);
CREATE INDEX idx_concilium_rl_entity      ON public.concilium_rate_limits(entity_type, entity_id);
CREATE INDEX idx_concilium_rl_quarantined ON public.concilium_rate_limits(quarantined) WHERE quarantined = true;

-- RLS
ALTER TABLE public.concilium_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own rate limits"
  ON public.concilium_rate_limits FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all rate limits"
  ON public.concilium_rate_limits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
