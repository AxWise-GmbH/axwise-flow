-- ============================================================
-- 149_user_ui_mode.sql - Persist the user's UI mode preference
--   Drives post-login routing and the TopBar/Settings mode toggle.
--   Extends public.users (same pattern as 148_setup_prefs).
-- ============================================================

-- ── ui_mode ───────────────────────────────────────────────────
-- One of: 'simple' | 'advanced'.
-- Read at login to pick the landing route (simple -> /dashboard,
-- advanced -> /agent-hub) and written by the TopBar / Settings
-- mode toggle. NULL = not yet set; treat as 'advanced' for
-- legacy users so behavior is unchanged until they opt in.
alter table if exists public.users
  add column if not exists ui_mode text
    check (ui_mode in ('simple','advanced'));

comment on column public.users.ui_mode is
  'User-chosen UI mode: simple|advanced. NULL = not set (treated as advanced). Drives post-login routing.';
