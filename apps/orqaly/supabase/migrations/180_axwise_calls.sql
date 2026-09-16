-- 180_axwise_calls.sql
-- Per-call AxWise inspector log. One row per AxWise call capturing the
-- FULL request we sent, the FULL response we got, and how Orqaly applied it - so
-- the monitor can drill into "what I sent / to whom / what I got / where applied".
-- Kept separate from llm_usage (the spend ledger); correlated by trace_id.
-- Idempotent. RLS: owner reads their own rows; the backend writes via service role.

CREATE TABLE IF NOT EXISTS public.axwise_calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  user_id               uuid,
  org_id                text,
  trace_id              text,
  request_id            text,
  integration_point     text,
  destination_url       text,
  model                 text,
  status                text,
  applied_outcome       text,
  ax_decision           text,
  local_decision        text,
  degraded              boolean DEFAULT false,
  skipped               boolean DEFAULT false,
  duration_ms           integer DEFAULT 0,
  cost_usd              numeric DEFAULT 0,
  request_payload       jsonb   DEFAULT '{}'::jsonb,
  processed_outputs     jsonb,
  applicable_conditions jsonb
);

ALTER TABLE public.axwise_calls ENABLE ROW LEVEL SECURITY;

-- Owner can read their own calls (auth.uid() = user_id), same as llm_usage.
DROP POLICY IF EXISTS axwise_calls_select_own ON public.axwise_calls;
CREATE POLICY axwise_calls_select_own ON public.axwise_calls
  FOR SELECT USING (auth.uid() = user_id);

-- Backend workers (service role) insert/manage.
DROP POLICY IF EXISTS axwise_calls_service_all ON public.axwise_calls;
CREATE POLICY axwise_calls_service_all ON public.axwise_calls
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_axwise_calls_user_created ON public.axwise_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_axwise_calls_trace        ON public.axwise_calls (trace_id);
