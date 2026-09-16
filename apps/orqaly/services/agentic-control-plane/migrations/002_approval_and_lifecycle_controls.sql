alter table agentic.agents
  add column activated_at timestamptz,
  add column paused_at timestamptz;

alter table agentic.agent_teams
  add column activated_at timestamptz,
  add column paused_at timestamptz;

alter table agentic.approval_requests
  add column decision_key text,
  add column decision_payload_hash text
    check (decision_payload_hash is null or decision_payload_hash ~ '^[a-f0-9]{64}$'),
  add column decided_by text,
  add constraint ck_agentic_approval_decision_record check (
    (status = 'pending' and decision_key is null and decision_payload_hash is null
      and decided_by is null and decided_at is null)
    or (status in ('approved', 'rejected') and decision_key is not null
      and decision_payload_hash is not null and decided_by is not null and decided_at is not null)
    or status in ('expired', 'superseded')
  );

create index ix_agentic_approval_decision_key
  on agentic.approval_requests (
    org_id, workspace_id, user_id, id, decision_key
  ) where decision_key is not null;
