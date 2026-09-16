-- 084_webhook_vault_secret.sql
-- Store webhook secret in Supabase vault for agent_jobs trigger

-- Delete existing secret if any (idempotent)
DELETE FROM vault.secrets WHERE name = 'supabase_webhook_secret';

-- Create the secret
SELECT vault.create_secret(
  'whsec_orchestratori_eb74b5913425407b820f56f4e3906cca',
  'supabase_webhook_secret',
  'Webhook token for agent_jobs INSERT trigger'
);

-- Verify the trigger function exists and uses correct URL
CREATE OR REPLACE FUNCTION public.notify_agent_job_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  webhook_url text := 'https://orqaly.com/api/agent/webhook-process';
  webhook_secret text;
  payload jsonb;
BEGIN
  SELECT decrypted_secret INTO webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_webhook_secret'
    LIMIT 1;

  IF webhook_secret IS NULL THEN
    webhook_secret := '';
  END IF;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'agent_jobs',
    'schema', 'public',
    'record', row_to_json(NEW)::jsonb
  );

  PERFORM net.http_post(
    url := webhook_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-token', webhook_secret
    )
  );

  RETURN NEW;
END;
$$;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS agent_jobs_webhook_trigger ON public.agent_jobs;
CREATE TRIGGER agent_jobs_webhook_trigger
  AFTER INSERT ON public.agent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agent_job_webhook();
