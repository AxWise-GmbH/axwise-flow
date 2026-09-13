create table agentic.memory_namespaces (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  scope_kind text not null check (
    scope_kind in ('workspace', 'user', 'project', 'conversation', 'task', 'agent')
  ),
  project_reference text check (
    project_reference is null or char_length(project_reference) between 1 and 512
  ),
  conversation_reference text check (
    conversation_reference is null
    or char_length(conversation_reference) between 1 and 512
  ),
  task_reference text check (
    task_reference is null or char_length(task_reference) between 1 and 512
  ),
  agent_id uuid,
  namespace_key text not null
    check (namespace_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 1 and 160),
  status text not null default 'active'
    check (status in ('active', 'paused', 'revoked')),
  allowed_domains text[] not null check (
    cardinality(allowed_domains) between 1 and 32
  ),
  allowed_topics text[] not null check (
    cardinality(allowed_topics) between 1 and 128
  ),
  allowed_purposes text[] not null check (
    cardinality(allowed_purposes) between 1 and 5
    and allowed_purposes <@ array[
      'task_planning', 'task_execution', 'research', 'personalization',
      'customer_support'
    ]::text[]
  ),
  maximum_classification text not null default 'internal'
    check (maximum_classification in ('public', 'internal', 'confidential', 'restricted')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_memory_namespace_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint uq_agentic_memory_namespace_key unique (
    org_id, workspace_id, user_id, namespace_key
  ),
  constraint fk_agentic_memory_namespace_agent foreign key (
    org_id, workspace_id, user_id, agent_id
  ) references agentic.agents (
    org_id, workspace_id, user_id, id
  ),
  constraint ck_agentic_memory_namespace_exact_scope check (
    (
      scope_kind in ('workspace', 'user')
      and project_reference is null
      and conversation_reference is null
      and task_reference is null
      and agent_id is null
    )
    or (
      scope_kind = 'project'
      and project_reference is not null
      and conversation_reference is null
      and task_reference is null
      and agent_id is null
    )
    or (
      scope_kind = 'conversation'
      and project_reference is null
      and conversation_reference is not null
      and task_reference is null
      and agent_id is null
    )
    or (
      scope_kind = 'task'
      and task_reference is not null
      and agent_id is null
    )
    or (
      scope_kind = 'agent'
      and project_reference is null
      and conversation_reference is null
      and task_reference is null
      and agent_id is not null
    )
  )
);

create index ix_agentic_memory_namespaces_scope
  on agentic.memory_namespaces (
    org_id, workspace_id, user_id, scope_kind, status, updated_at desc
  );

create index ix_agentic_memory_namespaces_project
  on agentic.memory_namespaces (
    org_id, workspace_id, user_id, project_reference, status
  ) where scope_kind = 'project';

create index ix_agentic_memory_namespaces_conversation
  on agentic.memory_namespaces (
    org_id, workspace_id, user_id, conversation_reference, status
  ) where scope_kind = 'conversation';

create index ix_agentic_memory_namespaces_task
  on agentic.memory_namespaces (
    org_id, workspace_id, user_id, project_reference,
    conversation_reference, task_reference, status
  ) where scope_kind = 'task';

create index ix_agentic_memory_namespaces_agent
  on agentic.memory_namespaces (
    org_id, workspace_id, user_id, agent_id, status
  ) where scope_kind = 'agent';

create table agentic.memory_items (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  namespace_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'superseded', 'revoked')),
  domain_key text not null
    check (domain_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  topic_keys text[] not null check (cardinality(topic_keys) between 1 and 64),
  purpose_keys text[] not null check (
    cardinality(purpose_keys) between 1 and 5
    and purpose_keys <@ array[
      'task_planning', 'task_execution', 'research', 'personalization',
      'customer_support'
    ]::text[]
  ),
  classification text not null
    check (classification in ('public', 'internal', 'confidential', 'restricted')),
  content_reference text not null check (char_length(content_reference) between 1 and 512),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  content_payload jsonb not null check (jsonb_typeof(content_payload) = 'object'),
  source_reference text,
  recorded_at timestamptz not null default now(),
  expires_at timestamptz,
  superseded_by_id uuid,
  created_at timestamptz not null default now(),
  constraint uq_agentic_memory_item_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint uq_agentic_memory_content_reference unique (
    org_id, workspace_id, user_id, namespace_id, content_reference
  ),
  constraint fk_agentic_memory_item_namespace foreign key (
    org_id, workspace_id, user_id, namespace_id
  ) references agentic.memory_namespaces (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_memory_item_successor foreign key (
    org_id, workspace_id, user_id, superseded_by_id
  ) references agentic.memory_items (
    org_id, workspace_id, user_id, id
  ),
  constraint ck_agentic_memory_expiry check (
    expires_at is null or expires_at > recorded_at
  ),
  constraint ck_agentic_memory_successor check (
    superseded_by_id is null or superseded_by_id <> id
  )
);

create index ix_agentic_memory_items_route
  on agentic.memory_items (
    org_id, workspace_id, user_id, namespace_id, domain_key,
    classification, recorded_at desc
  ) where status = 'active';

create index ix_agentic_memory_items_topics
  on agentic.memory_items using gin (topic_keys);

create table agentic.memory_access_logs (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  routing_request_id uuid not null,
  project_reference text check (
    project_reference is null or char_length(project_reference) between 1 and 512
  ),
  conversation_reference text check (
    conversation_reference is null
    or char_length(conversation_reference) between 1 and 512
  ),
  task_reference text not null check (char_length(task_reference) between 1 and 512),
  agent_id uuid not null,
  resolved_namespace_ids uuid[] not null default '{}'::uuid[] check (
    cardinality(resolved_namespace_ids) <= 128
  ),
  namespace_id uuid,
  memory_item_id uuid,
  domain_key text not null,
  purpose_key text not null check (purpose_key in (
    'task_planning', 'task_execution', 'research', 'personalization',
    'customer_support'
  )),
  decision text not null check (decision in ('selected', 'excluded', 'no_memory')),
  decision_reason text not null check (char_length(decision_reason) between 1 and 100),
  occurred_at timestamptz not null default now(),
  constraint uq_agentic_memory_access_log_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_memory_access_namespace foreign key (
    org_id, workspace_id, user_id, namespace_id
  ) references agentic.memory_namespaces (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_memory_access_item foreign key (
    org_id, workspace_id, user_id, memory_item_id
  ) references agentic.memory_items (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_memory_access_agent foreign key (
    org_id, workspace_id, user_id, agent_id
  ) references agentic.agents (
    org_id, workspace_id, user_id, id
  ),
  constraint ck_agentic_memory_access_selection check (
    (
      decision = 'selected'
      and namespace_id is not null
      and memory_item_id is not null
      and namespace_id = any(resolved_namespace_ids)
    )
    or decision in ('excluded', 'no_memory')
  )
);

create index ix_agentic_memory_access_task
  on agentic.memory_access_logs (
    org_id, workspace_id, user_id, agent_id, task_reference, occurred_at desc
  );

create trigger agentic_memory_access_log_immutable
  before update or delete on agentic.memory_access_logs
  for each row execute function agentic.reject_immutable_change();

create table agentic.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  status text not null default 'active'
    check (status in ('active', 'paused')),
  enabled_event_classes text[] not null default '{}'::text[] check (
    enabled_event_classes <@ array[
      'agent_outreach', 'agent_update', 'approval_required',
      'customer_input_required', 'deadline_risk', 'run_completed',
      'run_failed', 'security_alert'
    ]::text[]
  ),
  enabled_external_channels text[] not null default '{}'::text[] check (
    enabled_external_channels <@ array['email', 'push', 'sms', 'webhook']::text[]
  ),
  minimum_external_urgency text not null default 'normal'
    check (minimum_external_urgency in ('low', 'normal', 'high', 'critical')),
  quiet_time_zone text,
  quiet_start_local time,
  quiet_end_local time,
  allow_critical_during_quiet_hours boolean not null default false,
  allow_arbitrary_agent_outreach boolean not null default false,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_notification_preference_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint uq_agentic_notification_preference_user unique (
    org_id, workspace_id, user_id
  ),
  constraint ck_agentic_notification_quiet_hours check (
    (quiet_time_zone is null and quiet_start_local is null and quiet_end_local is null)
    or (
      quiet_time_zone is not null
      and quiet_start_local is not null
      and quiet_end_local is not null
      and quiet_start_local <> quiet_end_local
    )
  )
);

create table agentic.notification_channel_grants (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  channel text not null check (channel in ('email', 'push', 'sms', 'webhook')),
  event_classes text[] not null check (
    cardinality(event_classes) between 1 and 8
    and event_classes <@ array[
      'agent_outreach', 'agent_update', 'approval_required',
      'customer_input_required', 'deadline_risk', 'run_completed',
      'run_failed', 'security_alert'
    ]::text[]
  ),
  allowed_outreach_kinds text[] not null check (
    cardinality(allowed_outreach_kinds) between 1 and 2
    and allowed_outreach_kinds <@ array[
      'arbitrary_agent_outreach', 'task_event'
    ]::text[]
  ),
  minimum_urgency text not null default 'normal'
    check (minimum_urgency in ('low', 'normal', 'high', 'critical')),
  agent_id uuid,
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_notification_grant_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_notification_grant_agent foreign key (
    org_id, workspace_id, user_id, agent_id
  ) references agentic.agents (
    org_id, workspace_id, user_id, id
  ),
  constraint ck_agentic_notification_grant_window check (
    valid_until is null or valid_until > valid_from
  ),
  constraint ck_agentic_notification_grant_revocation check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
    or status = 'expired'
  ),
  constraint ck_agentic_notification_arbitrary_agent check (
    not ('arbitrary_agent_outreach' = any(allowed_outreach_kinds))
    or agent_id is not null
  )
);

create index ix_agentic_notification_grants_match
  on agentic.notification_channel_grants (
    org_id, workspace_id, user_id, channel, status, valid_until
  );

create table agentic.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  event_id uuid not null,
  event_class text not null check (event_class in (
    'agent_outreach', 'agent_update', 'approval_required',
    'customer_input_required', 'deadline_risk', 'run_completed',
    'run_failed', 'security_alert'
  )),
  urgency text not null check (urgency in ('low', 'normal', 'high', 'critical')),
  outreach_kind text not null check (
    outreach_kind in ('arbitrary_agent_outreach', 'task_event')
  ),
  source_agent_id uuid,
  run_id uuid,
  channel text not null check (channel in ('in_app', 'email', 'push', 'sms', 'webhook')),
  delivery_key text not null check (delivery_key ~ '^[a-f0-9]{64}$'),
  intent_state text not null check (intent_state in (
    'durable_unread', 'durable_read', 'external_ready',
    'external_deferred', 'cancelled'
  )),
  policy_reason text not null check (char_length(policy_reason) between 1 and 100),
  standing_grant_id uuid,
  safe_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_payload) = 'object'),
  available_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_notification_delivery_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint uq_agentic_notification_delivery_key unique (
    org_id, workspace_id, user_id, delivery_key, channel
  ),
  constraint fk_agentic_notification_delivery_agent foreign key (
    org_id, workspace_id, user_id, source_agent_id
  ) references agentic.agents (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_notification_delivery_run foreign key (
    org_id, workspace_id, user_id, run_id
  ) references agentic.execution_runs (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_notification_delivery_grant foreign key (
    org_id, workspace_id, user_id, standing_grant_id
  ) references agentic.notification_channel_grants (
    org_id, workspace_id, user_id, id
  ),
  constraint ck_agentic_notification_delivery_authority check (
    (
      channel = 'in_app'
      and standing_grant_id is null
      and intent_state in ('durable_unread', 'durable_read', 'cancelled')
    )
    or (
      channel <> 'in_app'
      and standing_grant_id is not null
      and intent_state in ('external_ready', 'external_deferred', 'cancelled')
    )
  ),
  constraint ck_agentic_notification_arbitrary_source check (
    outreach_kind <> 'arbitrary_agent_outreach' or source_agent_id is not null
  )
);

create index ix_agentic_notification_deliveries_in_app
  on agentic.notification_deliveries (
    org_id, workspace_id, user_id, intent_state, created_at desc
  ) where channel = 'in_app';

create index ix_agentic_notification_deliveries_external
  on agentic.notification_deliveries (
    intent_state, available_after, created_at
  ) where intent_state in ('external_ready', 'external_deferred');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'memory_namespaces',
    'memory_items',
    'memory_access_logs',
    'notification_preferences',
    'notification_channel_grants',
    'notification_deliveries'
  ] loop
    execute format('alter table agentic.%I enable row level security', table_name);
    execute format('alter table agentic.%I force row level security', table_name);
    execute format(
      'create policy tenant_isolation on agentic.%I for all to public using (' ||
      'org_id = nullif(current_setting(''app.organization_id'', true), '''') and ' ||
      'workspace_id = nullif(current_setting(''app.workspace_id'', true), '''') and ' ||
      'user_id = nullif(current_setting(''app.user_id'', true), '''')' ||
      ') with check (' ||
      'org_id = nullif(current_setting(''app.organization_id'', true), '''') and ' ||
      'workspace_id = nullif(current_setting(''app.workspace_id'', true), '''') and ' ||
      'user_id = nullif(current_setting(''app.user_id'', true), '''')' ||
      ')',
      table_name
    );
  end loop;
end;
$$;
