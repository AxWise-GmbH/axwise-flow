-- 085_marketplace_ratings.sql
-- Per-user ratings and comments for marketplace items (agents, skills, tools, teams, org templates)

CREATE TABLE IF NOT EXISTS marketplace_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,          -- template/tool/agent/team/org-template id
  item_type   TEXT NOT NULL,          -- 'agent', 'skill', 'tool', 'team', 'org_template'
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, item_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_ratings_user_id
  ON marketplace_ratings (user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_ratings_item
  ON marketplace_ratings (item_id, item_type);

ALTER TABLE marketplace_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplace_ratings_select" ON marketplace_ratings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "marketplace_ratings_insert" ON marketplace_ratings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "marketplace_ratings_update" ON marketplace_ratings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "marketplace_ratings_delete" ON marketplace_ratings
  FOR DELETE USING (user_id = auth.uid());
