BEGIN;

-- This deployment is intentionally personal-Clerk-only. Refuse to tighten the
-- schema while any organization-owned data remains so a rollout cannot silently
-- orphan or reinterpret an existing tenant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM orqaly.tenant_identity_bindings
     WHERE subject_type <> 'user'
  ) OR EXISTS (
    SELECT 1
      FROM orqaly.workflow_runs
     WHERE owner_organization_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1
      FROM orqaly.assistant_threads
     WHERE owner_organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'personal tenant migration found Clerk organization data'
      USING ERRCODE = '23514';
  END IF;
END
$$;

ALTER TABLE orqaly.tenant_identity_bindings
  ADD CONSTRAINT tenant_identity_bindings_personal_type_check
  CHECK (subject_type = 'user') NOT VALID;
ALTER TABLE orqaly.tenant_identity_bindings
  VALIDATE CONSTRAINT tenant_identity_bindings_personal_type_check;

ALTER TABLE orqaly.tenant_identity_bindings
  ADD CONSTRAINT tenant_identity_bindings_personal_subject_check
  CHECK (subject_id ~ '^user_[A-Za-z0-9]+$') NOT VALID;
ALTER TABLE orqaly.tenant_identity_bindings
  VALIDATE CONSTRAINT tenant_identity_bindings_personal_subject_check;

ALTER TABLE orqaly.workflow_runs
  ADD CONSTRAINT workflow_runs_personal_owner_check
  CHECK (owner_organization_id IS NULL) NOT VALID;
ALTER TABLE orqaly.workflow_runs
  VALIDATE CONSTRAINT workflow_runs_personal_owner_check;

ALTER TABLE orqaly.assistant_threads
  ADD CONSTRAINT assistant_threads_personal_owner_check
  CHECK (owner_organization_id IS NULL) NOT VALID;
ALTER TABLE orqaly.assistant_threads
  VALIDATE CONSTRAINT assistant_threads_personal_owner_check;

-- PostgreSQL 16 records inheritance both on the member role and on each role
-- membership. The application pools connect as the three login roles and do
-- not issue SET ROLE, so they need automatic inheritance of only their narrow
-- group role. Make that membership behavior explicit and portable while the
-- login roles themselves remain NOINHERIT/NOSUPERUSER/NOCREATEDB/NOCREATEROLE.
-- A schema-only installation has no environment login roles and safely skips
-- this release binding normalization; a partial Preview login set is refused.
DO $$
DECLARE
  v_preview_login_count integer;
BEGIN
  SELECT count(*)
    INTO v_preview_login_count
    FROM pg_catalog.pg_roles
   WHERE rolname IN (
     'orqaly_v2_001_identity_login',
     'orqaly_v2_001_api_login',
     'orqaly_v2_001_worker_login'
   );

  IF v_preview_login_count NOT IN (0, 3) THEN
    RAISE EXCEPTION 'partial Orqaly Preview login role set'
      USING ERRCODE = '55000';
  END IF;

  IF v_preview_login_count = 3 THEN
    GRANT orqaly_identity TO orqaly_v2_001_identity_login
      WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
    GRANT orqaly_api TO orqaly_v2_001_api_login
      WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
    GRANT orqaly_worker TO orqaly_v2_001_worker_login
      WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
  END IF;
END
$$;

-- Resolve an existing personal binding or create its minimum viable tenant in
-- one transaction. The advisory transaction lock makes the common concurrent
-- first-login path deterministic; the nested block also handles a writer that
-- does not participate in that lock protocol without leaving partial rows.
CREATE FUNCTION orqaly.ensure_personal_tenant(
  p_environment text,
  p_user_id text
)
RETURNS TABLE (tenant_id uuid, created boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant_status text;
  v_created boolean := false;
BEGIN
  IF p_environment IS NULL OR p_environment NOT IN ('preview', 'production') THEN
    RAISE EXCEPTION 'invalid environment' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL OR p_user_id !~ '^user_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid Clerk user id' USING ERRCODE = '22023';
  END IF;

  SELECT binding.tenant_id, tenant.status
    INTO v_tenant_id, v_tenant_status
    FROM orqaly.tenant_identity_bindings AS binding
    JOIN orqaly.tenants AS tenant ON tenant.id = binding.tenant_id
   WHERE binding.provider = 'clerk'
     AND binding.environment = p_environment
     AND binding.subject_type = 'user'
     AND binding.subject_id = p_user_id;

  IF NOT FOUND THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'orqaly.personal-tenant.v1|' || p_environment || '|' || p_user_id,
        0
      )
    );

    SELECT binding.tenant_id, tenant.status
      INTO v_tenant_id, v_tenant_status
      FROM orqaly.tenant_identity_bindings AS binding
      JOIN orqaly.tenants AS tenant ON tenant.id = binding.tenant_id
     WHERE binding.provider = 'clerk'
       AND binding.environment = p_environment
       AND binding.subject_type = 'user'
       AND binding.subject_id = p_user_id;

    IF NOT FOUND THEN
      v_tenant_id := public.gen_random_uuid();
      BEGIN
        INSERT INTO orqaly.tenants (id, display_name)
        VALUES (v_tenant_id, 'Personal workspace');

        INSERT INTO orqaly.tenant_identity_bindings (
          tenant_id, provider, environment, subject_type, subject_id
        ) VALUES (
          v_tenant_id, 'clerk', p_environment, 'user', p_user_id
        );

        INSERT INTO orqaly.tenant_agents (
          tenant_id, id, name, capabilities, tool_ids,
          quality_score, cost_per_run_cents
        ) VALUES (
          v_tenant_id,
          public.gen_random_uuid(),
          'Personal Research and Product Agent',
          ARRAY['research', 'evidence_synthesis', 'prd', 'product_strategy']::text[],
          '{}'::uuid[],
          0.95000,
          25
        );

        v_tenant_status := 'active';
        v_created := true;
      EXCEPTION WHEN unique_violation THEN
        v_tenant_id := NULL;
        v_tenant_status := NULL;
        SELECT binding.tenant_id, tenant.status
          INTO v_tenant_id, v_tenant_status
          FROM orqaly.tenant_identity_bindings AS binding
          JOIN orqaly.tenants AS tenant ON tenant.id = binding.tenant_id
         WHERE binding.provider = 'clerk'
           AND binding.environment = p_environment
           AND binding.subject_type = 'user'
           AND binding.subject_id = p_user_id;
        IF NOT FOUND THEN
          RAISE;
        END IF;
        v_created := false;
      END;
    END IF;
  END IF;

  IF v_tenant_status <> 'active' THEN
    RAISE EXCEPTION 'personal tenant is not active' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT v_tenant_id, v_created;
END
$$;

REVOKE ALL ON FUNCTION orqaly.ensure_personal_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.ensure_personal_tenant(text, text) TO orqaly_identity;

-- Expand/deploy compatibility for revisions that still call the 001 resolver.
-- The legacy signature remains temporarily, but organization semantics do not:
-- a non-null organization is rejected and a personal call delegates to JIT.
CREATE OR REPLACE FUNCTION orqaly.resolve_tenant_identity(
  p_environment text,
  p_user_id text,
  p_organization_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'Clerk Organizations are not supported'
      USING ERRCODE = '42501';
  END IF;

  SELECT provisioned.tenant_id
    INTO STRICT v_tenant_id
    FROM orqaly.ensure_personal_tenant(p_environment, p_user_id) AS provisioned;
  RETURN v_tenant_id;
END
$$;

REVOKE ALL ON FUNCTION orqaly.resolve_tenant_identity(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.resolve_tenant_identity(text, text, text) TO orqaly_identity;

COMMIT;
