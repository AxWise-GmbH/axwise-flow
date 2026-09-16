-- Concilium agents: AI agent lifecycle management
-- Phase 4: Agent tracking, check-in intervals, performance counters

CREATE TABLE IF NOT EXISTS public.concilium_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id        TEXT REFERENCES public.concilium(id) ON DELETE SET NULL,

  -- Identity
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  agent_type      TEXT DEFAULT 'external'
    CHECK (agent_type IN ('external', 'internal', 'hybrid')),

  -- Status lifecycle
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'active', 'paused', 'terminated', 'expired')),

  -- Tracking
  tracking_token  TEXT UNIQUE,
  check_in_interval_ms INTEGER NOT NULL DEFAULT 300000, -- 5 minutes
  last_check_in   TIMESTAMPTZ,
  missed_check_ins INTEGER NOT NULL DEFAULT 0,
  max_missed_check_ins INTEGER NOT NULL DEFAULT 3,

  -- Performance
  total_requests      INTEGER NOT NULL DEFAULT 0,
  total_tokens_used   BIGINT NOT NULL DEFAULT 0,
  total_cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_evaluations   INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,

  -- Permissions
  allowed_actions     JSONB NOT NULL DEFAULT '[]',
  max_requests_per_hour INTEGER NOT NULL DEFAULT 60,
  max_cost_per_day_usd NUMERIC(10,4) NOT NULL DEFAULT 5.0000,

  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_at     TIMESTAMPTZ,
  paused_at       TIMESTAMPTZ,
  terminated_at   TIMESTAMPTZ,
  termination_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PostgreSQL index names share a schema-wide namespace. Use table-qualified
-- names so these do not collide with the indexes created for public.agents in
-- migration 026 during a fresh bootstrap.
CREATE INDEX IF NOT EXISTS idx_concilium_agents_user_id
  ON public.concilium_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_concilium_agents_board_id
  ON public.concilium_agents(board_id);
CREATE INDEX IF NOT EXISTS idx_concilium_agents_status
  ON public.concilium_agents(status);
CREATE INDEX IF NOT EXISTS idx_concilium_agents_token
  ON public.concilium_agents(tracking_token)
  WHERE tracking_token IS NOT NULL;

ALTER TABLE public.concilium_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agents"
  ON public.concilium_agents FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all agents"
  ON public.concilium_agents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
