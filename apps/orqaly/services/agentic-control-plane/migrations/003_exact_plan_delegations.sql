alter table agentic.agent_delegations
  add column plan_version_id uuid,
  add column run_id uuid,
  add column policy_snapshot jsonb;

alter table agentic.agent_delegations
  add constraint uq_agentic_delegation_execution_binding unique (
    org_id, workspace_id, user_id, id, agent_id, run_id, plan_version_id
  ),
  add constraint fk_agentic_delegation_plan_version foreign key (
    org_id, workspace_id, user_id, plan_version_id
  ) references agentic.execution_plan_versions (
    org_id, workspace_id, user_id, id
  ) not valid,
  add constraint fk_agentic_delegation_run foreign key (
    org_id, workspace_id, user_id, run_id
  ) references agentic.execution_runs (
    org_id, workspace_id, user_id, id
  ) not valid,
  add constraint ck_agentic_delegation_exact_policy check (
    plan_version_id is not null
    and run_id is not null
    and policy_snapshot is not null
    and jsonb_typeof(policy_snapshot) = 'object'
  ) not valid;

create unique index uq_agentic_delegation_agent_plan_run
  on agentic.agent_delegations (
    org_id, workspace_id, user_id, run_id, plan_version_id, agent_id
  )
  where run_id is not null and plan_version_id is not null;

alter table agentic.execution_steps
  add column delegation_id uuid;

alter table agentic.execution_steps
  add constraint ck_agentic_step_delegation_required check (
    delegation_id is not null
  ) not valid,
  add constraint fk_agentic_step_exact_delegation foreign key (
    org_id, workspace_id, user_id, delegation_id,
    assigned_agent_id, run_id, plan_version_id
  ) references agentic.agent_delegations (
    org_id, workspace_id, user_id, id,
    agent_id, run_id, plan_version_id
  ) not valid;

create index ix_agentic_steps_delegation
  on agentic.execution_steps (
    org_id, workspace_id, user_id, delegation_id, state
  );
