-- ============================================================
-- 177_user_hidden_pages.sql - Persist the user's hidden sidebar pages
--   Backs the Settings > Pages control, which lets a user hide/show
--   individual sidebar pages in both advanced and simple mode.
--   Extends public.users (same pattern as 149_user_ui_mode).
-- ============================================================

-- ── hidden_pages ──────────────────────────────────────────────
-- JSON array of sidebar route strings the user has hidden, e.g.
-- ["/campaigns","/data"]. Read by the sidebar to filter its nav and
-- written by the Settings > Pages panel. Home (/home) is never stored
-- here (kept always-visible on the client). Default [] = nothing hidden.
alter table if exists public.users
  add column if not exists hidden_pages jsonb not null default '[]'::jsonb;

comment on column public.users.hidden_pages is
  'Sidebar page paths the user has hidden. JSON array of route strings, e.g. ["/campaigns","/data"]. Default [] = nothing hidden.';
