-- Pin every child reference to one exact tenant-scoped execution lineage.
-- The original single-object foreign keys remain useful, but they cannot by
-- themselves prevent a child from combining IDs that each exist in different
-- runs.

alter table agentic.execution_steps
  add constraint uq_agentic_step_run_chain unique (
    org_id, workspace_id, user_id, run_id, id
  );

alter table agentic.step_attempts
  add constraint uq_agentic_attempt_run_chain unique (
    org_id, workspace_id, user_id, run_id, id
  ),
  add constraint uq_agentic_attempt_step_run_chain unique (
    org_id, workspace_id, user_id, run_id, step_id, id
  ),
  add constraint fk_agentic_attempt_step_run_chain foreign key (
    org_id, workspace_id, user_id, run_id, step_id
  ) references agentic.execution_steps (
    org_id, workspace_id, user_id, run_id, id
  );

alter table agentic.step_receipts
  add constraint fk_agentic_receipt_step_run_chain foreign key (
    org_id, workspace_id, user_id, run_id, step_id
  ) references agentic.execution_steps (
    org_id, workspace_id, user_id, run_id, id
  ),
  add constraint fk_agentic_receipt_attempt_run_chain foreign key (
    org_id, workspace_id, user_id, run_id, step_id, attempt_id
  ) references agentic.step_attempts (
    org_id, workspace_id, user_id, run_id, step_id, id
  );

alter table agentic.run_events
  add constraint fk_agentic_event_step_run_chain foreign key (
    org_id, workspace_id, user_id, run_id, step_id
  ) references agentic.execution_steps (
    org_id, workspace_id, user_id, run_id, id
  ),
  add constraint fk_agentic_event_attempt_run_chain foreign key (
    org_id, workspace_id, user_id, run_id, attempt_id
  ) references agentic.step_attempts (
    org_id, workspace_id, user_id, run_id, id
  ),
  add constraint fk_agentic_event_attempt_step_run_chain foreign key (
    org_id, workspace_id, user_id, run_id, step_id, attempt_id
  ) references agentic.step_attempts (
    org_id, workspace_id, user_id, run_id, step_id, id
  );

-- PostgreSQL's default MATCH SIMPLE semantics deliberately preserve all valid
-- event shapes: run-only, step-only, attempt-only, or a fully linked event.
-- When both optional IDs are present, the final composite key proves that the
-- attempt belongs to that exact step and run.
