-- 081_organizations.sql
-- Organization management — holding structures, subsidiaries, multi-company setups

CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  slug          TEXT NOT NULL,
  industry      TEXT,
  org_type      TEXT DEFAULT 'holding',   -- holding, subsidiary, division, department
  parent_id     UUID REFERENCES organizations(id) ON DELETE SET NULL,
  website       TEXT,
  consilium_id  TEXT,                     -- linked consilium board ID
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_user
  ON organizations (slug, user_id);

CREATE INDEX IF NOT EXISTS idx_organizations_user_id
  ON organizations (user_id);

CREATE INDEX IF NOT EXISTS idx_organizations_parent_id
  ON organizations (parent_id);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (user_id = auth.uid());
