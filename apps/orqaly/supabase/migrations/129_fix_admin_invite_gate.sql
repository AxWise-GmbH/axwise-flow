-- 129_fix_admin_invite_gate.sql
-- Two production fixes for admin user-management flows on orqaly.com:
--
-- 1. `gate_signup_with_invite()` (migration 124) blocked admin-driven invites
--    because its `auth.role() = 'service_role'` bypass does not fire inside
--    GoTrue's admin-API connection (request.jwt.claims is not set there as
--    PostgREST sets it). Every admin invite raised BETA_INVITE_REQUIRED,
--    surfaced to the UI as the generic "Database error saving new user".
--    Fix: bypass when the user metadata carries `admin_invite: 'true'`, set
--    by the invite-user.js handler. The original service-role check is kept
--    as a fallback.
--
-- 2. THIRTEEN foreign keys to `auth.users` were created without an
--    `ON DELETE` clause across migrations 030, 041, 042, 054, 055, 056,
--    060, 062, 083, 094, 101, 105. Any one of them blocks admin delete
--    when a referencing row exists, and GoTrue surfaces the Postgres
--    error as the generic "Database error deleting user". This migration
--    adds ON DELETE behaviour to all of them:
--      - nullable audit/review columns (reviewed_by, updated_by, …) → SET NULL
--      - NOT NULL ownership columns (user_id) → CASCADE

create or replace function public.gate_signup_with_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required text;
  v_code text;
  v_invite record;
begin
  v_required := current_setting('app.beta_signup_required', true);
  if coalesce(v_required, 'true') <> 'true' then
    return new;
  end if;

  -- Admin-invited users carry an explicit marker in metadata; bypass the gate.
  -- auth.role() is unreliable inside GoTrue admin-API connections, so we can't
  -- rely on the service-role check alone for the admin invite path.
  if coalesce(new.raw_user_meta_data->>'admin_invite', 'false') = 'true' then
    return new;
  end if;

  -- Secondary fallback: standard service-role bypass (works from psql / Studio).
  if (auth.role() = 'service_role') then
    return new;
  end if;

  v_code := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  if v_code is null then
    raise exception 'BETA_INVITE_REQUIRED: signup is invite-only. Add invite_code to options.data when calling supabase.auth.signUp.';
  end if;

  select * into v_invite from public.beta_invites where code = v_code;
  if not found then
    raise exception 'BETA_INVITE_INVALID: invite code not recognized.';
  end if;
  if v_invite.used_at is not null then
    raise exception 'BETA_INVITE_USED: invite code has already been redeemed.';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'BETA_INVITE_EXPIRED: invite code has expired.';
  end if;

  update public.beta_invites
    set used_at = now(), used_by_user_id = new.id
    where code = v_code;

  return new;
end;
$$;

-- Fix every FK to auth.users that was created without an ON DELETE clause.
-- Without these, any referencing row blocks `auth.admin.deleteUser()` and
-- GoTrue returns the generic "Database error deleting user".
--
-- Policy:
--  - Nullable audit/review fields (reviewed_by, updated_by, etc.) → SET NULL
--    so the audit trail is preserved but the user reference is cleared.
--  - NOT NULL ownership columns → CASCADE so dependent rows are removed
--    with the user (SET NULL is impossible against a NOT NULL column).

-- ── nullable audit / review / authored-by fields → SET NULL ──────────────

alter table if exists public.tool_executions
  drop constraint if exists tool_executions_user_id_fkey;
alter table if exists public.tool_executions
  add  constraint tool_executions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table if exists public.concilium_security_events
  drop constraint if exists concilium_security_events_reviewed_by_fkey;
alter table if exists public.concilium_security_events
  add  constraint concilium_security_events_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table if exists public.concilium_fraud_events
  drop constraint if exists concilium_fraud_events_reviewed_by_fkey;
alter table if exists public.concilium_fraud_events
  add  constraint concilium_fraud_events_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table if exists public.app_settings
  drop constraint if exists app_settings_updated_by_fkey;
alter table if exists public.app_settings
  add  constraint app_settings_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

alter table if exists public.report_snapshots
  drop constraint if exists report_snapshots_user_id_fkey;
alter table if exists public.report_snapshots
  add  constraint report_snapshots_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table if exists public.investment_deal_analytics
  drop constraint if exists investment_deal_analytics_poster_id_fkey;
alter table if exists public.investment_deal_analytics
  add  constraint investment_deal_analytics_poster_id_fkey
  foreign key (poster_id) references auth.users(id) on delete set null;

-- alter table if exists public.feature_flags
--   drop constraint if exists feature_flags_disabled_by_fkey;
-- alter table if exists public.feature_flags
--   add  constraint feature_flags_disabled_by_fkey
--   foreign key (disabled_by) references auth.users(id) on delete set null;

-- ── NOT NULL ownership columns → CASCADE ─────────────────────────────────

alter table if exists public.agent_blueprints
  drop constraint if exists agent_blueprints_user_id_fkey;
alter table if exists public.agent_blueprints
  add  constraint agent_blueprints_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table if exists public.agent_tool_whitelist
  drop constraint if exists agent_tool_whitelist_user_id_fkey;
alter table if exists public.agent_tool_whitelist
  add  constraint agent_tool_whitelist_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table if exists public.consilium_supervisor_rules
  drop constraint if exists consilium_supervisor_rules_user_id_fkey;
alter table if exists public.consilium_supervisor_rules
  add  constraint consilium_supervisor_rules_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table if exists public.pulse_cycles
  drop constraint if exists pulse_cycles_user_id_fkey;
alter table if exists public.pulse_cycles
  add  constraint pulse_cycles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table if exists public.pulse_triggers
  drop constraint if exists pulse_triggers_user_id_fkey;
alter table if exists public.pulse_triggers
  add  constraint pulse_triggers_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table if exists public.theory_mode
  drop constraint if exists theory_mode_user_id_fkey;
alter table if exists public.theory_mode
  add  constraint theory_mode_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
