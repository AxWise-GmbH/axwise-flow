-- Company brief ("semantic mapping" quiz) — the discovery Q&A the assistant runs
-- to learn a company's situation, strengths, weak spots and priorities before
-- making decisions. One brief per user; many answers. Read/written by
-- lib/api-handlers/company-brief.js and consumed by assistant-first-steps.js.
-- Run in the Supabase SQL Editor. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.company_brief (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID,
  status      TEXT NOT NULL DEFAULT 'in_progress',
  summary     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_brief_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id    UUID NOT NULL REFERENCES public.company_brief(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_brief_answers_brief ON public.company_brief_answers(brief_id);
CREATE INDEX IF NOT EXISTS idx_company_brief_answers_user  ON public.company_brief_answers(user_id);

ALTER TABLE public.company_brief         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_brief_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_brief_owner ON public.company_brief;
CREATE POLICY company_brief_owner ON public.company_brief
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS company_brief_service ON public.company_brief;
CREATE POLICY company_brief_service ON public.company_brief
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS company_brief_answers_owner ON public.company_brief_answers;
CREATE POLICY company_brief_answers_owner ON public.company_brief_answers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS company_brief_answers_service ON public.company_brief_answers;
CREATE POLICY company_brief_answers_service ON public.company_brief_answers
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_company_brief_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_brief_updated_at ON public.company_brief;
CREATE TRIGGER trg_company_brief_updated_at
  BEFORE UPDATE ON public.company_brief
  FOR EACH ROW EXECUTE FUNCTION public.touch_company_brief_updated_at();
