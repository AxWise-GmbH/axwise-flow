-- 170: Multiple AI assistants per user, each scoped to an organization.
--
-- Supersedes the single-row assistant_setup model (161): a user can now run
-- several assistants - typically one per organization / business - and switch
-- between them. Exactly one assistant is "current" at a time (the one the
-- Assistant page and wizard act on).
--
-- assistant_setup is kept intact for backward-compatible reads during the
-- transition; this migration seeds `assistants` from any existing rows.
-- Run in the Supabase SQL Editor. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.assistants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The organization (business) this assistant belongs to. Optional so an
  -- assistant can exist before an org is chosen.
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  name            TEXT NOT NULL DEFAULT 'My Assistant',
  -- LLM "brain" + tone. Free-form so the conversational setup can extend it.
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Per-capability completion map, e.g. { "channel": true, "keys": true, ... }.
  steps           JSONB NOT NULL DEFAULT '{}'::jsonb,
  activated       BOOLEAN NOT NULL DEFAULT false,
  -- Exactly one current assistant per user (enforced by the partial unique
  -- index below). The backend unsets the others before setting a new current.
  is_current      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistants_owner ON public.assistants;
CREATE POLICY assistants_owner ON public.assistants
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS assistants_service ON public.assistants;
CREATE POLICY assistants_service ON public.assistants
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_assistants_user_id ON public.assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_assistants_organization_id ON public.assistants(organization_id);

-- At most one current assistant per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistants_one_current
  ON public.assistants(user_id) WHERE is_current;

-- Keep updated_at fresh on every write (reuse the touch pattern from 161).
CREATE OR REPLACE FUNCTION public.touch_assistants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assistants_updated_at ON public.assistants;
CREATE TRIGGER trg_assistants_updated_at
  BEFORE UPDATE ON public.assistants
  FOR EACH ROW EXECUTE FUNCTION public.touch_assistants_updated_at();

-- Seed `assistants` from the legacy singleton rows, once. Each migrated row
-- becomes that user's current assistant. Skips users who already have rows.
INSERT INTO public.assistants (user_id, name, config, steps, activated, is_current, created_at, updated_at)
SELECT s.user_id, 'My Assistant', s.config, s.steps, s.activated, true, s.created_at, s.updated_at
FROM public.assistant_setup s
WHERE NOT EXISTS (
  SELECT 1 FROM public.assistants a WHERE a.user_id = s.user_id
);
