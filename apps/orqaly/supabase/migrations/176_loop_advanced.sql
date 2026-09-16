-- 176_loop_advanced.sql
-- Advanced loop controls: a per-goal opt-in flag plus a settings blob that
-- gates cost/quality-aware stops and a human checkpoint on loop chains.
--
-- When loop_advanced is false the chain behaves exactly as before (stops only
-- on user toggle, failure, or MAX_LOOP_DEPTH). When true, maybeSpawnContinuation
-- enforces loop_settings:
--   { convergence_min_gain, chain_budget_cap_usd, hitl_every, refine_max_versions }
-- RLS is already enabled on public.goals (user-scoped policies apply).

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS loop_advanced boolean NOT NULL DEFAULT false;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS loop_settings jsonb;
