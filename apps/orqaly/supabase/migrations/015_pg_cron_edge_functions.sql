-- Enable pg_cron extension (already available on Supabase, just needs activation)
create extension if not exists pg_cron;

-- Grant usage to postgres role
grant usage on schema cron to postgres;

-- Schedule: daily database backup at 03:00 UTC
-- Calls the Supabase Edge Function via pg_net (HTTP extension)
select cron.schedule(
  'daily-backup',
  '0 3 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/backup-database',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.backup_secret'),
      'x-pg-cron', 'true'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule: daily AI partner analysis at 05:00 UTC
select cron.schedule(
  'daily-ai-analysis',
  '0 5 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ai-analyze-partners',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.backup_secret'),
      'x-pg-cron', 'true'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- NOTE: After running this migration, you need to set app.settings in your Supabase project:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
--   ALTER DATABASE postgres SET app.settings.backup_secret = 'YOUR_BACKUP_SECRET_VALUE';
-- 
-- Alternative (simpler): Use the Supabase Dashboard > Database > Extensions > pg_cron
-- and set up the cron jobs via the UI with hardcoded URLs.
