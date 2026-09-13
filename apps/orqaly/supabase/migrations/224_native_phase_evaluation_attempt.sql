-- Seal native AxWise phase evaluation across the goal row and the exact task
-- outputs being graded.  Application-side goal CAS alone cannot close a race
-- with team_tasks because those rows live in a different table; these two
-- service-role-only functions make reservation and terminal publication
-- transactional over both sources.

begin;

create or replace function public.native_phase_evaluation_task_receipts(
  p_goal_id uuid,
  p_user_id uuid,
  p_phase_index integer,
  p_formation_attempt text,
  p_work_attempt text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select coalesce(jsonb_agg(receipt order by receipt ->> 'task_id'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'task_id', t.id::text,
      'job_id', coalesce(t.job_pool_id::text, ''),
      'status', coalesce(t.status, ''),
      'agent_id', coalesce(t.agent_id::text, ''),
      'assigned_to', coalesce(t.assigned_to, ''),
      'formation_attempt', coalesce(t.materialization_attempt, ''),
      'work_attempt', coalesce(t.data ->> 'materialization_attempt', ''),
      'phase_index', coalesce((t.data ->> 'phase_index')::integer, -1),
      'step_id', coalesce(t.data ->> 'axwise_step_id', ''),
      'authorization_snapshot_hash',
        coalesce(t.data #>> '{axwise_execution_context,authorization_snapshot_hash}', ''),
      'authorization_task_id',
        coalesce(t.data #>> '{axwise_execution_context,authorization_task_id}', ''),
      'authorization_agent_id',
        coalesce(t.data #>> '{axwise_execution_context,authorization_agent_id}', ''),
      'deliverable_type', coalesce(t.data ->> 'deliverable_type', ''),
      'tool_log', coalesce(t.data -> 'toolLog', '[]'::jsonb),
      'output_sha256', encode(
        digest(
          pg_catalog.convert_to(coalesce(t.data ->> 'output', ''), 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    ) as receipt
    from public.team_tasks t
    where t.goal_id = p_goal_id
      and t.user_id = p_user_id
      and t.materialization_attempt = p_formation_attempt
      and t.data ->> 'materialization_attempt' = p_work_attempt
      and coalesce((t.data ->> 'phase_index')::integer, p_phase_index) = p_phase_index
      and lower(coalesce(t.status, '')) not in ('cancelled', 'canceled', 'superseded')
  ) exact_phase_tasks;
$$;

create or replace function public.native_phase_evaluation_job_receipts(
  p_goal_id uuid,
  p_user_id uuid,
  p_formation_attempt text,
  p_task_receipts jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(receipt order by receipt ->> 'job_id'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'job_id', j.id::text,
      'materialization_attempt', coalesce(j.materialization_attempt, ''),
      'cost_usd', coalesce(j.cost_usd, 0)
    ) as receipt
    from public.jobs j
    where j.goal_id = p_goal_id
      and j.user_id = p_user_id
      and j.materialization_attempt = p_formation_attempt
      and j.id::text in (
        select receipt ->> 'job_id'
        from jsonb_array_elements(p_task_receipts) receipt
      )
  ) exact_phase_jobs;
$$;

create or replace function public.reserve_native_phase_evaluation(
  p_goal_id uuid,
  p_user_id uuid,
  p_expected_updated_at timestamptz,
  p_scope_hash text,
  p_planning_attempt text,
  p_plan_hash text,
  p_formation_attempt text,
  p_work_attempt text,
  p_execution_snapshot_hash text,
  p_phase_index integer,
  p_phase_started_at text,
  p_task_receipts jsonb,
  p_job_receipts jsonb,
  p_attempt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  goal_row public.goals%rowtype;
  current_attempt jsonb;
  actual_receipts jsonb;
  actual_job_receipts jsonb;
  reserved_at_value timestamptz;
begin
  if p_goal_id is null
     or p_user_id is null
     or p_expected_updated_at is null
     or p_scope_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_planning_attempt), '') is null
     or p_plan_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_formation_attempt), '') is null
     or nullif(btrim(p_work_attempt), '') is null
     or nullif(btrim(p_execution_snapshot_hash), '') is null
     or p_phase_index < 0
     or nullif(btrim(p_phase_started_at), '') is null
     or jsonb_typeof(coalesce(p_task_receipts, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_task_receipts) < 1
     or jsonb_typeof(coalesce(p_job_receipts, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_job_receipts) < 1
     or jsonb_typeof(coalesce(p_attempt, 'null'::jsonb)) <> 'object'
     or p_attempt ->> 'version' is distinct from 'orqaly_native_phase_evaluation_attempt_v1'
     or p_attempt ->> 'status' is distinct from 'running'
     or coalesce(p_attempt ->> 'attempt_id', '') !~ '^[0-9a-f]{64}$'
     or nullif(p_attempt ->> 'lease_token', '') is null
     or nullif(p_attempt ->> 'lease_expires_at', '') is null
     or p_attempt ->> 'scope_hash' is distinct from p_scope_hash
     or p_attempt ->> 'planning_attempt_id' is distinct from p_planning_attempt
     or p_attempt ->> 'plan_hash' is distinct from p_plan_hash
     or p_attempt ->> 'formation_attempt_id' is distinct from p_formation_attempt
     or p_attempt ->> 'work_attempt_id' is distinct from p_work_attempt
     or p_attempt ->> 'execution_snapshot_hash' is distinct from p_execution_snapshot_hash
     or (p_attempt ->> 'phase_index')::integer is distinct from p_phase_index
     or p_attempt ->> 'phase_started_at' is distinct from p_phase_started_at
     or p_attempt -> 'task_receipts' is distinct from p_task_receipts
     or p_attempt -> 'job_receipts' is distinct from p_job_receipts then
    raise exception using
      message = 'native_phase_evaluation_reservation_contract_invalid',
      errcode = '22023';
  end if;

  select * into goal_row
  from public.goals
  where id = p_goal_id
    and user_id = p_user_id
  for update;

  if not found
     or goal_row.status is distinct from 'active'
     or goal_row.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('state', 'lost');
  end if;

  if goal_row.data #>> '{axwise_customer_intelligence,scope_packet,scope_hash}'
       is distinct from p_scope_hash
     or goal_row.data #>> '{scope_admission,status}' is distinct from 'accepted'
     or goal_row.data #>> '{scope_admission,scope_hash}' is distinct from p_scope_hash
     or goal_row.data #>> '{native_planning_attempt,version}'
       is distinct from 'orqaly_native_planning_attempt_v1'
     or goal_row.data #>> '{native_planning_attempt,status}' is distinct from 'completed'
     or goal_row.data #>> '{native_planning_attempt,attempt_id}'
       is distinct from p_planning_attempt
     or goal_row.data #>> '{native_planning_attempt,scope_hash}' is distinct from p_scope_hash
     or goal_row.data #>> '{native_planning_attempt,plan_hash}' is distinct from p_plan_hash
     or goal_row.data #>> '{team_formation_attempt,version}'
       is distinct from 'orqaly_team_formation_attempt_v1'
     or goal_row.data #>> '{team_formation_attempt,status}' is distinct from 'completed'
     or goal_row.data #>> '{team_formation_attempt,attempt_id}'
       is distinct from p_formation_attempt
     or goal_row.data #>> '{team_formation_attempt,planning_attempt_id}'
       is distinct from p_planning_attempt
     or goal_row.data #>> '{team_formation_attempt,plan_hash}' is distinct from p_plan_hash
     or goal_row.data #>> '{native_team_formation_attempt,attempt_id}'
       is distinct from p_formation_attempt
     or goal_row.data #>> '{native_team_formation_attempt,status}' is distinct from 'completed'
     or goal_row.data #>> '{native_team_formation_attempt,scope_hash}'
       is distinct from p_scope_hash
     or goal_row.data #>> '{team_work_materialization,version}'
       is distinct from 'orqaly_team_work_materialization_v1'
     or goal_row.data #>> '{team_work_materialization,formation_attempt}'
       is distinct from p_formation_attempt
     or goal_row.data #>> '{team_work_materialization,native_scope_hash}'
       is distinct from p_scope_hash
     or goal_row.data #>> '{goal_approvals,context,status}' is distinct from 'approved'
     or goal_row.data #>> '{goal_approvals,execution,status}' is distinct from 'approved'
     or goal_row.data #>> '{goal_approvals,execution,snapshot_hash}'
       is distinct from p_execution_snapshot_hash
     or goal_row.data #>> '{execution_authorization,status}' is distinct from 'approved'
     or goal_row.data #>> '{execution_authorization,snapshot_hash}'
       is distinct from p_execution_snapshot_hash
     or goal_row.data #>> '{execution_authorization,manifest,valid}' is distinct from 'true'
     or goal_row.plan #>> array['phases', p_phase_index::text, 'status']
       is distinct from 'executing'
     or goal_row.plan #>> array['phases', p_phase_index::text, 'started_at']
       is distinct from p_phase_started_at then
    return jsonb_build_object('state', 'authority_changed');
  end if;

  actual_receipts := public.native_phase_evaluation_task_receipts(
    p_goal_id,
    p_user_id,
    p_phase_index,
    p_formation_attempt,
    p_work_attempt
  );
  if actual_receipts is distinct from p_task_receipts then
    return jsonb_build_object('state', 'task_set_changed');
  end if;
  actual_job_receipts := public.native_phase_evaluation_job_receipts(
    p_goal_id,
    p_user_id,
    p_formation_attempt,
    p_task_receipts
  );
  if actual_job_receipts is distinct from p_job_receipts then
    return jsonb_build_object('state', 'job_cost_set_changed');
  end if;

  current_attempt := goal_row.data -> 'native_phase_evaluation_attempt';
  if current_attempt ->> 'version' = 'orqaly_native_phase_evaluation_attempt_v1' then
    if current_attempt ->> 'attempt_id' = p_attempt ->> 'attempt_id'
       and current_attempt ->> 'status' = 'completed' then
      return jsonb_build_object('state', 'completed', 'attempt', current_attempt);
    end if;
    if current_attempt ->> 'status' = 'running'
       and (current_attempt ->> 'lease_expires_at')::timestamptz > pg_catalog.clock_timestamp() then
      return jsonb_build_object(
        'state',
        case
          when current_attempt ->> 'attempt_id' = p_attempt ->> 'attempt_id'
            then 'in_progress'
          else 'conflict'
        end,
        'attempt', current_attempt
      );
    end if;
    if current_attempt ->> 'status' = 'completed'
       and (current_attempt ->> 'phase_index')::integer >= p_phase_index then
      return jsonb_build_object('state', 'conflict', 'attempt', current_attempt);
    end if;
  end if;

  reserved_at_value := pg_catalog.clock_timestamp();
  update public.goals
  set data = jsonb_set(
        coalesce(data, '{}'::jsonb),
        '{native_phase_evaluation_attempt}',
        p_attempt || jsonb_build_object('reserved_at', reserved_at_value),
        true
      ),
      updated_at = reserved_at_value
  where id = p_goal_id
    and user_id = p_user_id
    and status = 'active'
    and updated_at = p_expected_updated_at
  returning * into goal_row;

  if not found then
    return jsonb_build_object('state', 'lost');
  end if;
  return jsonb_build_object(
    'state', 'acquired',
    'goal_updated_at', goal_row.updated_at,
    'attempt', goal_row.data -> 'native_phase_evaluation_attempt'
  );
end;
$$;

create or replace function public.finalize_native_phase_evaluation(
  p_goal_id uuid,
  p_user_id uuid,
  p_expected_updated_at timestamptz,
  p_attempt_id text,
  p_lease_token text,
  p_scope_hash text,
  p_planning_attempt text,
  p_plan_hash text,
  p_formation_attempt text,
  p_work_attempt text,
  p_execution_snapshot_hash text,
  p_phase_index integer,
  p_phase_started_at text,
  p_task_receipts jsonb,
  p_job_receipts jsonb,
  p_next_status text,
  p_next_plan jsonb,
  p_next_current_value numeric,
  p_next_spent_usd numeric,
  p_next_data jsonb,
  p_completed_attempt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  goal_row public.goals%rowtype;
  actual_receipts jsonb;
  actual_job_receipts jsonb;
  completed_at_value timestamptz;
begin
  if p_goal_id is null
     or p_user_id is null
     or p_expected_updated_at is null
     or p_attempt_id !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_lease_token), '') is null
     or p_scope_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_planning_attempt), '') is null
     or p_plan_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_formation_attempt), '') is null
     or nullif(btrim(p_work_attempt), '') is null
     or nullif(btrim(p_execution_snapshot_hash), '') is null
     or p_phase_index < 0
     or nullif(btrim(p_phase_started_at), '') is null
     or jsonb_typeof(coalesce(p_task_receipts, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_task_receipts) < 1
     or jsonb_typeof(coalesce(p_job_receipts, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_job_receipts) < 1
     or p_next_status not in ('active', 'failed')
     or jsonb_typeof(coalesce(p_next_plan, 'null'::jsonb)) <> 'object'
     or p_next_spent_usd < 0
     or jsonb_typeof(coalesce(p_next_data, 'null'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_completed_attempt, 'null'::jsonb)) <> 'object'
     or p_completed_attempt ->> 'version'
       is distinct from 'orqaly_native_phase_evaluation_attempt_v1'
     or p_completed_attempt ->> 'attempt_id' is distinct from p_attempt_id
     or p_completed_attempt ->> 'lease_token' is distinct from p_lease_token
     or p_completed_attempt ->> 'status' is distinct from 'completed'
     or p_completed_attempt ->> 'scope_hash' is distinct from p_scope_hash
     or p_completed_attempt ->> 'planning_attempt_id' is distinct from p_planning_attempt
     or p_completed_attempt ->> 'plan_hash' is distinct from p_plan_hash
     or p_completed_attempt ->> 'formation_attempt_id' is distinct from p_formation_attempt
     or p_completed_attempt ->> 'work_attempt_id' is distinct from p_work_attempt
     or p_completed_attempt ->> 'execution_snapshot_hash'
       is distinct from p_execution_snapshot_hash
     or (p_completed_attempt ->> 'phase_index')::integer is distinct from p_phase_index
     or p_completed_attempt ->> 'phase_started_at' is distinct from p_phase_started_at
     or p_completed_attempt ->> 'cost_applied' is distinct from 'true'
     or coalesce((p_completed_attempt ->> 'phase_cost_usd')::numeric, -1) < 0
     or p_completed_attempt -> 'task_receipts' is distinct from p_task_receipts
     or p_completed_attempt -> 'job_receipts' is distinct from p_job_receipts
     or p_next_data -> 'native_phase_evaluation_attempt'
       is distinct from p_completed_attempt then
    raise exception using
      message = 'native_phase_evaluation_completion_contract_invalid',
      errcode = '22023';
  end if;

  select * into goal_row
  from public.goals
  where id = p_goal_id
    and user_id = p_user_id
  for update;

  if not found
     or goal_row.status is distinct from 'active'
     or goal_row.updated_at is distinct from p_expected_updated_at
     or goal_row.data #>> '{native_phase_evaluation_attempt,version}'
       is distinct from 'orqaly_native_phase_evaluation_attempt_v1'
     or goal_row.data #>> '{native_phase_evaluation_attempt,status}' is distinct from 'running'
     or goal_row.data #>> '{native_phase_evaluation_attempt,attempt_id}'
       is distinct from p_attempt_id
     or goal_row.data #>> '{native_phase_evaluation_attempt,lease_token}'
       is distinct from p_lease_token then
    return jsonb_build_object('state', 'lost');
  end if;

  if goal_row.data #>> '{axwise_customer_intelligence,scope_packet,scope_hash}'
       is distinct from p_scope_hash
     or goal_row.data #>> '{scope_admission,status}' is distinct from 'accepted'
     or goal_row.data #>> '{scope_admission,scope_hash}' is distinct from p_scope_hash
     or goal_row.data #>> '{native_planning_attempt,status}' is distinct from 'completed'
     or goal_row.data #>> '{native_planning_attempt,attempt_id}'
       is distinct from p_planning_attempt
     or goal_row.data #>> '{native_planning_attempt,plan_hash}' is distinct from p_plan_hash
     or goal_row.data #>> '{team_formation_attempt,status}' is distinct from 'completed'
     or goal_row.data #>> '{team_formation_attempt,attempt_id}'
       is distinct from p_formation_attempt
     or goal_row.data #>> '{team_formation_attempt,planning_attempt_id}'
       is distinct from p_planning_attempt
     or goal_row.data #>> '{team_formation_attempt,plan_hash}' is distinct from p_plan_hash
     or goal_row.data #>> '{native_team_formation_attempt,attempt_id}'
       is distinct from p_formation_attempt
     or goal_row.data #>> '{native_team_formation_attempt,status}' is distinct from 'completed'
     or goal_row.data #>> '{team_work_materialization,formation_attempt}'
       is distinct from p_formation_attempt
     or goal_row.data #>> '{team_work_materialization,native_scope_hash}'
       is distinct from p_scope_hash
     or goal_row.data #>> '{goal_approvals,execution,status}' is distinct from 'approved'
     or goal_row.data #>> '{goal_approvals,execution,snapshot_hash}'
       is distinct from p_execution_snapshot_hash
     or goal_row.data #>> '{execution_authorization,status}' is distinct from 'approved'
     or goal_row.data #>> '{execution_authorization,snapshot_hash}'
       is distinct from p_execution_snapshot_hash
     or goal_row.data #>> '{execution_authorization,manifest,valid}' is distinct from 'true'
     or goal_row.plan #>> array['phases', p_phase_index::text, 'status']
       is distinct from 'executing'
     or goal_row.plan #>> array['phases', p_phase_index::text, 'started_at']
       is distinct from p_phase_started_at then
    return jsonb_build_object('state', 'authority_changed');
  end if;

  if p_next_spent_usd is distinct from
       coalesce(goal_row.spent_usd, 0) + (p_completed_attempt ->> 'phase_cost_usd')::numeric
     or p_next_current_value is distinct from
       coalesce((p_completed_attempt #>> '{evaluation,progress_percent}')::numeric, 0)
     or p_next_plan #>> array['phases', p_phase_index::text, 'status']
       is distinct from (
         case
           when p_completed_attempt #>> '{evaluation,passed}' = 'true' then 'completed'
           else 'failed'
         end
       )
     or p_next_data #>> array[
       'phase_costs', p_phase_index::text, 'evaluation_attempt_id'
     ] is distinct from p_attempt_id
     or coalesce((p_next_data #>> array[
       'phase_costs', p_phase_index::text, 'total'
     ])::numeric, -1) is distinct from
       (p_completed_attempt ->> 'phase_cost_usd')::numeric then
    raise exception using
      message = 'native_phase_evaluation_terminal_accounting_invalid',
      errcode = '22023';
  end if;

  actual_receipts := public.native_phase_evaluation_task_receipts(
    p_goal_id,
    p_user_id,
    p_phase_index,
    p_formation_attempt,
    p_work_attempt
  );
  if actual_receipts is distinct from p_task_receipts then
    return jsonb_build_object('state', 'task_set_changed');
  end if;
  actual_job_receipts := public.native_phase_evaluation_job_receipts(
    p_goal_id,
    p_user_id,
    p_formation_attempt,
    p_task_receipts
  );
  if actual_job_receipts is distinct from p_job_receipts then
    return jsonb_build_object('state', 'job_cost_set_changed');
  end if;

  completed_at_value := pg_catalog.clock_timestamp();
  update public.goals
  set status = p_next_status,
      plan = p_next_plan,
      current_value = p_next_current_value,
      spent_usd = p_next_spent_usd,
      data = p_next_data,
      updated_at = completed_at_value
  where id = p_goal_id
    and user_id = p_user_id
    and status = 'active'
    and updated_at = p_expected_updated_at
    and data #>> '{native_phase_evaluation_attempt,status}' = 'running'
    and data #>> '{native_phase_evaluation_attempt,attempt_id}' = p_attempt_id
    and data #>> '{native_phase_evaluation_attempt,lease_token}' = p_lease_token
  returning * into goal_row;

  if not found then
    return jsonb_build_object('state', 'lost');
  end if;
  return jsonb_build_object(
    'state', 'completed',
    'goal_updated_at', goal_row.updated_at,
    'attempt', goal_row.data -> 'native_phase_evaluation_attempt'
  );
end;
$$;

revoke all on function public.native_phase_evaluation_task_receipts(
  uuid, uuid, integer, text, text
) from public, anon, authenticated;
revoke all on function public.native_phase_evaluation_job_receipts(
  uuid, uuid, text, jsonb
) from public, anon, authenticated;
revoke all on function public.reserve_native_phase_evaluation(
  uuid, uuid, timestamptz, text, text, text, text, text, text,
  integer, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.finalize_native_phase_evaluation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text,
  text, integer, text, jsonb, jsonb, text, jsonb, numeric, numeric, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.reserve_native_phase_evaluation(
  uuid, uuid, timestamptz, text, text, text, text, text, text,
  integer, text, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.finalize_native_phase_evaluation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text,
  text, integer, text, jsonb, jsonb, text, jsonb, numeric, numeric, jsonb, jsonb
) to service_role;

commit;
