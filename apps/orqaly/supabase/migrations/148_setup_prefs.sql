-- ============================================================
-- 148_setup_prefs.sql — Unified /setup onboarding page
--   Persists the two short-answer extras + a setup-completed flag.
--   Extends public.users (same pattern as 146_user_notification_prefs).
-- ============================================================

-- ── default_llm_preset ────────────────────────────────────────
-- One of: 'cheapest' | 'smartest' | 'fastest' (set on the Setup page).
-- Read by lib/agent-handlers/llm-executor.js when no explicit model
-- is requested. NULL = no preference; platform default is used.
alter table if exists public.users
  add column if not exists default_llm_preset text
    check (default_llm_preset in ('cheapest','smartest','fastest'));

-- ── workspace_logo_url ────────────────────────────────────────
-- Optional logo URL for the user's primary workspace. Populated
-- from the Setup page (section 2).
alter table if exists public.users
  add column if not exists workspace_logo_url text;

-- ── setup_completed_at ────────────────────────────────────────
-- Set when the user clicks "Finish" on /setup. Used to decide
-- whether to nudge them with a checklist or skip onboarding.
alter table if exists public.users
  add column if not exists setup_completed_at timestamptz;

comment on column public.users.default_llm_preset is
  'Setup page preset: cheapest|smartest|fastest. Read by llm-executor when no model is requested.';

comment on column public.users.workspace_logo_url is
  'Optional logo URL captured during /setup onboarding.';

comment on column public.users.setup_completed_at is
  'Timestamp when /setup was finished. NULL = onboarding still pending.';
