-- 067: Agent Ratings
-- Allows users to rate agents (individual or team) after completed work

CREATE TABLE IF NOT EXISTS agent_ratings (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id    text NOT NULL,
  team_id     text,
  rating      smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     text,
  request_id  text,
  rating_type text NOT NULL DEFAULT 'individual' CHECK (rating_type IN ('individual', 'team')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_ratings_agent_id ON agent_ratings(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_user_id  ON agent_ratings(user_id);

ALTER TABLE agent_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ratings"
  ON agent_ratings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ratings"
  ON agent_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ratings"
  ON agent_ratings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ratings"
  ON agent_ratings FOR DELETE
  USING (auth.uid() = user_id);
