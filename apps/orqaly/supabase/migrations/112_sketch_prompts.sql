-- ============================================================
-- 112_sketch_prompts.sql
-- PromptLab "Sketch" tab: user-imported prompts that augment
-- an agent's runtime prompt via execute-task injection.
--
-- Storage for prompts imported from files (v1), later from API,
-- MCP, or paste. When applied to an agent, execute-task.js calls
-- loadSketchPromptsForAgent() and splices the content into the
-- agent's composed prompt — mirroring the osja_lesson pattern.
--
-- NOTE: agent_id is UUID with no FK constraint because agents
-- may live in either public.agents (marketplace) or
-- public.concilium_agents (factory). Application layer enforces
-- consistency. RLS + user_id is the real security boundary.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.sketch_prompts (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id     uuid,                                -- nullable = draft, not yet applied
  name         text         NOT NULL,
  description  text,
  content      text         NOT NULL,              -- prompt body (markdown or plain)
  source_type  text         NOT NULL DEFAULT 'file'
               CHECK (source_type IN ('file', 'api', 'mcp', 'paste')),
  source_meta  jsonb        NOT NULL DEFAULT '{}'::jsonb,
  tags         text[]       NOT NULL DEFAULT '{}',
  status       text         NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'applied', 'archived')),
  applied_at   timestamptz,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.sketch_prompts              IS 'PromptLab Sketch: user-imported prompts applied to agents via runtime injection.';
COMMENT ON COLUMN public.sketch_prompts.agent_id     IS 'Target agent UUID. No FK — may reference agents or concilium_agents.';
COMMENT ON COLUMN public.sketch_prompts.source_type  IS 'file | api | mcp | paste';
COMMENT ON COLUMN public.sketch_prompts.status       IS 'draft | applied | archived';
COMMENT ON COLUMN public.sketch_prompts.source_meta  IS 'e.g. {filename, mime, size, frontmatter}';

CREATE INDEX IF NOT EXISTS idx_sketch_prompts_user   ON public.sketch_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_sketch_prompts_agent  ON public.sketch_prompts(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sketch_prompts_status ON public.sketch_prompts(status);

ALTER TABLE public.sketch_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sketch_prompts_owner_all" ON public.sketch_prompts;
CREATE POLICY "sketch_prompts_owner_all"
  ON public.sketch_prompts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger (mirrors convention used elsewhere in the schema)
CREATE OR REPLACE FUNCTION public.sketch_prompts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sketch_prompts_updated_at ON public.sketch_prompts;
CREATE TRIGGER trg_sketch_prompts_updated_at
  BEFORE UPDATE ON public.sketch_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.sketch_prompts_set_updated_at();
