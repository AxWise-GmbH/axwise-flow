-- communication_logs was created with "any authenticated user" policies and
-- no owner column. Derive ownership only from durable, corroborated signals;
-- preserve unresolved history in a locked quarantine table; then make every
-- live row tenant-owned and every browser operation owner-scoped.

BEGIN;

LOCK TABLE public.communication_logs IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Current chat writers use these two contexts, but migration 152's historical
-- allowlist predates both and causes otherwise valid chat inserts to fail.
ALTER TABLE public.communication_logs
  DROP CONSTRAINT IF EXISTS communication_logs_context_type_check;
ALTER TABLE public.communication_logs
  ADD CONSTRAINT communication_logs_context_type_check
  CHECK (context_type IN (
    'build', 'deal', 'investment', 'consilium', 'command', 'general',
    'organization', 'agent-chat', 'goal'
  ));

CREATE TABLE IF NOT EXISTS public.communication_logs_security_quarantine (
  original_id uuid PRIMARY KEY,
  original_row jsonb NOT NULL,
  reason text NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.communication_logs_security_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_logs_security_quarantine FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.communication_logs_security_quarantine
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.communication_logs_security_quarantine TO service_role;

COMMENT ON TABLE public.communication_logs_security_quarantine IS
  'Preserves legacy communication rows whose tenant could not be proven. Never exposed through user-facing RLS.';

CREATE TEMP TABLE communication_log_owner_candidates (
  log_id uuid NOT NULL,
  user_id uuid NOT NULL,
  source text NOT NULL,
  PRIMARY KEY (log_id, user_id, source)
) ON COMMIT DROP;

-- An already typed owner (for idempotent/replayed migrations) is evidence only
-- if it still resolves to a durable auth user.
INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, usr.id, 'existing_user_id'
FROM public.communication_logs AS log
JOIN auth.users AS usr ON usr.id = log.user_id
ON CONFLICT DO NOTHING;

-- A human sender is its auth user. Agent senders resolve through both current
-- agent registries; a collision with different owners remains ambiguous and is
-- quarantined by the unique-candidate rule below.
INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, usr.id, 'sender_auth_user'
FROM public.communication_logs AS log
JOIN auth.users AS usr ON usr.id = log.sender_id
WHERE log.sender_type = 'user'
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, agent.user_id, 'sender_agent'
FROM public.communication_logs AS log
JOIN public.agents AS agent ON agent.id = log.sender_id
WHERE log.sender_type = 'agent'
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, agent.user_id, 'sender_concilium_agent'
FROM public.communication_logs AS log
JOIN public.concilium_agents AS agent ON agent.id = log.sender_id
WHERE log.sender_type = 'agent'
ON CONFLICT DO NOTHING;

-- Historical writers used all three owner spellings in metadata. Treat every
-- valid spelling as evidence so disagreeing aliases produce two candidates
-- and can never be silently assigned.
INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, usr.id, 'metadata_' || alias.key
FROM public.communication_logs AS log
CROSS JOIN LATERAL (VALUES
  ('_userId', log.metadata ->> '_userId'),
  ('userId',  log.metadata ->> 'userId'),
  ('user_id', log.metadata ->> 'user_id')
) AS alias(key, value)
JOIN auth.users AS usr ON usr.id = public.try_uuid(alias.value)
WHERE nullif(btrim(coalesce(alias.value, '')), '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Channels, goals, organizations, and explicit context entities are durable
-- tenant-bound relations. These insertions deliberately accumulate evidence;
-- no precedence order can hide a cross-tenant disagreement.
INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, channel.connected_by, 'metadata_channel'
FROM public.communication_logs AS log
JOIN public.communication_channels AS channel
  ON channel.id = public.try_uuid(log.metadata ->> 'channel_id')
WHERE channel.connected_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, goal.user_id, 'metadata_goal'
FROM public.communication_logs AS log
CROSS JOIN LATERAL (VALUES
  (log.metadata ->> 'goalId'),
  (log.metadata ->> 'goal_id')
) AS candidate(value)
JOIN public.goals AS goal ON goal.id = public.try_uuid(candidate.value)
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, agent.user_id, 'metadata_agent'
FROM public.communication_logs AS log
CROSS JOIN LATERAL (VALUES
  (log.metadata ->> 'agentId'),
  (log.metadata ->> 'agent_id')
) AS candidate(value)
JOIN public.agents AS agent ON agent.id = public.try_uuid(candidate.value)
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, organization.user_id, 'metadata_organization'
FROM public.communication_logs AS log
CROSS JOIN LATERAL (VALUES
  (log.metadata ->> 'organizationId'),
  (log.metadata ->> 'organization_id'),
  (log.metadata ->> 'orgId'),
  (log.metadata ->> 'org_id')
) AS candidate(value)
JOIN public.organizations AS organization
  ON organization.id = public.try_uuid(candidate.value)
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, organization.user_id, 'organization_context'
FROM public.communication_logs AS log
JOIN public.organizations AS organization ON organization.id = log.context_id
WHERE log.context_type = 'organization'
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, goal.user_id, 'build_goal_context'
FROM public.communication_logs AS log
JOIN public.goals AS goal ON goal.id = log.context_id
WHERE log.context_type = 'build'
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, goal.user_id, 'goal_context'
FROM public.communication_logs AS log
JOIN public.goals AS goal ON goal.id = log.context_id
WHERE log.context_type = 'goal'
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, agent.user_id, 'agent_chat_context'
FROM public.communication_logs AS log
JOIN public.agents AS agent ON agent.id = log.context_id
WHERE log.context_type = 'agent-chat'
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, board.user_id, 'concilium_context'
FROM public.communication_logs AS log
JOIN public.concilium AS board ON board.id = log.context_id::text
WHERE log.context_type = 'consilium'
  AND board.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, deal.user_id, 'deal_context'
FROM public.communication_logs AS log
JOIN public.investment_deals AS deal ON deal.id = log.context_id
WHERE log.context_type = 'deal'
ON CONFLICT DO NOTHING;

INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT log.id, owner.user_id, owner.source
FROM public.communication_logs AS log
JOIN LATERAL (
  SELECT pool.user_id, 'investment_pool_context'::text AS source
  FROM public.investment_pools AS pool WHERE pool.id = log.context_id
  UNION ALL
  SELECT investor.user_id, 'investment_investor_context'::text
  FROM public.investment_investors AS investor WHERE investor.id = log.context_id
) AS owner ON true
WHERE log.context_type = 'investment'
ON CONFLICT DO NOTHING;

-- Assign only when every durable signal names exactly one tenant.
WITH resolved AS (
  SELECT log_id, min(user_id::text)::uuid AS user_id
  FROM communication_log_owner_candidates
  GROUP BY log_id
  HAVING count(DISTINCT user_id) = 1
)
UPDATE public.communication_logs AS log
SET user_id = resolved.user_id
FROM resolved
WHERE log.id = resolved.log_id
  AND log.user_id IS NULL;

-- A thread may contain system/agent messages with no direct identity. Once any
-- rows have a proven owner, propagate it only if the entire thread has exactly
-- one proven tenant.
INSERT INTO communication_log_owner_candidates(log_id, user_id, source)
SELECT orphan.id, owned.user_id, 'unique_thread_owner'
FROM public.communication_logs AS orphan
JOIN (
  SELECT thread_id, min(user_id::text)::uuid AS user_id
  FROM public.communication_logs
  WHERE user_id IS NOT NULL
  GROUP BY thread_id
  HAVING count(DISTINCT user_id) = 1
) AS owned ON owned.thread_id = orphan.thread_id
WHERE orphan.user_id IS NULL
ON CONFLICT DO NOTHING;

WITH resolved AS (
  SELECT log_id, min(user_id::text)::uuid AS user_id
  FROM communication_log_owner_candidates
  GROUP BY log_id
  HAVING count(DISTINCT user_id) = 1
)
UPDATE public.communication_logs AS log
SET user_id = resolved.user_id
FROM resolved
WHERE log.id = resolved.log_id
  AND log.user_id IS NULL;

-- Preserve but remove ownerless history from the live tenant table. The
-- quarantine table has no user policy and cannot spoil a customer's context.
INSERT INTO public.communication_logs_security_quarantine(
  original_id, original_row, reason
)
SELECT
  log.id,
  to_jsonb(log),
  CASE
    WHEN EXISTS (
      SELECT 1 FROM communication_log_owner_candidates candidate
      WHERE candidate.log_id = log.id
      GROUP BY candidate.log_id
      HAVING count(DISTINCT candidate.user_id) > 1
    ) THEN 'conflicting durable tenant signals'
    ELSE 'no provable durable tenant signal'
  END
FROM public.communication_logs AS log
WHERE log.user_id IS NULL
ON CONFLICT (original_id) DO NOTHING;

DELETE FROM public.communication_logs WHERE user_id IS NULL;

ALTER TABLE public.communication_logs
  DROP CONSTRAINT IF EXISTS communication_logs_user_id_fkey;
ALTER TABLE public.communication_logs
  ADD CONSTRAINT communication_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.communication_logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.communication_logs ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_comm_logs_user_created
  ON public.communication_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_logs_user_thread_created
  ON public.communication_logs(user_id, thread_id, created_at);

CREATE OR REPLACE FUNCTION public.communication_log_resolve_owner(
  p_user_id uuid,
  p_sender_type text,
  p_sender_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  alias_name text;
  alias_value text;
  candidate_ids uuid[];
  resolved_user_id uuid;
BEGIN
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'communication log metadata must be an object';
  END IF;

  FOREACH alias_name IN ARRAY ARRAY['_userId', 'userId', 'user_id'] LOOP
    IF p_metadata ? alias_name AND jsonb_typeof(p_metadata -> alias_name) <> 'null' THEN
      IF jsonb_typeof(p_metadata -> alias_name) <> 'string' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = format('communication log metadata.%s must be a user id string', alias_name);
      END IF;
      alias_value := p_metadata ->> alias_name;
      IF nullif(btrim(alias_value), '') IS NOT NULL AND (
        public.try_uuid(alias_value) IS NULL OR NOT EXISTS (
          SELECT 1 FROM auth.users usr WHERE usr.id = public.try_uuid(alias_value)
        )
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = format('communication log metadata.%s is not a durable user', alias_name);
      END IF;
    END IF;
  END LOOP;

  SELECT array_agg(DISTINCT candidate.user_id)
  INTO candidate_ids
  FROM (
    SELECT p_user_id AS user_id
    UNION ALL SELECT auth.uid()
    UNION ALL
      SELECT usr.id FROM auth.users usr
      WHERE p_sender_type = 'user' AND usr.id = p_sender_id
    UNION ALL
      SELECT agent.user_id FROM public.agents agent
      WHERE p_sender_type = 'agent' AND agent.id = p_sender_id
    UNION ALL
      SELECT agent.user_id FROM public.concilium_agents agent
      WHERE p_sender_type = 'agent' AND agent.id = p_sender_id
    UNION ALL
      SELECT usr.id
      FROM (VALUES
        (p_metadata ->> '_userId'),
        (p_metadata ->> 'userId'),
        (p_metadata ->> 'user_id')
      ) AS alias(value)
      JOIN auth.users usr ON usr.id = public.try_uuid(alias.value)
    UNION ALL
      SELECT channel.connected_by FROM public.communication_channels channel
      WHERE channel.id = public.try_uuid(p_metadata ->> 'channel_id')
    UNION ALL
      SELECT goal.user_id
      FROM (VALUES
        (p_metadata ->> 'goalId'),
        (p_metadata ->> 'goal_id')
      ) AS goal_ref(value)
      JOIN public.goals goal ON goal.id = public.try_uuid(goal_ref.value)
    UNION ALL
      SELECT agent.user_id
      FROM (VALUES
        (p_metadata ->> 'agentId'),
        (p_metadata ->> 'agent_id')
      ) AS agent_ref(value)
      JOIN public.agents agent ON agent.id = public.try_uuid(agent_ref.value)
    UNION ALL
      SELECT organization.user_id
      FROM (VALUES
        (p_metadata ->> 'organizationId'),
        (p_metadata ->> 'organization_id'),
        (p_metadata ->> 'orgId'),
        (p_metadata ->> 'org_id')
      ) AS organization_ref(value)
      JOIN public.organizations organization
        ON organization.id = public.try_uuid(organization_ref.value)
    UNION ALL
      SELECT organization.user_id FROM public.organizations organization
      WHERE p_context_type = 'organization' AND organization.id = p_context_id
    UNION ALL
      SELECT goal.user_id FROM public.goals goal
      WHERE p_context_type = 'build' AND goal.id = p_context_id
    UNION ALL
      SELECT goal.user_id FROM public.goals goal
      WHERE p_context_type = 'goal' AND goal.id = p_context_id
    UNION ALL
      SELECT agent.user_id FROM public.agents agent
      WHERE p_context_type = 'agent-chat' AND agent.id = p_context_id
    UNION ALL
      SELECT board.user_id FROM public.concilium board
      WHERE p_context_type = 'consilium' AND board.id = p_context_id::text
    UNION ALL
      SELECT deal.user_id FROM public.investment_deals deal
      WHERE p_context_type = 'deal' AND deal.id = p_context_id
    UNION ALL
      SELECT pool.user_id FROM public.investment_pools pool
      WHERE p_context_type = 'investment' AND pool.id = p_context_id
    UNION ALL
      SELECT investor.user_id FROM public.investment_investors investor
      WHERE p_context_type = 'investment' AND investor.id = p_context_id
  ) AS candidate
  WHERE candidate.user_id IS NOT NULL;

  IF coalesce(cardinality(candidate_ids), 0) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = 'communication_logs.user_id could not be resolved';
  END IF;
  IF cardinality(candidate_ids) <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'communication log tenant signals disagree';
  END IF;
  resolved_user_id := candidate_ids[1];
  RETURN resolved_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.communication_logs_stamp_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_user_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'communication_logs.user_id is immutable';
  END IF;

  resolved_user_id := public.communication_log_resolve_owner(
    NEW.user_id,
    NEW.sender_type,
    NEW.sender_id,
    NEW.context_type,
    NEW.context_id,
    NEW.metadata
  );
  NEW.user_id := resolved_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communication_logs_stamp_owner ON public.communication_logs;
CREATE TRIGGER trg_communication_logs_stamp_owner
  BEFORE INSERT OR UPDATE OF user_id, sender_type, sender_id, context_type, context_id, metadata
  ON public.communication_logs
  FOR EACH ROW EXECUTE FUNCTION public.communication_logs_stamp_owner();

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comm_logs_select" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_select_own" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_insert" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_insert_own" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_update" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_update_own" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_delete" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_delete_own" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_owner_select" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_owner_insert" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_owner_update" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_owner_delete" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_service" ON public.communication_logs;

CREATE POLICY "comm_logs_owner_select" ON public.communication_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "comm_logs_owner_insert" ON public.communication_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comm_logs_owner_delete" ON public.communication_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "comm_logs_service" ON public.communication_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.communication_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.communication_logs TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.communication_logs TO service_role;

REVOKE ALL ON FUNCTION public.communication_log_resolve_owner(uuid, text, uuid, text, uuid, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.communication_logs_stamp_owner() FROM PUBLIC;

COMMENT ON COLUMN public.communication_logs.user_id IS
  'Immutable tenant owner. Stamped from authenticated or durable service-side identity and enforced by owner-only RLS.';

COMMIT;
