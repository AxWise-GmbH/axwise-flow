-- ============================================================
-- 150_user_ui_mode_default_simple.sql
-- Card/block view is the default for regular users (simple mode).
-- NULL or unset ui_mode is treated as 'simple' in the app and API.
-- ============================================================

alter table if exists public.users
  alter column ui_mode set default 'simple';

comment on column public.users.ui_mode is
  'User UI mode: simple (card/block view, default) | advanced (table-heavy admin). NULL legacy rows treated as simple in API.';
