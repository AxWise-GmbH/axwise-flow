-- Webhook trigger: fire HTTP POST to /api/agent/webhook-process on every agent_jobs INSERT.
-- Uses pg_net extension (already enabled) to make async HTTP calls from PostgreSQL.
-- The webhook secret is stored in vault for security.

-- Store the webhook secret in vault (run separately via Management API):
-- SELECT vault.create_secret('<secret>', 'supabase_webhook_secret', 'Token for agent_jobs webhook');

-- Create the trigger function
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
  -- Read secret from vault; fall back to empty string if not found
  SELECT decrypted_secret INTO webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_webhook_secret'
    LIMIT 1;

  IF webhook_secret IS NULL THEN
    webhook_secret := '';
  END IF;

  -- Build the webhook payload (matches Supabase webhook format)
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'agent_jobs',
    'schema', 'public',
    'record', row_to_json(NEW)::jsonb
  );

  -- Fire async HTTP POST via pg_net with token auth
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

-- Create the trigger (AFTER INSERT, fires for each row)
DROP TRIGGER IF EXISTS agent_jobs_webhook_trigger ON public.agent_jobs;
CREATE TRIGGER agent_jobs_webhook_trigger
  AFTER INSERT ON public.agent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agent_job_webhook();
