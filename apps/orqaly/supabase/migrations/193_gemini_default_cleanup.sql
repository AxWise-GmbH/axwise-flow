-- 193: Make Gemini 3.6 Flash the effective default across persisted LLM config.
--
-- Configuration backfills deliberately require the complete historical
-- provider/model pair. A row with either a different provider or a different
-- model is an explicit/custom selection and must not be rewritten.

BEGIN;

ALTER TABLE public.concilium_members
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.6-flash';

UPDATE public.concilium_members
SET provider = 'gemini',
    model = 'gemini-3.6-flash',
    updated_at = now()
WHERE provider = 'groq'
  AND model = 'llama-3.3-70b-versatile';

ALTER TABLE public.agent_blueprints
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.6-flash';

UPDATE public.agent_blueprints
SET provider = 'gemini',
    model = 'gemini-3.6-flash',
    updated_at = now()
WHERE provider = 'glm'
  AND model = 'glm-5.1';

-- These tables record the provider/model that actually ran. Change only their
-- insert defaults; historical telemetry must remain historically accurate.
ALTER TABLE public.concilium_evaluations
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.6-flash';

ALTER TABLE public.llm_usage
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.6-flash';

COMMIT;
