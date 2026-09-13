-- 137_system_pulse.sql
-- Phase 3 — System Pulse engine. Recurring intelligent agent actions
-- ("every minute scan for KPI anomalies", "every day generate marketing
-- content ideas", "on goal_completed re-prioritize the roadmap").
-- Scheduler is Supabase pg_cron + pg_net (free, no Vercel Pro).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.agent_pulses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid,                       -- filled in Phase 6
  goal_chain_root_id uuid references public.goals(id) on delete cascade,
  agent_role text not null,               -- 'marketing' | 'analytics' | 'executive' | ...
  trigger_type text not null check (trigger_type in ('time','event','conditional')),
  cron_expr text,                          -- for trigger_type = 'time'
  event_name text,                         -- for trigger_type = 'event'
  condition_jsonl text,                    -- for trigger_type = 'conditional' (predicate DSL)
  action text not null,                    -- handler name in lib/pulses/actions/
  priority int not null default 5,
  enabled boolean not null default true,
  last_fired_at timestamptz,
  next_due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_pulses_due on public.agent_pulses(enabled, next_due_at);
create index if not exists idx_agent_pulses_user on public.agent_pulses(user_id);

create table if not exists public.pulse_runs (
  id uuid primary key default gen_random_uuid(),
  pulse_id uuid references public.agent_pulses(id) on delete cascade,
  fired_at timestamptz not null default now(),
  status text not null check (status in ('queued','done','failed','skipped')),
  outcome jsonb,
  job_id uuid,
  duration_ms integer
);
create index if not exists idx_pulse_runs_pulse on public.pulse_runs(pulse_id, fired_at desc);

alter table public.agent_pulses enable row level security;
drop policy if exists "agent_pulses_owner_all" on public.agent_pulses;
create policy "agent_pulses_owner_all" on public.agent_pulses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.pulse_runs enable row level security;
drop policy if exists "pulse_runs_via_pulse" on public.pulse_runs;
create policy "pulse_runs_via_pulse" on public.pulse_runs
  for select using (exists (
    select 1 from public.agent_pulses p where p.id = pulse_runs.pulse_id and p.user_id = auth.uid()
  ));

-- pg_cron schedule: hit our pulse-tick endpoint every minute. The shared
-- secret is read via current_setting so it can be rotated without code
-- changes: `alter database orchestratori set app.pulse_secret = '...';`
-- Replace <YOUR_DOMAIN> below before applying the migration in production.
-- For local dev, comment out the cron.schedule call and call the endpoint
-- manually.
do $$
begin
  -- Only schedule if pg_cron is actually available (it isn't in vanilla
  -- local supabase setups). Wrapped so the migration doesn't fail.
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'pulse-tick';
    perform cron.schedule(
      'pulse-tick',
      '* * * * *',
      $cron$ select net.http_post(
        url := coalesce(current_setting('app.pulse_endpoint', true), 'http://localhost:5176/api/ops?path=pulse-tick'),
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || coalesce(current_setting('app.pulse_secret', true), 'dev-secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      ); $cron$
    );
  end if;
exception when others then
  -- Don't block the migration if cron isn't available. Operators can
  -- schedule the tick from cron-job.org as a fallback.
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
