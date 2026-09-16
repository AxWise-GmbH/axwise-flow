-- 122_autopilot_enabled.sql
-- M4 Autopilot toggle — explicit per-goal and per-agent autonomy control.
--
-- Before: autonomy was implicit; cron-driven process-next always advanced
-- every goal with queued jobs and dispatched every due pulse. Users had no
-- "pause everything for this goal/agent" control short of deleting the row.
--
-- After: boolean flag defaults TRUE so existing rows keep running as before.
-- process-next skips work for goals/agents with autopilot_enabled=false. The
-- self-healer still runs (error recovery is always wanted); only reconcile
-- + pulse detection honor the flag.
--
-- concilium_agents already has autonomous_enabled (migration 094). That
-- column is retained for the pulse-specific autonomy semantics (decides
-- whether pulse cycles produce work vs. just observe). autopilot_enabled on
-- `agents` is broader — it gates whether the user's worker agents receive
-- any orchestration at all.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS autopilot_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS autopilot_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.goals.autopilot_enabled IS
  'If false, process-next will not advance this goal. Self-healer still runs.';
COMMENT ON COLUMN public.agents.autopilot_enabled IS
  'If false, this agent is excluded from pulse detection and team formation.';
