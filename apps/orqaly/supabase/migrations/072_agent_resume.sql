-- Add resume JSONB column to agents table
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS resume JSONB DEFAULT NULL;

COMMENT ON COLUMN public.agents.resume IS 'Structured agent resume: headline, summary, skills, experience, stats, certifications';
