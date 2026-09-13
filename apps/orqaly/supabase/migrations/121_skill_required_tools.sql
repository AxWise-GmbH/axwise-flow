-- 121_skill_required_tools.sql
-- M3 Dynamic Toolkit — let skill packs declare which tools they require.
-- Combined with installed-skill lookups, this replaces the hardcoded role→tools
-- map in _predefined-agent-tools.js as the primary source for an agent's
-- toolkit. The predefined map stays on as a fallback when all four dynamic
-- sources (agent metadata, skill-declared, deliverable-declared, user BYOK)
-- are empty.
--
-- Column is nullable + defaults to an empty array so existing rows behave as
-- before (skill contributes zero tools) and downstream resolvers never crash
-- on a null.

ALTER TABLE public.agent_skill_packs
  ADD COLUMN IF NOT EXISTS required_tools text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.agent_skill_packs.required_tools IS
  'Tool IDs (tool-*/mcp-*) this skill expects to have available during execution. Unioned by toolkit-resolver.';
