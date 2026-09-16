-- ============================================================
-- 026_agent_platform.sql
-- Agent Marketplace Foundation
--
-- NOTE: You requested this as "003_agent_platform" but
-- 003_user_ownership.sql already exists.  Using 026 keeps the
-- sequential order (last migration: 025_workflows_visible_to_all).
-- Supabase CLI runs migrations lexicographically; inserting a new
-- 003_ file would break the existing chain.
--
-- Creates: agents, tasks, payouts, feature_flags, notification_log
-- Skips:   audit_log  — already exists (005 + extended in 021)
--
-- Safe to re-run: every statement uses IF NOT EXISTS / idempotent.
-- Does NOT drop or alter any existing table.
-- ============================================================

-- Extension (idempotent — already enabled in 001 and 013)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- 1. agents
--    Marketplace-facing agent registry.
--    Distinct from:
--      agent_hub_agents  — Agent Hub internal registry (019)
--      system_agents     — Permissions/Agents tab (021)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agents (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text          NOT NULL,
  description   text,
  category      text,
  status        text          NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'suspended', 'pending_review')),
  pricing_model text          NOT NULL DEFAULT 'per_task'
                CHECK (pricing_model IN ('per_task', 'subscription', 'usage')),
  cost_per_task numeric(10,4) NOT NULL DEFAULT 0 CHECK (cost_per_task >= 0),
  capabilities  jsonb         NOT NULL DEFAULT '[]',
  metadata      jsonb         NOT NULL DEFAULT '{}',
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.agents               IS 'Marketplace agent registry (owner-scoped)';
COMMENT ON COLUMN public.agents.status        IS 'active | inactive | suspended | pending_review';
COMMENT ON COLUMN public.agents.pricing_model IS 'per_task | subscription | usage';

CREATE INDEX IF NOT EXISTS idx_agents_user_id   ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status    ON public.agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_category  ON public.agents(category);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON public.agents(created_at DESC);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agents"
  ON public.agents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. tasks
--    Marketplace-level task tracking.
--    Distinct from:
--      agent_hub_tasks — Hub project orchestration (019)
--      agent_jobs      — Async worker queue (017)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id       uuid        REFERENCES public.agents(id) ON DELETE SET NULL,
  title          text        NOT NULL,
  description    text,
  status         text        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  priority       text        NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  input_payload  jsonb       NOT NULL DEFAULT '{}',
  output_payload jsonb,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tasks          IS 'Marketplace task assignments (owner-scoped)';
COMMENT ON COLUMN public.tasks.status   IS 'pending | in_progress | completed | failed | cancelled';
COMMENT ON COLUMN public.tasks.priority IS 'low | medium | high | urgent';

CREATE INDEX IF NOT EXISTS idx_tasks_user_id    ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id   ON public.tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority   ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tasks"
  ON public.tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. payouts
--    Revenue split: agent 85 %, platform 15 %.
--    agent_share and platform_share are GENERATED ALWAYS AS
--    (stored computed columns — Postgres 12+).
--    Writes come from the service role (bypasses RLS).
--    Users can SELECT their own rows only.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payouts (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id           uuid          REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id            uuid          REFERENCES public.tasks(id)  ON DELETE SET NULL,
  gross_amount       numeric(12,4) NOT NULL CHECK (gross_amount >= 0),
  -- 85 / 15 split — auto-calculated, never writable directly
  agent_share        numeric(12,4) GENERATED ALWAYS AS (ROUND(gross_amount * 0.85, 4)) STORED,
  platform_share     numeric(12,4) GENERATED ALWAYS AS (ROUND(gross_amount * 0.15, 4)) STORED,
  currency           text          NOT NULL DEFAULT 'USD',
  status             text          NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
  stripe_transfer_id text,
  paid_at            timestamptz,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.payouts                IS 'Agent marketplace revenue splits (85/15)';
COMMENT ON COLUMN public.payouts.gross_amount   IS 'Total revenue for this task';
COMMENT ON COLUMN public.payouts.agent_share    IS 'GENERATED: gross_amount × 0.85 — agent receives 85 %';
COMMENT ON COLUMN public.payouts.platform_share IS 'GENERATED: gross_amount × 0.15 — platform keeps 15 %';
COMMENT ON COLUMN public.payouts.status         IS 'pending | processing | paid | failed | refunded';

CREATE INDEX IF NOT EXISTS idx_payouts_user_id   ON public.payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_agent_id  ON public.payouts(agent_id);
CREATE INDEX IF NOT EXISTS idx_payouts_task_id   ON public.payouts(task_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status    ON public.payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_paid_at   ON public.payouts(paid_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_payouts_created_at ON public.payouts(created_at DESC);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Users read their own payout rows; service role handles all writes
CREATE POLICY "Users read own payouts"
  ON public.payouts FOR SELECT
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4. feature_flags
--    Platform-wide feature toggles with optional rollout %.
--    Writes are admin-only (service role bypasses RLS).
--    All authenticated users can read (needed client-side).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,
  label       text,
  description text,
  enabled     boolean     NOT NULL DEFAULT false,
  -- 0 = no users, 100 = all users, values in between = gradual rollout
  rollout_pct integer     NOT NULL DEFAULT 100
              CHECK (rollout_pct BETWEEN 0 AND 100),
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.feature_flags             IS 'Platform-wide feature toggles';
COMMENT ON COLUMN public.feature_flags.key         IS 'Unique flag identifier (e.g. "agent_marketplace_v2")';
COMMENT ON COLUMN public.feature_flags.rollout_pct IS '0–100: percentage of users who see this feature';

CREATE INDEX IF NOT EXISTS idx_feature_flags_key     ON public.feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON public.feature_flags(enabled);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- All authenticated users read (needed to gate features client-side)
CREATE POLICY "Authenticated users read feature_flags"
  ON public.feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');

-- Writes come exclusively from service role (admin tooling / migrations)

-- ─────────────────────────────────────────────────────────────
-- 5. notification_log
--    Outbound notification delivery log.
--    Distinct from:
--      notifications (AI alert center — 008)
--    Writes via service role; users read their own rows.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  channel     text        NOT NULL
              CHECK (channel IN ('email', 'push', 'in_app', 'webhook', 'sms')),
  event_type  text        NOT NULL,
  recipient   text,
  subject     text,
  body        text,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  error       text,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.notification_log         IS 'Outbound notification delivery log (email, push, etc.)';
COMMENT ON COLUMN public.notification_log.channel IS 'email | push | in_app | webhook | sms';
COMMENT ON COLUMN public.notification_log.status  IS 'pending | sent | failed | bounced';

CREATE INDEX IF NOT EXISTS idx_notification_log_user_id    ON public.notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_status     ON public.notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_channel    ON public.notification_log(channel);
CREATE INDEX IF NOT EXISTS idx_notification_log_event_type ON public.notification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON public.notification_log(created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Users read their own delivery history; service role handles inserts
CREATE POLICY "Users read own notification_log"
  ON public.notification_log FOR SELECT
  USING (auth.uid() = user_id);
