-- ============================================================
-- 095_team_tasks_goal_id.sql — Direct goal_id column on team_tasks
-- Enables filtering/tracking tasks by goal without JSONB queries.
-- ============================================================

ALTER TABLE team_tasks ADD COLUMN IF NOT EXISTS goal_id UUID;
CREATE INDEX IF NOT EXISTS idx_team_tasks_goal_id ON team_tasks(goal_id);

-- Backfill existing tasks that have goal_id in data JSONB
UPDATE team_tasks
SET goal_id = (data->>'goal_id')::UUID
WHERE goal_id IS NULL
  AND data->>'goal_id' IS NOT NULL
  AND data->>'goal_id' != '';
