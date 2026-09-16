-- 086_org_assignments.sql
-- Org → Team and Org → Agent junction tables for the Organizations page

-- Teams assigned to an organization
CREATE TABLE IF NOT EXISTS org_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_org_teams_org_id    ON org_teams (org_id);
CREATE INDEX IF NOT EXISTS idx_org_teams_user_id   ON org_teams (user_id);

ALTER TABLE org_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_teams_select" ON org_teams FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "org_teams_insert" ON org_teams FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "org_teams_delete" ON org_teams FOR DELETE USING (user_id = auth.uid());

-- Agents assigned to an organization
CREATE TABLE IF NOT EXISTS org_agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_org_agents_org_id   ON org_agents (org_id);
CREATE INDEX IF NOT EXISTS idx_org_agents_user_id  ON org_agents (user_id);

ALTER TABLE org_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_agents_select" ON org_agents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "org_agents_insert" ON org_agents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "org_agents_delete" ON org_agents FOR DELETE USING (user_id = auth.uid());
