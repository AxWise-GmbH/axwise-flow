-- 207_arena_guide.sql — Arena Setup Guide: the roster, the stack, and the
-- developer-brief handoff.
--
-- The guide wires the whole contest for a non-technical owner: which software
-- the company runs (arena_stack), who the employees are (arena_people), and,
-- for tools we cannot connect by button, a tracked task carrying the
-- AI-written integration brief for the in-house developer (human_tasks grows a
-- type for that).

-- ── arena_people — the employees on the human side of every comparison ───────
CREATE TABLE IF NOT EXISTS public.arena_people (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',   -- src/config/departments.js role string
  email       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_arena_people_user
  ON public.arena_people (user_id, is_active);

-- ── arena_stack — the quiz's memory and the connect/brief pipeline's state ───
-- One row per tool the company says it uses. `key` is a catalog id
-- ('mcp-jira') or 'custom:<slug>' for tools we do not cover; status walks
--   selected -> connected                     (catalog tool, OAuth done)
--   selected -> gap -> brief_requested -> brief_ready -> handed_over
--                                             (uncovered tool, brief pipeline)
CREATE TABLE IF NOT EXISTS public.arena_stack (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,
  label          TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'catalog' CHECK (source IN ('catalog', 'custom')),
  department     TEXT,
  status         TEXT NOT NULL DEFAULT 'selected'
                 CHECK (status IN ('selected', 'connected', 'gap',
                                   'brief_requested', 'brief_ready', 'handed_over')),
  goal_id        UUID,           -- the pushed integration-brief goal
  human_task_id  UUID,           -- the tracked developer task
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_arena_stack_user
  ON public.arena_stack (user_id, status);

-- ── touch updated_at (reuses the trigger fn from migration 206) ──────────────
DROP TRIGGER IF EXISTS trg_arena_people_touch ON public.arena_people;
CREATE TRIGGER trg_arena_people_touch
  BEFORE UPDATE ON public.arena_people
  FOR EACH ROW EXECUTE FUNCTION public.arena_touch_updated_at();

DROP TRIGGER IF EXISTS trg_arena_stack_touch ON public.arena_stack;
CREATE TRIGGER trg_arena_stack_touch
  BEFORE UPDATE ON public.arena_stack
  FOR EACH ROW EXECUTE FUNCTION public.arena_touch_updated_at();

-- ── RLS — owner for all four verbs, plus service_role for the worker ─────────
ALTER TABLE public.arena_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_stack  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arena_people_own" ON public.arena_people;
CREATE POLICY "arena_people_own" ON public.arena_people
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "arena_people_service" ON public.arena_people;
CREATE POLICY "arena_people_service" ON public.arena_people
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "arena_stack_own" ON public.arena_stack;
CREATE POLICY "arena_stack_own" ON public.arena_stack
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "arena_stack_service" ON public.arena_stack;
CREATE POLICY "arena_stack_service" ON public.arena_stack
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── human_tasks: a task kind that carries a document, not a credential ───────
-- The inbox renders 'integration_brief' rows with the brief text, a copy
-- button and "Mark as done" — no API-key form. Verified: no migration after
-- 119 touches this constraint, and the only writer (h45) uses
-- 'provide_credential'.
ALTER TABLE public.human_tasks DROP CONSTRAINT IF EXISTS human_tasks_type_check;
ALTER TABLE public.human_tasks ADD CONSTRAINT human_tasks_type_check
  CHECK (type IN ('provide_credential', 'provide_key', 'manual_signup', 'integration_brief'));

COMMENT ON TABLE public.arena_people IS
  'Arena guide roster: the employees whose work the agents replicate and are compared against.';
COMMENT ON TABLE public.arena_stack IS
  'Arena guide stack: what the company works in, and how far each tool is wired (connected / brief pipeline).';
