-- Keep ordinary credential checkpoints owner-only and make their creation
-- idempotent under at-least-once goal-stage execution.

-- Authenticated clients may read their own rows through the existing
-- human_tasks_select_own policy, but every mutation must cross the authenticated
-- /api/human-task-complete boundary. Goal JSON and escalation provenance are
-- security-sensitive and must not be forgeable with a direct Supabase update.
DROP POLICY IF EXISTS "human_tasks_update_own" ON public.human_tasks;
REVOKE ALL PRIVILEGES ON TABLE public.human_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.human_tasks TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.human_tasks TO service_role;

-- Paid-human credential dispatch is disabled. Every active credential task is
-- owner-only regardless of legacy reason/provenance metadata.
UPDATE public.human_tasks
SET
  escalation_allowed = false,
  escalate_after_seconds = NULL,
  updated_at = now()
WHERE type IN ('provide_credential', 'provide_key', 'manual_signup')
  AND status IN ('pending', 'claimed')
  AND (escalation_allowed = true OR escalate_after_seconds IS NOT NULL);

-- Older cron versions used escalated_at as a permanent scanner sentinel even
-- when no paid task was submitted. Release only the explicit fail-closed
-- outcomes so their owners can still claim and complete them through the API.
UPDATE public.human_tasks
SET
  escalation_allowed = false,
  escalate_after_seconds = NULL,
  escalated_at = NULL,
  updated_at = now()
WHERE type IN ('provide_credential', 'provide_key', 'manual_signup')
  AND status IN ('pending', 'claimed')
  AND escalated_at IS NOT NULL
  AND escalation_result ->> 'status' IN (
    'no_rentahuman_key',
    'budget_exceeded',
    'origin_not_allowlisted',
    'submit_failed',
    'policy_rejected'
  );

-- Preserve the task currently referenced by the goal where possible. Cancel
-- only surplus active duplicates before installing the unique invariant.
WITH ranked AS (
  SELECT
    ht.id,
    row_number() OVER (
      PARTITION BY ht.goal_id, ht.tool_id
      ORDER BY
        COALESCE(ht.partial_context -> 'credential_completion' ->> 'status', '') = 'storing' DESC,
        COALESCE((g.data ->> 'blocked_by_human_task_id') = ht.id::text, false) DESC,
        ht.created_at DESC,
        ht.id DESC
    ) AS duplicate_rank
  FROM public.human_tasks AS ht
  LEFT JOIN public.goals AS g ON g.id = ht.goal_id
  WHERE ht.goal_id IS NOT NULL
    AND ht.type IN ('provide_credential', 'provide_key', 'manual_signup')
    AND ht.status IN ('pending', 'claimed')
    AND ht.escalated_at IS NULL
)
UPDATE public.human_tasks AS ht
SET
  status = 'cancelled',
  completed_at = COALESCE(ht.completed_at, now()),
  completed_by = 'cancelled',
  escalation_allowed = false,
  escalate_after_seconds = NULL,
  updated_at = now()
FROM ranked
WHERE ranked.id = ht.id
  AND ranked.duplicate_rank > 1
  -- Never cancel an in-flight completion. If corrupt legacy state contains two
  -- storing rows for one goal/tool, fail index creation for manual operator
  -- reconciliation instead of racing either Vault writer.
  AND COALESCE(ht.partial_context -> 'credential_completion' ->> 'status', '') <> 'storing';

CREATE UNIQUE INDEX IF NOT EXISTS idx_human_tasks_active_credential_goal_tool
  ON public.human_tasks (goal_id, tool_id)
  WHERE goal_id IS NOT NULL
    AND type IN ('provide_credential', 'provide_key', 'manual_signup')
    AND status IN ('pending', 'claimed')
    AND escalated_at IS NULL;

-- Future writers cannot accidentally re-enable paid escalation for any active
-- credential task.
ALTER TABLE public.human_tasks
  DROP CONSTRAINT IF EXISTS human_tasks_owner_only_reason_no_escalation;

ALTER TABLE public.human_tasks
  DROP CONSTRAINT IF EXISTS human_tasks_active_credential_owner_only;

ALTER TABLE public.human_tasks
  ADD CONSTRAINT human_tasks_active_credential_owner_only
  CHECK (
    status NOT IN ('pending', 'claimed')
    OR type NOT IN ('provide_credential', 'provide_key', 'manual_signup')
    OR (escalation_allowed = false AND escalate_after_seconds IS NULL)
  );
