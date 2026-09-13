-- Durable, tenant-scoped persistence for AxWise goal research bundles.
--
-- The goal row keeps only a compact pointer. Full research sources, personas,
-- artifacts and goal-agent persona bindings live here with immutable bundle
-- hashes and explicit current/superseded versioning.
--
-- Idempotent: tables/indexes/policies/triggers/functions may be re-applied.

create table if not exists public.goal_research_runs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_run_id text not null,
  external_decision_id text,
  bundle_version text not null,
  bundle_hash text not null check (bundle_hash ~ '^[0-9a-f]{64}$'),
  provider_bundle_hash text,
  research_prd_hash text check (
    research_prd_hash is null or research_prd_hash ~ '^[0-9a-f]{64}$'
  ),
  selected_persona_ids text[] not null default '{}',
  run_status text,
  version_status text not null default 'importing'
    check (version_status in ('importing', 'current', 'superseded')),
  source_count integer not null default 0 check (source_count >= 0),
  persona_count integer not null default 0 check (persona_count >= 0),
  artifact_count integer not null default 0 check (artifact_count >= 0),
  raw_bundle jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, bundle_hash)
);

create unique index if not exists idx_goal_research_runs_external
  on public.goal_research_runs(goal_id, external_run_id, bundle_hash);
create unique index if not exists idx_goal_research_runs_one_current
  on public.goal_research_runs(goal_id)
  where version_status = 'current';
create index if not exists idx_goal_research_runs_owner_goal
  on public.goal_research_runs(user_id, org_id, goal_id, imported_at desc);

create table if not exists public.goal_research_sources (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.goal_research_runs(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_source_id text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  provider_source_hash text,
  source_type text,
  title text,
  url text,
  publisher text,
  observed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_run_id, external_source_id)
);

create index if not exists idx_goal_research_sources_run
  on public.goal_research_sources(research_run_id, created_at);
create index if not exists idx_goal_research_sources_hash
  on public.goal_research_sources(goal_id, source_hash);

create table if not exists public.goal_research_personas (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.goal_research_runs(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_persona_id text not null,
  persona_hash text not null check (persona_hash ~ '^[0-9a-f]{64}$'),
  persona_type text,
  name text,
  role text,
  stakeholder_type text,
  selected boolean not null default false,
  source_hashes text[] not null default '{}',
  profile jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_run_id, external_persona_id)
);

create index if not exists idx_goal_research_personas_run
  on public.goal_research_personas(research_run_id, selected desc, created_at);

create table if not exists public.goal_research_artifacts (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.goal_research_runs(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_artifact_id text not null,
  artifact_type text,
  title text,
  mime_type text,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  content_text text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_run_id, external_artifact_id)
);

create index if not exists idx_goal_research_artifacts_run
  on public.goal_research_artifacts(research_run_id, artifact_type, created_at);

create table if not exists public.goal_agent_persona_assignments (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.goal_research_runs(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent_id text not null,
  persona_id uuid not null references public.goal_research_personas(id) on delete cascade,
  external_persona_id text not null,
  assignment_source text not null default 'axwise'
    check (assignment_source in ('axwise', 'orqaly_team_formation')),
  assignment_role text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_run_id, agent_id, persona_id, assignment_source)
);

create index if not exists idx_goal_agent_persona_assignments_goal_agent
  on public.goal_agent_persona_assignments(goal_id, agent_id, created_at desc);

-- Research-bound team formation uses this server-computed manifest hash to
-- distinguish its own runnable rows from legacy/manual goal work. It lets the
-- atomic materializer retire only prior rows that it owns.
alter table public.jobs
  add column if not exists materialization_attempt text;
alter table public.team_tasks
  add column if not exists materialization_attempt text;

create index if not exists idx_jobs_goal_materialization_attempt
  on public.jobs(goal_id, materialization_attempt)
  where materialization_attempt is not null;
create index if not exists idx_team_tasks_goal_materialization_attempt
  on public.team_tasks(goal_id, materialization_attempt)
  where materialization_attempt is not null;

create or replace function public.goal_research_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_goal_research_runs_touch_updated_at on public.goal_research_runs;
create trigger trg_goal_research_runs_touch_updated_at
  before update on public.goal_research_runs
  for each row execute function public.goal_research_touch_updated_at();

