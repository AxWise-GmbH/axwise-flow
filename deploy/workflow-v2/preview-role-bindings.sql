\set ON_ERROR_STOP on

\if :{?schema_checksum}
\else
  \echo 'schema_checksum is required'
  \quit 64
\endif
\if :{?migration_path}
\else
  \echo 'migration_path is required'
  \quit 64
\endif
\if :{?bindings_checksum}
\else
  \echo 'bindings_checksum is required'
  \quit 64
\endif
\if :{?bindings_path}
\else
  \echo 'bindings_path is required'
  \quit 64
\endif
\if :{?source_commit}
\else
  \echo 'source_commit is required'
  \quit 64
\endif
\if :{?database_name}
\else
  \echo 'database_name is required'
  \quit 64
\endif

GRANT axwise_v2_api TO axwise_v2_001_api_login;
GRANT axwise_v2_worker TO axwise_v2_001_worker_login;
ALTER ROLE axwise_v2_001_api_login SET statement_timeout = '15s';
ALTER ROLE axwise_v2_001_worker_login SET statement_timeout = '15s';

REVOKE CONNECT ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO postgres;
GRANT CONNECT ON DATABASE :"database_name" TO
  axwise_v2_001_api_login,
  axwise_v2_001_worker_login;

CREATE SCHEMA workflow_v2_release;
REVOKE ALL ON SCHEMA workflow_v2_release FROM PUBLIC;
CREATE TABLE workflow_v2_release.applied_baseline (
  component text PRIMARY KEY CHECK (component = 'axwise'),
  migration_number integer NOT NULL CHECK (migration_number = 1),
  migration_path text NOT NULL CHECK (
    migration_path = 'backend/database/workflow_v2/001_cognitive_operations.sql'
  ),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  bindings_path text NOT NULL CHECK (
    bindings_path = 'deploy/workflow-v2/preview-role-bindings.sql'
  ),
  bindings_sha256 text NOT NULL CHECK (bindings_sha256 ~ '^[a-f0-9]{64}$'),
  source_commit text NOT NULL CHECK (source_commit ~ '^[a-f0-9]{40}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON workflow_v2_release.applied_baseline FROM PUBLIC;
INSERT INTO workflow_v2_release.applied_baseline (
  component, migration_number, migration_path, sha256,
  bindings_path, bindings_sha256, source_commit
) VALUES (
  'axwise', 1, :'migration_path', :'schema_checksum',
  :'bindings_path', :'bindings_checksum', :'source_commit'
);
