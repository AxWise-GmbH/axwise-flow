-- Landing pages: stores agent-generated and user-edited landing page data.
-- GrapesJS editor state (components/styles JSON) + rendered HTML + deploy info.

CREATE TABLE public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Page',

  -- GrapesJS editor state (for re-editing)
  gjs_components JSONB,
  gjs_styles JSONB,
  gjs_assets JSONB,

  -- Rendered output
  html TEXT,

  -- Deployment
  cloudflare_project TEXT,
  deployment_url TEXT,
  deployed_at TIMESTAMPTZ,

  -- Meta
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'deployed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pages"
  ON public.landing_pages FOR ALL
  USING (auth.uid() = user_id);

-- Index for goal lookups
CREATE INDEX idx_landing_pages_goal ON public.landing_pages (goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX idx_landing_pages_user ON public.landing_pages (user_id);

-- Updated-at trigger (reuse existing function if available)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