-- Service-role writes bypass RLS, so a trigger must still prove that every
-- stored run matches the owning goal and organization.
create or replace function public.goal_research_validate_run_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  goal_owner uuid;
  goal_org uuid;
begin
  select g.user_id, g.org_id into goal_owner, goal_org
    from public.goals g
   where g.id = new.goal_id;

  if goal_owner is null then
    raise exception 'Goal research run references an unavailable goal';
  end if;
  if goal_org is null then
    raise exception 'Goal research requires an organization-scoped goal';
  end if;
  if goal_owner <> new.user_id or goal_org <> new.org_id then
    raise exception 'Goal research tenant scope does not match its goal';
  end if;
  if not exists (
    select 1 from public.organizations o
     where o.id = new.org_id and o.user_id = new.user_id
  ) then
    raise exception 'Goal research organization is not owned by the goal owner';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_goal_research_runs_validate_scope on public.goal_research_runs;
create trigger trg_goal_research_runs_validate_scope
  before insert or update of goal_id, user_id, org_id
  on public.goal_research_runs
  for each row execute function public.goal_research_validate_run_scope();

create or replace function public.goal_research_validate_child_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_goal uuid;
  parent_owner uuid;
  parent_org uuid;
begin
  select r.goal_id, r.user_id, r.org_id into parent_goal, parent_owner, parent_org
    from public.goal_research_runs r
   where r.id = new.research_run_id;

  if parent_goal is null then
    raise exception 'Goal research child references an unavailable run';
  end if;
  if parent_goal <> new.goal_id or parent_owner <> new.user_id or parent_org <> new.org_id then
    raise exception 'Goal research child tenant scope does not match its run';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_goal_research_sources_validate_scope on public.goal_research_sources;
create trigger trg_goal_research_sources_validate_scope
  before insert or update of research_run_id, goal_id, user_id, org_id
  on public.goal_research_sources
  for each row execute function public.goal_research_validate_child_scope();

drop trigger if exists trg_goal_research_personas_validate_scope on public.goal_research_personas;
create trigger trg_goal_research_personas_validate_scope
  before insert or update of research_run_id, goal_id, user_id, org_id
  on public.goal_research_personas
  for each row execute function public.goal_research_validate_child_scope();

drop trigger if exists trg_goal_research_artifacts_validate_scope on public.goal_research_artifacts;
create trigger trg_goal_research_artifacts_validate_scope
  before insert or update of research_run_id, goal_id, user_id, org_id
  on public.goal_research_artifacts
  for each row execute function public.goal_research_validate_child_scope();

create or replace function public.goal_research_validate_assignment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_goal uuid;
  parent_owner uuid;
  parent_org uuid;
  stored_persona text;
begin
  select r.goal_id, r.user_id, r.org_id into parent_goal, parent_owner, parent_org
    from public.goal_research_runs r
   where r.id = new.research_run_id;
  if parent_goal is null then
    raise exception 'Goal-agent assignment references an unavailable research run';
  end if;
  if parent_goal <> new.goal_id or parent_owner <> new.user_id or parent_org <> new.org_id then
    raise exception 'Goal-agent assignment tenant scope does not match its run';
  end if;

  select p.external_persona_id into stored_persona
    from public.goal_research_personas p
   where p.id = new.persona_id
     and p.research_run_id = new.research_run_id;
  if stored_persona is null or stored_persona <> new.external_persona_id then
    raise exception 'Goal-agent assignment persona does not match its research run';
  end if;
  if not exists (
    select 1 from public.agents a
     where a.id::text = new.agent_id and a.user_id = new.user_id
  ) then
    raise exception 'Goal-agent assignment agent is not owned by the goal owner';
  end if;
  if not exists (
    select 1 from public.org_agents oa
     where oa.org_id = new.org_id
       and oa.user_id = new.user_id
       and oa.agent_id = new.agent_id
  ) then
    raise exception 'Goal-agent assignment agent is outside the goal organization';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_goal_agent_persona_assignments_validate_scope
  on public.goal_agent_persona_assignments;
