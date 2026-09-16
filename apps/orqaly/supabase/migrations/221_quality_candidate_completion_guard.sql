-- 221_quality_candidate_completion_guard.sql
--
-- Make quality-gated completion a database-owned, revision-bound transition.
-- The application still performs deterministic and semantic review, but only
-- these RPCs may freeze/reopen the exact attested artifact. row_version is
-- database maintained and authoritative when wall clocks are stale.

begin;

-- Supabase migrations are normally transactional, but keep the boundary
-- explicit for every runner. SHARE blocks task INSERT/UPDATE/DELETE until the
-- preflight, backfill, and replacement trigger are all committed together.
-- Lock tasks before ALTERing goals so an in-flight task writer cannot deadlock
-- while its existing parent-touch trigger waits for the goals table.
lock table public.team_tasks in share mode;

alter table public.goals
  add column if not exists row_version bigint not null default 0;

create table if not exists public.goal_quality_artifact_freezes (
  goal_id uuid not null references public.goals(id) on delete cascade,
  completion_row_version bigint not null check (completion_row_version >= 0),
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  candidate_id text not null check (btrim(candidate_id) <> ''),
  candidate_set jsonb not null check (jsonb_typeof(candidate_set) = 'array'),
  artifact_text text not null check (btrim(artifact_text) <> ''),
  attestation jsonb not null check (
    jsonb_typeof(attestation) = 'object'
    and attestation ->> 'status' = 'passed'
  ),
  attempt_identity jsonb not null default '{}'::jsonb check (
    jsonb_typeof(attempt_identity) = 'object'
  ),
  frozen_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  release_reason text,
  revision_ref text,
  primary key (goal_id, completion_row_version),
  constraint goal_quality_artifact_freezes_release_shape check (
    (released_at is null and release_reason is null and revision_ref is null)
    or (
      released_at is not null
      and nullif(btrim(release_reason), '') is not null
      and nullif(btrim(revision_ref), '') is not null
    )
  )
);

create unique index if not exists uq_goal_quality_artifact_freezes_active
  on public.goal_quality_artifact_freezes(goal_id)
  where released_at is null;

alter table public.goal_quality_artifact_freezes enable row level security;
alter table public.goal_quality_artifact_freezes force row level security;

revoke all on table public.goal_quality_artifact_freezes from public;
revoke all on table public.goal_quality_artifact_freezes from anon;
revoke all on table public.goal_quality_artifact_freezes from authenticated;
revoke all on table public.goal_quality_artifact_freezes from service_role;
grant select on table public.goal_quality_artifact_freezes to service_role;

