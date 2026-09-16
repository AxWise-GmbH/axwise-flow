-- 219: Promote Gemini 3.7 Flash to Orqaly's exact persisted default.
-- Existing model selections and historical telemetry remain unchanged.

BEGIN;

ALTER TABLE public.concilium_members
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.7-flash';

ALTER TABLE public.agent_blueprints
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.7-flash';

ALTER TABLE public.concilium_evaluations
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.7-flash';

ALTER TABLE public.llm_usage
  ALTER COLUMN provider SET DEFAULT 'gemini',
  ALTER COLUMN model SET DEFAULT 'gemini-3.7-flash';

COMMIT;
