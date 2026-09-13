-- 080_agent_skills.sql
-- Skill packs marketplace + per-agent installed skills

-- ── Skill Packs (library of reusable skill templates) ───────────────────────
CREATE TABLE IF NOT EXISTS agent_skill_packs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  tags          TEXT[] DEFAULT '{}',
  author        TEXT DEFAULT 'Orqaly',
  version       TEXT DEFAULT '1.0',
  compatible_roles TEXT[] DEFAULT '{all}',
  content       TEXT NOT NULL,
  icon          TEXT DEFAULT 'extension',
  is_bundled    BOOLEAN DEFAULT false,
  is_public     BOOLEAN DEFAULT true,
  install_count INTEGER DEFAULT 0,
  rating_avg    NUMERIC(3,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Unique on slug scoped to user (NULL user_id = bundled)
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_packs_slug_user
  ON agent_skill_packs (slug, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'));

-- ── Installed Skills (per-agent skill bindings) ─────────────────────────────
CREATE TABLE IF NOT EXISTS agent_installed_skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL,
  skill_id      UUID NOT NULL REFERENCES agent_skill_packs(id) ON DELETE CASCADE,
  custom_content TEXT,
  is_active     BOOLEAN DEFAULT true,
  installed_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_installed_skills_user_agent
  ON agent_installed_skills (user_id, agent_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE agent_skill_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_installed_skills ENABLE ROW LEVEL SECURITY;

-- Skill packs: readable if bundled, public, or owned by current user
CREATE POLICY "skill_packs_select" ON agent_skill_packs
  FOR SELECT USING (
    is_bundled = true
    OR is_public = true
    OR user_id = auth.uid()
  );

-- Skill packs: insert/update/delete only own rows
CREATE POLICY "skill_packs_insert" ON agent_skill_packs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "skill_packs_update" ON agent_skill_packs
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "skill_packs_delete" ON agent_skill_packs
  FOR DELETE USING (user_id = auth.uid());

-- Installed skills: all ops scoped to own rows
CREATE POLICY "installed_skills_select" ON agent_installed_skills
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "installed_skills_insert" ON agent_installed_skills
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "installed_skills_update" ON agent_installed_skills
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "installed_skills_delete" ON agent_installed_skills
  FOR DELETE USING (user_id = auth.uid());
