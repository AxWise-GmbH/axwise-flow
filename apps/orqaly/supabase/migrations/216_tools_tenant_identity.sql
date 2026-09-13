-- `tools.id` is a canonical product slug (for example `tool-github`), not a
-- globally unique database identity.  Keeping it as the sole primary key made
-- the first tenant to provision a predefined tool block every other tenant
-- from inserting the same canonical slug once tools RLS became owner-scoped.
--
-- Introduce an opaque physical row key while preserving the canonical `id`
-- consumed throughout the application.  User-owned rows are unique by
-- (user_id, id); legacy/global rows retain one canonical row per id.  The
-- replicator reference becomes tenant-bound as well, preventing a replicator
-- from pointing at another owner's tool.

BEGIN;

-- Add the physical key with its default in the same DDL statement.  A separate
-- UPDATE would re-check every NOT VALID constraint on legacy rows and can be
-- blocked by credential data deliberately preserved for an explicit cleanup
-- under migration 194.  ADD COLUMN initializes row_id without rewriting the
-- unrelated data document through the DML constraint boundary.
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS row_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.tools
  ALTER COLUMN row_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN row_id SET NOT NULL,
  ALTER COLUMN id SET NOT NULL;

-- Owner-scoped tool configuration must disappear with its owner. SET NULL
-- would turn multiple tenants' equal canonical ids into colliding global rows.
ALTER TABLE public.tools
  DROP CONSTRAINT IF EXISTS tools_user_id_fkey;

ALTER TABLE public.tools
  ADD CONSTRAINT tools_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users (id)
  ON DELETE CASCADE;

ALTER TABLE public.replicators
  DROP CONSTRAINT IF EXISTS replicators_source_tool_id_fkey;

ALTER TABLE public.tools
  DROP CONSTRAINT IF EXISTS tools_pkey;

ALTER TABLE public.tools
  ADD CONSTRAINT tools_pkey PRIMARY KEY (row_id);

ALTER TABLE public.tools
  ADD CONSTRAINT tools_user_id_id_key UNIQUE (user_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS tools_global_canonical_id_unique
  ON public.tools (id)
  WHERE user_id IS NULL;

-- NOT VALID preserves potentially inconsistent historical rows for an
-- explicit operator audit while enforcing the tenant match for every new or
-- updated replicator immediately.
ALTER TABLE public.replicators
  ADD CONSTRAINT replicators_source_tool_owner_fkey
  FOREIGN KEY (user_id, source_tool_id)
  REFERENCES public.tools (user_id, id)
  ON UPDATE CASCADE
  ON DELETE CASCADE
  NOT VALID;

COMMENT ON COLUMN public.tools.row_id IS
  'Opaque physical identity. tools.id remains the tenant-scoped canonical tool slug.';

COMMIT;
