-- 119_human_tasks.sql
-- User-first human fallback for credential provisioning.
--
-- When Sandris (Account Creation Specialist) cannot complete a signup, or is
-- missing from the user's roster, the self-healer's h45 strategy creates a
-- row here. The UI shows a claim button with a live countdown; if the user
-- claims it, they complete the signup manually via /api/human-task-complete.
-- If they ignore it past escalate_after_seconds, a cron worker may auto-escalate
-- to a paid human-in-the-loop service (Phase 7 — rentahuman.ai etc.).
--
-- For KYC / identity-sensitive tasks, escalation_allowed is set to false so the
-- task stays with the Orqaly account owner indefinitely.

CREATE TABLE IF NOT EXISTS public.human_tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id                 UUID,
  tool_id                 TEXT NOT NULL,
  provider_url            TEXT,
  type                    TEXT NOT NULL DEFAULT 'provide_credential'
                          CHECK (type IN ('provide_credential', 'provide_key', 'manual_signup')),
  reason                  TEXT,
  reason_code             TEXT,                                  -- machine-readable: sandris_missing | sandris_exhausted | phone_required | oauth_only | kyc_required | tos_disallows | manual
  instructions            TEXT,
  recommended_provider    TEXT,
  partial_context         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- { temp_email, steps_completed, last_error, screenshot_url? }
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'claimed', 'completed', 'cancelled', 'escalated')),
  escalation_allowed      BOOLEAN NOT NULL DEFAULT true,
  escalate_after_seconds  INTEGER DEFAULT 120,                   -- null = never auto-escalate
  claimed_at              TIMESTAMPTZ,
  escalated_at            TIMESTAMPTZ,
  escalation_result       JSONB,                                 -- set by Phase 7 worker
  completed_at            TIMESTAMPTZ,
  completed_by            TEXT CHECK (completed_by IN ('user', 'rentahuman', 'timeout', 'cancelled')),
  submitted_value         JSONB,                                 -- redacted: { key_last4 } not the raw key
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_human_tasks_user_status
  ON public.human_tasks (user_id, status);

-- Partial index for the timeout worker: only rows that might need escalation
CREATE INDEX IF NOT EXISTS idx_human_tasks_escalation_watch
  ON public.human_tasks (created_at, escalate_after_seconds)
  WHERE status = 'pending'
    AND escalation_allowed = true
    AND claimed_at IS NULL
    AND escalated_at IS NULL;

-- Touch updated_at on UPDATE
CREATE OR REPLACE FUNCTION human_tasks_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_human_tasks_touch_updated_at ON public.human_tasks;
CREATE TRIGGER trg_human_tasks_touch_updated_at
  BEFORE UPDATE ON public.human_tasks
  FOR EACH ROW EXECUTE FUNCTION human_tasks_touch_updated_at();

-- RLS: users read + update their own rows; service role handles all writes via h45 / complete endpoint.
ALTER TABLE public.human_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "human_tasks_select_own" ON public.human_tasks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "human_tasks_update_own" ON public.human_tasks
  FOR UPDATE USING (user_id = auth.uid());
