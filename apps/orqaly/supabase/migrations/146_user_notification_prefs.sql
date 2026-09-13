-- ============================================================
-- 146_user_notification_prefs.sql — Communicator Phase 3
--   Per-user notification preferences + daily LLM spend cap.
--   Defaults are intentionally permissive (fail-open) so a new
--   user starts receiving useful events without configuration.
-- ============================================================

-- ── notification_prefs jsonb ──────────────────────────────────────────────
-- Shape (all optional, default = enabled):
--   {
--     "goal.completed":     true,
--     "goal.failed":        true,
--     "goal.self_heal":     true,
--     "goal.awaiting_user": true,
--     "daily.digest":       false,    // off by default; opt-in via UI
--     "stranger.threshold": true      // admins only
--   }
-- Setting any key to `false` disables that event for this user.
-- Setting any key to `true` (or omitting it) enables the event.
alter table if exists public.users
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

create index if not exists idx_users_notification_prefs
  on public.users using gin (notification_prefs);

-- ── daily_llm_cap_usd ──────────────────────────────────────────────────────
-- Per-user spend cap for the assistant bridge. Defaults to NULL → bridge
-- uses its hard-coded $5/day default. Set higher (or NULL) to relax.
alter table if exists public.users
  add column if not exists daily_llm_cap_usd numeric;

comment on column public.users.notification_prefs is
  'Per-user proactive-push preferences. Keys like "goal.completed" map to booleans. Missing key = enabled. Used by lib/utils/notify-user.js.';

comment on column public.users.daily_llm_cap_usd is
  'Optional per-user daily LLM spend cap (USD) enforced by lib/communicator-handlers/assistant-bridge.js. NULL = use platform default ($5).';
