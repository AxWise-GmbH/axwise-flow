-- 208_arena_guide_custom.sql — the guide learns the company's own words.
--
-- Departments are no longer only the six built-ins: a company can add its own
-- team with a label and a one-line description of what it does. People gain a
-- free-text "what do they do" so a role that is not in our list still reads
-- clearly, and the agent counterpart knows what to replicate.

ALTER TABLE public.arena_department_config
  ADD COLUMN IF NOT EXISTS label       TEXT,   -- custom departments only ('custom:<slug>' ids)
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.arena_people
  ADD COLUMN IF NOT EXISTS description TEXT;   -- "what do they do", in the owner's words

COMMENT ON COLUMN public.arena_department_config.label IS
  'Display name for a custom department (id starts with custom:). Built-ins resolve their label in code.';
COMMENT ON COLUMN public.arena_people.description IS
  'Plain-language description of the work this person does; shown on the roster and used to brief the agent counterpart.';
