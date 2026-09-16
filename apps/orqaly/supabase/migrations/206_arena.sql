-- 206_arena.sql — Arena: people vs agents on the same daily job.
--
-- A job already exists as a team_tasks row carrying BOTH sides: `assigned_to`
-- (the person) and `agent_id` (the agent). What is missing is anywhere to put
-- what each side actually delivered, what it cost, and who won. That is these
-- four tables.
--
-- Business measures (cost_usd, minutes_spent, outcome) are real columns rather
-- than jsonb keys because every number on the Decide view sums or divides them.
-- `outcome` is deliberately separate from `rating`: a four-star result that
-- still had to go back for rework is the case that quietly costs money, and
-- stars alone hide it.

-- ── arena_submissions — one row per (task, side) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.arena_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id           TEXT NOT NULL,                       -- team_tasks.id (TEXT pk)
  side              TEXT NOT NULL CHECK (side IN ('people', 'agents')),

  -- who delivered it
  actor_kind        TEXT NOT NULL DEFAULT 'person' CHECK (actor_kind IN ('person', 'agent')),
  actor_name        TEXT NOT NULL DEFAULT '',
  actor_ref         TEXT,                                -- agents.id when actor_kind = 'agent'
  actor_role        TEXT,                                -- resolves the department + the rate

  -- what was delivered
  title             TEXT NOT NULL DEFAULT '',
  note              TEXT NOT NULL DEFAULT '',
  assets            JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ name, storage_path, mime, size, kind, url }]
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Phase 2: [{ source, ref, title, url, at, raw_status }]
  source            TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'connection', 'agent')),

  -- how the agent produced it. mirror = verbatim same task text; roadmap = its own approach.
  run               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { mode, provider, model, goal_id }

  -- quality
  rating            SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  rating_comment    TEXT,
  outcome           TEXT CHECK (outcome IS NULL OR outcome IN ('accepted', 'rework', 'rejected')),
  reworked_count    INTEGER NOT NULL DEFAULT 0,

  -- business measures
  cost_usd          NUMERIC(12, 4),   -- agents: rolled from llm_usage. people: rate x time.
  minutes_spent     INTEGER,          -- agents: measured. people: entered, or derived.
  minutes_derived   BOOLEAN NOT NULL DEFAULT false,  -- true = wall-clock guess, shown as such

  registered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, task_id, side)
);

CREATE INDEX IF NOT EXISTS idx_arena_submissions_task
  ON public.arena_submissions (user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_arena_submissions_recent
  ON public.arena_submissions (user_id, registered_at DESC);
-- The Exceptions list: accepted results that still needed rework.
CREATE INDEX IF NOT EXISTS idx_arena_submissions_rework
  ON public.arena_submissions (user_id, outcome)
  WHERE reworked_count > 0;

-- ── arena_verdicts — who won a job ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arena_verdicts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL,
  winner        TEXT NOT NULL CHECK (winner IN ('people', 'agents', 'tie')),
  reason        TEXT,
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_arena_verdicts_user
  ON public.arena_verdicts (user_id, decided_at DESC);

-- ── arena_department_config — the setup step, and the home of risk weight ────
-- `stakes` raises the bar before Arena will suggest a handover: a wrong contract
-- review and a wrong banner do not cost the same. `monthly_volume` is what makes
-- coverage honest — a 4-1 lead across 5 of 200 jobs is noise.
CREATE TABLE IF NOT EXISTS public.arena_department_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department      TEXT NOT NULL,                         -- src/config/departments.js id
  enabled         BOOLEAN NOT NULL DEFAULT true,
  stakes          TEXT NOT NULL DEFAULT 'medium' CHECK (stakes IN ('low', 'medium', 'high')),
  monthly_volume  INTEGER CHECK (monthly_volume IS NULL OR monthly_volume >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, department)
);

