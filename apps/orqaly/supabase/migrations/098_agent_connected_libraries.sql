-- 098_agent_connected_libraries.sql
-- Per-agent MCP/Composio library bindings with risk-tiered safety, per-action
-- enabled list, and weekly VirusTotal endpoint reputation cache.
--
-- See plan: /Users/work/.claude/plans/reactive-snacking-hellman.md
-- Companion catalog: src/config/mcpToolCatalog.js (riskTier / actionsSafe / actionsSensitive / endpointUrl)

CREATE TABLE IF NOT EXISTS agent_connected_libraries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id          TEXT NOT NULL,
  tool_id           TEXT NOT NULL,                                  -- catalog id e.g. 'mcp-github'
  composio_app      TEXT NOT NULL,                                  -- 'github', 'discord', etc.
  status            TEXT NOT NULL DEFAULT 'active'                  -- active | error | revoked | vt_warn
                    CHECK (status IN ('active', 'error', 'revoked', 'vt_warn')),
  enabled_actions   TEXT[] NOT NULL DEFAULT '{}',                   -- subset of actionsSafe ∪ opted-in actionsSensitive
  vt_last_scan      JSONB,                                          -- { scanned_at, verdict, harmless, malicious, suspicious, url }
  invocation_count  INTEGER NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_acl_user_agent
  ON agent_connected_libraries (user_id, agent_id);

CREATE INDEX IF NOT EXISTS idx_acl_endpoint
  ON agent_connected_libraries (tool_id);

-- Touch updated_at on UPDATE
CREATE OR REPLACE FUNCTION acl_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acl_touch_updated_at ON agent_connected_libraries;
CREATE TRIGGER trg_acl_touch_updated_at
  BEFORE UPDATE ON agent_connected_libraries
  FOR EACH ROW EXECUTE FUNCTION acl_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE agent_connected_libraries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acl_select" ON agent_connected_libraries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "acl_insert" ON agent_connected_libraries
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "acl_update" ON agent_connected_libraries
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "acl_delete" ON agent_connected_libraries
  FOR DELETE USING (user_id = auth.uid());
