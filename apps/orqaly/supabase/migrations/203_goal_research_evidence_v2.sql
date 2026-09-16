-- Additive, consumer-first persistence for axwise_research_bundle_v2.
-- V1 rows retain null hashes and zero typed-record counts.

alter table public.goal_research_runs
  add column if not exists evidence_profile_version text,
  add column if not exists evidence_profile_hash text,
  add column if not exists fact_manifest_hash text,
  add column if not exists calculation_manifest_hash text,
  add column if not exists fact_count integer not null default 0 check (fact_count >= 0),
  add column if not exists calculation_count integer not null default 0 check (calculation_count >= 0);

alter table public.goal_research_runs
  drop constraint if exists goal_research_runs_evidence_profile_hash_check,
  add constraint goal_research_runs_evidence_profile_hash_check check (
    evidence_profile_hash is null or evidence_profile_hash ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists goal_research_runs_fact_manifest_hash_check,
  add constraint goal_research_runs_fact_manifest_hash_check check (
    fact_manifest_hash is null or fact_manifest_hash ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists goal_research_runs_calculation_manifest_hash_check,
  add constraint goal_research_runs_calculation_manifest_hash_check check (
    calculation_manifest_hash is null or calculation_manifest_hash ~ '^[0-9a-f]{64}$'
  );

create table if not exists public.goal_research_facts (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.goal_research_runs(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_fact_id text not null,
  claim_id text not null,
  fact_kind text not null,
  schema_version text not null check (schema_version = 'evidence_fact_v1'),
  fact_hash text not null check (fact_hash ~ '^[0-9a-f]{64}$'),
  source_ids text[] not null,
  source_hashes text[] not null,
  country_codes text[] not null,
  -- Preserve the producer's validated RFC3339 spelling byte-for-byte because
  -- observed_at participates in fact_hash. A timestamptz round trip may render
  -- the same instant differently (for example Z as +00:00).
  observed_at text not null,
  market_scope_hash text not null check (market_scope_hash ~ '^[0-9a-f]{64}$'),
  topic_seed_sha256 text not null check (topic_seed_sha256 ~ '^[0-9a-f]{64}$'),
  comparison_scope_hash text not null check (comparison_scope_hash ~ '^[0-9a-f]{64}$'),
  verification_status text not null check (
    verification_status = 'verified_current_authoritative'
  ),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (research_run_id, external_fact_id)
);

create index if not exists idx_goal_research_facts_run
  on public.goal_research_facts(research_run_id, fact_kind, created_at);
create index if not exists idx_goal_research_facts_claim
  on public.goal_research_facts(research_run_id, claim_id);

create table if not exists public.goal_research_calculations (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.goal_research_runs(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_calculation_id text not null,
  calculation_kind text not null,
  schema_version text not null check (schema_version = 'evidence_calculation_v1'),
  formula_version text not null,
  calculation_hash text not null check (calculation_hash ~ '^[0-9a-f]{64}$'),
  input_fact_ids text[] not null,
  country_codes text[] not null,
  comparison_scope_hash text not null check (comparison_scope_hash ~ '^[0-9a-f]{64}$'),
  verification_status text not null check (
    verification_status = 'verified_traceable_calculation'
  ),
  target_basis jsonb not null,
  result jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (research_run_id, external_calculation_id)
);

create index if not exists idx_goal_research_calculations_run
  on public.goal_research_calculations(research_run_id, calculation_kind, created_at);
drop trigger if exists trg_goal_research_facts_validate_scope on public.goal_research_facts;
create trigger trg_goal_research_facts_validate_scope
  before insert or update of research_run_id, goal_id, user_id, org_id
  on public.goal_research_facts
  for each row execute function public.goal_research_validate_child_scope();

drop trigger if exists trg_goal_research_calculations_validate_scope
  on public.goal_research_calculations;
create trigger trg_goal_research_calculations_validate_scope
  before insert or update of research_run_id, goal_id, user_id, org_id
  on public.goal_research_calculations
  for each row execute function public.goal_research_validate_child_scope();

-- Activation remains the atomic visibility boundary. V2 cannot become current
-- until every hash-pinned typed child row is durable under the importing run.
create or replace function public.activate_goal_research_run(
  p_run_id uuid,
  p_user_id uuid
)
returns public.goal_research_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.goal_research_runs;
  stored_fact_count integer;
  stored_calculation_count integer;
begin
  select * into target
    from public.goal_research_runs
   where id = p_run_id and user_id = p_user_id;
  if target.id is null then
    raise exception 'Goal research run not found for owner';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.goal_id::text, 0));

  if target.bundle_version = 'axwise_research_bundle_v2' then
    if target.evidence_profile_version <> 'business_evidence_profile_v1'
       or target.evidence_profile_hash is null
       or target.fact_manifest_hash is null
       or target.calculation_manifest_hash is null then
      raise exception 'Goal research v2 run identity is incomplete';
    end if;
    select count(*) into stored_fact_count
      from public.goal_research_facts
     where research_run_id = target.id
       and goal_id = target.goal_id
       and user_id = target.user_id
       and org_id = target.org_id;
    select count(*) into stored_calculation_count
      from public.goal_research_calculations
     where research_run_id = target.id
       and goal_id = target.goal_id
       and user_id = target.user_id
       and org_id = target.org_id;
    if stored_fact_count <> target.fact_count
       or stored_calculation_count <> target.calculation_count then
      raise exception 'Goal research v2 typed evidence is incomplete';
    end if;
  end if;

  update public.goal_research_runs
     set version_status = 'superseded',
         superseded_at = coalesce(superseded_at, now()),
         updated_at = now()
   where goal_id = target.goal_id
     and user_id = target.user_id
     and version_status = 'current'
     and id <> target.id;

  update public.goal_research_runs
     set version_status = 'current',
         superseded_at = null,
         updated_at = now()
   where id = target.id and user_id = target.user_id
   returning * into target;

  return target;
end;
$$;

revoke all on function public.activate_goal_research_run(uuid, uuid) from public;
revoke all on function public.activate_goal_research_run(uuid, uuid) from anon;
revoke all on function public.activate_goal_research_run(uuid, uuid) from authenticated;
grant execute on function public.activate_goal_research_run(uuid, uuid) to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['goal_research_facts', 'goal_research_calculations'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_select', table_name);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      table_name || '_owner_select', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_service', table_name);
    execute format(
      'create policy %I on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
      table_name || '_service', table_name
    );
  end loop;
end $$;

grant select on table public.goal_research_facts to authenticated;
grant select on table public.goal_research_calculations to authenticated;
grant all on table public.goal_research_facts to service_role;
grant all on table public.goal_research_calculations to service_role;
