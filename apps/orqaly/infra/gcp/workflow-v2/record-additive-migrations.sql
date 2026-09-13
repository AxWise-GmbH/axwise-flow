\set ON_ERROR_STOP on

\if :{?assistant_migration_path}
\else
  \echo 'assistant_migration_path is required'
  \quit 64
\endif
\if :{?assistant_migration_checksum}
\else
  \echo 'assistant_migration_checksum is required'
  \quit 64
\endif
\if :{?personal_session_migration_path}
\else
  \echo 'personal_session_migration_path is required'
  \quit 64
\endif
\if :{?personal_session_migration_checksum}
\else
  \echo 'personal_session_migration_checksum is required'
  \quit 64
\endif
\if :{?assistant_retry_migration_path}
\else
  \echo 'assistant_retry_migration_path is required'
  \quit 64
\endif
\if :{?assistant_retry_migration_checksum}
\else
  \echo 'assistant_retry_migration_checksum is required'
  \quit 64
\endif
\if :{?assistant_events_migration_path}
\else
  \echo 'assistant_events_migration_path is required'
  \quit 64
\endif
\if :{?assistant_events_migration_checksum}
\else
  \echo 'assistant_events_migration_checksum is required'
  \quit 64
\endif
\if :{?assistant_turn_provenance_migration_path}
\else
  \echo 'assistant_turn_provenance_migration_path is required'
  \quit 64
\endif
\if :{?assistant_turn_provenance_migration_checksum}
\else
  \echo 'assistant_turn_provenance_migration_checksum is required'
  \quit 64
\endif
\if :{?assistant_grounded_sources_reason_migration_path}
\else
  \echo 'assistant_grounded_sources_reason_migration_path is required'
  \quit 64
\endif
\if :{?assistant_grounded_sources_reason_migration_checksum}
\else
  \echo 'assistant_grounded_sources_reason_migration_checksum is required'
  \quit 64
\endif
\if :{?agentic_execution_migration_path}
\else
  \echo 'agentic_execution_migration_path is required'
  \quit 64
\endif
\if :{?agentic_execution_migration_checksum}
\else
  \echo 'agentic_execution_migration_checksum is required'
  \quit 64
\endif
\if :{?source_commit}
\else
  \echo 'source_commit is required'
  \quit 64
\endif

CREATE TABLE IF NOT EXISTS workflow_v2_release.applied_additive_migrations (
  component text NOT NULL CHECK (component = 'orqaly'),
  migration_number integer NOT NULL,
  migration_path text NOT NULL CHECK (length(migration_path) BETWEEN 1 AND 500),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  first_applied_source_commit text NOT NULL CHECK (
    first_applied_source_commit ~ '^[a-f0-9]{40}$'
  ),
  source_commit text NOT NULL CHECK (source_commit ~ '^[a-f0-9]{40}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (component, migration_number)
);
REVOKE ALL ON workflow_v2_release.applied_additive_migrations FROM PUBLIC;

-- CREATE TABLE IF NOT EXISTS does not evolve the 002/003-era constraint. Give
-- the ledger one stable named constraint so each additive release can advance an
-- exact existing ledger and a fresh database with identical catalog bytes.
ALTER TABLE workflow_v2_release.applied_additive_migrations
  DROP CONSTRAINT IF EXISTS applied_additive_migrations_migration_number_check;
ALTER TABLE workflow_v2_release.applied_additive_migrations
  ADD CONSTRAINT applied_additive_migrations_migration_number_check
  CHECK (migration_number IN (2, 3, 4, 5, 6, 7, 8));

INSERT INTO workflow_v2_release.applied_additive_migrations (
  component, migration_number, migration_path, sha256,
  first_applied_source_commit, source_commit
) VALUES
  (
    'orqaly', 2, :'assistant_migration_path',
    :'assistant_migration_checksum', :'source_commit', :'source_commit'
  ),
  (
    'orqaly', 3, :'personal_session_migration_path',
    :'personal_session_migration_checksum', :'source_commit', :'source_commit'
  ),
  (
    'orqaly', 4, :'assistant_retry_migration_path',
    :'assistant_retry_migration_checksum', :'source_commit', :'source_commit'
  ),
  (
    'orqaly', 5, :'assistant_events_migration_path',
    :'assistant_events_migration_checksum', :'source_commit', :'source_commit'
  ),
  (
    'orqaly', 6, :'assistant_turn_provenance_migration_path',
    :'assistant_turn_provenance_migration_checksum', :'source_commit', :'source_commit'
  ),
  (
    'orqaly', 7, :'assistant_grounded_sources_reason_migration_path',
    :'assistant_grounded_sources_reason_migration_checksum', :'source_commit', :'source_commit'
  ),
  (
    'orqaly', 8, :'agentic_execution_migration_path',
    :'agentic_execution_migration_checksum', :'source_commit', :'source_commit'
  )
ON CONFLICT (component, migration_number) DO UPDATE
SET source_commit = EXCLUDED.source_commit,
    verified_at = clock_timestamp()
WHERE workflow_v2_release.applied_additive_migrations.migration_path = EXCLUDED.migration_path
  AND workflow_v2_release.applied_additive_migrations.sha256 = EXCLUDED.sha256;

-- A conflict with different bytes updates nothing and must fail the same
-- transaction rather than rewriting release history.
SELECT 1 / (
  COUNT(*) = 7
  AND COUNT(*) FILTER (
    WHERE migration_number = 2
      AND migration_path = :'assistant_migration_path'
      AND sha256 = :'assistant_migration_checksum'
      AND source_commit = :'source_commit'
  ) = 1
  AND COUNT(*) FILTER (
    WHERE migration_number = 3
      AND migration_path = :'personal_session_migration_path'
      AND sha256 = :'personal_session_migration_checksum'
      AND source_commit = :'source_commit'
  ) = 1
  AND COUNT(*) FILTER (
    WHERE migration_number = 4
      AND migration_path = :'assistant_retry_migration_path'
      AND sha256 = :'assistant_retry_migration_checksum'
      AND source_commit = :'source_commit'
  ) = 1
  AND COUNT(*) FILTER (
    WHERE migration_number = 5
      AND migration_path = :'assistant_events_migration_path'
      AND sha256 = :'assistant_events_migration_checksum'
      AND source_commit = :'source_commit'
  ) = 1
  AND COUNT(*) FILTER (
    WHERE migration_number = 6
      AND migration_path = :'assistant_turn_provenance_migration_path'
      AND sha256 = :'assistant_turn_provenance_migration_checksum'
      AND source_commit = :'source_commit'
  ) = 1
  AND COUNT(*) FILTER (
    WHERE migration_number = 7
      AND migration_path = :'assistant_grounded_sources_reason_migration_path'
      AND sha256 = :'assistant_grounded_sources_reason_migration_checksum'
      AND source_commit = :'source_commit'
  ) = 1
  AND COUNT(*) FILTER (
    WHERE migration_number = 8
      AND migration_path = :'agentic_execution_migration_path'
      AND sha256 = :'agentic_execution_migration_checksum'
      AND source_commit = :'source_commit'
  ) = 1
)::integer AS additive_migrations_verified
FROM workflow_v2_release.applied_additive_migrations
WHERE component = 'orqaly';
