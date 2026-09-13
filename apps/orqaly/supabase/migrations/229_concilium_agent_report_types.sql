-- Trusted supervisor, audit, and human-approval workflow writers use report
-- types introduced after migration 048. Keep one explicit database allowlist
-- so these writes cannot fall through to arbitrary report categories.

BEGIN;

ALTER TABLE public.concilium_agent_reports
  DROP CONSTRAINT IF EXISTS concilium_agent_reports_report_type_check;

ALTER TABLE public.concilium_agent_reports
  ADD CONSTRAINT concilium_agent_reports_report_type_check
  CHECK (report_type IN (
    'check_in',
    'activity',
    'error',
    'completion',
    'status_change',
    'system_audit',
    'supervisor_intervention',
    'approval_request'
  ));

COMMENT ON CONSTRAINT concilium_agent_reports_report_type_check
  ON public.concilium_agent_reports IS
  'Allowlist for lifecycle, secured audit/supervisor, and human approval reports.';

COMMIT;