-- ── arena_rates — without this there is no money math at all ─────────────────
-- Nothing in the system knows what an employee costs, so this is manual input.
-- Resolution order is person, then role, then department, then none. A job with
-- no resolvable rate shows time but NO money, and is excluded from cost averages
-- rather than counted as zero — a fabricated saving is worse than no saving.
CREATE TABLE IF NOT EXISTS public.arena_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope           TEXT NOT NULL CHECK (scope IN ('person', 'role', 'department')),
  key             TEXT NOT NULL,                         -- 'Marta K.' | 'Lawyer' | 'legal'
  currency        TEXT NOT NULL DEFAULT 'EUR',
  hourly_rate     NUMERIC(12, 2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  per_job_cost    NUMERIC(12, 2) CHECK (per_job_cost IS NULL OR per_job_cost >= 0),
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT arena_rates_needs_a_number
    CHECK (hourly_rate IS NOT NULL OR per_job_cost IS NOT NULL),
  UNIQUE (user_id, scope, key, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_arena_rates_lookup
  ON public.arena_rates (user_id, scope, key, effective_from DESC);

-- ── touch updated_at ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.arena_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_arena_submissions_touch ON public.arena_submissions;
CREATE TRIGGER trg_arena_submissions_touch
  BEFORE UPDATE ON public.arena_submissions
  FOR EACH ROW EXECUTE FUNCTION public.arena_touch_updated_at();

DROP TRIGGER IF EXISTS trg_arena_verdicts_touch ON public.arena_verdicts;
CREATE TRIGGER trg_arena_verdicts_touch
  BEFORE UPDATE ON public.arena_verdicts
  FOR EACH ROW EXECUTE FUNCTION public.arena_touch_updated_at();

DROP TRIGGER IF EXISTS trg_arena_department_config_touch ON public.arena_department_config;
CREATE TRIGGER trg_arena_department_config_touch
  BEFORE UPDATE ON public.arena_department_config
  FOR EACH ROW EXECUTE FUNCTION public.arena_touch_updated_at();

DROP TRIGGER IF EXISTS trg_arena_rates_touch ON public.arena_rates;
CREATE TRIGGER trg_arena_rates_touch
  BEFORE UPDATE ON public.arena_rates
  FOR EACH ROW EXECUTE FUNCTION public.arena_touch_updated_at();

-- ── RLS — owner for all four verbs, plus service_role for the worker ─────────
ALTER TABLE public.arena_submissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_verdicts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_department_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_rates              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arena_submissions_own" ON public.arena_submissions;
CREATE POLICY "arena_submissions_own" ON public.arena_submissions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "arena_submissions_service" ON public.arena_submissions;
CREATE POLICY "arena_submissions_service" ON public.arena_submissions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "arena_verdicts_own" ON public.arena_verdicts;
CREATE POLICY "arena_verdicts_own" ON public.arena_verdicts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "arena_verdicts_service" ON public.arena_verdicts;
CREATE POLICY "arena_verdicts_service" ON public.arena_verdicts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "arena_department_config_own" ON public.arena_department_config;
CREATE POLICY "arena_department_config_own" ON public.arena_department_config
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "arena_department_config_service" ON public.arena_department_config;
CREATE POLICY "arena_department_config_service" ON public.arena_department_config
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "arena_rates_own" ON public.arena_rates;
CREATE POLICY "arena_rates_own" ON public.arena_rates
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "arena_rates_service" ON public.arena_rates;
CREATE POLICY "arena_rates_service" ON public.arena_rates
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Storage: registered result files ─────────────────────────────────────────
-- Create the bucket "arena-results" in Supabase Dashboard → Storage (private).
-- Objects are stored under <user_id>/<task_id>/<filename>, so the first path
-- segment is the owner check — same hardened pattern as migration 039.
DROP POLICY IF EXISTS "arena_results_insert" ON storage.objects;
CREATE POLICY "arena_results_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'arena-results'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "arena_results_select" ON storage.objects;
CREATE POLICY "arena_results_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'arena-results'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "arena_results_update" ON storage.objects;
CREATE POLICY "arena_results_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'arena-results'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "arena_results_delete" ON storage.objects;
CREATE POLICY "arena_results_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'arena-results'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON TABLE public.arena_submissions IS
  'What each side delivered for a job, with cost, time and outcome. One row per (task, side).';
COMMENT ON TABLE public.arena_rates IS
  'Manual cost inputs. No rate means Arena shows time but no money — never a fabricated zero.';
COMMENT ON COLUMN public.arena_submissions.minutes_derived IS
  'true when minutes_spent was inferred from assigned-to-registered wall-clock rather than entered.';
