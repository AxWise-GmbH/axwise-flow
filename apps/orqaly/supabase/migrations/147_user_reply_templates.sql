-- ============================================================
-- 147_user_reply_templates.sql — Communicator Phase 5e
--   Adds reply_templates jsonb on users so users can configure
--   which inline buttons attach to each bot message type.
-- ============================================================

alter table if exists public.users
  add column if not exists reply_templates jsonb not null default '{}'::jsonb;

comment on column public.users.reply_templates is
  'Per-message-type inline-button config. Shape: { goal_created: ["view","cancel"], push_goal_done: ["view","snooze_1h","dismiss"], ... }. Empty = use code defaults from formatForMessenger / callback-dispatcher.';
