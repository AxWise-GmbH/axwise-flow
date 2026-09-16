-- ============================================================================
-- 052: Consilium Agent Activity Audit — Daily pg_cron job
-- Checks for silent agents, zero-report agents, and auto-pauses stale agents.
-- ============================================================================

-- 1. Audit function — runs inside PostgreSQL, no HTTP call needed
CREATE OR REPLACE FUNCTION public.fn_concilium_agent_audit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── Silent agents: missed check-ins (2× interval) ────────────────────────
  INSERT INTO concilium_agent_reports (agent_id, user_id, report_type, summary, details)
  SELECT
    a.id,
    a.user_id,
    'system_audit',
    'Missed check-in: agent silent for >' || (a.check_in_interval_ms * 2 / 1000) || 's',
    jsonb_build_object(
      'check', 'missed_check_in',
      'last_seen', a.last_check_in_at,
      'expected_interval_ms', a.check_in_interval_ms
    )
  FROM concilium_agents a
  WHERE a.status = 'active'
    AND a.last_check_in_at IS NOT NULL
    AND a.last_check_in_at < NOW() - make_interval(secs => (a.check_in_interval_ms * 2.0 / 1000))
    -- Avoid duplicate audits: skip if already flagged in the last 24h
    AND NOT EXISTS (
      SELECT 1 FROM concilium_agent_reports r
      WHERE r.agent_id = a.id
        AND r.report_type = 'system_audit'
        AND r.details->>'check' = 'missed_check_in'
        AND r.created_at > NOW() - INTERVAL '24 hours'
    );

  -- ── Zero-report agents: active with no reports in 24h ────────────────────
  INSERT INTO concilium_agent_reports (agent_id, user_id, report_type, summary, details)
  SELECT
    a.id,
    a.user_id,
    'system_audit',
    'No activity reports submitted in 24 hours',
    jsonb_build_object('check', 'zero_reports_24h')
  FROM concilium_agents a
  WHERE a.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM concilium_agent_reports r
      WHERE r.agent_id = a.id
        AND r.created_at > NOW() - INTERVAL '24 hours'
    );

  -- ── Auto-pause stale agents: no activity in 48h ──────────────────────────
  UPDATE concilium_agents
  SET status = 'paused', updated_at = NOW()
  WHERE status = 'active'
    AND (last_check_in_at IS NULL OR last_check_in_at < NOW() - INTERVAL '48 hours')
    AND NOT EXISTS (
      SELECT 1 FROM concilium_agent_reports r
      WHERE r.agent_id = concilium_agents.id
        AND r.created_at > NOW() - INTERVAL '48 hours'
    );

  -- Insert audit reports for auto-paused agents
  INSERT INTO concilium_agent_reports (agent_id, user_id, report_type, summary, details)
  SELECT
    a.id,
    a.user_id,
    'system_audit',
    'Agent auto-paused: no activity for 48+ hours',
    jsonb_build_object('check', 'auto_paused_stale', 'paused_at', NOW())
  FROM concilium_agents a
  WHERE a.status = 'paused'
    AND a.updated_at >= NOW() - INTERVAL '1 minute'
    AND NOT EXISTS (
      SELECT 1 FROM concilium_agent_reports r
      WHERE r.agent_id = a.id
        AND r.report_type = 'system_audit'
        AND r.details->>'check' = 'auto_paused_stale'
        AND r.created_at > NOW() - INTERVAL '24 hours'
    );
END;
$$;

-- 2. Schedule daily at 06:00 UTC (after existing daily-ai-analysis at 05:00)
SELECT cron.schedule(
  'concilium-agent-audit',
  '0 6 * * *',
  $$SELECT public.fn_concilium_agent_audit()$$
);
