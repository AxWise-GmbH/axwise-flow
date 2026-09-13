-- 172: Consilium topology graph (editable org-chart on a React Flow canvas).
--
-- Backs the "Graph" view on the Consilium Boards tab. Renders the org hierarchy
-- (Organization -> Consilium -> Team -> Agent) on a cloned workflow-style canvas
-- that the user can freely rearrange and edit (add/delete/connect nodes). The
-- diagram is seeded once from the user's existing rows (organizations, concilium,
-- concilium_teams, concilium_team_members, concilium_members) and then owned by
-- the user.
--
-- IMPORTANT: this is NOT a workflow. It intentionally lives in its own tables and
-- must never appear in the /workflow library (which reads only from `workflows`).
--
-- One diagram per user for v1 (scope = 'consilium'), with restorable version
-- snapshots and a per-action activity feed. Rows are user-scoped (RLS). Run in the
-- Supabase SQL Editor. Additive + idempotent.

-- ── Main diagram (one per user per scope for v1) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.consilium_topology (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Consilium topology',
  -- Room to add scopes later (per-org / per-board diagrams).
  scope           TEXT NOT NULL DEFAULT 'consilium' CHECK (scope IN ('consilium')),
  -- React Flow nodes/edges, positions baked in.
  nodes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges           JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enforces "one diagram per user" for v1.
  UNIQUE (user_id, scope)
);

ALTER TABLE public.consilium_topology ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consilium_topology_owner ON public.consilium_topology;
CREATE POLICY consilium_topology_owner ON public.consilium_topology
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS consilium_topology_service ON public.consilium_topology;
CREATE POLICY consilium_topology_service ON public.consilium_topology
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_consilium_topology_user
  ON public.consilium_topology(user_id);

-- ── Version snapshots (restorable, append-only) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.consilium_topology_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id  UUID NOT NULL REFERENCES public.consilium_topology(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  nodes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges       JSONB NOT NULL DEFAULT '[]'::jsonb,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (diagram_id, version)
);

ALTER TABLE public.consilium_topology_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consilium_topology_versions_owner ON public.consilium_topology_versions;
CREATE POLICY consilium_topology_versions_owner ON public.consilium_topology_versions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS consilium_topology_versions_service ON public.consilium_topology_versions;
CREATE POLICY consilium_topology_versions_service ON public.consilium_topology_versions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_ctv_diagram_version
  ON public.consilium_topology_versions(diagram_id, version DESC);

-- ── Per-action activity feed ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consilium_topology_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id  UUID NOT NULL REFERENCES public.consilium_topology(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'seed' | 'save' | 'restore' | 'node_add' | 'node_move' | 'node_delete'
  -- | 'edge_connect' | 'edge_disconnect' | 'reseed'
  action      TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consilium_topology_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consilium_topology_activity_owner ON public.consilium_topology_activity;
CREATE POLICY consilium_topology_activity_owner ON public.consilium_topology_activity
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS consilium_topology_activity_service ON public.consilium_topology_activity;
CREATE POLICY consilium_topology_activity_service ON public.consilium_topology_activity
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_cta_diagram_created
  ON public.consilium_topology_activity(diagram_id, created_at DESC);
