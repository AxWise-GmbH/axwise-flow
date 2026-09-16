-- Agent Tool Whitelist: formal registry of approved tools with risk levels.
-- Agents can only use tools that appear in this whitelist for their owner.

CREATE TABLE IF NOT EXISTS public.agent_tool_whitelist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  tool_id text NOT NULL,
  tool_name text NOT NULL,
  description text DEFAULT '',
  risk_level text DEFAULT 'low',
  requires_approval boolean DEFAULT false,
  category text DEFAULT 'general',
  endpoint_path text DEFAULT '',
  allowed_operations jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.agent_tool_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tool whitelist"
  ON public.agent_tool_whitelist
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_agent_tool_whitelist_user ON public.agent_tool_whitelist (user_id);
CREATE INDEX idx_agent_tool_whitelist_tool ON public.agent_tool_whitelist (tool_id);
CREATE UNIQUE INDEX idx_agent_tool_whitelist_unique ON public.agent_tool_whitelist (user_id, tool_id);
