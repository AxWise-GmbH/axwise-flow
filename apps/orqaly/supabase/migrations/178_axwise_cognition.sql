-- Migration 178: AxWise cognition audit columns
--
-- Adds a dedicated `axwise` JSONB column to the consilium tables so the output
-- of the external AxWise conditions layer (applicableConditions + processed
-- cognition, keyed by requestId) is stored for audit and reuse WITHOUT
-- contaminating baseline fields or the generic `metadata`.
--
-- RLS is unchanged: a new column inherits the table's existing policies, so no
-- new policy is required. Idempotent (IF NOT EXISTS). Apply manually in the
-- Supabase SQL Editor (see supabase/README.md).

ALTER TABLE public.concilium
  ADD COLUMN IF NOT EXISTS axwise JSONB DEFAULT NULL;

ALTER TABLE public.concilium_members
  ADD COLUMN IF NOT EXISTS axwise JSONB DEFAULT NULL;

ALTER TABLE public.concilium_agents
  ADD COLUMN IF NOT EXISTS axwise JSONB DEFAULT NULL;

-- Expedite compliance/audit lookups by requestId (btree on the extracted text
-- key; requestId is a single scalar, so a plain functional index fits better
-- than GIN).
CREATE INDEX IF NOT EXISTS idx_concilium_axwise_req_id
  ON public.concilium ((axwise ->> 'requestId'));

CREATE INDEX IF NOT EXISTS idx_concilium_members_axwise_req_id
  ON public.concilium_members ((axwise ->> 'requestId'));

CREATE INDEX IF NOT EXISTS idx_concilium_agents_axwise_req_id
  ON public.concilium_agents ((axwise ->> 'requestId'));
