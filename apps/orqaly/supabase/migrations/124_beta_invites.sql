-- 124_beta_invites.sql
-- Invite-only signup gate for the private beta.
--
-- Pattern: a Postgres trigger fires BEFORE INSERT on auth.users and looks up
-- a single-use invite code from raw_user_meta_data->>invite_code. The frontend
-- passes this when calling supabase.auth.signUp({ email, password, options: {
-- data: { invite_code: 'XYZ123' } } }).
--
-- This blocks bot signups (no code = rejection) and lets you control the
-- ramp by issuing codes manually (insert into beta_invites).

create table if not exists public.beta_invites (
  code              text primary key,
  -- Optional notes for who/what this code was issued to.
  label             text,
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz,
  -- Single-use: once a user redeems it, we record it here.
  used_at           timestamptz,
  used_by_user_id   uuid references auth.users(id) on delete set null
);

create index if not exists idx_beta_invites_unused on public.beta_invites(code) where used_at is null;

alter table public.beta_invites enable row level security;

-- No public read policy — invites are admin-only. The signup trigger uses the
-- security-definer function below to bypass RLS for redemption.
drop policy if exists "No public access to invites" on public.beta_invites;

-- ── Signup gate ──────────────────────────────────────────────────────────
-- Set this to 'true' to enforce invite codes on signup. Leave 'false' to
-- temporarily disable gating (e.g. while seeding admin accounts).
-- Read by the trigger below; change via:
--   alter database postgres set app.beta_signup_required = 'true';
do $$ begin
  perform set_config('app.beta_signup_required', 'true', false);
exception when others then null;
end $$;

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
  -- Allow disabling the gate via settings (useful for admin seeding).
  v_required := current_setting('app.beta_signup_required', true);
  if coalesce(v_required, 'true') <> 'true' then
    return new;
  end if;

  -- Service-role inserts bypass the gate. This lets admin tools (Supabase
  -- Studio "Invite User") create accounts without an invite code.
  if (auth.role() = 'service_role') then
    return new;
  end if;

  -- Pull invite code from the user metadata payload.
  v_code := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  if v_code is null then
    raise exception 'BETA_INVITE_REQUIRED: signup is invite-only. Add invite_code to options.data when calling supabase.auth.signUp.';
  end if;

  -- Look up + validate the invite (single-use, non-expired, unused).
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

  -- Mark the invite as redeemed by this user.
  update public.beta_invites
    set used_at = now(), used_by_user_id = new.id
    where code = v_code;

  return new;
end;
$$;

drop trigger if exists trg_auth_users_invite_gate on auth.users;
create trigger trg_auth_users_invite_gate
  before insert on auth.users
  for each row execute function public.gate_signup_with_invite();

-- Audit trail: log every gate event so we can see attempted bot signups.
create or replace function public.audit_invite_redeem()
returns trigger language plpgsql security definer as $$
begin
  if new.used_at is not null and (old.used_at is null) then
    insert into public.audit_log (action, entity, entity_id, user_id, details)
    values (
      'BETA_INVITE_REDEEMED',
      'beta_invites',
      new.code,
      new.used_by_user_id,
      jsonb_build_object('label', new.label)::text
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_beta_invites_audit on public.beta_invites;
create trigger trg_beta_invites_audit
  after update on public.beta_invites
  for each row execute function public.audit_invite_redeem();

-- ── Seed: a few starter codes you can use immediately ────────────────────
-- Distribute these to your first 5 testers. Generate more via:
--   insert into beta_invites (code, label) values ('YOUR_CODE', 'Tester name');
insert into public.beta_invites (code, label) values
  ('BETA-A1B2C3', 'Reserved tester slot 1'),
  ('BETA-D4E5F6', 'Reserved tester slot 2'),
  ('BETA-G7H8I9', 'Reserved tester slot 3'),
  ('BETA-J0K1L2', 'Reserved tester slot 4'),
  ('BETA-M3N4O5', 'Reserved tester slot 5')
on conflict (code) do nothing;
