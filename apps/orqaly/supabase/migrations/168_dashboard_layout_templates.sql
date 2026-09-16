-- Dashboard layout templates — named, per-user snapshots of which dashboard
-- blocks are shown/hidden and in what order. Built-in presets (e.g. "Beginner")
-- live in code; these rows are the user's own "Custom" templates. Read/written
-- by lib/api-handlers/dashboard-templates.js, consumed by the Home filter
-- dialog. `surface` future-proofs the table for other block-based screens.
-- Run in the Supabase SQL Editor. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.dashboard_layout_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface     TEXT NOT NULL DEFAULT 'home',
  name        TEXT NOT NULL,
  hidden      JSONB NOT NULL DEFAULT '[]'::jsonb,
  block_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, surface, name)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layout_templates_user
  ON public.dashboard_layout_templates(user_id, surface);

ALTER TABLE public.dashboard_layout_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_layout_templates_owner ON public.dashboard_layout_templates;
CREATE POLICY dashboard_layout_templates_owner ON public.dashboard_layout_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS dashboard_layout_templates_service ON public.dashboard_layout_templates;
CREATE POLICY dashboard_layout_templates_service ON public.dashboard_layout_templates
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_dashboard_layout_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dashboard_layout_templates_updated_at ON public.dashboard_layout_templates;
CREATE TRIGGER trg_dashboard_layout_templates_updated_at
  BEFORE UPDATE ON public.dashboard_layout_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_dashboard_layout_templates_updated_at();
