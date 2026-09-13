\set ON_ERROR_STOP on

\if :{?database_name}
\else
  \echo 'database_name is required'
  \quit 64
\endif
\if :{?agentic_binding_path}
\else
  \echo 'agentic_binding_path is required'
  \quit 64
\endif
\if :{?agentic_binding_checksum}
\else
  \echo 'agentic_binding_checksum is required'
  \quit 64
\endif
\if :{?source_commit}
\else
  \echo 'source_commit is required'
  \quit 64
\endif

-- The password is deliberately supplied through the psql process environment,
-- never argv or a checked-in file.  The release scripts validate its generated
-- 48-hex form before invoking this exact staged file.
\getenv gateway_password ORQALY_GATEWAY_DB_PASSWORD_VALUE
\if :{?gateway_password}
\else
  \echo 'ORQALY_GATEWAY_DB_PASSWORD_VALUE is required'
  \quit 64
\endif

DO $gateway_login$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'orqaly_v2_001_gateway_login'
  ) THEN
    CREATE ROLE orqaly_v2_001_gateway_login
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$gateway_login$;

ALTER ROLE orqaly_v2_001_gateway_login WITH
  LOGIN PASSWORD :'gateway_password'
  NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE cloudsqlsuperuser FROM orqaly_v2_001_gateway_login;

-- PostgreSQL 16 records inheritance on each membership.  The Gateway never
-- issues SET ROLE, so this one narrow capability membership must inherit even
-- though the login remains NOINHERIT for every future grant by default.
GRANT orqaly_gateway TO orqaly_v2_001_gateway_login
  WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
ALTER ROLE orqaly_v2_001_gateway_login SET statement_timeout = '15s';

GRANT CONNECT ON DATABASE :"database_name" TO orqaly_v2_001_gateway_login;

CREATE TABLE IF NOT EXISTS workflow_v2_release.applied_additive_bindings (
  component text NOT NULL CHECK (component = 'orqaly'),
  migration_number integer NOT NULL CHECK (migration_number = 8),
  bindings_path text NOT NULL CHECK (length(bindings_path) BETWEEN 1 AND 500),
  bindings_sha256 text NOT NULL CHECK (bindings_sha256 ~ '^[a-f0-9]{64}$'),
  first_applied_source_commit text NOT NULL CHECK (
    first_applied_source_commit ~ '^[a-f0-9]{40}$'
  ),
  source_commit text NOT NULL CHECK (source_commit ~ '^[a-f0-9]{40}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (component, migration_number)
);
REVOKE ALL ON workflow_v2_release.applied_additive_bindings FROM PUBLIC;

INSERT INTO workflow_v2_release.applied_additive_bindings (
  component, migration_number, bindings_path, bindings_sha256,
  first_applied_source_commit, source_commit
) VALUES (
  'orqaly', 8, :'agentic_binding_path', :'agentic_binding_checksum',
  :'source_commit', :'source_commit'
)
ON CONFLICT (component, migration_number) DO UPDATE
SET source_commit = EXCLUDED.source_commit,
    verified_at = clock_timestamp()
WHERE workflow_v2_release.applied_additive_bindings.bindings_path = EXCLUDED.bindings_path
  AND workflow_v2_release.applied_additive_bindings.bindings_sha256 = EXCLUDED.bindings_sha256;

-- A conflicting byte identity updates nothing and aborts the surrounding
-- migration transaction rather than rewriting release history.
SELECT 1 / (
  COUNT(*) = 1
  AND COUNT(*) FILTER (
    WHERE migration_number = 8
      AND bindings_path = :'agentic_binding_path'
      AND bindings_sha256 = :'agentic_binding_checksum'
      AND source_commit = :'source_commit'
  ) = 1
)::integer AS additive_binding_verified
FROM workflow_v2_release.applied_additive_bindings
WHERE component = 'orqaly';

DO $verify_gateway_login$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'orqaly_v2_001_gateway_login'
      AND (
        NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
      )
  ) OR pg_catalog.pg_has_role(
    'orqaly_v2_001_gateway_login', 'cloudsqlsuperuser', 'MEMBER'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    WHERE granted_role.rolname = 'orqaly_gateway'
      AND member_role.rolname = 'orqaly_v2_001_gateway_login'
      AND membership.admin_option = false
      AND membership.inherit_option = true
      AND membership.set_option = false
  ) THEN
    RAISE EXCEPTION 'Preview Gateway login is not least privilege'
      USING ERRCODE = '55000';
  END IF;
END
$verify_gateway_login$;
