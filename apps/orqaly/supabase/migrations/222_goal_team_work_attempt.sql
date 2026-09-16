-- Atomically materialize the work manifest owned by one exact team-formation
-- attempt.  The goal row is the transaction boundary: a retry, cancellation,
-- scope revision, or second worker can never publish jobs/tasks after losing
-- ownership of the forming_team state.

begin;

create or replace function public.materialize_goal_team_work(
  p_goal_id uuid,
  p_user_id uuid,
  p_formation_attempt text,
  p_native_scope_hash text,
  p_research_run_id uuid,
  p_research_attempt_key text,
  p_jobs jsonb,
  p_tasks jsonb,
  p_assignments jsonb,
  p_team jsonb default null,
  p_member_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  goal_row public.goals%rowtype;
  common_attempt jsonb;
  native_attempt jsonb;
  planning_attempt jsonb;
  completed_attempt jsonb;
  next_goal_data jsonb;
  research_result jsonb := null;
  research_mode boolean := false;
  inserted_jobs integer := 0;
  inserted_tasks integer := 0;
  inserted_assignments integer := 0;
  retired_jobs integer := 0;
  retired_tasks integer := 0;
  updated_goals integer := 0;
  expected_final_status text;
  completed_at_value timestamptz;
  team_requested boolean := false;
  requested_team_id uuid := null;
  materialized_team_id uuid := null;
  existing_team public.agent_teams%rowtype;
  verified_members integer := 0;
begin
  if p_goal_id is null
     or p_user_id is null
     or nullif(btrim(p_formation_attempt), '') is null then
    raise exception using
      message = 'team_work_materialization_scope_required',
      errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_jobs, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_tasks, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_assignments, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_member_ids, 'null'::jsonb)) <> 'array' then
    raise exception using
      message = 'team_work_materialization_arrays_required',
      errcode = '22023';
  end if;
  if jsonb_array_length(p_jobs) < 1
     or jsonb_array_length(p_jobs) > 100
     or jsonb_array_length(p_tasks) <> jsonb_array_length(p_jobs) then
    raise exception using
      message = 'team_work_materialization_counts_invalid',
      errcode = '22023';
  end if;

  research_mode := p_research_run_id is not null
    or p_research_attempt_key is not null;
  if research_mode and (
    p_research_run_id is null
    or p_research_attempt_key is null
    or p_research_attempt_key !~ '^[0-9a-f]{64}$'
    or jsonb_array_length(p_assignments) < 1
    or jsonb_array_length(p_assignments) > 100
  ) then
    raise exception using
      message = 'team_work_research_binding_invalid',
      errcode = '22023';
  end if;
  if not research_mode and jsonb_array_length(p_assignments) <> 0 then
    raise exception using
      message = 'team_work_nonresearch_assignments_forbidden',
      errcode = '22023';
  end if;
  if p_native_scope_hash is not null
     and p_native_scope_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      message = 'team_work_native_scope_hash_invalid',
      errcode = '22023';
  end if;

  team_requested := p_team is not null and jsonb_typeof(p_team) = 'object';
  if p_team is not null and not team_requested then
    raise exception using
      message = 'team_work_team_contract_invalid',
      errcode = '22023';
  end if;
  if not team_requested and jsonb_array_length(p_member_ids) <> 0 then
    raise exception using
      message = 'team_work_members_without_team_forbidden',
      errcode = '22023';
  end if;
  if team_requested then
    if jsonb_array_length(p_member_ids) < 1
       or jsonb_array_length(p_member_ids) > 9
       or nullif(btrim(p_team ->> 'name'), '') is null
       or nullif(p_team ->> 'leader_id', '') is null
       or (p_team ? 'goal_id' and p_team ->> 'goal_id' is distinct from p_goal_id::text)
       or (p_team ? 'user_id' and p_team ->> 'user_id' is distinct from p_user_id::text) then
      raise exception using
        message = 'team_work_team_contract_invalid',
        errcode = '22023';
    end if;
    if p_team ->> 'leader_id'
         !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (
         select 1
           from jsonb_array_elements(p_member_ids) item
          where jsonb_typeof(item) <> 'string'
             or item #>> '{}'
               !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       )
       or (select count(distinct item #>> '{}') from jsonb_array_elements(p_member_ids) item)
         <> jsonb_array_length(p_member_ids)
       or not exists (
         select 1
           from jsonb_array_elements(p_member_ids) item
          where item #>> '{}' = p_team ->> 'leader_id'
       ) then
      raise exception using
        message = 'team_work_team_members_invalid',
        errcode = '22023';
    end if;
    if nullif(p_team ->> 'id', '') is not null then
      if p_team ->> 'id'
           !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using
          message = 'team_work_team_id_invalid',
          errcode = '22023';
      end if;
      requested_team_id := (p_team ->> 'id')::uuid;
    end if;
  end if;

  -- Serialize every team-work publisher for this goal, including the existing
  -- research materializer (which takes the same transaction-scoped lock).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_goal_id::text, 0)
  );

  select goal.*
    into goal_row
    from public.goals as goal
   where goal.id = p_goal_id
   for update;
  if not found or goal_row.user_id is distinct from p_user_id then
    raise exception using
      message = 'team_work_materialization_goal_not_owned',
      errcode = '42501';
  end if;
  if goal_row.status is distinct from 'forming_team' then
    raise exception using
      message = 'team_work_materialization_goal_not_forming_team',
      errcode = '55000';
  end if;

  common_attempt := goal_row.data -> 'team_formation_attempt';
  if coalesce(jsonb_typeof(common_attempt), '') <> 'object'
     or common_attempt ->> 'version' is distinct from 'orqaly_team_formation_attempt_v1'
     or common_attempt ->> 'attempt_id' is distinct from p_formation_attempt
     or common_attempt ->> 'status' is distinct from 'materializing' then
    raise exception using
      message = 'team_work_formation_attempt_not_owned',
      errcode = '55000';
  end if;

  native_attempt := goal_row.data -> 'native_team_formation_attempt';
  planning_attempt := goal_row.data -> 'native_planning_attempt';
  -- A caller may not omit p_native_scope_hash to weaken an already-native row
  -- into the legacy materialization branch.
  if p_native_scope_hash is null and (
    native_attempt is not null
    or goal_row.data #> '{axwise_customer_intelligence,scope_packet}' is not null
    or goal_row.data #>> '{scope_admission,native_scope}' = 'true'
  ) then
    raise exception using
      message = 'team_work_native_scope_hash_required',
      errcode = '42501';
  end if;

  if p_native_scope_hash is not null then
    if coalesce(jsonb_typeof(planning_attempt), '') <> 'object'
       or planning_attempt ->> 'version' is distinct from 'orqaly_native_planning_attempt_v1'
       or planning_attempt ->> 'status' is distinct from 'completed'
       or nullif(planning_attempt ->> 'attempt_id', '') is null
       or planning_attempt ->> 'scope_hash' is distinct from p_native_scope_hash
       or coalesce(planning_attempt ->> 'plan_hash', '') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(planning_attempt -> 'plan_snapshot') is distinct from 'object'
       or goal_row.plan is distinct from planning_attempt -> 'plan_snapshot'
       or common_attempt ->> 'planning_attempt_id'
         is distinct from planning_attempt ->> 'attempt_id'
       or common_attempt ->> 'plan_hash' is distinct from planning_attempt ->> 'plan_hash' then
      raise exception using
        message = 'team_work_native_planning_attempt_not_owned',
        errcode = '55000';
    end if;
    if coalesce(jsonb_typeof(native_attempt), '') <> 'object'
       or native_attempt is distinct from common_attempt
       or native_attempt ->> 'version' is distinct from 'orqaly_team_formation_attempt_v1'
       or native_attempt ->> 'attempt_id' is distinct from p_formation_attempt
       or native_attempt ->> 'status' is distinct from 'materializing'
       or native_attempt ->> 'scope_hash' is distinct from p_native_scope_hash then
      raise exception using
        message = 'team_work_native_formation_attempt_not_owned',
        errcode = '55000';
    end if;

    -- Re-prove the complete native Gate-1 identity under the row lock.  The
    -- approved snapshot's native identity must still describe the live packet,
    -- validation, and confirmation; a stale approval cannot publish work.
    if goal_row.data #>> '{axwise_customer_intelligence,scope_packet,version}'
         is distinct from 'axwise_scope_packet_v1'
       or goal_row.data #>> '{axwise_customer_intelligence,scope_packet,scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{axwise_customer_intelligence,scope_validation,version}'
         is distinct from 'axwise_scope_validation_v1'
       or goal_row.data #>> '{axwise_customer_intelligence,scope_validation,scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{axwise_customer_intelligence,scope_validation,valid}'
         is distinct from 'true'
       or goal_row.data #>> '{axwise_customer_intelligence,scope_validation,ready_for_synthesis}'
         is distinct from 'true'
       or goal_row.data #>> '{axwise_customer_intelligence,axwise_scope_confirmation,scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{axwise_customer_intelligence,axwise_scope_confirmation,status}'
         is distinct from 'proceed_or_edit'
       or goal_row.data #>> '{axwise_customer_intelligence,axwise_scope_confirmation,primary_action}'
         is distinct from 'proceed'
       or coalesce(
         (goal_row.data #>> '{axwise_customer_intelligence,axwise_scope_confirmation,authorizes_external_actions}')::boolean,
         false
       ) is distinct from false then
      raise exception using
        message = 'team_work_native_scope_not_canonical',
        errcode = '42501';
    end if;

    if goal_row.data #>> '{scope_admission,native_scope}' is distinct from 'true'
       or goal_row.data #>> '{scope_admission,status}' is distinct from 'accepted'
       or goal_row.data #>> '{scope_admission,state_key}'
         is distinct from 'axwise_customer_intelligence'
       or goal_row.data #>> '{scope_admission,scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{scope_admission,grants_authorization}'
         is distinct from 'false'
       or goal_row.data #>> '{work_shape_route,scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{work_shape_route,authoritative_scope}'
         is distinct from 'true'
       or goal_row.data #>> '{work_shape_route,playbook_id}'
         is distinct from goal_row.data #>> '{scope_admission,playbook_id}'
       or goal_row.data #>> '{work_shape_route,version}'
         is distinct from goal_row.data #>> '{scope_admission,route_version}' then
      raise exception using
        message = 'team_work_native_scope_admission_stale',
        errcode = '42501';
    end if;

    if goal_row.data #>> '{goal_approvals,context,version}'
         is distinct from 'orqaly_goal_approval_v1'
       or goal_row.data #>> '{goal_approvals,context,kind}' is distinct from 'context'
       or goal_row.data #>> '{goal_approvals,context,status}' is distinct from 'approved'
       or coalesce(goal_row.data #>> '{goal_approvals,context,snapshot_hash}', '')
         !~ '^[0-9a-f]{64}$'
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,packet_version}'
         is distinct from 'axwise_scope_packet_v1'
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,generation}'
         is distinct from goal_row.data #>> '{axwise_customer_intelligence,generation}'
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,scope_updated_at}'
         is distinct from goal_row.data #>> '{axwise_customer_intelligence,updated_at}'
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,validation_scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,validation_valid}'
         is distinct from 'true'
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,validation_ready_for_synthesis}'
         is distinct from 'true'
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,confirmation_scope_hash}'
         is distinct from p_native_scope_hash
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,confirmation_status}'
         is distinct from 'proceed_or_edit'
       or goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,confirmation_primary_action}'
         is distinct from 'proceed'
       or coalesce(
         (goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,confirmation_authorizes_external_actions}')::boolean,
         false
       ) is distinct from false then
      raise exception using
        message = 'team_work_native_context_approval_stale',
        errcode = '42501';
    end if;
  end if;

  -- The complete manifest must be tenant/goal/attempt bound before any old
  -- work is retired.  Every planned task maps to exactly one supplied job and
  -- the same authorized agent; every supplied job has exactly one task.
  if (select count(distinct item ->> 'id') from jsonb_array_elements(p_jobs) item)
       <> jsonb_array_length(p_jobs)
     or (select count(distinct item ->> 'id') from jsonb_array_elements(p_tasks) item)
       <> jsonb_array_length(p_tasks) then
    raise exception using
      message = 'team_work_materialization_ids_not_unique',
      errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_jobs) item
     where nullif(item ->> 'id', '') is null
       or item ->> 'goal_id' is distinct from p_goal_id::text
       or item ->> 'user_id' is distinct from p_user_id::text
       or item ->> 'materialization_attempt' is distinct from p_formation_attempt
       or item ->> 'status' is distinct from 'active'
       or nullif(item ->> 'assigned_agent_id', '') is null
  ) then
    raise exception using
      message = 'team_work_materialization_job_scope_invalid',
      errcode = '42501';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_tasks) item
     where nullif(item ->> 'id', '') is null
       or nullif(item ->> 'job_pool_id', '') is null
       or item ->> 'goal_id' is distinct from p_goal_id::text
       or item #>> '{data,goal_id}' is distinct from p_goal_id::text
       or item #>> '{data,materialization_attempt}'
         is distinct from coalesce(p_research_attempt_key, p_formation_attempt)
       or item ->> 'user_id' is distinct from p_user_id::text
       or item ->> 'materialization_attempt' is distinct from p_formation_attempt
       or item ->> 'status' is distinct from 'planned'
       or nullif(item ->> 'agent_id', '') is null
  ) then
    raise exception using
      message = 'team_work_materialization_task_scope_invalid',
      errcode = '42501';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_tasks) task
     where (
       select count(*)
         from jsonb_array_elements(p_jobs) job
        where job ->> 'id' = task ->> 'job_pool_id'
          and job ->> 'assigned_agent_id' is not distinct from task ->> 'agent_id'
     ) <> 1
  ) or exists (
    select 1
      from jsonb_array_elements(p_jobs) job
     where (
       select count(*)
         from jsonb_array_elements(p_tasks) task
        where task ->> 'job_pool_id' = job ->> 'id'
          and task ->> 'agent_id' is not distinct from job ->> 'assigned_agent_id'
     ) <> 1
  ) then
    raise exception using
      message = 'team_work_materialization_task_job_binding_invalid',
      errcode = '22023';
  end if;

  if team_requested then
    select count(*)
      into verified_members
      from public.agents as agent
     where agent.user_id = p_user_id
       and agent.status = 'active'
       and agent.id::text in (
         select item #>> '{}' from jsonb_array_elements(p_member_ids) item
       );
    if verified_members <> jsonb_array_length(p_member_ids) then
      raise exception using
        message = 'team_work_team_contains_unauthorized_agent',
        errcode = '42501';
    end if;

    if goal_row.org_id is not null then
      if not exists (
        select 1
          from public.organizations as organization
         where organization.id = goal_row.org_id
           and organization.user_id = p_user_id
           and organization.is_active = true
      ) then
        raise exception using
          message = 'team_work_organization_not_owned',
          errcode = '42501';
      end if;
      select count(*)
        into verified_members
        from public.org_agents as membership
       where membership.org_id = goal_row.org_id
         and membership.user_id = p_user_id
         and membership.agent_id in (
           select item #>> '{}' from jsonb_array_elements(p_member_ids) item
         );
      if verified_members <> jsonb_array_length(p_member_ids) then
        raise exception using
          message = 'team_work_team_contains_out_of_org_agent',
          errcode = '42501';
      end if;
    end if;

    select team.*
      into existing_team
      from public.agent_teams as team
     where team.goal_id = p_goal_id
       and team.user_id = p_user_id
       and team.is_active = true
     for update;
    if found then
      if requested_team_id is not null and requested_team_id <> existing_team.id then
        raise exception using
          message = 'team_work_goal_team_identity_conflict',
          errcode = '23514';
      end if;
      materialized_team_id := existing_team.id;
      update public.agent_teams
         set name = btrim(p_team ->> 'name'),
             description = coalesce(p_team ->> 'description', ''),
             leader_id = (p_team ->> 'leader_id')::uuid,
             updated_at = pg_catalog.clock_timestamp()
       where id = materialized_team_id
         and user_id = p_user_id
         and goal_id = p_goal_id
         and is_active = true;
    elsif requested_team_id is not null then
      insert into public.agent_teams (
        id, user_id, name, description, leader_id, goal_id, is_active
      ) values (
        requested_team_id,
        p_user_id,
        btrim(p_team ->> 'name'),
        coalesce(p_team ->> 'description', ''),
        (p_team ->> 'leader_id')::uuid,
        p_goal_id,
        true
      )
      returning id into materialized_team_id;
    else
      insert into public.agent_teams (
        user_id, name, description, leader_id, goal_id, is_active
      ) values (
        p_user_id,
        btrim(p_team ->> 'name'),
        coalesce(p_team ->> 'description', ''),
        (p_team ->> 'leader_id')::uuid,
        p_goal_id,
        true
      )
      returning id into materialized_team_id;
    end if;

    if exists (
      select 1
        from public.agent_team_members as membership
       where membership.team_id = materialized_team_id
         and membership.user_id <> p_user_id
    ) then
      raise exception using
        message = 'team_work_goal_team_membership_tenant_conflict',
        errcode = '23514';
    end if;
    delete from public.agent_team_members
     where team_id = materialized_team_id
       and user_id = p_user_id;
    insert into public.agent_team_members (team_id, member_id, user_id, role)
    select
      materialized_team_id,
      (item #>> '{}')::uuid,
      p_user_id,
      case when item #>> '{}' = p_team ->> 'leader_id' then 'leader' else 'member' end
      from jsonb_array_elements(p_member_ids) item;
    get diagnostics verified_members = row_count;
    if verified_members <> jsonb_array_length(p_member_ids) then
      raise exception using
        message = 'team_work_goal_team_member_count_mismatch',
        errcode = '23514';
    end if;

  else
    -- Explicit/preassigned teams are selected and persisted before this stage.
    -- With no replacement contract, leave membership immutable and merely
    -- verify any selected workforce team is active and tenant-owned.
    materialized_team_id := goal_row.agent_team_id;
    if materialized_team_id is not null and not exists (
      select 1
        from public.agent_teams as team
       where team.id = materialized_team_id
         and team.user_id = p_user_id
         and team.is_active = true
    ) then
      raise exception using
        message = 'team_work_preassigned_team_not_owned',
        errcode = '42501';
    end if;
    if materialized_team_id is not null and (
      not exists (
        select 1
          from public.agent_team_members as membership
         where membership.team_id = materialized_team_id
           and membership.user_id = p_user_id
      )
      or exists (
        select 1
          from public.agent_team_members as membership
          left join public.agents as agent
            on agent.id = membership.member_id
         where membership.team_id = materialized_team_id
           and (
             membership.user_id is distinct from p_user_id
             or agent.id is null
             or agent.user_id is distinct from p_user_id
             or agent.status is distinct from 'active'
             or (
               goal_row.org_id is not null
               and not exists (
                 select 1
                   from public.org_agents as organization_agent
                  where organization_agent.org_id = goal_row.org_id
                    and organization_agent.user_id = p_user_id
                    and organization_agent.agent_id = membership.member_id::text
               )
             )
           )
      )
    ) then
      raise exception using
        message = 'team_work_preassigned_team_roster_not_authorized',
        errcode = '42501';
    end if;
  end if;

  -- Every runnable row must belong to the exact team committed above. Merely
  -- proving that an agent exists in the tenant is insufficient: a stale or
  -- poisoned manifest must not smuggle a different executor past Gate 2.
  if materialized_team_id is null then
    raise exception using
      message = 'team_work_materialized_team_required',
      errcode = '42501';
  end if;

  -- Organization visibility is part of the same publication boundary as the
  -- roster and work manifest. Apply it to both newly proposed and explicitly
  -- preassigned Agent Hub teams so a committed execution can never be absent
  -- from the organization's Teams view after a worker crash.
  if goal_row.org_id is not null then
    if exists (
      select 1
        from public.org_teams as organization_team
       where organization_team.org_id = goal_row.org_id
         and organization_team.team_id = materialized_team_id::text
         and organization_team.user_id <> p_user_id
    ) then
      raise exception using
        message = 'team_work_goal_team_organization_tenant_conflict',
        errcode = '23514';
    end if;
    insert into public.org_teams (user_id, org_id, team_id)
    values (p_user_id, goal_row.org_id, materialized_team_id::text)
    on conflict (org_id, team_id) do nothing;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_jobs) item
     where not exists (
       select 1
         from public.agent_team_members as membership
         join public.agents as agent
           on agent.id = membership.member_id
        where membership.team_id = materialized_team_id
          and membership.user_id = p_user_id
          and membership.member_id::text = item ->> 'assigned_agent_id'
          and agent.user_id = p_user_id
          and agent.status = 'active'
          and (
            goal_row.org_id is null
            or exists (
              select 1
                from public.org_agents as organization_agent
               where organization_agent.org_id = goal_row.org_id
                 and organization_agent.user_id = p_user_id
                 and organization_agent.agent_id::text = membership.member_id::text
            )
          )
     )
  ) then
    raise exception using
      message = 'team_work_manifest_agent_not_in_materialized_team',
      errcode = '42501';
  end if;

  if research_mode then
    -- A function call participates in this same PostgreSQL transaction.  The
    -- delegated routine may update the goal to provisioning_tools, but neither
    -- its rows nor that state can commit unless the formation attempt below is
    -- completed successfully too.
    research_result := public.materialize_goal_research_work(
      p_goal_id,
      p_user_id,
      p_research_run_id,
      p_research_attempt_key,
      p_jobs,
      p_tasks,
      p_assignments
    );
    if coalesce(jsonb_typeof(research_result), '') <> 'object'
       or coalesce(research_result ->> 'reused', '') not in ('true', 'false')
       or coalesce(research_result ->> 'stale', 'false') not in ('true', 'false') then
      raise exception using
        message = 'team_work_research_materialization_result_invalid',
        errcode = '23514';
    end if;
    if research_result ->> 'stale' = 'true' then
      raise exception using
        message = 'team_work_research_materialization_stale',
        errcode = '55000';
    end if;
    if research_result ->> 'attempt_key' is distinct from p_research_attempt_key then
      raise exception using
        message = 'team_work_research_materialization_attempt_mismatch',
        errcode = '23514';
    end if;
    inserted_jobs := coalesce((research_result ->> 'job_count')::integer, 0);
    inserted_tasks := coalesce((research_result ->> 'task_count')::integer, 0);
    inserted_assignments := coalesce((research_result ->> 'assignment_count')::integer, 0);
    if inserted_jobs <> jsonb_array_length(p_jobs)
       or inserted_tasks <> jsonb_array_length(p_tasks)
       or inserted_assignments <> jsonb_array_length(p_assignments) then
      raise exception using
        message = 'team_work_research_materialization_count_mismatch',
        errcode = '23514';
    end if;
    if research_result ->> 'reused' = 'true' then
      -- The delegated function proves exact row equality and deliberately
      -- returns before its normal lifecycle transition. Require the durable
      -- marker from the original committed attempt as a second identity proof
      -- before allowing this wrapper to finish from forming_team.
      if goal_row.data #>> '{research_materialization,attempt_key}'
           is distinct from p_research_attempt_key
         or goal_row.data #>> '{research_materialization,research_run_id}'
           is distinct from p_research_run_id::text
         or goal_row.data #>> '{research_materialization,job_count}'
           is distinct from jsonb_array_length(p_jobs)::text
         or goal_row.data #>> '{research_materialization,task_count}'
           is distinct from jsonb_array_length(p_tasks)::text
         or goal_row.data #>> '{research_materialization,assignment_count}'
           is distinct from jsonb_array_length(p_assignments)::text
         or nullif(goal_row.data #>> '{research_materialization,materialized_at}', '') is null then
        raise exception using
          message = 'team_work_research_reuse_marker_invalid',
          errcode = '23514';
      end if;
      expected_final_status := 'forming_team';
    else
      expected_final_status := 'provisioning_tools';
    end if;
  else
    -- Retire only unfinished rows owned by older materialization attempts.
    -- The replacement attempt is excluded explicitly; NULL/legacy history and
    -- completed work are left untouched.
    update public.team_tasks
       set status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
     where goal_id = p_goal_id
       and user_id = p_user_id
       and materialization_attempt is not null
       and materialization_attempt is distinct from p_formation_attempt
       and status in ('planned', 'todo', 'in_progress', 'inProgress');
    get diagnostics retired_tasks = row_count;

    update public.jobs
       set status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
     where goal_id = p_goal_id
       and user_id = p_user_id
       and materialization_attempt is not null
       and materialization_attempt is distinct from p_formation_attempt
       and status = 'active';
    get diagnostics retired_jobs = row_count;

    insert into public.jobs (
      id, user_id, goal_id, materialization_attempt, description, category,
      requirements, status, assigned_agent_id, assigned_agent_name
    )
    select
      item ->> 'id',
      (item ->> 'user_id')::uuid,
      (item ->> 'goal_id')::uuid,
      p_formation_attempt,
      coalesce(item ->> 'description', ''),
      item ->> 'category',
      coalesce(item ->> 'requirements', ''),
      'active',
      item ->> 'assigned_agent_id',
      coalesce(item ->> 'assigned_agent_name', '')
      from jsonb_array_elements(p_jobs) item;
    get diagnostics inserted_jobs = row_count;

    -- Test-only failure injection proves that retirement and all replacement
    -- writes share this function's transaction.
    if pg_catalog.current_setting('orqaly.test_fail_team_materialization', true)
         = 'after_jobs' then
      raise exception using
        message = 'team_work_materialization_test_failure',
        errcode = '40001';
    end if;

    insert into public.team_tasks (
      id, user_id, job_pool_id, materialization_attempt, title, description,
      status, sequence_order, assigned_to, agent_id, category, goal_id,
      estimate, deadline, priority, data
    )
    select
      item ->> 'id',
      (item ->> 'user_id')::uuid,
      item ->> 'job_pool_id',
      p_formation_attempt,
      coalesce(item ->> 'title', ''),
      coalesce(item ->> 'description', ''),
      'planned',
      coalesce((item ->> 'sequence_order')::integer, 0),
      item ->> 'assigned_to',
      item ->> 'agent_id',
      item ->> 'category',
      (item ->> 'goal_id')::uuid,
      item ->> 'estimate',
      nullif(item ->> 'deadline', '')::date,
      item ->> 'priority',
      coalesce(item -> 'data', '{}'::jsonb)
      from jsonb_array_elements(p_tasks) item;
    get diagnostics inserted_tasks = row_count;

    if inserted_jobs <> jsonb_array_length(p_jobs)
       or inserted_tasks <> jsonb_array_length(p_tasks) then
      raise exception using
        message = 'team_work_materialization_insert_count_mismatch',
        errcode = '23514';
    end if;
    expected_final_status := 'forming_team';
  end if;

  completed_at_value := pg_catalog.clock_timestamp();
  completed_attempt := common_attempt || jsonb_build_object(
    'status', 'completed',
    'completed_at', completed_at_value,
    'job_count', inserted_jobs,
    'task_count', inserted_tasks,
    'assignment_count', inserted_assignments,
    'research_attempt_key', p_research_attempt_key
  );
  -- The delegated research function added its durable research_materialization
  -- record to the same row. Reload it before composing the final patch so this
  -- wrapper cannot overwrite that nested function's write with its pre-call
  -- snapshot.
  select data
    into next_goal_data
    from public.goals
   where id = p_goal_id
     and user_id = p_user_id;
  next_goal_data := jsonb_set(
    coalesce(next_goal_data, '{}'::jsonb),
    '{team_formation_attempt}',
    completed_attempt,
    true
  );
  if p_native_scope_hash is not null then
    next_goal_data := jsonb_set(
      next_goal_data,
      '{native_team_formation_attempt}',
      completed_attempt,
      true
    );
  end if;
  next_goal_data := jsonb_set(
    next_goal_data,
    '{team_work_materialization}',
    jsonb_build_object(
      'version', 'orqaly_team_work_materialization_v1',
      'formation_attempt', p_formation_attempt,
      'native_scope_hash', p_native_scope_hash,
      'research_run_id', p_research_run_id,
      'research_attempt_key', p_research_attempt_key,
      'team_id', materialized_team_id,
      'member_count', case
        when team_requested then jsonb_array_length(p_member_ids)
        else null
      end,
      'job_count', inserted_jobs,
      'task_count', inserted_tasks,
      'assignment_count', inserted_assignments,
      'materialized_at', completed_at_value
    ),
    true
  );

  update public.goals
     set status = 'provisioning_tools',
         agent_team_id = coalesce(materialized_team_id, agent_team_id),
         data = next_goal_data,
         updated_at = pg_catalog.clock_timestamp()
   where id = p_goal_id
     and user_id = p_user_id
     and status = expected_final_status
     and data #>> '{team_formation_attempt,version}'
       = 'orqaly_team_formation_attempt_v1'
     and data #>> '{team_formation_attempt,attempt_id}' = p_formation_attempt
     and data #>> '{team_formation_attempt,status}' = 'materializing'
     and (
       p_native_scope_hash is null
       or (
         data #>> '{native_team_formation_attempt,attempt_id}' = p_formation_attempt
         and data #>> '{native_team_formation_attempt,status}' = 'materializing'
         and data #>> '{native_team_formation_attempt,scope_hash}' = p_native_scope_hash
         and data #>> '{axwise_customer_intelligence,scope_packet,scope_hash}'
           = p_native_scope_hash
       )
     );
  get diagnostics updated_goals = row_count;
  if updated_goals <> 1 then
    raise exception using
      message = 'team_work_formation_attempt_lost_before_commit',
      errcode = '55000';
  end if;

  return jsonb_build_object(
    'formation_attempt', p_formation_attempt,
    'native_scope_hash', p_native_scope_hash,
    'research', research_mode,
    'research_attempt_key', p_research_attempt_key,
    'team_id', materialized_team_id,
    'member_count', case
      when team_requested then jsonb_array_length(p_member_ids)
      else null
    end,
    'job_count', inserted_jobs,
    'task_count', inserted_tasks,
    'assignment_count', inserted_assignments,
    'retired_job_count', retired_jobs,
    'retired_task_count', retired_tasks,
    'completed_at', completed_at_value,
    'reused', false
  );
end;
$$;

revoke all on function public.materialize_goal_team_work(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
revoke all on function public.materialize_goal_team_work(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from anon;
revoke all on function public.materialize_goal_team_work(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from authenticated;
grant execute on function public.materialize_goal_team_work(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

commit;
