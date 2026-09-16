-- Add per-template block widths to dashboard layout templates. `widths` holds the
-- block ids rendered at half width (everything else is full width), so a saved
-- template can reproduce a side-by-side layout (e.g. Goals in Action | Activity).
-- Run in the Supabase SQL Editor. Additive + idempotent.

ALTER TABLE public.dashboard_layout_templates
  ADD COLUMN IF NOT EXISTS widths JSONB NOT NULL DEFAULT '[]'::jsonb;
