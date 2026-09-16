-- Unified AI Assistant setup state. One row per user. Replaces the two
-- localStorage flags the old dialogs used:
--   localStorage['orch_assistant_config'] (Dashboard: provider/model/key/tone/temperature)
--   localStorage['orch_assistant_active']  (Organizations: activation flag)
-- Read/written by lib/api-handlers/assistant-setup.js and surfaced in the
-- unified AssistantSetupChatDialog. Run in the Supabase SQL Editor.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.assistant_setup (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- LLM "brain" + tone (migrated off orch_assistant_config). Free-form so the
  -- conversational setup can extend it without a migration each time.
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Per-capability completion map, e.g. { "channel": true, "persona": true, ... }.
  steps       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Replaces orch_assistant_active.
  activated   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_setup ENABLE ROW LEVEL SECURITY;

-- User owns their single setup row.
DROP POLICY IF EXISTS assistant_setup_owner ON public.assistant_setup;
CREATE POLICY assistant_setup_owner ON public.assistant_setup
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Backend workers (service role) bypass RLS for maintenance / activation.
DROP POLICY IF EXISTS assistant_setup_service ON public.assistant_setup;
CREATE POLICY assistant_setup_service ON public.assistant_setup
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION public.touch_assistant_setup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assistant_setup_updated_at ON public.assistant_setup;
CREATE TRIGGER trg_assistant_setup_updated_at
  BEFORE UPDATE ON public.assistant_setup
  FOR EACH ROW EXECUTE FUNCTION public.touch_assistant_setup_updated_at();
