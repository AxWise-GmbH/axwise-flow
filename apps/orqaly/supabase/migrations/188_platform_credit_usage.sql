-- Platform credit usage ledger: one running-total row per user, tracking
-- actual spend against the platform-provided ("Use platform credits") LLM key.
-- Distinct from llm_usage (per-call log) — this is a single accumulator so
-- the hard-cap check in resolve-user-key.js is an O(1) lookup, not a sum over
-- history on every call. Run in Supabase SQL Editor.

create table if not exists public.platform_credit_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_cost_usd numeric(10, 8) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.platform_credit_usage enable row level security;

-- Users can read their own running total (e.g. to show "$X of $50 used" in
-- the UI). All writes happen via the service-role client only (tracked-llm.js
-- upserts after a successful platform-credits call) — no user-facing
-- insert/update policy, matching the llm_usage (031) RLS shape.
create policy "Users read own platform_credit_usage"
  on public.platform_credit_usage for select
  using (auth.uid() = user_id or auth.role() = 'authenticated');
