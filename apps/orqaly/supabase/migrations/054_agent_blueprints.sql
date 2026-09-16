-- Agent Blueprints: structured config for agent creation via Agent Factory.
-- Stores system prompt, model/provider, tools, constraints, and workflow link.

CREATE TABLE IF NOT EXISTS public.agent_blueprints (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  category text DEFAULT 'general',
  system_prompt text NOT NULL,
  provider text DEFAULT 'groq',
  model text DEFAULT 'llama-3.3-70b-versatile',
  temperature numeric DEFAULT 0.3,
  max_tokens integer DEFAULT 3000,
  tools jsonb DEFAULT '[]'::jsonb,
  constraints jsonb DEFAULT '{}'::jsonb,
  workflow_id uuid,
  is_template boolean DEFAULT false,
  version integer DEFAULT 1,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.agent_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own blueprints"
  ON public.agent_blueprints
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_agent_blueprints_user ON public.agent_blueprints (user_id);
CREATE INDEX idx_agent_blueprints_status ON public.agent_blueprints (status);
CREATE INDEX idx_agent_blueprints_category ON public.agent_blueprints (category);
CREATE INDEX idx_agent_blueprints_template ON public.agent_blueprints (is_template) WHERE is_template = true;
