-- 109: Osja feedback loop — per-agent regen policy + learning toggle
--
-- Closes the loop between Osja's quality verdict and agent behavior:
--   * osja_regen_threshold: auto-regenerate deliverables scoring below this
--   * osja_regen_max_attempts: how many times a single deliverable may be regenerated
--     (0 disables auto-regen entirely for this agent)
--   * osja_learning_enabled: whether to write 'osja_lesson' knowledge docs for
--     this agent so future goals benefit from Osja's critique
--
-- Deliverable-level state (previous_versions, regen_count) lives inside the
-- goals.data.deliverables JSONB array — no team_tasks schema change needed.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS osja_regen_threshold INT DEFAULT 70
    CHECK (osja_regen_threshold BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS osja_regen_max_attempts INT DEFAULT 1
    CHECK (osja_regen_max_attempts BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS osja_learning_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.agents.osja_regen_threshold IS
  'Osja score below which a deliverable is auto-regenerated (0-100, default 70).';
COMMENT ON COLUMN public.agents.osja_regen_max_attempts IS
  'Max auto-regen attempts per deliverable (0=disabled, default 1, hard cap 3).';
COMMENT ON COLUMN public.agents.osja_learning_enabled IS
  'When true, Osja upgrade verdicts are saved as osja_lesson docs for this agent.';
