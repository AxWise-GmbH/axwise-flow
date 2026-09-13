-- Switch all agent blueprints from any provider to GLM glm-5.1.
-- Also update the table defaults for new blueprints.

UPDATE public.agent_blueprints
SET provider = 'glm',
    model = 'glm-5.1',
    updated_at = now();

ALTER TABLE public.agent_blueprints
  ALTER COLUMN provider SET DEFAULT 'glm',
  ALTER COLUMN model SET DEFAULT 'glm-5.1';