create trigger trg_goal_agent_persona_assignments_validate_scope
  before insert or update of research_run_id, goal_id, user_id, org_id, agent_id, persona_id,
    external_persona_id
  on public.goal_agent_persona_assignments
  for each row execute function public.goal_research_validate_assignment_scope();

-- Serialize the tiny activation step per goal. Importers first upsert all
-- immutable children under an `importing` run, then atomically supersede the
-- old current version and activate the complete new version.
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
begin
  select * into target
    from public.goal_research_runs
   where id = p_run_id and user_id = p_user_id;
  if target.id is null then
    raise exception 'Goal research run not found for owner';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.goal_id::text, 0));

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

-- Replace one research-bound team manifest as a single transaction. The lock
-- serializes worker redeliveries. Only rows marked by this materializer are
-- retired; unrelated/legacy goal work and completed history remain untouched.
-- Only Orqaly's final bindings are replaced; AxWise import provenance is kept.
create or replace function public.materialize_goal_research_work(
  p_goal_id uuid,
  p_user_id uuid,
  p_research_run_id uuid,
  p_attempt_key text,
  p_jobs jsonb,
  p_tasks jsonb,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  goal_owner uuid;
  goal_org uuid;
  goal_status text;
  committed_attempt text;
  run_goal uuid;
  run_owner uuid;
  run_org uuid;
  inserted_jobs integer := 0;
  inserted_tasks integer := 0;
  inserted_assignments integer := 0;
  existing_jobs integer := 0;
  existing_tasks integer := 0;
  existing_assignments integer := 0;
begin
  if p_goal_id is null or p_user_id is null or p_research_run_id is null then
    raise exception using message = 'research_materialization_scope_required', errcode = '22023';
  end if;
  if p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'research_materialization_attempt_invalid', errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_jobs, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_tasks, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_assignments, 'null'::jsonb)) <> 'array' then
    raise exception using message = 'research_materialization_arrays_required', errcode = '22023';
  end if;
  if jsonb_array_length(p_jobs) < 1
     or jsonb_array_length(p_jobs) > 100
     or jsonb_array_length(p_tasks) <> jsonb_array_length(p_jobs)
     or jsonb_array_length(p_assignments) < 1
     or jsonb_array_length(p_assignments) > 100 then
    raise exception using message = 'research_materialization_counts_invalid', errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_goal_id::text, 0));

  select
    g.user_id,
    g.org_id,
    g.status,
    g.data#>>'{research_materialization,attempt_key}'
    into goal_owner, goal_org, goal_status, committed_attempt
    from public.goals g
   where g.id = p_goal_id
   for update;
  if goal_owner is null or goal_owner <> p_user_id or goal_org is null then
    raise exception using message = 'research_materialization_goal_not_owned', errcode = '42501';
  end if;
  select r.goal_id, r.user_id, r.org_id into run_goal, run_owner, run_org
    from public.goal_research_runs r
   where r.id = p_research_run_id
     and r.version_status = 'current';
  if run_goal is null
     or run_goal <> p_goal_id
     or run_owner <> p_user_id
     or run_org <> goal_org then
    raise exception using message = 'research_materialization_run_not_current', errcode = '42501';
  end if;

  if (select count(distinct item->>'id') from jsonb_array_elements(p_jobs) item)
       <> jsonb_array_length(p_jobs)
     or (select count(distinct item->>'id') from jsonb_array_elements(p_tasks) item)
       <> jsonb_array_length(p_tasks) then
    raise exception using message = 'research_materialization_ids_not_unique', errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_jobs) item
     where nullif(item->>'id', '') is null
        or item->>'goal_id' is distinct from p_goal_id::text
        or item->>'user_id' is distinct from p_user_id::text
        or item->>'status' is distinct from 'active'
  ) then
    raise exception using message = 'research_materialization_job_scope_invalid', errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tasks) item
     where nullif(item->>'id', '') is null
        or nullif(item->>'job_pool_id', '') is null
        or item->>'goal_id' is distinct from p_goal_id::text
        or item->>'user_id' is distinct from p_user_id::text
        or item->>'status' is distinct from 'planned'
  ) then
    raise exception using message = 'research_materialization_task_scope_invalid', errcode = '42501';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_tasks) task
     where not exists (
       select 1 from jsonb_array_elements(p_jobs) job
        where job->>'id' = task->>'job_pool_id'
          and job->>'assigned_agent_id' is not distinct from task->>'agent_id'
     )
  ) then
    raise exception using message = 'research_materialization_task_job_binding_invalid', errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_assignments) item
     where item->>'research_run_id' is distinct from p_research_run_id::text
        or item->>'goal_id' is distinct from p_goal_id::text
        or item->>'user_id' is distinct from p_user_id::text
        or item->>'org_id' is distinct from run_org::text
        or item->>'assignment_source' is distinct from 'orqaly_team_formation'
        or item#>>'{payload,materialization_attempt}' is distinct from p_attempt_key
        or nullif(item->>'agent_id', '') is null
        or nullif(item->>'persona_id', '') is null
        or nullif(item->>'external_persona_id', '') is null
  ) then
    raise exception using message = 'research_materialization_assignment_scope_invalid', errcode = '42501';
  end if;

  -- The assignment manifest must cover every task exactly once, and the task
  -- and binding must name the same authorized agent.
  if exists (
    select 1
      from jsonb_array_elements(p_tasks) task
     where (
       select count(*)
         from jsonb_array_elements(p_assignments) assignment,
              jsonb_array_elements_text(coalesce(assignment#>'{payload,task_ids}', '[]'::jsonb)) task_id
        where task_id = task->>'id'
          and assignment->>'agent_id' = task->>'agent_id'
     ) <> 1
  ) or exists (
    select 1
      from jsonb_array_elements(p_assignments) assignment,
           jsonb_array_elements_text(coalesce(assignment#>'{payload,task_ids}', '[]'::jsonb)) task_id
     where not exists (
       select 1 from jsonb_array_elements(p_tasks) task
        where task->>'id' = task_id
          and task->>'agent_id' = assignment->>'agent_id'
     )
  ) then
    raise exception using message = 'research_materialization_task_binding_invalid', errcode = '22023';
  end if;

  -- Exact retry: a prior call can only expose all three sets because this
  -- function commits them together. Return without touching history.
  select count(*) into existing_jobs
    from public.jobs j
   where j.goal_id = p_goal_id and j.user_id = p_user_id
     and j.materialization_attempt = p_attempt_key and j.status = 'active';
  select count(*) into existing_tasks
    from public.team_tasks t
   where t.goal_id = p_goal_id and t.user_id = p_user_id
     and t.materialization_attempt = p_attempt_key and t.status = 'planned';
  select count(*) into existing_assignments
    from public.goal_agent_persona_assignments a
   where a.research_run_id = p_research_run_id
     and a.goal_id = p_goal_id and a.user_id = p_user_id
     and a.assignment_source = 'orqaly_team_formation'
     and a.payload->>'materialization_attempt' = p_attempt_key;
  if existing_jobs = jsonb_array_length(p_jobs)
     and existing_tasks = jsonb_array_length(p_tasks)
     and existing_assignments = jsonb_array_length(p_assignments)
     and not exists (
       select 1 from jsonb_array_elements(p_jobs) item
        where not exists (
          select 1 from public.jobs j
           where j.id = item->>'id'
             and j.goal_id = p_goal_id and j.user_id = p_user_id
             and j.materialization_attempt = p_attempt_key and j.status = 'active'
             and j.description = coalesce(item->>'description', '')
             and j.category is not distinct from item->>'category'
             and j.requirements = coalesce(item->>'requirements', '')
             and j.assigned_agent_id is not distinct from item->>'assigned_agent_id'
             and j.assigned_agent_name = coalesce(item->>'assigned_agent_name', '')
        )
     )
     and not exists (
       select 1 from jsonb_array_elements(p_tasks) item
        where not exists (
          select 1 from public.team_tasks t
           where t.id = item->>'id'
             and t.goal_id = p_goal_id and t.user_id = p_user_id
             and t.materialization_attempt = p_attempt_key and t.status = 'planned'
             and t.job_pool_id = item->>'job_pool_id'
             and t.title = coalesce(item->>'title', '')
             and t.description = coalesce(item->>'description', '')
             and t.sequence_order = coalesce((item->>'sequence_order')::integer, 0)
             and t.assigned_to is not distinct from item->>'assigned_to'
             and t.agent_id is not distinct from item->>'agent_id'
             and t.category is not distinct from item->>'category'
             and t.estimate is not distinct from item->>'estimate'
             and t.deadline is not distinct from nullif(item->>'deadline', '')::date
             and t.priority is not distinct from item->>'priority'
             and t.data = coalesce(item->'data', '{}'::jsonb)
        )
     )
     and not exists (
       select 1 from jsonb_array_elements(p_assignments) item
        where not exists (
          select 1 from public.goal_agent_persona_assignments a
           where a.research_run_id = (item->>'research_run_id')::uuid
             and a.agent_id = item->>'agent_id'
             and a.persona_id = (item->>'persona_id')::uuid
             and a.assignment_source = 'orqaly_team_formation'
             and a.external_persona_id = item->>'external_persona_id'
             and a.assignment_role is not distinct from item->>'assignment_role'
             and a.payload = coalesce(item->'payload', '{}'::jsonb)
        )
     ) then
    return jsonb_build_object(
      'attempt_key', p_attempt_key,
      'job_count', existing_jobs,
      'task_count', existing_tasks,
      'assignment_count', existing_assignments,
      'reused', true
    );
  end if;
  if existing_jobs > 0 or existing_tasks > 0 or existing_assignments > 0 then
    raise exception using
      message = 'research_materialization_attempt_inconsistent',
      errcode = '23514';
  end if;
  if goal_status <> 'forming_team' then
    if committed_attempt is not null then
      return jsonb_build_object(
        'attempt_key', committed_attempt,
        'requested_attempt_key', p_attempt_key,
        'stale', true,
        'reused', false
      );
    end if;
    raise exception using message = 'research_materialization_goal_not_forming_team', errcode = '55000';
  end if;

  update public.team_tasks
     set status = 'cancelled', updated_at = now()
   where goal_id = p_goal_id and user_id = p_user_id
     and materialization_attempt is not null
     and status in ('planned', 'todo', 'in_progress', 'inProgress');
  update public.jobs
     set status = 'cancelled', updated_at = now()
   where goal_id = p_goal_id and user_id = p_user_id
     and materialization_attempt is not null
     and status = 'active';

  insert into public.jobs (
    id, user_id, goal_id, materialization_attempt, description, category,
    requirements, status, assigned_agent_id, assigned_agent_name
  )
  select
    item->>'id', (item->>'user_id')::uuid, (item->>'goal_id')::uuid, p_attempt_key,
    coalesce(item->>'description', ''), item->>'category', coalesce(item->>'requirements', ''),
    item->>'status', item->>'assigned_agent_id', coalesce(item->>'assigned_agent_name', '')
  from jsonb_array_elements(p_jobs) item;
  get diagnostics inserted_jobs = row_count;

  -- Test-only fault hook: ordinary API callers cannot set PostgreSQL session
  -- GUCs. It lets the isolated migration test prove that a late exception
  -- rolls back both the retirement updates and the new job inserts.
  if current_setting('orqaly.test_fail_materialization', true) = 'after_jobs' then
    raise exception using message = 'research_materialization_test_failure', errcode = '40001';
  end if;

  insert into public.team_tasks (
    id, user_id, job_pool_id, materialization_attempt, title, description,
    status, sequence_order, assigned_to, agent_id, category, goal_id,
    estimate, deadline, priority, data
  )
  select
    item->>'id', (item->>'user_id')::uuid, item->>'job_pool_id', p_attempt_key,
    coalesce(item->>'title', ''), coalesce(item->>'description', ''), item->>'status',
    coalesce((item->>'sequence_order')::integer, 0), item->>'assigned_to', item->>'agent_id',
    item->>'category', (item->>'goal_id')::uuid, item->>'estimate',
    nullif(item->>'deadline', '')::date, item->>'priority', coalesce(item->'data', '{}'::jsonb)
  from jsonb_array_elements(p_tasks) item;
  get diagnostics inserted_tasks = row_count;

  delete from public.goal_agent_persona_assignments a
   where a.research_run_id = p_research_run_id
     and a.goal_id = p_goal_id and a.user_id = p_user_id
     and a.assignment_source = 'orqaly_team_formation';
  insert into public.goal_agent_persona_assignments (
    research_run_id, goal_id, user_id, org_id, agent_id, persona_id,
    external_persona_id, assignment_source, assignment_role, payload
  )
  select
    (item->>'research_run_id')::uuid, (item->>'goal_id')::uuid,
    (item->>'user_id')::uuid, (item->>'org_id')::uuid, item->>'agent_id',
    (item->>'persona_id')::uuid, item->>'external_persona_id',
    'orqaly_team_formation', item->>'assignment_role', coalesce(item->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_assignments) item;
  get diagnostics inserted_assignments = row_count;

  if inserted_jobs <> jsonb_array_length(p_jobs)
     or inserted_tasks <> jsonb_array_length(p_tasks)
     or inserted_assignments <> jsonb_array_length(p_assignments) then
    raise exception using message = 'research_materialization_insert_count_mismatch', errcode = '23514';
  end if;
  update public.goals
     set status = 'provisioning_tools',
         data = jsonb_set(
           coalesce(data, '{}'::jsonb),
           '{research_materialization}',
           jsonb_build_object(
             'attempt_key', p_attempt_key,
             'research_run_id', p_research_run_id,
             'job_count', inserted_jobs,
             'task_count', inserted_tasks,
             'assignment_count', inserted_assignments,
             'materialized_at', now()
           ),
           true
         ),
         updated_at = now()
   where id = p_goal_id and user_id = p_user_id;
  return jsonb_build_object(
    'attempt_key', p_attempt_key,
    'job_count', inserted_jobs,
    'task_count', inserted_tasks,
    'assignment_count', inserted_assignments,
    'reused', false
  );
end;
$$;

revoke all on function public.materialize_goal_research_work(
  uuid, uuid, uuid, text, jsonb, jsonb, jsonb
) from public;
revoke all on function public.materialize_goal_research_work(
  uuid, uuid, uuid, text, jsonb, jsonb, jsonb
) from anon;
revoke all on function public.materialize_goal_research_work(
  uuid, uuid, uuid, text, jsonb, jsonb, jsonb
) from authenticated;
grant execute on function public.materialize_goal_research_work(
  uuid, uuid, uuid, text, jsonb, jsonb, jsonb
) to service_role;

-- Trigger helpers are invoked only through their bound triggers. PostgreSQL
-- grants function execution to PUBLIC by default, so remove that unnecessary
-- callable surface (the owner retains implicit control).
revoke all on function public.goal_research_touch_updated_at() from public;
revoke all on function public.goal_research_touch_updated_at() from anon;
revoke all on function public.goal_research_touch_updated_at() from authenticated;
revoke all on function public.goal_research_validate_run_scope() from public;
revoke all on function public.goal_research_validate_run_scope() from anon;
revoke all on function public.goal_research_validate_run_scope() from authenticated;
revoke all on function public.goal_research_validate_child_scope() from public;
revoke all on function public.goal_research_validate_child_scope() from anon;
revoke all on function public.goal_research_validate_child_scope() from authenticated;
revoke all on function public.goal_research_validate_assignment_scope() from public;
revoke all on function public.goal_research_validate_assignment_scope() from anon;
revoke all on function public.goal_research_validate_assignment_scope() from authenticated;

-- Browser clients may read only their own records; writes are backend-only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'goal_research_runs',
    'goal_research_sources',
    'goal_research_personas',
    'goal_research_artifacts',
    'goal_agent_persona_assignments'
  ] loop
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

grant select on table public.goal_research_runs to authenticated;
grant select on table public.goal_research_sources to authenticated;
grant select on table public.goal_research_personas to authenticated;
grant select on table public.goal_research_artifacts to authenticated;
grant select on table public.goal_agent_persona_assignments to authenticated;

grant all on table public.goal_research_runs to service_role;
grant all on table public.goal_research_sources to service_role;
grant all on table public.goal_research_personas to service_role;
grant all on table public.goal_research_artifacts to service_role;
grant all on table public.goal_agent_persona_assignments to service_role;
