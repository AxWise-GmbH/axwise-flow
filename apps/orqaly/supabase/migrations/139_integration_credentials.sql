-- 139_integration_credentials.sql
-- Phase 5 — Token refresh framework. Every OAuth-based integration writes
-- one row here per user × provider. Tokens are refreshed automatically by
-- lib/integrations/_shared/oauth-refresh.js before expiry; failures alert
-- the user via the notifications fan-out.
--
-- Storage note: access_token and refresh_token are sensitive. Use
-- column-level encryption (pgcrypto) or store hashes in plaintext for
-- now and add encryption in a follow-up — Supabase RLS keeps them
-- scoped to the owner but they're still readable by service_role.

create extension if not exists pgcrypto;

create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,                  -- 'stripe' | 'posthog' | 'ga4' | 'meta_ads' | 'google_ads' | 'gmail' | ...
  external_account_id text,                -- e.g. Stripe account id, Meta ad account id
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  metadata jsonb not null default '{}'::jsonb,
  last_refreshed_at timestamptz,
  refresh_failure_count int not null default 0,
  status text not null default 'active' check (status in ('active','needs_reauth','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_account_id)
);
create index if not exists idx_integration_credentials_user on public.integration_credentials(user_id);
create index if not exists idx_integration_credentials_expiring
  on public.integration_credentials(expires_at)
  where status = 'active';

alter table public.integration_credentials enable row level security;
drop policy if exists "integration_credentials_owner" on public.integration_credentials;
create policy "integration_credentials_owner" on public.integration_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