create or replace function public.quality_artifact_sha256(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, extensions
as $$
  select encode(digest(replace(value, E'\r\n', E'\n'), 'sha256'), 'hex')
$$;

revoke all on function public.quality_artifact_sha256(text) from public;
grant execute on function public.quality_artifact_sha256(text) to service_role;

-- Existing output-bearing done tasks must not carry an ambiguous or malformed
-- second parent. A blank legacy JSON parent may remain for non-frozen work,
-- but any nonblank parent must be a valid UUID and agree with the typed parent.
do $$
begin
  if exists (
    select 1
      from public.team_tasks as task
     where lower(coalesce(task.status, '')) = 'done'
       and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
       and nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is not null
       and public.try_uuid(task.data ->> 'goal_id') is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Output-bearing done team_tasks contain malformed JSON goal IDs';
  end if;

  if exists (
    select 1
      from public.team_tasks as task
     where lower(coalesce(task.status, '')) = 'done'
       and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
       and task.goal_id is not null
       and public.try_uuid(task.data ->> 'goal_id') is not null
       and task.goal_id is distinct from public.try_uuid(task.data ->> 'goal_id')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Output-bearing done team_tasks contain conflicting typed and JSON goal IDs';
  end if;
end;
$$;

create or replace function public.guard_goal_quality_freeze()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_freeze public.goal_quality_artifact_freezes%rowtype;
  has_active_freeze boolean := false;
  matching_terminal_transition boolean := false;
  protected_change boolean := false;
  protected_data_change boolean := false;
  new_attestation jsonb;
  new_validation jsonb;
  request_role text := nullif(auth.role(), '');
  trusted_writer boolean :=
    coalesce(request_role = 'service_role', false)
    or session_user in ('postgres', 'supabase_admin');
begin
  if tg_op = 'INSERT' then
    new.row_version := 0;
    new.updated_at := coalesce(new.updated_at, clock_timestamp());
    if not trusted_writer
      and (
        new.status = 'pending_validation'
        or new.data ? 'prd_quality_attestation'
        or new.data ? 'prd_quality_validation'
        or new.data ? 'prd_quality_repair'
      )
    then
      raise exception using
        errcode = '42501',
        message = 'Quality validation state may be created only by the trusted backend';
    end if;
    if new.status in ('completed', 'completed_with_warnings')
      and new.data -> 'prd_quality_attestation' ->> 'status' = 'passed'
    then
      raise exception using
        errcode = '55000',
        message = 'Quality-attested goals must be completed by complete_quality_goal_revision';
    end if;
    return new;
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := greatest(
    coalesce(new.updated_at, clock_timestamp()),
    coalesce(old.updated_at, clock_timestamp() - interval '1 microsecond')
      + interval '1 microsecond'
  );

  if not trusted_writer
    and (
      (new.status = 'pending_validation' and old.status is distinct from new.status)
      or (old.data -> 'prd_quality_attestation') is distinct from
        (new.data -> 'prd_quality_attestation')
      or (old.data -> 'prd_quality_validation') is distinct from
        (new.data -> 'prd_quality_validation')
      or (old.data -> 'prd_quality_repair') is distinct from
        (new.data -> 'prd_quality_repair')
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Quality validation state may be changed only by the trusted backend';
  end if;

  select artifact_freeze.*
    into active_freeze
    from public.goal_quality_artifact_freezes as artifact_freeze
   where artifact_freeze.goal_id = old.id
     and artifact_freeze.released_at is null;
  has_active_freeze := found;

  new_attestation := new.data -> 'prd_quality_attestation';
  new_validation := new.data -> 'prd_quality_validation';
  matching_terminal_transition :=
    has_active_freeze
    and old.status = 'pending_validation'
    and new.status in ('completed', 'completed_with_warnings')
    and old.user_id is not distinct from new.user_id
    and old.title is not distinct from new.title
    and old.description is not distinct from new.description
    and old.iteration is not distinct from new.iteration
    and new_attestation ->> 'status' = 'passed'
    and active_freeze.completion_row_version = new.row_version
    and active_freeze.attestation = new_attestation
    and active_freeze.artifact_hash = lower(coalesce(new_attestation ->> 'artifact_hash', ''))
    and active_freeze.scope_hash = lower(coalesce(new_attestation ->> 'scope_hash', ''))
    and active_freeze.candidate_id = coalesce(new_validation ->> 'candidate_id', '')
    and active_freeze.candidate_set = coalesce(new_validation -> 'candidate_set', 'null'::jsonb);

  -- AxWise delivery receipts are operational post-completion bookkeeping, not
  -- artifact/scope state. Only trusted backend writers may change those two
  -- keys without reopening; tenant owners remain unable to spoof receipts.
  protected_data_change := case
    when trusted_writer then
      (old.data - 'axwise_outcome' - 'axwise_outcome_delivery') is distinct from
      (new.data - 'axwise_outcome' - 'axwise_outcome_delivery')
    else old.data is distinct from new.data
  end;

  protected_change :=
    old.user_id is distinct from new.user_id
    or old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.iteration is distinct from new.iteration
    or old.status is distinct from new.status
    or protected_data_change
    or old.plan is distinct from new.plan
    or old.retrospective is distinct from new.retrospective;

  if has_active_freeze and protected_change and not matching_terminal_transition then
    raise exception using
      errcode = '55000',
      message = format(
        'Goal %s has an active quality artifact freeze; use reopen_quality_goal_revision',
        old.id
      );
  end if;

  if new.status in ('completed', 'completed_with_warnings')
    and new_attestation ->> 'status' = 'passed'
    and (
      not has_active_freeze
      or active_freeze.attestation is distinct from new_attestation
      or active_freeze.artifact_hash is distinct from lower(coalesce(new_attestation ->> 'artifact_hash', ''))
      or active_freeze.scope_hash is distinct from lower(coalesce(new_attestation ->> 'scope_hash', ''))
      or active_freeze.candidate_id is distinct from coalesce(new_validation ->> 'candidate_id', '')
      or active_freeze.candidate_set is distinct from coalesce(new_validation -> 'candidate_set', 'null'::jsonb)
    )
  then
    raise exception using
      errcode = '55000',
      message = format('Completed quality goal %s does not match its active artifact freeze', old.id);
  end if;

  if old.status = 'pending_validation'
    and new.status in ('completed', 'completed_with_warnings')
    and not matching_terminal_transition
  then
    raise exception using
      errcode = '55000',
      message = 'pending_validation may reach a successful terminal state only through the atomic quality completion RPC';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_goal_quality_freeze() from public;

drop trigger if exists trg_goals_quality_freeze on public.goals;
create trigger trg_goals_quality_freeze
  before insert or update on public.goals
  for each row
  execute function public.guard_goal_quality_freeze();

create or replace function public.guard_goal_quality_freeze_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.goal_quality_artifact_freezes as artifact_freeze
     where artifact_freeze.goal_id = old.id
       and artifact_freeze.released_at is null
  ) then
    raise exception using
      errcode = '55000',
      message = format(
        'Goal %s has an active quality artifact freeze; explicitly reopen/release it before deletion',
        old.id
      );
  end if;
  return old;
end;
$$;

revoke all on function public.guard_goal_quality_freeze_delete() from public;

drop trigger if exists trg_goals_quality_freeze_delete on public.goals;
create trigger trg_goals_quality_freeze_delete
  before delete on public.goals
  for each row
  execute function public.guard_goal_quality_freeze_delete();

create or replace function public.complete_quality_goal_revision(
  p_goal_id uuid,
  p_user_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_expected_row_version bigint,
  p_expected_data jsonb,
  p_expected_plan jsonb,
  p_completion_data jsonb,
  p_completion_retrospective jsonb,
  p_completion_updated_at timestamptz,
  p_candidate_id text,
  p_candidate_artifact text,
  p_candidate_set jsonb,
  p_attestation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  goal_row public.goals%rowtype;
  completed_goal public.goals%rowtype;
  active_freeze public.goal_quality_artifact_freezes%rowtype;
  candidate_task public.team_tasks%rowtype;
  has_active_freeze boolean := false;
  candidate_match_count integer;
  deliverable_match_count integer;
  candidate_count integer;
  distinct_candidate_count integer;
  artifact_hash_value text;
  scope_hash_value text;
begin
  if not (
    coalesce(auth.role() = 'service_role', false)
    or session_user in ('postgres', 'supabase_admin')
  ) then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;

  select goal.*
    into goal_row
    from public.goals as goal
   where goal.id = p_goal_id
   for update;
  if not found or goal_row.user_id is distinct from p_user_id then
    return jsonb_build_object('status', 'conflict', 'reason', 'goal_not_found_or_owner_changed');
  end if;

  select artifact_freeze.*
    into active_freeze
    from public.goal_quality_artifact_freezes as artifact_freeze
   where artifact_freeze.goal_id = p_goal_id
     and artifact_freeze.released_at is null
   for update;
  has_active_freeze := found;

  artifact_hash_value := lower(coalesce(p_attestation ->> 'artifact_hash', ''));
  scope_hash_value := lower(coalesce(p_attestation ->> 'scope_hash', ''));

  -- An exact duplicate call after a committed/lost response is safe to adopt.
  if goal_row.status in ('completed', 'completed_with_warnings') then
    if has_active_freeze
      and goal_row.data is not distinct from p_completion_data
      and goal_row.retrospective is not distinct from p_completion_retrospective
      and active_freeze.artifact_hash = artifact_hash_value
      and active_freeze.scope_hash = scope_hash_value
      and active_freeze.candidate_id = p_candidate_id
      and active_freeze.candidate_set is not distinct from p_candidate_set
      and active_freeze.artifact_text = p_candidate_artifact
      and active_freeze.attestation is not distinct from p_attestation
    then
      return jsonb_build_object('status', 'already_completed', 'goal', to_jsonb(goal_row));
    end if;
    return jsonb_build_object('status', 'conflict', 'reason', 'completed_revision_differs');
  end if;

  if p_expected_status is distinct from 'pending_validation'
    or goal_row.status is distinct from p_expected_status
    or goal_row.updated_at is distinct from p_expected_updated_at
    or goal_row.row_version is distinct from p_expected_row_version
    or goal_row.data is distinct from p_expected_data
    or goal_row.plan is distinct from p_expected_plan
  then
    return jsonb_build_object('status', 'conflict', 'reason', 'goal_snapshot_changed');
  end if;

  if has_active_freeze then
    raise exception using
      errcode = '55000',
      message = 'A non-terminal quality goal already has an active artifact freeze';
  end if;

  if p_completion_updated_at is null
    or jsonb_typeof(p_completion_data) is distinct from 'object'
    or jsonb_typeof(p_attestation) is distinct from 'object'
    or p_attestation ->> 'version' is distinct from 'prd-quality-attestation-v2'
    or p_attestation ->> 'ruleset_version' is distinct from 'prd-quality-ruleset-v2'
    or p_attestation ->> 'status' is distinct from 'passed'
    or artifact_hash_value !~ '^[0-9a-f]{64}$'
    or scope_hash_value !~ '^[0-9a-f]{64}$'
    or nullif(btrim(coalesce(p_candidate_id, '')), '') is null
    or nullif(btrim(coalesce(p_candidate_artifact, '')), '') is null
    or jsonb_typeof(p_candidate_set) is distinct from 'array'
    or jsonb_array_length(p_candidate_set) = 0
    or jsonb_typeof(p_completion_data -> 'deliverables') is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Invalid quality completion evidence';
  end if;

  if jsonb_array_length(p_completion_data -> 'deliverables') <> 1 then
    raise exception using
      errcode = '23514',
      message = 'Quality completion must expose exactly one user-visible deliverable';
  end if;

  if public.quality_artifact_sha256(p_candidate_artifact) is distinct from artifact_hash_value
    or p_completion_data -> 'prd_quality_attestation' is distinct from p_attestation
    or p_completion_data #>> '{prd_quality_validation,status}' is distinct from 'passed'
    or p_completion_data #>> '{prd_quality_validation,candidate_id}' is distinct from p_candidate_id
    or lower(coalesce(p_completion_data #>> '{prd_quality_validation,artifact_hash}', ''))
      is distinct from artifact_hash_value
    or lower(coalesce(p_completion_data #>> '{prd_quality_validation,scope_hash}', ''))
      is distinct from scope_hash_value
    or p_completion_data #> '{prd_quality_validation,candidate_set}' is distinct from p_candidate_set
  then
    raise exception using errcode = '23514', message = 'Completion payload does not match its attestation';
  end if;

  select count(*)
    into deliverable_match_count
    from jsonb_array_elements(p_completion_data -> 'deliverables') as deliverable
   where jsonb_typeof(deliverable) = 'object'
     and deliverable ->> 'id' = p_candidate_id
     and deliverable ->> 'output' = p_candidate_artifact
     and public.quality_artifact_sha256(deliverable ->> 'output') = artifact_hash_value;
  if deliverable_match_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'User-visible deliverable does not uniquely match the selected attested artifact';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_candidate_set) as item
     where jsonb_typeof(item) is distinct from 'object'
        or nullif(btrim(coalesce(item ->> 'id', '')), '') is null
        or lower(coalesce(item ->> 'artifact_hash', '')) !~ '^[0-9a-f]{64}$'
  ) then
    raise exception using errcode = '22023', message = 'Malformed quality candidate set';
  end if;

  select count(*), count(distinct item ->> 'id')
    into candidate_count, distinct_candidate_count
    from jsonb_array_elements(p_candidate_set) as item;
  if candidate_count is distinct from distinct_candidate_count then
    raise exception using errcode = '23514', message = 'Duplicate quality candidate identities';
  end if;

  select count(*)
    into candidate_match_count
    from jsonb_array_elements(p_candidate_set) as item
   where item ->> 'id' = p_candidate_id
     and lower(item ->> 'artifact_hash') = artifact_hash_value;
  if candidate_match_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'Selected artifact must occur exactly once in the candidate set';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_candidate_set) as item
     where not exists (
       select 1
         from public.team_tasks as task
        where task.id = item ->> 'id'
          and task.goal_id = goal_row.id
          and task.user_id = goal_row.user_id
          and lower(coalesce(task.status, '')) = 'done'
          and (
            nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null
            or public.try_uuid(task.data ->> 'goal_id') = goal_row.id
          )
          and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
          and public.quality_artifact_sha256(task.data ->> 'output') =
            lower(item ->> 'artifact_hash')
     )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Candidate set is not an exact tenant-bound set of done artifact rows';
  end if;

  select task.*
    into strict candidate_task
    from public.team_tasks as task
   where task.id = p_candidate_id
     and task.goal_id = goal_row.id
     and task.user_id = goal_row.user_id
     and lower(coalesce(task.status, '')) = 'done'
     and (
       nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null
       or public.try_uuid(task.data ->> 'goal_id') = goal_row.id
     )
     and task.data ->> 'output' = p_candidate_artifact
     and public.quality_artifact_sha256(task.data ->> 'output') = artifact_hash_value;

  insert into public.goal_quality_artifact_freezes (
    goal_id, completion_row_version, artifact_hash, scope_hash,
    candidate_id, candidate_set, artifact_text, attestation,
    attempt_identity, frozen_at
  ) values (
    goal_row.id,
    goal_row.row_version + 1,
    artifact_hash_value,
    scope_hash_value,
    p_candidate_id,
    p_candidate_set,
    p_candidate_artifact,
    p_attestation,
    jsonb_build_object(
      'row_version', goal_row.row_version,
      'retry_count', coalesce(goal_row.data -> 'retry_count', '0'::jsonb),
      'iteration', goal_row.iteration,
      'goal_task_attempt', goal_row.data -> 'goal_task_attempt',
      'axwise_decision_id', goal_row.data #>> '{axwise_orchestration,decision_id}',
      'execution_authorization_hash', coalesce(
        goal_row.data #>> '{execution_authorization,snapshot_hash}',
        goal_row.data #>> '{goal_approvals,execution,snapshot_hash}'
      ),
      'last_feedback_application_version',
        goal_row.data ->> 'last_feedback_application_version'
    ),
    p_completion_updated_at
  );

  update public.goals
     set status = 'completed',
         data = p_completion_data,
         retrospective = p_completion_retrospective,
         updated_at = p_completion_updated_at
   where id = goal_row.id
   returning * into strict completed_goal;

  if completed_goal.row_version <> goal_row.row_version + 1 then
    raise exception using errcode = '40001', message = 'Goal revision did not advance exactly once';
  end if;

  return jsonb_build_object('status', 'completed', 'goal', to_jsonb(completed_goal));
end;
$$;

revoke all on function public.complete_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text, text, jsonb, jsonb
) from public;
revoke all on function public.complete_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text, text, jsonb, jsonb
) from anon;
revoke all on function public.complete_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text, text, jsonb, jsonb
) from authenticated;
grant execute on function public.complete_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text, text, jsonb, jsonb
) to service_role;

-- Protect already-completed passed attestations before enabling mutation
-- guards. Ambiguous legacy evidence aborts for explicit operator review.
do $$
declare
  goal_row public.goals%rowtype;
  task_row public.team_tasks%rowtype;
  existing_freeze public.goal_quality_artifact_freezes%rowtype;
  candidate_id_value text;
  candidate_set_value jsonb;
  attestation_value jsonb;
  artifact_hash_value text;
  scope_hash_value text;
  artifact_text_value text;
  match_count integer;
  selected_count integer;
  candidate_count integer;
  distinct_candidate_count integer;
  deliverable_match_count integer;
begin
  for goal_row in
    select goal.*
      from public.goals as goal
     where goal.status in ('completed', 'completed_with_warnings')
       and goal.data -> 'prd_quality_attestation' ->> 'status' = 'passed'
     order by goal.id
     for update
  loop
    attestation_value := goal_row.data -> 'prd_quality_attestation';
    artifact_hash_value := lower(coalesce(attestation_value ->> 'artifact_hash', ''));
    scope_hash_value := lower(coalesce(attestation_value ->> 'scope_hash', ''));
    if artifact_hash_value !~ '^[0-9a-f]{64}$' or scope_hash_value !~ '^[0-9a-f]{64}$' then
      raise exception using
        errcode = '23514',
        message = format('Completed quality goal %s has invalid attestation hashes', goal_row.id);
    end if;

    candidate_id_value := nullif(
      btrim(
        coalesce(goal_row.data #>> '{prd_quality_validation,candidate_id}', '')
      ),
      ''
    );
    if candidate_id_value is null then
      raise exception using
        errcode = '23514',
        message = format(
          'Completed quality goal %s lacks a durable selected candidate ID',
          goal_row.id
        );
    end if;

    select count(*), max(task.id)
      into match_count, candidate_id_value
      from public.team_tasks as task
     where task.id = candidate_id_value
       and task.goal_id = goal_row.id
       and task.user_id = goal_row.user_id
       and lower(coalesce(task.status, '')) = 'done'
       and (
         nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null
         or public.try_uuid(task.data ->> 'goal_id') = goal_row.id
       )
       and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
       and public.quality_artifact_sha256(task.data ->> 'output') = artifact_hash_value;

    if match_count <> 1 or candidate_id_value is null then
      raise exception using
        errcode = '23514',
        message = format(
          'Completed quality goal %s does not resolve to exactly one tenant-bound attested artifact',
          goal_row.id
        );
    end if;

    select task.*
      into strict task_row
      from public.team_tasks as task
     where task.id = candidate_id_value
       and task.goal_id = goal_row.id
       and task.user_id = goal_row.user_id
       and lower(coalesce(task.status, '')) = 'done'
       and (
         nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null
         or public.try_uuid(task.data ->> 'goal_id') = goal_row.id
       )
       and public.quality_artifact_sha256(task.data ->> 'output') = artifact_hash_value;
    artifact_text_value := task_row.data ->> 'output';

    if jsonb_typeof(goal_row.data -> 'deliverables') is distinct from 'array' then
      raise exception using
        errcode = '23514',
        message = format(
          'Completed quality goal %s lacks durable user-visible deliverables',
          goal_row.id
        );
    end if;

    if jsonb_array_length(goal_row.data -> 'deliverables') <> 1 then
      raise exception using
        errcode = '23514',
        message = format(
          'Completed quality goal %s does not have exactly one durable user-visible deliverable',
          goal_row.id
        );
    end if;

    select count(*)
      into deliverable_match_count
      from jsonb_array_elements(goal_row.data -> 'deliverables') as deliverable
     where jsonb_typeof(deliverable) = 'object'
       and deliverable ->> 'id' = candidate_id_value
       and deliverable ->> 'output' = artifact_text_value
       and public.quality_artifact_sha256(deliverable ->> 'output') = artifact_hash_value;
    if deliverable_match_count <> 1 then
      raise exception using
        errcode = '23514',
        message = format(
          'Completed quality goal %s has no unique user-visible projection of its selected artifact',
          goal_row.id
        );
    end if;

    candidate_set_value := goal_row.data #> '{prd_quality_validation,candidate_set}';
    if jsonb_typeof(candidate_set_value) is distinct from 'array' then
      raise exception using
        errcode = '23514',
        message = format(
          'Completed quality goal %s lacks a durable candidate set',
          goal_row.id
        );
    end if;

    select count(*)
      into selected_count
      from jsonb_array_elements(candidate_set_value) as item
     where item ->> 'id' = candidate_id_value
       and lower(coalesce(item ->> 'artifact_hash', '')) = artifact_hash_value;
    if selected_count <> 1 then
      raise exception using
        errcode = '23514',
        message = format('Completed quality goal %s has an invalid candidate set', goal_row.id);
    end if;

    select count(*), count(distinct item ->> 'id')
      into candidate_count, distinct_candidate_count
      from jsonb_array_elements(candidate_set_value) as item;
    if candidate_count is distinct from distinct_candidate_count then
      raise exception using
        errcode = '23514',
        message = format('Completed quality goal %s has duplicate candidate identities', goal_row.id);
    end if;

    if exists (
      select 1
        from jsonb_array_elements(candidate_set_value) as item
       where jsonb_typeof(item) is distinct from 'object'
          or nullif(btrim(coalesce(item ->> 'id', '')), '') is null
          or lower(coalesce(item ->> 'artifact_hash', '')) !~ '^[0-9a-f]{64}$'
          or not exists (
            select 1
              from public.team_tasks as task
             where task.id = item ->> 'id'
               and task.goal_id = goal_row.id
               and task.user_id = goal_row.user_id
               and lower(coalesce(task.status, '')) = 'done'
               and (
                 nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null
                 or public.try_uuid(task.data ->> 'goal_id') = goal_row.id
               )
               and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
               and public.quality_artifact_sha256(task.data ->> 'output') =
                 lower(item ->> 'artifact_hash')
          )
    ) then
      raise exception using
        errcode = '23514',
        message = format('Completed quality goal %s has a non-verifiable candidate set', goal_row.id);
    end if;

    select artifact_freeze.*
      into existing_freeze
      from public.goal_quality_artifact_freezes as artifact_freeze
     where artifact_freeze.goal_id = goal_row.id
       and artifact_freeze.released_at is null;
    if found then
      if existing_freeze.artifact_hash is distinct from artifact_hash_value
        or existing_freeze.scope_hash is distinct from scope_hash_value
        or existing_freeze.candidate_id is distinct from candidate_id_value
        or existing_freeze.candidate_set is distinct from candidate_set_value
        or existing_freeze.artifact_text is distinct from artifact_text_value
        or existing_freeze.attestation is distinct from attestation_value
      then
        raise exception using
          errcode = '23514',
          message = format('Existing quality freeze for goal %s disagrees with durable evidence', goal_row.id);
      end if;
      continue;
    end if;

    insert into public.goal_quality_artifact_freezes (
      goal_id, completion_row_version, artifact_hash, scope_hash,
      candidate_id, candidate_set, artifact_text, attestation,
      attempt_identity, frozen_at
    ) values (
      goal_row.id,
      goal_row.row_version,
      artifact_hash_value,
      scope_hash_value,
      candidate_id_value,
      candidate_set_value,
      artifact_text_value,
      attestation_value,
      jsonb_build_object(
        'row_version', goal_row.row_version,
        'retry_count', coalesce(goal_row.data -> 'retry_count', '0'::jsonb),
        'iteration', goal_row.iteration,
        'goal_task_attempt', goal_row.data -> 'goal_task_attempt',
        'axwise_decision_id', goal_row.data #>> '{axwise_orchestration,decision_id}',
        'execution_authorization_hash', coalesce(
          goal_row.data #>> '{execution_authorization,snapshot_hash}',
          goal_row.data #>> '{goal_approvals,execution,snapshot_hash}'
        ),
        'last_feedback_application_version',
          goal_row.data ->> 'last_feedback_application_version',
        'source', 'migration_221_backfill'
      ),
      goal_row.updated_at
    );
  end loop;
end;
$$;

create or replace function public.reopen_quality_goal_revision(
  p_goal_id uuid,
  p_user_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_expected_row_version bigint,
  p_expected_data jsonb,
  p_expected_plan jsonb,
  p_next_data jsonb,
  p_next_plan jsonb,
  p_next_updated_at timestamptz,
  p_revision_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  goal_row public.goals%rowtype;
  reopened_goal public.goals%rowtype;
  active_freeze public.goal_quality_artifact_freezes%rowtype;
  has_active_freeze boolean := false;
  released_match_count integer := 0;
  sanitized_next_data jsonb;
begin
  if not (
    coalesce(auth.role() = 'service_role', false)
    or session_user in ('postgres', 'supabase_admin')
  ) then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;
  if nullif(btrim(coalesce(p_revision_ref, '')), '') is null
    or p_next_updated_at is null
    or jsonb_typeof(p_next_data) is distinct from 'object'
    or jsonb_typeof(p_next_plan) is distinct from 'object'
  then
    raise exception using errcode = '22023', message = 'Invalid quality revision reopen payload';
  end if;

  sanitized_next_data := coalesce(p_next_data, '{}'::jsonb)
    - 'completed_at'
    - 'prd_quality_attestation'
    - 'prd_quality_validation'
    - 'prd_quality_repair';
  if sanitized_next_data ->> 'last_feedback_application_version' is distinct from p_revision_ref then
    raise exception using
      errcode = '23514',
      message = 'Reopened quality goal must carry the exact feedback revision marker';
  end if;

  select goal.*
    into goal_row
    from public.goals as goal
   where goal.id = p_goal_id
   for update;
  if not found or goal_row.user_id is distinct from p_user_id then
    return jsonb_build_object('status', 'conflict', 'reason', 'goal_not_found_or_owner_changed');
  end if;

  select artifact_freeze.*
    into active_freeze
    from public.goal_quality_artifact_freezes as artifact_freeze
   where artifact_freeze.goal_id = p_goal_id
     and artifact_freeze.released_at is null
   for update;
  has_active_freeze := found;

  if not has_active_freeze then
    select count(*)
      into released_match_count
      from public.goal_quality_artifact_freezes as artifact_freeze
     where artifact_freeze.goal_id = p_goal_id
       and artifact_freeze.released_at is not null
       and artifact_freeze.release_reason = 'feedback_revision'
       and artifact_freeze.revision_ref = p_revision_ref;
    if goal_row.status = 'active'
      and released_match_count = 1
      and goal_row.data is not distinct from sanitized_next_data
      and goal_row.plan is not distinct from p_next_plan
      and goal_row.data ->> 'last_feedback_application_version' = p_revision_ref
    then
      return jsonb_build_object('status', 'already_reopened', 'goal', to_jsonb(goal_row));
    end if;
    if goal_row.data -> 'prd_quality_attestation' ->> 'status' = 'passed' then
      raise exception using
        errcode = '55000',
        message = 'Passed quality attestation has no active durable freeze';
    end if;
    return jsonb_build_object('status', 'not_frozen', 'reason', 'legacy_goal_without_freeze');
  end if;

  if p_expected_status not in ('completed', 'completed_with_warnings')
    or goal_row.status is distinct from p_expected_status
    or goal_row.updated_at is distinct from p_expected_updated_at
    or goal_row.row_version is distinct from p_expected_row_version
    or goal_row.data is distinct from p_expected_data
    or goal_row.plan is distinct from p_expected_plan
  then
    return jsonb_build_object('status', 'conflict', 'reason', 'goal_snapshot_changed');
  end if;

  if goal_row.data -> 'prd_quality_attestation' is distinct from active_freeze.attestation
    or lower(coalesce(goal_row.data #>> '{prd_quality_attestation,artifact_hash}', ''))
      is distinct from active_freeze.artifact_hash
    or lower(coalesce(goal_row.data #>> '{prd_quality_attestation,scope_hash}', ''))
      is distinct from active_freeze.scope_hash
  then
    raise exception using
      errcode = '55000',
      message = 'Completed goal no longer matches its active quality freeze';
  end if;

  update public.goal_quality_artifact_freezes
     set released_at = clock_timestamp(),
         release_reason = 'feedback_revision',
         revision_ref = p_revision_ref
   where goal_id = goal_row.id
     and completion_row_version = active_freeze.completion_row_version
     and released_at is null;
  if not found then
    raise exception using errcode = '40001', message = 'Quality freeze changed during reopen';
  end if;

  update public.goals
     set status = 'active',
         data = sanitized_next_data,
         plan = p_next_plan,
         updated_at = p_next_updated_at
   where id = goal_row.id
   returning * into strict reopened_goal;

  if reopened_goal.row_version <> goal_row.row_version + 1 then
    raise exception using errcode = '40001', message = 'Goal revision did not advance exactly once';
  end if;

  return jsonb_build_object('status', 'reopened', 'goal', to_jsonb(reopened_goal));
end;
$$;

revoke all on function public.reopen_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text
) from public;
revoke all on function public.reopen_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text
) from anon;
revoke all on function public.reopen_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text
) from authenticated;
grant execute on function public.reopen_quality_goal_revision(
  uuid, uuid, text, timestamptz, bigint, jsonb, jsonb, jsonb, jsonb,
  timestamptz, text
) to service_role;

create or replace function public.guard_quality_completion_team_task_artifact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_typed_goal_id uuid;
  old_data_goal_id uuid;
  old_goal_id uuid;
  new_typed_goal_id uuid;
  new_data_goal_id uuid;
  new_goal_id uuid;
  old_json_goal_text text;
  new_json_goal_text text;
  old_done_artifact boolean := false;
  new_done_artifact boolean := false;
  artifact_mutation boolean := false;
  target_goal_id uuid;
  target_status text;
  target_user_id uuid;
  target_frozen boolean := false;
  request_role text := nullif(auth.role(), '');
  request_user_id uuid := auth.uid();
  trusted_writer boolean :=
    coalesce(request_role = 'service_role', false)
    or session_user in ('postgres', 'supabase_admin');
begin
  if tg_op <> 'INSERT' then
    old_typed_goal_id := old.goal_id;
    old_json_goal_text := nullif(btrim(coalesce(old.data ->> 'goal_id', '')), '');
    old_data_goal_id := public.try_uuid(old_json_goal_text);
    old_goal_id := coalesce(old_typed_goal_id, old_data_goal_id);
    old_done_artifact :=
      lower(coalesce(old.status, '')) = 'done'
      and nullif(btrim(coalesce(old.data ->> 'output', '')), '') is not null;
  end if;

  if tg_op <> 'DELETE' then
    new_typed_goal_id := new.goal_id;
    new_json_goal_text := nullif(btrim(coalesce(new.data ->> 'goal_id', '')), '');
    new_data_goal_id := public.try_uuid(new_json_goal_text);
    new_goal_id := coalesce(new_typed_goal_id, new_data_goal_id);
    new_done_artifact :=
      lower(coalesce(new.status, '')) = 'done'
      and nullif(btrim(coalesce(new.data ->> 'output', '')), '') is not null;
  end if;

  if (old_done_artifact and old_json_goal_text is not null and old_data_goal_id is null)
    or (new_done_artifact and new_json_goal_text is not null and new_data_goal_id is null)
  then
    raise exception using errcode = '23514', message = 'Artifact task has a malformed JSON parent goal ID';
  end if;

  if (
    old_done_artifact
    and old_typed_goal_id is not null
    and old_data_goal_id is not null
    and old_typed_goal_id is distinct from old_data_goal_id
  ) or (
    new_done_artifact
    and new_typed_goal_id is not null
    and new_data_goal_id is not null
    and new_typed_goal_id is distinct from new_data_goal_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Artifact task has conflicting typed and JSON parent goal IDs';
  end if;

  if tg_op = 'INSERT' then
    artifact_mutation := new_done_artifact;
  elsif tg_op = 'DELETE' then
    artifact_mutation := old_done_artifact;
  else
    artifact_mutation :=
      (old_done_artifact or new_done_artifact)
      and (
        old.status is distinct from new.status
        or (old.data ->> 'output') is distinct from (new.data ->> 'output')
        or old.user_id is distinct from new.user_id
        or old_goal_id is distinct from new_goal_id
        or (old.data ->> 'goal_id') is distinct from (new.data ->> 'goal_id')
        or old.id is distinct from new.id
        or old.title is distinct from new.title
        or (old.data ->> 'deliverable_type') is distinct from (new.data ->> 'deliverable_type')
        or (old.data ->> 'phase_index') is distinct from (new.data ->> 'phase_index')
        or (old.data ->> 'goal_retry_count') is distinct from (new.data ->> 'goal_retry_count')
        or (old.data ->> 'axwise_decision_id') is distinct from (new.data ->> 'axwise_decision_id')
        or (old.data #>> '{axwise_execution_context,decision_id}')
          is distinct from (new.data #>> '{axwise_execution_context,decision_id}')
      );
  end if;

  if not artifact_mutation then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Lock both parents in UUID order when an artifact is moved. Completion and
  -- reopen always acquire the goal before inspecting task/freeze rows.
  for target_goal_id in
    select distinct parent_id
      from (values (old_goal_id), (new_goal_id)) as parents(parent_id)
     where parent_id is not null
     order by parent_id
  loop
    target_status := null;
    target_user_id := null;
    select goal.status, goal.user_id
      into target_status, target_user_id
      from public.goals as goal
     where goal.id = target_goal_id
     for update;
    if not found then continue; end if;

    if tg_op <> 'DELETE'
      and new_done_artifact
      and new_goal_id is not distinct from target_goal_id
      and new.user_id is distinct from target_user_id
    then
      raise exception using
        errcode = '23514',
        message = 'Artifact task tenant must match its parent goal tenant';
    end if;

    if not trusted_writer
      and (
        request_role is distinct from 'authenticated'
        or request_user_id is distinct from target_user_id
      )
    then
      raise exception using
        errcode = '42501',
        message = 'Artifact task parent goal is outside the authenticated tenant';
    end if;

    select exists (
      select 1
        from public.goal_quality_artifact_freezes as artifact_freeze
       where artifact_freeze.goal_id = target_goal_id
         and artifact_freeze.released_at is null
    ) into target_frozen;
    if target_frozen then
      raise exception using
        errcode = '55000',
        message = format(
          'Cannot mutate frozen artifact task %s for goal %s',
          coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, '<unknown>'),
          target_goal_id
        );
    end if;

    if target_status in ('active', 'pending_validation') then
      update public.goals set updated_at = updated_at where id = target_goal_id;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.guard_quality_completion_team_task_artifact() from public;

drop trigger if exists trg_team_tasks_quality_completion_artifact_guard on public.team_tasks;
drop trigger if exists trg_team_tasks_zz_quality_completion_artifact_guard on public.team_tasks;
create trigger trg_team_tasks_zz_quality_completion_artifact_guard
  before insert or delete or update of id, title, status, data, goal_id, user_id
  on public.team_tasks
  for each row
  execute function public.guard_quality_completion_team_task_artifact();

commit;
