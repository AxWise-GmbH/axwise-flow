-- Make the queue row, rather than caller-controlled JSON, the durable tenant
-- authority and introduce an exact, renewable lease for every running job.
--
-- This migration deliberately terminalizes pre-lease running work. Such rows
-- cannot prove which invocation still owns them, so reusing them would permit
-- two workers to publish or mutate state for one logical execution.

BEGIN;

LOCK TABLE public.agent_jobs IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.agent_jobs
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- Resolve one alias family without trusting a preferred spelling. JSON null
-- and the empty string mean "not supplied" for entity references; malformed,
-- blank, non-string, or disagreeing values fail closed.
CREATE OR REPLACE FUNCTION public.agent_job_alias_value(
  p_payload jsonb,
  p_aliases text[],
  p_label text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  alias_name text;
  raw_value text;
  resolved_value text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN NULL;
  END IF;

  FOREACH alias_name IN ARRAY p_aliases LOOP
    IF NOT (p_payload ? alias_name) OR jsonb_typeof(p_payload -> alias_name) = 'null' THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(p_payload -> alias_name) <> 'string' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('%s.%s must be a string', p_label, alias_name);
    END IF;

    raw_value := p_payload ->> alias_name;
    IF raw_value = '' THEN
      CONTINUE;
    END IF;
    IF btrim(raw_value) = '' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('%s.%s must not be blank', p_label, alias_name);
    END IF;
    IF resolved_value IS NOT NULL AND resolved_value IS DISTINCT FROM btrim(raw_value) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('%s aliases disagree', p_label);
    END IF;
    resolved_value := btrim(raw_value);
  END LOOP;

  RETURN resolved_value;
END;
$$;

-- Return NULL for an executable authority envelope, otherwise the exact
-- reason it must be quarantined. This is a function (rather than only a
-- trigger) so the migration can classify legacy rows before installing the
-- write boundary.
CREATE OR REPLACE FUNCTION public.agent_job_authority_contract_error(
  p_user_id uuid,
  p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  owner_alias text;
  owner_scope jsonb;
  owner_scope_name text;
  job_type text;
  goal_ref text;
  trigger_goal_ref text;
  task_ref text;
  work_job_ref text;
  agent_ref text;
  context_agent_ref text;
  context_blueprint_ref text;
  blueprint_ref text;
  effective_agent_ref text;
  team_ref text;
  concilium_ref text;
  workflow_ref text;
  organization_ref text;
  tenant_organization_ref text;
  channel_ref text;
  parent_goal_ref text;
  continuation_goal_ref text;
  decision_ref text;
  sample_ref text;
  trigger_blueprint_ref text;
  trigger_agent_ref text;
  trigger_board_ref text;
  task_goal_id uuid;
  task_data_goal_id uuid;
  task_data_goal_text text;
  task_job_id text;
  task_agent_id text;
  work_job_goal_id uuid;
  work_job_agent_id text;
  work_job_concilium_id text;
  goal_agent_team_id text;
  goal_concilium_team_id text;
  goal_concilium_id text;
  goal_workflow_id text;
  goal_org_id text;
  goal_executor_type text;
  goal_executor_id text;
  parsed_uuid uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'agent_jobs.user_id is required';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN 'agent_jobs.payload must be a JSON object';
  END IF;
  IF coalesce(jsonb_typeof(p_payload -> 'type'), 'null') <> 'string'
     OR nullif(btrim(coalesce(p_payload ->> 'type', '')), '') IS NULL THEN
    RETURN 'payload.type is required';
  END IF;
  job_type := btrim(p_payload ->> 'type');
  IF job_type NOT IN (
    'agent', 'axwise-ground', 'axwise-outcome', 'browser-task', 'communicator-process',
    'concilium-evaluate', 'council-meeting', 'evaluate', 'execute-task',
    'execute-workflow', 'library-calibration', 'loop-refine-parent-deliverables',
    'orchestrate-goal', 'prompt-refinement', 'pulse-cycle', 'run-llm'
  ) THEN
    RETURN format('unsupported queued job type: %s', job_type);
  END IF;

  -- Every supplied owner alias, including nested scopes consumed by runtime
  -- handlers, must exactly equal the typed queue owner. Missing aliases are
  -- stamped later; conflicting aliases are never repaired silently.
  FOR owner_scope_name, owner_scope IN
    SELECT * FROM (VALUES
      ('payload', p_payload),
      ('payload.agentContext', p_payload -> 'agentContext'),
      ('payload.tenant', p_payload -> 'tenant')
    ) AS scopes(label, value)
  LOOP
    IF owner_scope IS NULL OR jsonb_typeof(owner_scope) = 'null' THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(owner_scope) <> 'object' THEN
      RETURN format('%s must be a JSON object', owner_scope_name);
    END IF;
    FOREACH owner_alias IN ARRAY ARRAY['_userId', 'userId', 'user_id'] LOOP
      IF owner_scope ? owner_alias THEN
        IF jsonb_typeof(owner_scope -> owner_alias) <> 'string'
           OR owner_scope ->> owner_alias IS DISTINCT FROM p_user_id::text THEN
          RETURN format('%s.%s does not match agent_jobs.user_id', owner_scope_name, owner_alias);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  IF p_payload ? 'triggerData'
     AND jsonb_typeof(p_payload -> 'triggerData') NOT IN ('object', 'null') THEN
    RETURN 'payload.triggerData must be a JSON object';
  END IF;

  BEGIN
    goal_ref := public.agent_job_alias_value(p_payload, ARRAY['goalId', 'goal_id'], 'goal');
    trigger_goal_ref := public.agent_job_alias_value(
      p_payload -> 'triggerData', ARRAY['goalId', 'goal_id'], 'trigger goal'
    );
    task_ref := public.agent_job_alias_value(p_payload, ARRAY['taskId', 'task_id'], 'task');
    work_job_ref := public.agent_job_alias_value(
      p_payload, ARRAY['jobId', 'job_id', 'jobPoolId', 'job_pool_id'], 'job'
    );
    agent_ref := public.agent_job_alias_value(
      p_payload, ARRAY['agentId', 'agent_id', 'assignedAgentId', 'assigned_agent_id'], 'agent'
    );
    context_agent_ref := public.agent_job_alias_value(
      p_payload -> 'agentContext',
      ARRAY['id', '_agentId', 'agentId', 'agent_id'],
      'agentContext agent'
    );
    context_blueprint_ref := public.agent_job_alias_value(
      p_payload -> 'agentContext', ARRAY['blueprint_id'], 'agentContext blueprint'
    );
    blueprint_ref := public.agent_job_alias_value(
      p_payload, ARRAY['blueprintId', 'blueprint_id'], 'blueprint'
    );
    team_ref := public.agent_job_alias_value(p_payload, ARRAY['teamId', 'team_id'], 'team');
    concilium_ref := public.agent_job_alias_value(
      p_payload, ARRAY['conciliumId', 'concilium_id', 'boardId', 'board_id'], 'concilium'
    );
    workflow_ref := public.agent_job_alias_value(
      p_payload, ARRAY['workflowId', 'workflow_id'], 'workflow'
    );
    organization_ref := public.agent_job_alias_value(
      p_payload,
      ARRAY['organizationId', 'organization_id', 'orgId', 'org_id'],
      'organization'
    );
    tenant_organization_ref := public.agent_job_alias_value(
      p_payload -> 'tenant',
      ARRAY['organizationId', 'organization_id', 'orgId', 'org_id'],
      'tenant organization'
    );
    channel_ref := public.agent_job_alias_value(
      p_payload, ARRAY['channelId', 'channel_id'], 'channel'
    );
    parent_goal_ref := public.agent_job_alias_value(
      p_payload, ARRAY['parentGoalId', 'parent_goal_id'], 'parent goal'
    );
    continuation_goal_ref := public.agent_job_alias_value(
      p_payload, ARRAY['continuationGoalId', 'continuation_goal_id'], 'continuation goal'
    );
    decision_ref := public.agent_job_alias_value(
      p_payload, ARRAY['decisionId', 'decision_id'], 'AxWise decision'
    );
    sample_ref := public.agent_job_alias_value(
      p_payload, ARRAY['sampleId', 'sample_id'], 'calibration sample'
    );
    trigger_blueprint_ref := public.agent_job_alias_value(
      p_payload -> 'triggerData', ARRAY['blueprint_id'], 'workflow trigger blueprint'
    );
    trigger_agent_ref := public.agent_job_alias_value(
      p_payload -> 'triggerData', ARRAY['agent_id'], 'workflow trigger agent'
    );
    trigger_board_ref := public.agent_job_alias_value(
      p_payload -> 'triggerData', ARRAY['board_id'], 'workflow trigger board'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;

  IF goal_ref IS NOT NULL AND trigger_goal_ref IS NOT NULL
     AND goal_ref IS DISTINCT FROM trigger_goal_ref THEN
    RETURN 'workflow goal references disagree';
  END IF;
  goal_ref := coalesce(goal_ref, trigger_goal_ref);

  IF organization_ref IS NOT NULL AND tenant_organization_ref IS NOT NULL
     AND organization_ref IS DISTINCT FROM tenant_organization_ref THEN
    RETURN 'organization and tenant organization references disagree';
  END IF;
  organization_ref := coalesce(organization_ref, tenant_organization_ref);

  effective_agent_ref := coalesce(
    agent_ref, blueprint_ref, context_agent_ref, context_blueprint_ref
  );
  IF effective_agent_ref IS NOT NULL AND (
    (agent_ref IS NOT NULL AND agent_ref IS DISTINCT FROM effective_agent_ref)
    OR (blueprint_ref IS NOT NULL AND blueprint_ref IS DISTINCT FROM effective_agent_ref)
    OR (context_agent_ref IS NOT NULL AND context_agent_ref IS DISTINCT FROM effective_agent_ref)
    OR (context_blueprint_ref IS NOT NULL AND context_blueprint_ref IS DISTINCT FROM effective_agent_ref)
  ) THEN
    RETURN 'agent identity references disagree';
  END IF;
  blueprint_ref := coalesce(blueprint_ref, context_blueprint_ref);

  -- Type-specific minimum durable bindings. Optional references below are
  -- still validated whenever present.
  IF job_type = 'agent' AND effective_agent_ref IS NULL THEN
    RETURN 'agent job requires an exact durable agent or blueprint';
  ELSIF job_type = 'orchestrate-goal' AND goal_ref IS NULL THEN
    RETURN 'orchestrate-goal requires goalId';
  ELSIF job_type = 'execute-task' AND (task_ref IS NULL OR work_job_ref IS NULL) THEN
    RETURN 'execute-task requires taskId and jobId';
  ELSIF job_type = 'execute-workflow' AND workflow_ref IS NULL THEN
    RETURN 'execute-workflow requires workflowId';
  ELSIF job_type = 'council-meeting' AND team_ref IS NULL THEN
    RETURN 'council-meeting requires teamId';
  ELSIF job_type = 'concilium-evaluate' AND concilium_ref IS NULL THEN
    RETURN 'concilium-evaluate requires conciliumId';
  ELSIF job_type = 'pulse-cycle' AND (effective_agent_ref IS NULL OR goal_ref IS NULL) THEN
    RETURN 'pulse-cycle requires agentId and goalId';
  ELSIF job_type = 'prompt-refinement' AND effective_agent_ref IS NULL THEN
    RETURN 'prompt-refinement requires agentId';
  ELSIF job_type = 'axwise-outcome' AND (goal_ref IS NULL OR decision_ref IS NULL) THEN
    RETURN 'axwise-outcome requires goalId and decisionId';
  ELSIF job_type = 'axwise-ground' AND (
    organization_ref IS NULL OR nullif(btrim(coalesce(p_payload ->> 'requestId', '')), '') IS NULL
  ) THEN
    RETURN 'axwise-ground requires organization and requestId';
  ELSIF job_type = 'communicator-process' AND channel_ref IS NULL THEN
    RETURN 'communicator-process requires channelId';
  ELSIF job_type = 'loop-refine-parent-deliverables' AND (
    parent_goal_ref IS NULL OR continuation_goal_ref IS NULL
  ) THEN
    RETURN 'loop refinement requires parentGoalId and continuationGoalId';
  ELSIF job_type = 'evaluate' AND coalesce(
    goal_ref, task_ref, work_job_ref, effective_agent_ref, team_ref,
    concilium_ref, workflow_ref, organization_ref, channel_ref
  ) IS NOT NULL THEN
    RETURN 'evaluate does not accept durable entity attribution';
  END IF;

  IF parent_goal_ref IS NOT NULL AND parent_goal_ref = continuation_goal_ref THEN
    RETURN 'refinement goals must be distinct';
  END IF;

  -- Resolve the direct goal and every durable link it carries under the same
  -- owner. This prevents an owned goal row from smuggling a foreign executor,
  -- organization, team, Concilium, or workflow into a trusted job.
  IF goal_ref IS NOT NULL THEN
    parsed_uuid := public.try_uuid(goal_ref);
    IF parsed_uuid IS NULL THEN RETURN 'goal id is malformed'; END IF;
    SELECT
      g.agent_team_id::text,
      g.team_id::text,
      g.concilium_id,
      g.workflow_id,
      g.org_id::text,
      g.executor_type,
      g.executor_id
    INTO
      goal_agent_team_id,
      goal_concilium_team_id,
      goal_concilium_id,
      goal_workflow_id,
      goal_org_id,
      goal_executor_type,
      goal_executor_id
    FROM public.goals AS g
    WHERE g.id = parsed_uuid AND g.user_id = p_user_id;
    IF NOT FOUND THEN RETURN 'goal is missing or belongs to another owner'; END IF;

    IF goal_agent_team_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.agent_teams t
      WHERE t.id = public.try_uuid(goal_agent_team_id) AND t.user_id = p_user_id
    ) THEN RETURN 'goal agent team is missing or belongs to another owner'; END IF;
    IF goal_concilium_team_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.concilium_teams t
      WHERE t.id = public.try_uuid(goal_concilium_team_id) AND t.user_id = p_user_id
    ) THEN RETURN 'goal Concilium team is missing or belongs to another owner'; END IF;
    IF goal_concilium_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.concilium c
      WHERE c.id = goal_concilium_id AND c.user_id = p_user_id
    ) THEN RETURN 'goal Concilium is missing or belongs to another owner'; END IF;
    IF goal_workflow_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = goal_workflow_id AND w.user_id = p_user_id
    ) THEN RETURN 'goal workflow is missing or belongs to another owner'; END IF;
    IF goal_org_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = public.try_uuid(goal_org_id) AND o.user_id = p_user_id
    ) THEN RETURN 'goal organization is missing or belongs to another owner'; END IF;

    IF team_ref IS NOT NULL
       AND coalesce(goal_agent_team_id, goal_concilium_team_id) IS NOT NULL
       AND team_ref IS DISTINCT FROM goal_agent_team_id
       AND team_ref IS DISTINCT FROM goal_concilium_team_id THEN
      RETURN 'queued team does not match the goal team';
    END IF;
    IF concilium_ref IS NOT NULL AND goal_concilium_id IS NOT NULL
       AND concilium_ref IS DISTINCT FROM goal_concilium_id THEN
      RETURN 'queued Concilium does not match the goal Concilium';
    END IF;
    IF workflow_ref IS NOT NULL AND goal_workflow_id IS NOT NULL
       AND workflow_ref IS DISTINCT FROM goal_workflow_id THEN
      RETURN 'queued workflow does not match the goal workflow';
    END IF;
    IF organization_ref IS NOT NULL AND goal_org_id IS NOT NULL
       AND organization_ref IS DISTINCT FROM goal_org_id THEN
      RETURN 'queued organization does not match the goal organization';
    END IF;

    IF goal_executor_id IS NOT NULL THEN
      IF goal_executor_type = 'organization' THEN
        IF goal_executor_id IS DISTINCT FROM p_user_id::text AND (
          public.try_uuid(goal_executor_id) IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.organizations o
          WHERE o.id = public.try_uuid(goal_executor_id) AND o.user_id = p_user_id
          )
        ) THEN RETURN 'goal organization executor is missing or foreign'; END IF;
      ELSIF goal_executor_type = 'consilium' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.concilium c
          WHERE c.id = goal_executor_id AND c.user_id = p_user_id
        ) THEN RETURN 'goal Concilium executor is missing or foreign'; END IF;
      ELSIF goal_executor_type = 'team' THEN
        IF goal_executor_id IS DISTINCT FROM goal_agent_team_id
           AND goal_executor_id IS DISTINCT FROM goal_concilium_team_id THEN
          RETURN 'goal team executor is not durably linked';
        END IF;
      ELSIF goal_executor_type = 'agent' THEN
        IF public.try_uuid(goal_executor_id) IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.agents a
          WHERE a.id = public.try_uuid(goal_executor_id) AND a.user_id = p_user_id
        ) THEN RETURN 'goal agent executor is missing or foreign'; END IF;
      ELSE
        RETURN 'goal executor type is missing or unsupported';
      END IF;
    END IF;
  END IF;

  IF task_ref IS NOT NULL THEN
    SELECT
      t.goal_id,
      public.try_uuid(t.data ->> 'goal_id'),
      t.data ->> 'goal_id',
      t.job_pool_id,
      t.agent_id
    INTO task_goal_id, task_data_goal_id, task_data_goal_text, task_job_id, task_agent_id
    FROM public.team_tasks AS t
    WHERE t.id = task_ref AND t.user_id = p_user_id;
    IF NOT FOUND THEN RETURN 'task is missing or belongs to another owner'; END IF;
    IF nullif(btrim(coalesce(task_data_goal_text, '')), '') IS NOT NULL
       AND task_data_goal_id IS NULL THEN
      RETURN 'task JSON goal id is malformed';
    END IF;
    IF task_goal_id IS NOT NULL AND task_data_goal_id IS NOT NULL
       AND task_goal_id IS DISTINCT FROM task_data_goal_id THEN
      RETURN 'task durable goal bindings disagree';
    END IF;
    IF goal_ref IS NOT NULL AND coalesce(task_goal_id, task_data_goal_id)::text
       IS DISTINCT FROM goal_ref THEN
      RETURN 'task belongs to another goal';
    END IF;
    IF coalesce(task_goal_id, task_data_goal_id) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = coalesce(task_goal_id, task_data_goal_id) AND g.user_id = p_user_id
    ) THEN RETURN 'task parent goal is missing or belongs to another owner'; END IF;
    IF work_job_ref IS NOT NULL AND task_job_id IS DISTINCT FROM work_job_ref THEN
      RETURN 'task belongs to another job';
    END IF;
    IF task_job_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.jobs j WHERE j.id = task_job_id AND j.user_id = p_user_id
    ) THEN RETURN 'task parent job is missing or belongs to another owner'; END IF;
    IF effective_agent_ref IS NOT NULL AND task_agent_id IS NOT NULL
       AND task_agent_id IS DISTINCT FROM effective_agent_ref THEN
      RETURN 'task belongs to another agent';
    END IF;
    IF task_agent_id IS NOT NULL AND (
      public.try_uuid(task_agent_id) IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = public.try_uuid(task_agent_id) AND a.user_id = p_user_id
      )
    ) THEN RETURN 'task agent is missing or belongs to another owner'; END IF;
  END IF;

  IF work_job_ref IS NOT NULL THEN
    SELECT j.goal_id, j.assigned_agent_id, j.concilium_id
    INTO work_job_goal_id, work_job_agent_id, work_job_concilium_id
    FROM public.jobs AS j
    WHERE j.id = work_job_ref AND j.user_id = p_user_id;
    IF NOT FOUND THEN RETURN 'job is missing or belongs to another owner'; END IF;
    IF goal_ref IS NOT NULL AND work_job_goal_id::text IS DISTINCT FROM goal_ref THEN
      RETURN 'job belongs to another goal';
    END IF;
    IF work_job_goal_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = work_job_goal_id AND g.user_id = p_user_id
    ) THEN RETURN 'job parent goal is missing or belongs to another owner'; END IF;
    IF effective_agent_ref IS NOT NULL AND work_job_agent_id IS NOT NULL
       AND work_job_agent_id IS DISTINCT FROM effective_agent_ref THEN
      RETURN 'job belongs to another agent';
    END IF;
    IF work_job_agent_id IS NOT NULL AND (
      public.try_uuid(work_job_agent_id) IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = public.try_uuid(work_job_agent_id) AND a.user_id = p_user_id
      )
    ) THEN RETURN 'job agent is missing or belongs to another owner'; END IF;
    IF concilium_ref IS NOT NULL AND work_job_concilium_id IS NOT NULL
       AND work_job_concilium_id IS DISTINCT FROM concilium_ref THEN
      RETURN 'job belongs to another Concilium';
    END IF;
    IF work_job_concilium_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.concilium c
      WHERE c.id = work_job_concilium_id AND c.user_id = p_user_id
    ) THEN RETURN 'job Concilium is missing or belongs to another owner'; END IF;
  END IF;

  IF effective_agent_ref IS NOT NULL THEN
    parsed_uuid := public.try_uuid(effective_agent_ref);
    IF parsed_uuid IS NULL THEN RETURN 'agent id is malformed'; END IF;
    IF job_type IN ('pulse-cycle', 'prompt-refinement') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.concilium_agents a
        WHERE a.id = parsed_uuid AND a.user_id = p_user_id
      ) THEN RETURN 'Concilium agent is missing or belongs to another owner'; END IF;
    ELSIF blueprint_ref IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.agent_blueprints a
        WHERE a.id = parsed_uuid AND a.user_id = p_user_id
      ) THEN RETURN 'agent blueprint is missing or belongs to another owner'; END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.agents a WHERE a.id = parsed_uuid AND a.user_id = p_user_id
    ) THEN RETURN 'agent is missing or belongs to another owner'; END IF;
  END IF;

  IF team_ref IS NOT NULL AND (
    public.try_uuid(team_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.agent_teams t
      WHERE t.id = public.try_uuid(team_ref) AND t.user_id = p_user_id
    )
  ) THEN RETURN 'team is missing or belongs to another owner'; END IF;

  IF concilium_ref IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.concilium c
    WHERE c.id = concilium_ref AND c.user_id = p_user_id
  ) THEN RETURN 'Concilium is missing or belongs to another owner'; END IF;

  IF workflow_ref IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workflows w
    WHERE w.id = workflow_ref AND w.user_id = p_user_id
  ) THEN RETURN 'workflow is missing or belongs to another owner'; END IF;

  IF organization_ref IS NOT NULL AND organization_ref IS DISTINCT FROM p_user_id::text AND (
    public.try_uuid(organization_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = public.try_uuid(organization_ref) AND o.user_id = p_user_id
    )
  ) THEN RETURN 'organization is missing or belongs to another owner'; END IF;

  IF channel_ref IS NOT NULL AND (
    public.try_uuid(channel_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.communication_channels c
      WHERE c.id = public.try_uuid(channel_ref) AND c.connected_by = p_user_id
    )
  ) THEN RETURN 'channel is missing or belongs to another owner'; END IF;

  IF parent_goal_ref IS NOT NULL AND (
    public.try_uuid(parent_goal_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = public.try_uuid(parent_goal_ref) AND g.user_id = p_user_id
    )
  ) THEN RETURN 'parent goal is missing or belongs to another owner'; END IF;

  IF continuation_goal_ref IS NOT NULL AND (
    public.try_uuid(continuation_goal_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = public.try_uuid(continuation_goal_ref) AND g.user_id = p_user_id
    )
  ) THEN RETURN 'continuation goal is missing or belongs to another owner'; END IF;

  IF sample_ref IS NOT NULL AND (
    public.try_uuid(sample_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.knowledge_documents d
      WHERE d.id = public.try_uuid(sample_ref) AND d.user_id = p_user_id
    )
  ) THEN RETURN 'calibration sample is missing or belongs to another owner'; END IF;

  IF trigger_blueprint_ref IS NOT NULL AND (
    public.try_uuid(trigger_blueprint_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.agent_blueprints a
      WHERE a.id = public.try_uuid(trigger_blueprint_ref) AND a.user_id = p_user_id
    )
  ) THEN RETURN 'workflow trigger blueprint is missing or foreign'; END IF;
  IF trigger_agent_ref IS NOT NULL AND (
    public.try_uuid(trigger_agent_ref) IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.concilium_agents a
      WHERE a.id = public.try_uuid(trigger_agent_ref) AND a.user_id = p_user_id
    )
  ) THEN RETURN 'workflow trigger agent is missing or foreign'; END IF;
  IF trigger_board_ref IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.concilium c
    WHERE c.id = trigger_board_ref AND c.user_id = p_user_id
  ) THEN RETURN 'workflow trigger Concilium is missing or foreign'; END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_job_canonical_owner_payload(
  p_payload jsonb,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb := p_payload;
  nested_scope jsonb;
BEGIN
  result := jsonb_set(result, '{_userId}', to_jsonb(p_user_id::text), true);
  result := jsonb_set(result, '{userId}', to_jsonb(p_user_id::text), true);
  result := jsonb_set(result, '{user_id}', to_jsonb(p_user_id::text), true);

  IF jsonb_typeof(result -> 'agentContext') = 'object' THEN
    nested_scope := result -> 'agentContext';
    nested_scope := jsonb_set(nested_scope, '{_userId}', to_jsonb(p_user_id::text), true);
    nested_scope := jsonb_set(nested_scope, '{userId}', to_jsonb(p_user_id::text), true);
    nested_scope := jsonb_set(nested_scope, '{user_id}', to_jsonb(p_user_id::text), true);
    result := jsonb_set(result, '{agentContext}', nested_scope, false);
  END IF;
  IF jsonb_typeof(result -> 'tenant') = 'object' THEN
    nested_scope := result -> 'tenant';
    nested_scope := jsonb_set(nested_scope, '{_userId}', to_jsonb(p_user_id::text), true);
    nested_scope := jsonb_set(nested_scope, '{userId}', to_jsonb(p_user_id::text), true);
    nested_scope := jsonb_set(nested_scope, '{user_id}', to_jsonb(p_user_id::text), true);
    result := jsonb_set(result, '{tenant}', nested_scope, false);
  END IF;
  RETURN result;
END;
$$;

-- A pre-migration running row has no complete trustworthy lease. Preserve its
-- audit record but make it terminal before installing the lease invariant.
-- The predicate also makes reapplication safe for an already valid live lease.
UPDATE public.agent_jobs
SET
  status = 'failed',
  error = 'JOB_LIVE_LEASE_REQUIRED: legacy running job quarantined during durable lease rollout',
  lease_token = NULL,
  heartbeat_at = NULL,
  lease_expires_at = NULL,
  updated_at = clock_timestamp()
WHERE status = 'running'
  AND (
    lease_token IS NULL
    OR heartbeat_at IS NULL
    OR lease_expires_at IS NULL
    OR lease_expires_at <= heartbeat_at
  );

-- Active legacy rows with ambiguous or foreign authority are likewise made
-- terminal. The precise reason stays on the queue row for operator review.
WITH invalid_jobs AS MATERIALIZED (
  SELECT
    id,
    public.agent_job_authority_contract_error(user_id, payload) AS reason
  FROM public.agent_jobs
  WHERE status = 'queued'
)
UPDATE public.agent_jobs AS job
SET
  status = 'failed',
  error = 'JOB_OWNER_VALIDATION_ERROR: ' || invalid.reason,
  lease_token = NULL,
  heartbeat_at = NULL,
  lease_expires_at = NULL,
  updated_at = clock_timestamp()
FROM invalid_jobs AS invalid
WHERE job.id = invalid.id
  AND invalid.reason IS NOT NULL;

-- Only unambiguous queued rows are normalized. Conflicting aliases were
-- terminalized above and are never overwritten with a guessed owner.
UPDATE public.agent_jobs
SET payload = public.agent_job_canonical_owner_payload(payload, user_id)
WHERE status = 'queued'
  AND public.agent_job_authority_contract_error(user_id, payload) IS NULL;

ALTER TABLE public.agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_user_id_fkey;
ALTER TABLE public.agent_jobs
  ADD CONSTRAINT agent_jobs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.agent_jobs ALTER COLUMN user_id DROP DEFAULT;

-- Migration 017 allowed every authenticated tenant to poll every job. Once
-- user_id is the sole durable owner, status/result polling must be owner-only.
-- PostgreSQL ORs permissive policies, so the historical policy must be removed
-- rather than merely supplemented.
DROP POLICY IF EXISTS "Authenticated read agent_jobs" ON public.agent_jobs;
DROP POLICY IF EXISTS "Authenticated can read agent_jobs" ON public.agent_jobs;
DROP POLICY IF EXISTS agent_jobs_owner_all ON public.agent_jobs;
DROP POLICY IF EXISTS agent_jobs_owner_select ON public.agent_jobs;
DROP POLICY IF EXISTS agent_jobs_select_own ON public.agent_jobs;
DROP POLICY IF EXISTS agent_jobs_service ON public.agent_jobs;
CREATE POLICY agent_jobs_owner_select
  ON public.agent_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY agent_jobs_service
  ON public.agent_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.agent_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agent_jobs TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.agent_jobs TO service_role;

-- Runtime revocation uses `cancelled` as an explicit terminal state. The
-- original 017 check predates that lifecycle and otherwise rejects a safe
-- lease-revoking cancellation.
ALTER TABLE public.agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_status_check;
ALTER TABLE public.agent_jobs
  ADD CONSTRAINT agent_jobs_status_check
  CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled'));

-- Terminal historical quarantines may remain ownerless for audit. No queued
-- or running row may do so, and the trigger below rejects every new ownerless
-- insert. NOT VALID avoids rewriting unrelated terminal history; VALIDATE
-- proves the entire executable set is safe now.
ALTER TABLE public.agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_executable_owner_check;
ALTER TABLE public.agent_jobs
  ADD CONSTRAINT agent_jobs_executable_owner_check
  CHECK (status NOT IN ('queued', 'running') OR user_id IS NOT NULL) NOT VALID;
ALTER TABLE public.agent_jobs VALIDATE CONSTRAINT agent_jobs_executable_owner_check;

ALTER TABLE public.agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_live_lease_check;
ALTER TABLE public.agent_jobs
  ADD CONSTRAINT agent_jobs_live_lease_check
  CHECK (
    (
      status = 'running'
      AND lease_token IS NOT NULL
      AND heartbeat_at IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at > heartbeat_at
    )
    OR
    (
      status <> 'running'
      AND lease_token IS NULL
      AND heartbeat_at IS NULL
      AND lease_expires_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_agent_jobs_running_lease_expiry
  ON public.agent_jobs(status, worker_scope, lease_expires_at)
  WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_jobs_live_lease_token
  ON public.agent_jobs(lease_token)
  WHERE lease_token IS NOT NULL;

-- Migration 183's fallback trigger trusted payload._userId and guessed owners.
-- All current producers now write the typed owner explicitly; remove that
-- compatibility path before installing the durable authority boundary.
DROP TRIGGER IF EXISTS trg_agent_jobs_set_owner ON public.agent_jobs;
DROP FUNCTION IF EXISTS public.agent_jobs_set_owner();

CREATE OR REPLACE FUNCTION public.agent_jobs_enforce_authority_and_lease()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  contract_error text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23502',
        MESSAGE = 'agent_jobs.user_id is required';
    END IF;
    contract_error := public.agent_job_authority_contract_error(NEW.user_id, NEW.payload);
    IF contract_error IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'JOB_OWNER_VALIDATION_ERROR: ' || contract_error;
    END IF;
    NEW.payload := public.agent_job_canonical_owner_payload(NEW.payload, NEW.user_id);
  ELSE
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'agent_jobs.user_id is immutable';
    END IF;
    IF OLD.payload IS DISTINCT FROM NEW.payload THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'agent_jobs.payload authority envelope is immutable';
    END IF;

  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'running' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'agent job must be inserted queued before it can be leased';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'running'
     AND OLD.status NOT IN ('queued', 'running') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'terminal agent job cannot transition directly to running';
  END IF;

  IF NEW.status = 'running' THEN
    IF NEW.lease_token IS NULL OR NEW.heartbeat_at IS NULL OR NEW.lease_expires_at IS NULL
       OR NEW.lease_expires_at <= NEW.heartbeat_at THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'running agent job requires a valid live lease';
    END IF;
    IF NEW.lease_expires_at > NEW.heartbeat_at + interval '2 minutes'
       OR NEW.lease_expires_at <= clock_timestamp()
       OR NEW.heartbeat_at > clock_timestamp() + interval '30 seconds' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'running agent job lease is outside the bounded clock envelope';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'running'
       AND OLD.lease_token IS DISTINCT FROM NEW.lease_token THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'running agent job lease_token is immutable';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'running'
       AND (
         NEW.heartbeat_at < OLD.heartbeat_at
         OR NEW.lease_expires_at < OLD.lease_expires_at
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'running agent job heartbeat and expiry are monotonic';
    END IF;
  ELSE
    -- A terminal/requeued transition revokes the old invocation atomically.
    NEW.lease_token := NULL;
    NEW.heartbeat_at := NULL;
    NEW.lease_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_jobs_authority_and_lease ON public.agent_jobs;
CREATE TRIGGER trg_agent_jobs_authority_and_lease
  BEFORE INSERT OR UPDATE ON public.agent_jobs
  FOR EACH ROW EXECUTE FUNCTION public.agent_jobs_enforce_authority_and_lease();

REVOKE ALL ON FUNCTION public.agent_job_alias_value(jsonb, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_job_authority_contract_error(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_job_canonical_owner_payload(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_jobs_enforce_authority_and_lease() FROM PUBLIC;

COMMENT ON COLUMN public.agent_jobs.user_id IS
  'Sole durable tenant authority. Explicit on insert and immutable for the lifetime of the queue row.';
COMMENT ON COLUMN public.agent_jobs.lease_token IS
  'Unique invocation lease. Present only while status=running and required in every mutation CAS.';
COMMENT ON COLUMN public.agent_jobs.heartbeat_at IS
  'Last durable heartbeat for the exact lease_token.';
COMMENT ON COLUMN public.agent_jobs.lease_expires_at IS
  'Expiry for the exact lease_token; stale recovery may act only after this timestamp.';

COMMIT;
