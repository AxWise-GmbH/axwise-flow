-- 155: Goal-scoped LLM usage metadata for token reporting

ALTER TABLE public.llm_usage
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;

ALTER TABLE public.llm_usage
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_llm_usage_goal_id ON public.llm_usage(goal_id);

CREATE INDEX IF NOT EXISTS idx_llm_usage_metadata_goal
  ON public.llm_usage((metadata->>'goal_id'));
