-- Public Scheduling Link: secure token, buffers, persona, booking limits.
-- Extends booking_profiles; no new meeting infrastructure.
--
-- Older repositories carried the base booking migration under an invalid
-- filename (012a_...), so a fresh Supabase bootstrap may reach this migration
-- before booking_profiles exists. Keep this historical migration safe and let
-- migration 189 install/repair the complete schema later in the same run.

do $migration$
begin
  if to_regclass('public.booking_profiles') is null then
    raise notice 'booking_profiles is absent; deferring public scheduling columns to migration 189';
    return;
  end if;

  execute $ddl$
    alter table public.booking_profiles
      add column if not exists public_token text unique,
      add column if not exists buffer_before_minutes smallint not null default 0 check (buffer_before_minutes >= 0 and buffer_before_minutes <= 120),
      add column if not exists buffer_after_minutes smallint not null default 0 check (buffer_after_minutes >= 0 and buffer_after_minutes <= 120),
      add column if not exists role text not null default '',
      add column if not exists avatar_url text,
      add column if not exists max_bookings_per_day smallint not null default 0 check (max_bookings_per_day >= 0 and max_bookings_per_day <= 50)
  $ddl$;

  execute $ddl$
    create unique index if not exists idx_booking_profiles_public_token
      on public.booking_profiles(public_token)
      where public_token is not null
  $ddl$;

  execute $ddl$comment on column public.booking_profiles.public_token is 'Secure token for /schedule/{token}; null when link revoked.'$ddl$;
  execute $ddl$comment on column public.booking_profiles.buffer_before_minutes is 'Minutes of buffer before each booking (no slot start within this before another booking).'$ddl$;
  execute $ddl$comment on column public.booking_profiles.buffer_after_minutes is 'Minutes of buffer after each booking (no slot start within this after another booking).'$ddl$;
  execute $ddl$comment on column public.booking_profiles.role is 'Persona role label (e.g. Sales, Support).'$ddl$;
  execute $ddl$comment on column public.booking_profiles.avatar_url is 'Optional persona image URL.'$ddl$;
  execute $ddl$comment on column public.booking_profiles.max_bookings_per_day is 'Max bookings per day per profile; 0 = no limit.'$ddl$;
end
$migration$;
