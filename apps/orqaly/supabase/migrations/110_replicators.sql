-- 110: Replicator feature — auto-generated in-platform UI for any connected tool
--
-- A "replicator" wraps one row in the existing `tools` table and exposes its
-- endpoints as a set of phase cards inside the platform (sidebar nav + marketplace tab).
-- Blueprint = (replicators) -> (replicator_pages) -> (replicator_phases).
-- Execution history lives in replicator_runs and drives the activity sidebar + retry.

CREATE TABLE IF NOT EXISTS public.replicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_tool_id TEXT NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon_name TEXT,
  icon_url TEXT,
  integration_type TEXT NOT NULL
    CHECK (integration_type IN ('composio', 'api', 'mcp', 'webhook', 'sdk', 'internal')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'draft')),
  blueprint_version INT NOT NULL DEFAULT 1,
  docs_source JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS public.replicator_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  replicator_id UUID NOT NULL REFERENCES public.replicators(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (replicator_id, slug)
);

CREATE TABLE IF NOT EXISTS public.replicator_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.replicator_pages(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  action_kind TEXT NOT NULL
    CHECK (action_kind IN ('composio_action', 'http', 'mcp_tool', 'webhook', 'sdk')),
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_hint JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_role TEXT,
  timeout_ms INT NOT NULL DEFAULT 30000 CHECK (timeout_ms BETWEEN 1000 AND 600000),
  docs_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.replicator_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES public.replicator_phases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_json JSONB,
  output_json JSONB,
  status TEXT NOT NULL
    CHECK (status IN ('success', 'error', 'timeout', 'cancelled', 'pending')),
  error_class TEXT
    CHECK (error_class IS NULL OR error_class IN (
      'network_unreachable', 'tls_error', 'dns_error', 'timeout',
      'auth_error', 'rate_limited', 'server_error', 'client_error', 'invalid_response'
    )),
  error_message TEXT,
  http_status INT,
  latency_ms INT,
  duration_ms INT,
  request_url TEXT,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS replicators_user_status_idx
  ON public.replicators (user_id, status);
CREATE INDEX IF NOT EXISTS replicator_pages_replicator_position_idx
  ON public.replicator_pages (replicator_id, position);
CREATE INDEX IF NOT EXISTS replicator_phases_page_position_idx
  ON public.replicator_phases (page_id, position);
CREATE INDEX IF NOT EXISTS replicator_runs_phase_created_idx
  ON public.replicator_runs (phase_id, created_at DESC);
CREATE INDEX IF NOT EXISTS replicator_runs_user_created_idx
  ON public.replicator_runs (user_id, created_at DESC);

ALTER TABLE public.replicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replicator_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replicator_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replicator_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replicators: owner full access"
  ON public.replicators FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "replicator_pages: owner via join"
  ON public.replicator_pages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.replicators r
    WHERE r.id = replicator_pages.replicator_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.replicators r
    WHERE r.id = replicator_pages.replicator_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "replicator_phases: owner via join"
  ON public.replicator_phases FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.replicators r
    JOIN public.replicator_pages p ON p.replicator_id = r.id
    WHERE p.id = replicator_phases.page_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.replicators r
    JOIN public.replicator_pages p ON p.replicator_id = r.id
    WHERE p.id = replicator_phases.page_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "replicator_runs: owner read/write own"
  ON public.replicator_runs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.replicators IS
  'Replicator feature — auto-generated UI wrapper around one connected tool. Blueprint-driven renderer reads pages + phases at runtime.';
COMMENT ON COLUMN public.replicators.docs_source IS
  'Source docs metadata for stale-detection + inline docs panel: { type: openapi|postman|url|pdf, url, hash, fetched_at }.';
COMMENT ON COLUMN public.replicator_phases.action_kind IS
  'How this phase is executed. Dispatches to existing executors (composio, http fetch, mcp client, webhook-executor, sdk).';
COMMENT ON COLUMN public.replicator_runs.error_class IS
  'Coarse error taxonomy driving the phase card error surface UI.';
