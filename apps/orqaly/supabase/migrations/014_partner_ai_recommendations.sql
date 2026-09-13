-- Partner AI Recommendations
-- Stores AI-generated recommendations per partner, refreshed every 24h by cron.

create table if not exists public.partner_ai_recommendations (
  id uuid primary key default uuid_generate_v4(),
  partner_id text not null references public.partners(id) on delete cascade,
  title text not null,
  description text,
  steps jsonb default '[]'::jsonb,
  priority text not null default 'medium',
  category text,
  analyzed_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_partner_ai_recs_partner_id on public.partner_ai_recommendations(partner_id);
create index if not exists idx_partner_ai_recs_analyzed_at on public.partner_ai_recommendations(analyzed_at);

-- RLS: allow authenticated users to read recommendations
alter table public.partner_ai_recommendations enable row level security;

create policy "Anyone authenticated can read AI recommendations"
  on public.partner_ai_recommendations for select
  to authenticated
  using (true);

create policy "Service role can manage AI recommendations"
  on public.partner_ai_recommendations for all
  to service_role
  using (true)
  with check (true);
