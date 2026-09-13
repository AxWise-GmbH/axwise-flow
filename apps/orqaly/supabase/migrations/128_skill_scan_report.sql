-- ===========================================================================
-- 112_skill_scan_report.sql — Persisted prompt-injection safety scan
--
-- Every skill (bundled, user-created, Forge-generated) now carries a
-- scan_report JSONB showing whether it passed the Phase A validator.
-- Bundled + existing rows are backfilled as passed since they already
-- passed validateSkill at seed/create time.
-- ===========================================================================

ALTER TABLE agent_skill_packs
  ADD COLUMN IF NOT EXISTS scan_report jsonb;

-- Backfill every existing row as passed (validator_version v1).
UPDATE agent_skill_packs
SET scan_report = jsonb_build_object(
  'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'validator_version', 'v1',
  'passed', true,
  'rule', null,
  'excerpt', null
)
WHERE scan_report IS NULL;

-- Index for "show me only flagged" admin queries (rare, but cheap to have).
CREATE INDEX IF NOT EXISTS idx_agent_skill_packs_scan_flagged
  ON agent_skill_packs ((scan_report->>'passed'))
  WHERE (scan_report->>'passed') = 'false';

COMMENT ON COLUMN agent_skill_packs.scan_report IS
  'JSONB: { at: ISO, validator_version, passed: bool, rule: str|null, excerpt: str|null, forge?: { red_team_safe, red_team_total, behaviour_pass, behaviour_total } }. Populated on every create/update/seed/forge.';
