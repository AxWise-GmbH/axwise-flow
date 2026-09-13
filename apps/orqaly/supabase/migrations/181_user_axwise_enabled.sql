-- ============================================================
-- 181_user_axwise_enabled.sql - Per-user AxWise kill switch
--   Backs the Settings > AxWise "AxWise overlay" master toggle. When false,
--   the backend SKIPS all AxWise calls for this user's requests (exact
--   pre-integration behavior - no external call, no latency, no logging) and
--   every AxWise UI surface hides. The env AXWISE_ENABLE stays the hard global
--   gate; this per-account flag can only turn AxWise OFF, never force it on.
--   Extends public.users (same pattern as 149_user_ui_mode / 177_user_hidden_pages).
-- ============================================================

-- Default TRUE preserves current behavior for every existing user (AxWise stays
-- on until they explicitly turn it off). Read by lib/integrations/axwise/user-flag.js
-- and surfaced via /api/app?path=user-prefs.
alter table if exists public.users
  add column if not exists axwise_enabled boolean not null default true;

comment on column public.users.axwise_enabled is
  'Per-user AxWise kill switch. true (default) = AxWise active for this user; false = backend skips AxWise entirely (pre-integration behavior) and AxWise UI hides. The env AXWISE_ENABLE is the hard global gate on top of this.';
