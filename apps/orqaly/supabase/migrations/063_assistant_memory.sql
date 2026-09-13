-- Persistent assistant memory — stores user preferences, key facts, past decisions
-- Auto-extracted after conversations by LLM, injected into system prompt

CREATE TABLE IF NOT EXISTS public.assistant_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  source text DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_assistant_memory_user ON public.assistant_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_memory_category ON public.assistant_memory(user_id, category);

ALTER TABLE public.assistant_memory ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own memories
CREATE POLICY "Users read own assistant_memory"
  ON public.assistant_memory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own assistant_memory"
  ON public.assistant_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own assistant_memory"
  ON public.assistant_memory FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own assistant_memory"
  ON public.assistant_memory FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_assistant_memory_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assistant_memory_updated
  BEFORE UPDATE ON public.assistant_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_assistant_memory_timestamp();
